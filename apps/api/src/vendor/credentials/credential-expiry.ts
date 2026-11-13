import { CertificationType } from '../entities/vendor-capability.entity';
import { CertificationReviewStatus } from '../entities/vendor-certification.entity';

// Vendor credentials that expire: the company's certificate of insurance and
// each technician's trade licenses. Reminders go out 60, 30 and 7 days before
// the date; once it passes, the vendor is locked out of jobs and customer data
// (vendor-access.ts) until they upload a renewed credential.

export const REMINDER_DAYS = [60, 30, 7] as const;
// Stored in *ReminderSentDays once the "it has expired" email has gone out.
export const EXPIRED_NOTICE = 0;

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysUntil(expiry: Date, now: Date): number {
  return Math.ceil((new Date(expiry).getTime() - now.getTime()) / DAY_MS);
}

export function isExpired(expiry: Date | null | undefined, now: Date): boolean {
  return !!expiry && new Date(expiry).getTime() <= now.getTime();
}

// Which notice is due today, given the last one sent (null = none yet), or
// null when nothing new is due. Only the nearest threshold is sent, so a
// credential entered with 20 days left gets the 30-day notice once and the
// 7-day notice later, never the 60-day one.
export function dueNotice(expiry: Date | null, lastSentDays: number | null, now: Date): number | null {
  if (!expiry) return null; // still being read, or no date found yet
  if (isExpired(expiry, now)) return lastSentDays === EXPIRED_NOTICE ? null : EXPIRED_NOTICE;
  const left = daysUntil(expiry, now);
  const threshold = [...REMINDER_DAYS].reverse().find((t) => left <= t); // 7, then 30, then 60
  if (threshold === undefined) return null;
  if (lastSentDays !== null && lastSentDays <= threshold) return null;
  return threshold;
}

export interface LicenseLike {
  id: string;
  certificationType: CertificationType;
  status: CertificationReviewStatus;
  expirationDate: Date | null;
}

// A license type counts as expired only when none of the user's non-rejected
// licenses of that type is still current — adding a new license instead of
// renewing the old row clears the lock too. Returns the expired rows to renew
// (the newest one per type).
export function expiredLicenses<T extends LicenseLike>(licenses: T[], now: Date): T[] {
  // Licenses with no expiry date yet (still being read, or waiting for an
  // admin to fill it in) count as neither current nor expired.
  const live = licenses.filter((l) => l.status !== CertificationReviewStatus.REJECTED && !!l.expirationDate);
  const byType = new Map<CertificationType, T[]>();
  for (const l of live) byType.set(l.certificationType, [...(byType.get(l.certificationType) ?? []), l]);
  const out: T[] = [];
  for (const rows of byType.values()) {
    if (rows.some((r) => !isExpired(r.expirationDate, now))) continue;
    out.push(rows.sort((a, b) => new Date(b.expirationDate).getTime() - new Date(a.expirationDate).getTime())[0]);
  }
  return out;
}

export function noticeText(credential: string, notice: number, expiry: Date): { title: string; body: string } {
  const date = new Date(expiry).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  if (notice === EXPIRED_NOTICE) {
    return {
      title: `${credential} expired`,
      body: `Your ${credential.toLowerCase()} expired on ${date}. You can't see or accept jobs until you upload the renewed one. Open the Attenteve app to renew it.`,
    };
  }
  return {
    title: `${credential} expires in ${notice} days`,
    body: `Your ${credential.toLowerCase()} expires on ${date}. Upload the renewed one in the Attenteve app before then, or you'll lose access to jobs and customers until you do.`,
  };
}
