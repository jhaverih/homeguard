import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FamilyInvite } from './family-invite.entity';
import { FamilyInvitesService } from './family-invites.service';
import { FamilyController, FamilyPublicController } from './family.controller';
import { User } from '../users/entities/user.entity';
import { CustomerProfile } from '../users/entities/customer-profile.entity';
import { CustomerSubscription } from '../subscriptions/entities/customer-subscription.entity';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailService } from '../common/email/email.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FamilyInvite, User, CustomerProfile, CustomerSubscription]),
    UsersModule,
    AuthModule,
    NotificationsModule,
    ConfigModule,
  ],
  providers: [FamilyInvitesService, EmailService],
  controllers: [FamilyController, FamilyPublicController],
})
export class FamilyModule {}
