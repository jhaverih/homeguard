import axios from 'axios';
import { JWT } from 'google-auth-library';
import { SdmDevice } from './nest-traits';

const SDM_SCOPE = 'https://www.googleapis.com/auth/sdm.service';
const PUBSUB_SCOPE = 'https://www.googleapis.com/auth/pubsub';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SDM_API = 'https://smartdevicemanagement.googleapis.com/v1';
const PUBSUB_API = 'https://pubsub.googleapis.com/v1';

// Everything Nest needs from the environment (see the NEST_* block in the
// QNAP .env). The OAuth + Device Access values are required for anything to
// work; the Pub/Sub pair only enables real-time events — without them the
// 5-minute poll still keeps readings flowing, just less promptly.
export interface NestConfig {
  clientId: string;
  clientSecret: string;
  projectId: string;
  redirectUri: string;
  pubsubSubscription: string | null;
  pubsubServiceAccountKey: { client_email: string; private_key: string } | null;
}

export function nestConfigFromEnv(env: NodeJS.ProcessEnv = process.env): NestConfig | null {
  const { NEST_CLIENT_ID, NEST_CLIENT_SECRET, NEST_PROJECT_ID } = env;
  if (!NEST_CLIENT_ID || !NEST_CLIENT_SECRET || !NEST_PROJECT_ID) return null;
  let key: NestConfig['pubsubServiceAccountKey'] = null;
  if (env.NEST_PUBSUB_SA_KEY_BASE64) {
    try {
      const parsed = JSON.parse(Buffer.from(env.NEST_PUBSUB_SA_KEY_BASE64, 'base64').toString('utf8'));
      if (parsed.client_email && parsed.private_key) key = { client_email: parsed.client_email, private_key: parsed.private_key };
    } catch {
      key = null; // reported by NestService at startup
    }
  }
  return {
    clientId: NEST_CLIENT_ID,
    clientSecret: NEST_CLIENT_SECRET,
    projectId: NEST_PROJECT_ID,
    redirectUri: env.NEST_REDIRECT_URI || 'https://api.attenteve.com/api/nest/oauth/callback',
    pubsubSubscription: env.NEST_PUBSUB_SUBSCRIPTION || null,
    pubsubServiceAccountKey: key,
  };
}

// Raised when Google rejects the refresh token itself (revoked in the Google
// account, app removed, or a Testing-mode consent screen's 7-day expiry) —
// only a fresh consent from the homeowner fixes it, never a retry.
export class NestAuthorizationRevokedError extends Error {}

export class SdmClient {
  constructor(private readonly config: NestConfig) {}

  // Google's Partner Connections Manager consent screen — the homeowner
  // picks which structures/devices Attenteve may see.
  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      redirect_uri: this.config.redirectUri,
      access_type: 'offline',
      prompt: 'consent',
      client_id: this.config.clientId,
      response_type: 'code',
      scope: SDM_SCOPE,
      state,
    });
    return `https://nestservices.google.com/partnerconnections/${this.config.projectId}/auth?${params}`;
  }

  async exchangeCode(code: string): Promise<{ refreshToken: string; accessToken: string; expiresIn: number }> {
    const res = await axios.post<any>(TOKEN_URL, new URLSearchParams({
      code, client_id: this.config.clientId, client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri, grant_type: 'authorization_code',
    }), { timeout: 15000 });
    if (!res.data.refresh_token) throw new Error('Google returned no refresh token — remove Attenteve from the Google account and connect again');
    return { refreshToken: res.data.refresh_token, accessToken: res.data.access_token, expiresIn: res.data.expires_in };
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    try {
      const res = await axios.post<any>(TOKEN_URL, new URLSearchParams({
        refresh_token: refreshToken, client_id: this.config.clientId, client_secret: this.config.clientSecret, grant_type: 'refresh_token',
      }), { timeout: 15000 });
      return { accessToken: res.data.access_token, expiresIn: res.data.expires_in };
    } catch (err: any) {
      if (err.response?.data?.error === 'invalid_grant') throw new NestAuthorizationRevokedError('Google access was revoked or expired — reconnect Nest');
      throw err;
    }
  }

  async revoke(token: string): Promise<void> {
    await axios.post('https://oauth2.googleapis.com/revoke', new URLSearchParams({ token }), { timeout: 15000 });
  }

  async listDevices(accessToken: string): Promise<SdmDevice[]> {
    const res = await axios.get<any>(`${SDM_API}/enterprises/${this.config.projectId}/devices`, {
      headers: { Authorization: `Bearer ${accessToken}` }, timeout: 20000,
    });
    return res.data.devices ?? [];
  }
}

export interface PubsubMessage { ackId: string; data: any }

// Synchronous pull over plain HTTPS — outbound only, like the YoLink MQTT
// connection, so nothing has to be exposed on the QNAP for real-time events.
export class PubsubClient {
  private readonly jwt: JWT;

  constructor(private readonly subscription: string, key: { client_email: string; private_key: string }) {
    this.jwt = new JWT({ email: key.client_email, key: key.private_key, scopes: [PUBSUB_SCOPE] });
  }

  async pull(maxMessages = 50): Promise<PubsubMessage[]> {
    const res = await this.jwt.request<any>({
      url: `${PUBSUB_API}/${this.subscription}:pull`, method: 'POST', data: { maxMessages }, timeout: 90000,
    });
    return (res.data.receivedMessages ?? []).map((m: any) => {
      let data: any = null;
      try {
        data = JSON.parse(Buffer.from(m.message?.data ?? '', 'base64').toString('utf8'));
      } catch {
        data = null; // malformed — still acked so it isn't redelivered forever
      }
      return { ackId: m.ackId, data };
    });
  }

  async acknowledge(ackIds: string[]): Promise<void> {
    if (ackIds.length === 0) return;
    await this.jwt.request({ url: `${PUBSUB_API}/${this.subscription}:acknowledge`, method: 'POST', data: { ackIds }, timeout: 30000 });
  }
}
