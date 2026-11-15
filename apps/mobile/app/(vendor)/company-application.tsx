import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { onboardingApi, VendorApplication } from '../../src/services/api';
import { Section, ui } from '../../src/components/onboarding/OnboardingUI';
import { anyReading, InsurancePanel, StatesPanel, stateName } from '../../src/components/onboarding/CompanyDocuments';
import { colors } from '../../src/theme';

// Approved companies keeping their documents current:
//   - the states the company can operate in, each with its business
//     registration, and adding a registration for another state;
//   - the certificate of insurance (upload a renewed one any time).
// Documents are read automatically, then verified by Attenteve. Only the
// company admin can upload; technicians see the same status read-only.
export default function CompanyDocumentsScreen() {
  const [app, setApp] = useState<VendorApplication | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setApp(await onboardingApi.get());
    } catch (e: any) {
      Alert.alert('Could not load your documents', e.message);
    } finally {
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Re-check every 10 seconds while a document is being read.
  const reading = anyReading(app?.states, app?.documents.coiStatus);
  useEffect(() => {
    if (!reading) return;
    const timer = setInterval(() => { load(); }, 10_000);
    return () => clearInterval(timer);
  }, [reading, load]);

  if (!app) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;
  const admin = app.isCompanyAdmin;
  const operating = app.states.filter((s) => s.canOperate).map((s) => stateName(s.state));

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={ui.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <Text style={ui.title}>Company Documents</Text>
      <Text style={ui.subtitle}>
        {operating.length
          ? `You can serve customers in: ${operating.join(', ')}.`
          : 'You can\'t serve customers in any state yet. Upload a business registration for the states you serve.'}
      </Text>
      {!admin && <Text style={ui.sectionHint}>Only your company admin can upload documents.</Text>}

      <Section
        title="States you can operate in"
        hint="Customers only see your company in states where your business registration is verified. Add a registration for each state you serve."
      >
        <StatesPanel
          states={app.states}
          editable={admin}
          uploadRegistration={async (state, key) => setApp(await onboardingApi.uploadStateRegistration(state, key))}
        />
      </Section>

      <Section title="Certificate of insurance" hint="Upload your renewed certificate whenever your policy renews.">
        <InsurancePanel
          insurance={{ ...app.documents, expirationDate: app.documents.coiExpirationDate, documentUrl: app.documents.coiUrl }}
          editable={admin}
          uploadInsurance={async (key) => setApp(await onboardingApi.uploadInsurance(key))}
        />
      </Section>
    </ScrollView>
  );
}
