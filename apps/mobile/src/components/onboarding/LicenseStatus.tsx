import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme';

// How a license's status is shown to the contractor, everywhere in the app.
// Statuses come from the API (vendor-certification.entity.ts):
//   READING        the AI engine is reading the uploaded license
//   PENDING_REVIEW read cleanly, waiting for Attenteve to verify it
//   NEEDS_REVIEW   read, but Attenteve needs to check something by hand
//   APPROVED       verified
//   REJECTED       not accepted (for example, it had already expired)
//   EXPIRED        was valid, but the expiry date has passed

type Tone = { bg: string; border: string; text: string };
const NEUTRAL: Tone = { bg: colors.mist, border: colors.border, text: colors.steel };
const WARN: Tone = { bg: colors.warningSoft, border: colors.warningBorder, text: colors.warningText };
const GOOD: Tone = { bg: colors.successSoft, border: colors.successBorder, text: colors.successText };
const BAD: Tone = { bg: colors.dangerSoft, border: colors.dangerBorder, text: colors.dangerText };

export const LICENSE_STATUS: Record<string, { label: string; tone: Tone; hint: string }> = {
  READING: { label: 'Reading…', tone: NEUTRAL, hint: 'We are reading your license. This can take a couple of minutes.' },
  PENDING_REVIEW: { label: 'Pending verification', tone: WARN, hint: 'Your license was read. Attenteve will verify it.' },
  NEEDS_REVIEW: { label: 'Needs review', tone: WARN, hint: 'Attenteve will check this license by hand.' },
  APPROVED: { label: 'Verified', tone: GOOD, hint: 'Verified by Attenteve.' },
  REJECTED: { label: 'Not accepted', tone: BAD, hint: 'Upload a current, readable copy of this license.' },
  EXPIRED: { label: 'Expired', tone: BAD, hint: 'This license has expired. Upload your renewed license.' },
};

/** A date like "Mar 1, 2027", or "—" when there is none. Dates are stored at noon UTC, so this shows the printed day. */
export function formatDay(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Whole days until a date (negative once it has passed), or null. */
export function daysLeft(value: string | null | undefined): number | null {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
}

export function LicenseStatusBadge({ status }: { status: string }) {
  const s = LICENSE_STATUS[status] ?? { label: status, tone: NEUTRAL };
  return (
    <View style={[styles.badge, { backgroundColor: s.tone.bg, borderColor: s.tone.border }]}>
      <Text style={[styles.badgeText, { color: s.tone.text }]}>{s.label}</Text>
    </View>
  );
}

/** Expiry line: "Expires Mar 1, 2027", plus a warning within 30 days. */
export function ExpiryText({ date, status }: { date: string | null; status: string }) {
  if (status === 'READING') return null;
  const left = daysLeft(date);
  const soon = left !== null && left >= 0 && left <= 30 && status !== 'EXPIRED' && status !== 'REJECTED';
  return (
    <Text style={[styles.expiry, soon && { color: colors.warningText, fontWeight: '700' }]}>
      {date ? `Expires ${formatDay(date)}` : 'Expiry date not found'}
      {soon ? ` · expires in ${left} day${left === 1 ? '' : 's'}` : ''}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  expiry: { fontSize: 13, color: colors.steel, marginTop: 4 },
});
