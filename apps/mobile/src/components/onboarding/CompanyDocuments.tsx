import { useState } from 'react';
import { View, Text, StyleSheet, Linking, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CoiReading, VendorState } from '../../services/api';
import { US_STATES } from '../AddressPicker';
import { DocumentUpload } from './DocumentUpload';
import { ExpiryText, formatDay, LICENSE_STATUS, LicenseStatusBadge } from './LicenseStatus';
import { StatePicker, ui } from './OnboardingUI';
import { colors } from '../../theme';

// The company-level documents Attenteve reads automatically, shared by the
// application (Documents screen) and approved vendors (Company Documents):
//
//   StatesPanel     one business registration per state the company serves,
//                   with whether it can take jobs there, and "add a state"
//   InsurancePanel  the certificate of insurance, with what was read from it
//
// Both only display and upload; the parent screen calls the API (passed in as
// `upload...`) and refreshes, and re-checks every few seconds while anything
// is still "Reading…".

/** The person or company that every certificate must name as additional insured. */
export const ADDITIONAL_INSURED = 'Attenteve LLC';

const STATE_NAME: Record<string, string> = Object.fromEntries(Object.entries(US_STATES).map(([name, code]) => [code, name]));
export const stateName = (code: string) => STATE_NAME[code] ?? code;

// Registration wording for each status (licenses use LICENSE_STATUS's hints).
const REG_HINT: Record<string, string> = {
  READING: 'We are reading your registration. This can take a couple of minutes.',
  PENDING_REVIEW: 'Your registration was read. Attenteve will verify it.',
  NEEDS_REVIEW: 'Attenteve will check this registration by hand.',
  APPROVED: 'Verified by Attenteve.',
  REJECTED: 'Upload a registration showing your business is active in this state.',
  EXPIRED: 'Upload your registration for this state to serve customers here again.',
};

type Tone = { bg: string; border: string; text: string };
const GOOD: Tone = { bg: colors.successSoft, border: colors.successBorder, text: colors.successText };
const WARN: Tone = { bg: colors.warningSoft, border: colors.warningBorder, text: colors.warningText };
const BAD: Tone = { bg: colors.dangerSoft, border: colors.dangerBorder, text: colors.dangerText };

