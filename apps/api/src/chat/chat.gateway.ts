import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatMessage } from './entities/message.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { UsersService } from '../users/users.service';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';
import { JobEventsService } from '../job-events/job-events.service';
import { JobEventType } from '../job-events/job-event.entity';

// One chat room per service request (roomId = the request id), between the
// customer (and their household) and the assigned vendor.
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    @InjectRepository(ChatMessage)
    private messagesRepo: Repository<ChatMessage>,
    @InjectRepository(ServiceRequest)
    private requestsRepo: Repository<ServiceRequest>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private usersService: UsersService,
    private notificationsService: NotificationsService,
    private events: JobEventsService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.split(' ')[1];
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET'),
      });
      client.data.userId = payload.sub;
    } catch {
      client.emit('chat-error', { message: 'Your sign-in has expired. Please sign in again.' });
      client.disconnect();
    }
  }

  handleDisconnect() {
    // Rooms are dropped by socket.io automatically.
  }

  // The request's other party for this user, or null when the user isn't
  // on this job (not its vendor, customer or a member of the customer's home).
  private async otherParty(userId: string, roomId: string): Promise<{ request: ServiceRequest; recipientId: string | null } | null> {
    if (!userId || !/^[0-9a-f-]{36}$/i.test(roomId ?? '')) return null;
    const request = await this.requestsRepo.findOne({ where: { id: roomId } });
    if (!request) return null;
    if (request.vendorId === userId) return { request, recipientId: request.customerId };
    const related = await this.usersService.getRelatedCustomerIds(userId);
    if (related.includes(request.customerId)) return { request, recipientId: request.vendorId ?? null };
    return null;
  }

  @SubscribeMessage('join-room')
  async joinRoom(@MessageBody() data: { roomId: string }, @ConnectedSocket() client: Socket) {
    const access = await this.otherParty(client.data.userId, data?.roomId);
    if (!access) return { ok: false, error: 'You are not part of this job.' };
    client.join(data.roomId);
    return { ok: true };
  }

  @SubscribeMessage('leave-room')
  leaveRoom(@MessageBody() data: { roomId: string }, @ConnectedSocket() client: Socket) {
    if (data?.roomId) client.leave(data.roomId);
    return { ok: true };
  }

  @SubscribeMessage('send-message')
  async sendMessage(
    @MessageBody() data: { roomId: string; content: string },
    @ConnectedSocket() client: Socket,
  ) {
    const content = String(data?.content ?? '').trim().slice(0, 2000);
    if (!content) return { ok: false, error: 'Message is empty.' };
    const access = await this.otherParty(client.data.userId, data?.roomId);
    if (!access) return { ok: false, error: 'You are not part of this job.' };

    const saved = await this.messagesRepo.save(this.messagesRepo.create({
      roomId: data.roomId,
      senderId: client.data.userId,
      content,
    }));
    const withSender = await this.messagesRepo.findOne({ where: { id: saved.id }, relations: ['sender'] });
    const senderName = withSender?.sender ? `${withSender.sender.firstName} ${withSender.sender.lastName}` : undefined;
    const payload = { ...withSender, sender: undefined, senderName };

    this.server.to(data.roomId).emit('new-message', payload);

    // Who wrote and when (the text stays in chat_messages), for response
    // time and communication patterns per job.
    await this.events.record(
      JobEventType.MESSAGE_SENT, access.request,
      { role: access.request.vendorId === client.data.userId ? 'VENDOR' : 'CUSTOMER', id: client.data.userId },
      { messageId: saved.id, length: content.length },
    );

    // Push the recipient unless they have this chat open right now.
    const recipientId = access.recipientId;
    if (recipientId) {
      const inRoom = (await this.server.in(data.roomId).fetchSockets()).some((s) => s.data.userId === recipientId);
      if (!inRoom) {
        await this.notificationsService.notifyUser(
          recipientId,
          NotificationType.NEW_MESSAGE,
          senderName ? `Message from ${senderName.split(' ')[0]}` : 'New message',
          content.substring(0, 100),
          { roomId: data.roomId, serviceRequestId: data.roomId },
        ).catch((err) => this.logger.warn(`Chat push failed: ${err?.message ?? err}`));
      }
    }

    return { ok: true, message: payload };
  }

  @SubscribeMessage('get-messages')
  async getMessages(@MessageBody() data: { roomId: string }, @ConnectedSocket() client: Socket) {
    if (!(await this.otherParty(client.data.userId, data?.roomId))) return [];
    const messages = await this.messagesRepo.find({
      where: { roomId: data.roomId },
      order: { createdAt: 'ASC' },
      take: 200,
      relations: ['sender'],
    });
    return messages.map((m) => ({
      ...m,
      sender: undefined,
      senderName: m.sender ? `${m.sender.firstName} ${m.sender.lastName}` : undefined,
    }));
  }

  @SubscribeMessage('mark-read')
  async markRead(@MessageBody() data: { roomId: string }, @ConnectedSocket() client: Socket) {
    if (!(await this.otherParty(client.data.userId, data?.roomId))) return;
    await this.messagesRepo
      .createQueryBuilder()
      .update()
      .set({ readAt: new Date() })
      .where('roomId = :roomId AND senderId != :userId AND readAt IS NULL', {
        roomId: data.roomId,
        userId: client.data.userId,
      })
      .execute();
  }
}
