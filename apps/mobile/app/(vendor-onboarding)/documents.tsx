import { useEffect } from 'react';
import { ScrollView, ActivityIndicator } from 'react-native';
import { onboardingApi } from '../../src/services/api';
import { useVendorApplication } from '../../src/hooks/useVendorApplication';
import { LockedNotice, ReviewerNote, Section, ui } from '../../src/components/onboarding/OnboardingUI';
import { anyReading, InsurancePanel, StatesPanel } from '../../src/components/onboarding/CompanyDocuments';
import { colors } from '../../src/theme';

// Application step: a business registration for each state the company serves,
// and the certificate of insurance. Both are read automatically by Attenteve's
// AI (on its own computer, nothing sent outside); the screen re-checks every
// 10 seconds while a document is still being read.
export default function DocumentsScreen() {
  const { app, setApp, loading, reload, item } = useVendorApplication();

  const reading = anyReading(app?.states, app?.documents.coiStatus);
  useEffect(() => {
    if (!reading) return;
    const timer = setInterval(() => { reload(); }, 10_000);
    return () => clearInterval(timer);
  }, [reading, reload]);

  if (loading || !app) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;
  const reg = item('stateRegistration');
  const ins = item('insurance');

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <Section
        title="State business registrations"
        hint="You need a business registration for every state you serve. Customers only see your company in states where your registration is verified."
      >
        <ReviewerNote note={reg?.reviewerNote} />
        <StatesPanel
          states={app.states}
          editable={!!reg?.editable}
          uploadRegistration={async (state, key) => setApp(await onboardingApi.uploadStateRegistration(state, key))}
        />
        {!reg?.editable && <LockedNotice />}
      </Section>

      <Section title="Certificate of insurance" hint="Your general liability certificate of insurance (COI).">
        <ReviewerNote note={ins?.reviewerNote} />
        <InsurancePanel
          insurance={{ ...app.documents, expirationDate: app.documents.coiExpirationDate, documentUrl: app.documents.coiUrl }}
          editable={!!ins?.editable}
          uploadInsurance={async (key) => setApp(await onboardingApi.uploadInsurance(key))}
        />
        {!ins?.editable && <LockedNotice />}
      </Section>
    </ScrollView>
  );
}
