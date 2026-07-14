import { Injectable, OnModuleInit, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { InspectionNote } from '../inspections/entities/inspection.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { ServiceRequestStatus } from '../common/enums/role.enum';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { AiRecommendation, AiRecommendationStatus } from './entities/ai-recommendation.entity';
import { PricingService } from '../pricing/pricing.service';

type Season = 'winter' | 'spring' | 'summer' | 'fall';

const SEASONAL_TASKS: Record<Season, string[]> = {
  spring: [
    'Inspect roof and gutters for winter damage',
    'Service the AC system before cooling season',
    'Check exterior drainage and grading after snowmelt/spring rain',
    'Inspect and repair exterior caulking and weatherstripping',
    'Test sump pump ahead of spring rains',
    'Power wash siding, deck, and driveway',
  ],
  summer: [
    'Change or clean HVAC filters monthly during heavy use',
    'Inspect deck and fencing for warping or rot',
    'Check irrigation system and outdoor faucets for leaks',
    'Inspect attic ventilation and insulation before peak heat',
    'Service exterior paint and touch up peeling areas',
  ],
  fall: [
    'Heating system tune-up and filter replacement',
    'Chimney and fireplace inspection',
    'Roof, gutters, and shingle inspection before leaf season',
    'Weatherstripping and door seal check',
    'Smoke and CO detector battery replacement',
    'Drain and store outdoor hoses before first freeze',
  ],
  winter: [
    'Inspect for ice dams and roof snow load',
    'Check pipe insulation in unheated spaces to prevent freezing',
    'Test heating system regularly during heavy use',
    'Inspect weatherstripping around doors and windows for drafts',
    'Check attic and crawlspace for pest entry points',
  ],
};

function getCurrentSeason(date = new Date()): Season {
  const month = date.getMonth(); // 0-11
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

const SYSTEM_PROMPT = `You are Houmi's AI maintenance assistant. Houmi is a home-services platform that connects homeowners with vetted vendors for inspections and maintenance. You are embedded inside the Houmi mobile app and are speaking directly to a Houmi customer.

Your role:
- Help homeowners understand their inspection results and plan home maintenance
- Answer questions about home upkeep, common issues, and when to call a professional
- When a customer wants to book an inspection or a service, tell them to tap "Request a Service" in the app (the wrench icon in the bottom navigation). You cannot book for them, but the button is right there in the app.
- Do not suggest contacting HomeGuard through any other channel — all booking happens inside this app.

What a handyman CAN do (no trade license needed): drywall patching/repair, trim and molding work, cabinet repair, weatherproofing/caulking, replacing existing light fixtures/switches/outlets/smart-home devices (not new wiring or breaker panel work), replacing faucets/showerheads, toilet maintenance, sealing minor gaps (not main water lines, sewage, or gas lines), mounting TVs/shelving/window treatments/safety rails, furniture assembly, door and pet-door installation, gutter cleaning, pressure washing, fencing, and deck upkeep.

What REQUIRES a licensed professional: HVAC work, electrical wiring/panel work, plumbing beyond fixture swaps, roofing, general contracting/renovation projects, and solar installation. Always tell the customer these need a licensed, certified vendor — Houmi already gates these to certified pros, so just let them know to request the service and a qualified vendor will be matched.

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
    @InjectRepository(AiRecommendation)
    private recommendationsRepo: Repository<AiRecommendation>,
    private pricingService: PricingService,
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

    return lines.join('\n') + (await this.buildSeasonalAndCatalogContext());
  }

  private async buildSeasonalAndCatalogContext(): Promise<string> {
    const season = getCurrentSeason();
    const tasks = SEASONAL_TASKS[season];
    const lines: string[] = [
      `\n\nCurrent season: ${season}. Recommended seasonal maintenance for this time of year:`,
      ...tasks.map((t) => `  - ${t}`),
    ];

    const catalog = await this.pricingService.getAll();
    const bookable = catalog.filter((c) => c.isActive && c.customerRequestable !== false);
    if (bookable.length > 0) {
      lines.push('\n\nBookable services:');
      for (const item of bookable) {
        lines.push(`  - ${item.name}: ${item.description}`);
      }
      // Placed last, as its own instruction, since small local models follow
      // a rule stated right before they respond far more reliably than one
      // buried earlier in a long system prompt.
      lines.push(
        '\n\nIMPORTANT — before you answer: decide if one of the services listed above is the right next step for this customer.'
        + '\nIf yes: write your normal helpful reply, then on its own new final line write exactly: RECOMMEND: <the exact service name from the list above>'
        + '\nIf no listed service fits (general question, past-inspection question, needs a licensed trade not in the list): write your reply and add no such line.'
        + '\nExample final line when clogged gutters come up: RECOMMEND: Gutters Inspection & Cleaning',
      );
    }

    return lines.join('\n');
  }

  private async callOllama(
    customerId: string,
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<{ reply: string; recommendedName: string | null }> {
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

    const raw: string = response.data?.message?.content ?? 'Sorry, I could not generate a response.';

    // Small local models follow a rigid "final line" template far more
    // reliably than an instruction to name a service somewhere in prose —
    // pull it out and keep it out of what the customer actually reads.
    const match = raw.match(/\n?RECOMMEND:\s*(.+?)\s*$/i);
    const recommendedName = match ? match[1].trim() : null;
    const reply = match ? raw.slice(0, match.index).trim() : raw;

    return { reply, recommendedName };
  }

  async chat(
    customerId: string,
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    sessionId?: string,
  ): Promise<{ reply: string; sessionId: string; recommendations: any[] }> {
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

    const { reply, recommendedName } = await this.callOllama(customerId, message, history);

    // Persist assistant reply (the visible, marker-stripped text)
    const savedReply = await this.messagesRepo.save(
      this.messagesRepo.create({ sessionId: session.id, role: 'assistant', content: reply }),
    );

    const recommendations = await this.extractRecommendations(customerId, session.id, savedReply.id, recommendedName, message);

    return { reply, sessionId: session.id, recommendations };
  }

  // Includes generic words that recur across multiple, unrelated catalog
  // items (e.g. "Full" in "HVAC Full Inspection" collided with "full of
  // leaves" in an unrelated gutter question during testing) — these add
  // false-positive risk without adding real matching signal.
  private static readonly CATALOG_MATCH_STOPWORDS = new Set([
    'and', 'the', 'for', 'with', 'your', 'service', 'services', 'system', 'work', 'works',
    'full', 'new', 'included', 'home', 'unit', 'project', 'repair', 'repairs',
    'replace', 'replacement', 'inspection', 'patio',
  ]);

  // A 1B-parameter local model does not reliably follow the "RECOMMEND: <name>"
  // instruction (confirmed via live testing — it consistently falls back to
  // its simpler trained behavior). Rather than keep tuning a prompt a model
  // this small may just be unable to follow, fall back to a fully
  // deterministic match against the CUSTOMER's own words — independent of
  // anything the model does or doesn't say.
  private matchCatalogFromText(text: string, bookable: any[]): any[] {
    const lower = text.toLowerCase();
    const matches = bookable.filter((c) => {
      const words = c.name.toLowerCase().replace(/[&,]/g, ' ').split(/\s+/)
        .filter((w: string) => w.length > 3 && !MaintenanceBotService.CATALOG_MATCH_STOPWORDS.has(w));
      return words.some((w: string) => lower.includes(w));
    });
    // Too many simultaneous matches means the words weren't distinctive
    // enough to trust — better to show nothing than something wrong.
    return matches.length <= 2 ? matches : [];
  }

  private async extractRecommendations(
    customerId: string,
    sessionId: string,
    messageId: string,
    recommendedName: string | null,
    userMessage: string,
  ): Promise<any[]> {
    const catalog = await this.pricingService.getAll();
    const bookable = catalog.filter((c) => c.isActive && c.customerRequestable !== false);

    let matches: any[] = [];
    if (recommendedName) {
      const lowerName = recommendedName.toLowerCase();
      matches = bookable.filter((c) => c.name.toLowerCase() === lowerName || lowerName.includes(c.name.toLowerCase()));
    }
    if (matches.length === 0) {
      matches = this.matchCatalogFromText(userMessage, bookable);
    }
    if (matches.length === 0) return [];

    const saved = await Promise.all(matches.map((c) => this.recommendationsRepo.save(
      this.recommendationsRepo.create({
        customerId,
        sessionId,
        messageId,
        servicePriceId: c.id,
        status: AiRecommendationStatus.SUGGESTED,
      }),
    )));
    return this.enrichRecommendations(saved, bookable);
  }

  private async enrichRecommendations(recs: AiRecommendation[], catalogHint?: any[]): Promise<any[]> {
    if (recs.length === 0) return [];
    const catalog = catalogHint ?? await this.pricingService.getAll(true);
    const catalogMap = new Map(catalog.map((c) => [c.id, c]));
    return recs.map((r) => {
      const item = catalogMap.get(r.servicePriceId);
      return {
        id: r.id,
        messageId: r.messageId,
        status: r.status,
        servicePriceId: r.servicePriceId,
        name: item?.name,
        description: item?.description,
        priceNote: item?.priceNote,
      };
    });
  }

  async respondToRecommendation(
    customerId: string,
    id: string,
    status: AiRecommendationStatus.ACCEPTED | AiRecommendationStatus.DECLINED,
  ): Promise<AiRecommendation> {
    const rec = await this.recommendationsRepo.findOne({ where: { id, customerId } });
    if (!rec) throw new NotFoundException('Recommendation not found');
    if (rec.status !== AiRecommendationStatus.SUGGESTED) {
      throw new BadRequestException('This recommendation has already been responded to');
    }
    rec.status = status;
    rec.respondedAt = new Date();
    return this.recommendationsRepo.save(rec);
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
  ): Promise<{ id: string; title: string; messages: ChatMessage[]; recommendations: any[] }> {
    const session = await this.sessionsRepo.findOne({ where: { id: sessionId, customerId } });
    if (!session) throw new NotFoundException('Session not found');

    const messages = await this.messagesRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });

    const recs = await this.recommendationsRepo.find({ where: { sessionId, customerId } });
    const recommendations = await this.enrichRecommendations(recs);

    return { id: session.id, title: session.title, messages, recommendations };
  }

  async deleteSession(customerId: string, sessionId: string): Promise<{ success: boolean }> {
    const session = await this.sessionsRepo.findOne({ where: { id: sessionId, customerId } });
    if (!session) throw new NotFoundException('Session not found');
    await this.sessionsRepo.remove(session);
    return { success: true };
  }
}
