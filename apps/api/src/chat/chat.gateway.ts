import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatMessage } from './entities/message.entity';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers = new Map<string, string>();

  constructor(
    @InjectRepository(ChatMessage)
    private messagesRepo: Repository<ChatMessage>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.split(' ')[1];
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET'),
      });
      client.data.userId = payload.sub;
      this.connectedUsers.set(payload.sub, client.id);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data.userId) {
      this.connectedUsers.delete(client.data.userId);
    }
  }

  @SubscribeMessage('join-room')
  joinRoom(@MessageBody() data: { roomId: string }, @ConnectedSocket() client: Socket) {
    client.join(data.roomId);
    return { event: 'joined', roomId: data.roomId };
  }

  @SubscribeMessage('send-message')
  async sendMessage(
    @MessageBody() data: { roomId: string; content: string; recipientId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const message = this.messagesRepo.create({
      roomId: data.roomId,
      senderId: client.data.userId,
      content: data.content,
    });
    const saved = await this.messagesRepo.save(message);

    this.server.to(data.roomId).emit('new-message', saved);

    if (!this.connectedUsers.has(data.recipientId)) {
      await this.notificationsService.notifyUser(
        data.recipientId,
        NotificationType.NEW_MESSAGE,
        'New Message',
        data.content.substring(0, 100),
        { roomId: data.roomId },
      );
    }

    return saved;
  }

  @SubscribeMessage('get-messages')
  async getMessages(@MessageBody() data: { roomId: string }) {
    return this.messagesRepo.find({
      where: { roomId: data.roomId },
      order: { createdAt: 'ASC' },
      take: 100,
    });
  }

  @SubscribeMessage('mark-read')
  async markRead(@MessageBody() data: { roomId: string }, @ConnectedSocket() client: Socket) {
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
