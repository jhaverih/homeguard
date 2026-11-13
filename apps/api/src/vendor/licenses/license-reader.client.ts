import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LicenseExtraction } from './license-validation';

// Talks to the license reader running on the AI laptop
// (services/license-reader, next to Ollama). It sends the license file and
// gets back the fields the AI read from it.
//
// Settings (QNAP .env, written from GitHub secrets by update-env.yml):
//   LICENSE_READER_URL  e.g. http://192.168.86.35:8090
//   READER_TOKEN        shared password; the reader refuses requests without it
//
// Reading a photo on the laptop's CPU can take a few minutes, so the timeout
// is generous. Any failure (laptop off, timeout, unreadable file) is returned
// as { ok: false, reason } so the caller can fall back to a manual review
// instead of failing the vendor's upload.

export type ReaderResult =
  | { ok: true; extraction: LicenseExtraction & { method?: string; model?: string } }
  | { ok: false; reason: string };

// A photo can take several minutes on the laptop CPU (the reader itself waits up to 7).
const TIMEOUT_MS = 8 * 60 * 1000;
const CONFIDENCE = new Set(['high', 'medium', 'low']);

@Injectable()
export class LicenseReaderClient {
  private readonly logger = new Logger(LicenseReaderClient.name);

  constructor(private config: ConfigService) {}

  async read(file: { data: Buffer; contentType: string; filename: string }, trade: string): Promise<ReaderResult> {
    const url = this.config.get<string>('LICENSE_READER_URL');
    const token = this.config.get<string>('READER_TOKEN');
    if (!url || !token) return { ok: false, reason: 'Automatic reading is not set up on this server.' };

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file.data)], { type: file.contentType }), file.filename);
    form.append('trade', trade);

    try {
      const res = await fetch(`${url.replace(/\/$/, '')}/extract`, {
        method: 'POST',
        headers: { 'X-Reader-Token': token },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        const detail = await res.json().then((b: any) => b?.detail).catch(() => null);
        this.logger.warn(`License reader returned ${res.status}: ${detail ?? ''}`);
        return { ok: false, reason: res.status === 422 && detail ? String(detail) : 'Automatic reading was unavailable.' };
      }
      const body: any = await res.json();
      if (!body || !CONFIDENCE.has(body.confidence)) return { ok: false, reason: 'Automatic reading returned an unexpected answer.' };
      return { ok: true, extraction: body };
    } catch (err) {
      this.logger.warn(`License reader unreachable: ${(err as Error).message}`);
      return { ok: false, reason: 'Automatic reading was unavailable.' };
    }
  }
}
