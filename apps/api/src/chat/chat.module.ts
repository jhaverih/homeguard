import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChatGateway } from './chat.gateway';
import { ChatMessage } from './entities/message.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMessage, ServiceRequest]),
    NotificationsModule,
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET', 'fallback-secret-change-me'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [ChatGateway],
  exports: [ChatGateway],
})
export class ChatModule {}