function Chip({ label, tone }: { label: string; tone: Tone }) {
  return (
    <View style={[styles.chip, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <Text style={[styles.chipText, { color: tone.text }]}>{label}</Text>
    </View>
  );
}

function Reasons({ reasons }: { reasons: string[] | null | undefined }) {
  if (!reasons?.length) return null;
  return <>{reasons.map((r) => <Text key={r} style={styles.reason}>• {r}</Text>)}</>;
}

// ── States ──────────────────────────────────────────────────────────────────

/** A headline for one state: can it take jobs there, and if not, why. */
function stateHeadline(s: VendorState): { label: string; tone: Tone } | null {
  const r = s.registration;
  if (s.canOperate) return r?.graceUntil ? { label: `Can operate until ${formatDay(r.graceUntil)}`, tone: WARN } : { label: 'Can operate', tone: GOOD };
  if (r?.status === 'APPROVED' && !s.open) return { label: 'Registered · not open yet', tone: WARN };
  if (!r) return { label: 'Registration needed', tone: BAD };
  return null; // shown with the normal status badge instead
}

function canUpload(s: VendorState): boolean {
  const r = s.registration;
  if (!r || !r.documentUrl) return true;                 // nothing uploaded, or a temporary pass
  return ['REJECTED', 'EXPIRED', 'NEEDS_REVIEW'].includes(r.status);
}

export function StatesPanel({ states, editable, uploadRegistration }: {
  states: VendorState[];
  editable: boolean;
  uploadRegistration: (state: string, documentKey: string) => Promise<void>;
}) {
  const [newState, setNewState] = useState('');
  const known = new Set(states.map((s) => s.state));

  return (
    <View>
      {states.length === 0 && (
        <Text style={ui.sectionHint}>Choose the counties you serve first. You need a business registration for each state they are in.</Text>
      )}

      {states.map((s) => {
        const r = s.registration;
        const headline = stateHeadline(s);
        return (
          <View key={s.state} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{stateName(s.state)} ({s.state})</Text>
              {headline && <Chip {...headline} />}
            </View>
            {r && !s.canOperate && r.status !== 'APPROVED' && <LicenseStatusBadge status={r.status} />}
            {r?.status === 'READING' && <ActivityIndicator style={styles.spinner} color={colors.lanternDeep} />}

            {!s.required && <Text style={styles.detail}>You have no counties in {s.state}; customers there won't see you.</Text>}
            {s.required && !s.open && <Text style={styles.detail}>Attenteve isn't open in {stateName(s.state)} yet.</Text>}
            {r?.graceUntil && !r.documentUrl && (
              <Text style={[styles.detail, { color: colors.warningText }]}>
                You were already serving {s.state}, so you can keep serving it until {formatDay(r.graceUntil)}. Upload your {s.state} registration before then.
              </Text>
            )}

            {r?.documentUrl && r.status !== 'READING' && (
              <>
                {(r.businessName || r.entityNumber) && (
                  <Text style={styles.detail}>{[r.businessName, r.entityNumber && `#${r.entityNumber}`].filter(Boolean).join(' · ')}</Text>
                )}
                {r.registrationStatus && <Text style={styles.detail}>Status on the document: {r.registrationStatus}</Text>}
                <Text style={styles.detail}>{REG_HINT[r.status]}</Text>
                <Reasons reasons={r.reviewReasons} />
                {r.reviewNotes && !r.reviewReasons.includes(r.reviewNotes) && <Text style={styles.reason}>Attenteve: {r.reviewNotes}</Text>}
                <Text style={ui.link} onPress={() => Linking.openURL(r.documentUrl!)}>View document</Text>
              </>
            )}

            {editable && canUpload(s) && (
              <DocumentUpload
                title={`Upload your ${s.state} business registration`}
                hint={`Your ${stateName(s.state)} certificate of existence, good standing or registration showing your company name. A PDF (up to 10 MB) or a clear photo.`}
                what="registration"
                buttonLabel="Upload Registration"
                folder="vendor-applications"
                submit={(key) => uploadRegistration(s.state, key)}
              />
            )}
          </View>
        );
      })}

      {editable && (
        <View style={[styles.card, { borderStyle: 'dashed' }]}>
          <Text style={styles.cardTitle}>Add another state</Text>
          <Text style={styles.detail}>Registered in more states? Add each one so you can serve customers there as Attenteve opens.</Text>
          <StatePicker value={newState} onChange={setNewState} placeholder="Choose a state" />
          {!!newState && known.has(newState) && <Text style={styles.detail}>{stateName(newState)} is already listed above.</Text>}
          {!!newState && !known.has(newState) && (
            <DocumentUpload
              title={`Upload your ${newState} business registration`}
              hint="A PDF (up to 10 MB) or a clear photo."
              what="registration"
              buttonLabel="Upload Registration"
              folder="vendor-applications"
              submit={async (key) => { await uploadRegistration(newState, key); setNewState(''); }}
            />
          )}
        </View>
      )}
    </View>
  );
}

// ── Insurance ───────────────────────────────────────────────────────────────

type Insurance = CoiReading & { expirationDate: string | null; documentUrl: string | null };

export function InsurancePanel({ insurance, editable, uploadInsurance, uploadTitle }: {
  insurance: Insurance;
  editable: boolean;
  uploadInsurance: (documentKey: string) => Promise<void>;
  uploadTitle?: string;
}) {
  const i = insurance;
  const status = i.coiStatus;
  const money = (n: number) => `$${n.toLocaleString('en-US')}`;
  return (
    <View>
      <View style={styles.requirement}>
        <Ionicons name="information-circle-outline" size={18} color={colors.lanternDeep} />
        <Text style={styles.requirementText}>
          Your general liability certificate must list <Text style={{ fontWeight: '700' }}>{ADDITIONAL_INSURED}</Text> as additional
          insured, with at least $1,000,000 per occurrence. Ask your insurance agent for a certificate naming {ADDITIONAL_INSURED}.
        </Text>
      </View>

      {i.documentUrl && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Certificate on file</Text>
          {status && <LicenseStatusBadge status={status} />}
          {status === 'READING' && <ActivityIndicator style={styles.spinner} color={colors.lanternDeep} />}
          {status !== 'READING' && (
            <>
              <ExpiryText date={i.expirationDate} status={status ?? 'APPROVED'} />
              {i.coiInsurerName && <Text style={styles.detail}>Insurer: {i.coiInsurerName}{i.coiPolicyNumber ? ` · Policy ${i.coiPolicyNumber}` : ''}</Text>}
              {i.coiGeneralLiability != null && <Text style={styles.detail}>General liability: {money(i.coiGeneralLiability)} per occurrence</Text>}
              {i.coiAdditionalInsured != null && (
                <Text style={styles.detail}>
                  Additional insured: {i.coiAdditionalInsured ? (i.coiAdditionalInsuredName ?? 'yes') : 'not shown'}
                </Text>
              )}
              {status && <Text style={styles.detail}>{(LICENSE_STATUS[status]?.hint ?? '').replace('license', 'certificate')}</Text>}
              <Reasons reasons={i.coiReviewReasons} />
              {i.coiReviewNotes && !i.coiReviewReasons.includes(i.coiReviewNotes) && <Text style={styles.reason}>Attenteve: {i.coiReviewNotes}</Text>}
            </>
          )}
          <Text style={ui.link} onPress={() => Linking.openURL(i.documentUrl!)}>View certificate</Text>
        </View>
      )}

      {editable && status !== 'READING' && (
        <DocumentUpload
          title={uploadTitle ?? (i.documentUrl ? 'Upload a new certificate' : 'Upload your certificate of insurance')}
          hint="A PDF (up to 10 MB) or a clear photo. We read the policy dates, the general liability limit and the additional insured for you."
          what="certificate"
          buttonLabel="Upload Certificate"
          folder="vendor-applications"
          submit={uploadInsurance}
        />
      )}
    </View>
  );
}

/** True while anything on these panels is still being read (the screen re-checks every 10 s). */
export function anyReading(states: VendorState[] | undefined, coiStatus: string | null | undefined): boolean {
  return coiStatus === 'READING' || !!states?.some((s) => s.registration?.status === 'READING');
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginTop: 10, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.lanternDeep },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontSize: 12, fontWeight: '700' },
  detail: { fontSize: 13, color: colors.steel, marginTop: 4, lineHeight: 18 },
  reason: { fontSize: 13, color: colors.warningText, marginTop: 4, lineHeight: 18 },
  spinner: { alignSelf: 'flex-start', marginTop: 6 },
  requirement: { flexDirection: 'row', gap: 8, backgroundColor: colors.mist, borderRadius: 10, padding: 10, marginBottom: 4 },
  requirementText: { flex: 1, fontSize: 13, color: colors.ink, lineHeight: 18 },
});
