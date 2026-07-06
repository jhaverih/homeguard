import { Injectable, OnModuleInit, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { InspectionNote } from '../inspections/entities/inspection.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { ServiceRequestStatus } from '../common/enums/role.enum';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';

const SYSTEM_PROMPT = `You are Houmi's AI maintenance assistant. Houmi is a home-services platform that connects homeowners with vetted vendors for inspections and maintenance. You are embedded inside the Houmi mobile app and are speaking directly to a Houmi customer.

Your role:
- Help homeowners understand their inspection results and plan home maintenance
- Answer questions about home upkeep, common issues, and when to call a professional
- When a customer wants to book an inspection or a service, tell them to tap "Request a Service" in the app (the wrench icon in the bottom navigation). You cannot book for them, but the button is right there in the app.
- Do not suggest contacting HomeGuard through any other channel — all booking happens inside this app.

Keep responses concise and practical — 2-5 sentences unless a detailed list is genuinely needed.
Always be friendly and reassuring.
Do not provide legal or structural engineering advice; recommend a licensed professional for those.`;

@Injectable()
export class MaintenanceBotService implements OnModuleInit {
  private readonly ollamaUrl: string;
  private readonly model: string;
  private readonly logger = new Logger(MaintenanceBotService.name);

  constructor(
    @InjectRepository(InspectionNote)
    private notesRepo: Repository<InspectionNote>,
    @InjectRepository(ServiceRequest)
    private requestsRepo: Repository<ServiceRequest>,
    @InjectRepository(ChatSession)
    private sessionsRepo: Repository<ChatSession>,
    @InjectRepository(ChatMessage)
    private messagesRepo: Repository<ChatMessage>,
    private config: ConfigService,
  ) {
    this.ollamaUrl = this.config.get('OLLAMA_URL', 'http://172.29.20.1:11434');
    this.model = this.config.get('OLLAMA_MODEL', 'llama3.2');
  }

  onModuleInit() {
    this.logger.log(`Pre-warming Ollama model ${this.model} at ${this.ollamaUrl}`);
    axios.post(
      `${this.ollamaUrl}/api/chat`,
      { model: this.model, messages: [{ role: 'user', content: 'hi' }], stream: false, keep_alive: -1 },
      { timeout: 720000 },
    ).then(() => {
      this.logger.log(`Ollama model ${this.model} warm and ready`);
    }).catch((err) => {
      this.logger.warn(`Ollama pre-warm failed (will retry on first user message): ${err.message}`);
    });
  }

  private async buildContext(customerId: string): Promise<string> {
    const recentRequests = await this.requestsRepo.find({
      where: { customerId, status: ServiceRequestStatus.COMPLETED },
      order: { completedAt: 'DESC' },
      take: 5,
    });

    if (recentRequests.length === 0) return '';

    const requestIds = recentRequests.map((r) => r.id);
    const notes = await this.notesRepo
      .createQueryBuilder('n')
      .where('n.serviceRequestId IN (:...ids)', { ids: requestIds })
      .orderBy('n.createdAt', 'DESC')
      .take(10)
      .getMany();

    const lines: string[] = ['\n\nCustomer inspection history:'];
    for (const req of recentRequests) {
      const date = req.completedAt
        ? new Date(req.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'Unknown date';
      lines.push(`\nInspection on ${date} at ${req.address}, ${req.city}, ${req.state}:`);
      if (req.vendorNotes) lines.push(`  Vendor notes: ${req.vendorNotes}`);
      const reqNotes = notes.filter((n) => n.serviceRequestId === req.id);
      for (const n of reqNotes) lines.push(`  ${n.title}: ${n.content}`);
    }

    return lines.join('\n');
  }

  private async callOllama(
    customerId: string,
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<string> {
    const context = await this.buildContext(customerId);
    const systemContent = SYSTEM_PROMPT + context;

    const messages = [
      { role: 'system', content: systemContent },
      ...history.slice(-6),
      { role: 'user', content: message },
    ];

    const response = await axios.post(
      `${this.ollamaUrl}/api/chat`,
      { model: this.model, messages, stream: false, keep_alive: -1 },
      { timeout: 600000 },
    );

    return response.data?.message?.content ?? 'Sorry, I could not generate a response.';
  }

  async chat(
    customerId: string,
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    sessionId?: string,
  ): Promise<{ reply: string; sessionId: string }> {
    // Find or create session
    let session: ChatSession | null = null;
    if (sessionId) {
      session = await this.sessionsRepo.findOne({ where: { id: sessionId, customerId } });
    }
    if (!session) {
      const title = message.length > 45 ? message.substring(0, 45) + '…' : message;
      session = await this.sessionsRepo.save(this.sessionsRepo.create({ customerId, title }));
    }

    // Persist user message
    await this.messagesRepo.save(
      this.messagesRepo.create({ sessionId: session.id, role: 'user', content: message }),
    );

    const reply = await this.callOllama(customerId, message, history);

    // Persist assistant reply
    await this.messagesRepo.save(
      this.messagesRepo.create({ sessionId: session.id, role: 'assistant', content: reply }),
    );

    return { reply, sessionId: session.id };
  }

  async getSessions(customerId: string): Promise<any[]> {
    const sessions = await this.sessionsRepo.find({
      where: { customerId },
      order: { createdAt: 'DESC' },
      take: 30,
    });

    return Promise.all(
      sessions.map(async (s) => {
        const messageCount = await this.messagesRepo.count({ where: { sessionId: s.id } });
        return { id: s.id, title: s.title, createdAt: s.createdAt, messageCount };
      }),
    );
  }

  async getSession(
    customerId: string,
    sessionId: string,
  ): Promise<{ id: string; title: string; messages: ChatMessage[] }> {
    const session = await this.sessionsRepo.findOne({ where: { id: sessionId, customerId } });
    if (!session) throw new NotFoundException('Session not found');

    const messages = await this.messagesRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });

    return { id: session.id, title: session.title, messages };
  }

  async deleteSession(customerId: string, sessionId: string): Promise<{ success: boolean }> {
    const session = await this.sessionsRepo.findOne({ where: { id: sessionId, customerId } });
    if (!session) throw new NotFoundException('Session not found');
    await this.sessionsRepo.remove(session);
    return { success: true };
  }
}
