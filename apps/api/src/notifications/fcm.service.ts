import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

// Direct FCM sends, bypassing Expo's push relay entirely — built specifically
// because Expo's hosted push service silently drops the categoryId field
// before it reaches FCM (confirmed via on-device diagnostic: notifications
// arrive with categoryIdentifier: MISSING despite our server setting it and
// expo-server-sdk's actual runtime doing a raw passthrough of the message
// object — the drop happens somewhere inside Expo's own relay, outside this
// codebase). expo-notifications' native Android FCM receiver reads plain
// `data.title` / `data.message` / `data.categoryId` / `data.body` (JSON
// blob) regardless of which server sent the message, so a correctly-shaped
// direct FCM data payload is picked up by the exact same notification-
// building code that already renders title/body correctly today — we're
// only replacing the transport for the one field Expo drops.
@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private ready = false;

  constructor(private configService: ConfigService) {}

  onModuleInit(): void {
    // Base64-encoded, not raw JSON — a private key's PEM content plus JSON's
    // own quoting makes a .env-safe raw encoding fragile across parsers
    // (dotenv locally vs. Docker Compose's env_file on deploy each have
    // their own quote/escape rules); base64 sidesteps that entirely.
    const raw = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON_BASE64');
    if (!raw) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 not set — direct-FCM sends disabled, falling back to Expo push for all notifications.');
      return;
    }
    try {
      const serviceAccount = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
      if (!getApps().length) {
        initializeApp({ credential: cert(serviceAccount) });
      }
      this.ready = true;
    } catch (err) {
      this.logger.error('Failed to initialize Firebase Admin from FIREBASE_SERVICE_ACCOUNT_JSON', err as Error);
    }
  }

  get isReady(): boolean {
    return this.ready;
  }

  // FCM data payloads require every value to be a string — callers pass
  // already-string values; this only exists to fail loudly if that
  // contract is violated rather than silently sending a malformed message.
  async sendDataMessage(token: string, data: Record<string, string>): Promise<boolean> {
    if (!this.ready) return false;
    try {
      await getMessaging().send({
        token,
        data,
        android: { priority: 'high' },
      });
      return true;
    } catch (err) {
      this.logger.warn(`Direct FCM send failed for token ending …${token.slice(-6)}: ${(err as Error).message}`);
      return false;
    }
  }
}
