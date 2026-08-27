import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { FcmService } from './fcm.service';
import { NotificationsController } from './notifications.controller';
import { AppNotification } from './entities/notification.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([AppNotification]), UsersModule, ConfigModule],
  providers: [NotificationsService, FcmService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
