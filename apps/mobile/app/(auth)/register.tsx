import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { Ionicons } from '@expo/vector-icons';
import { HoumiLogo } from '../../src/components/HoumiLogo';
import { authApi, subscriptionsApi, api } from '../../src/services/api';
import { useAuthStore } from '../../src/store/auth.store';

export default function RegisterScreen() {
  const { role: roleParam } = useLocalSearchParams<{ role?: string }>();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'account' | 'role' | 'plan'>('account');
  const [selectedRole, setSelectedRole] = useState<'CUSTOMER' | 'VENDOR'>(
    roleParam === 'VENDOR' ? 'VENDOR' : 'CUSTOMER'
  );
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const { setAuth } = useAuthStore();
  const { control, handleSubmit, getValues, trigger, formState: { errors } } = useForm();

  const goToRoleStep = async () => {
    const valid = await trigger();
    if (!valid) return;

    if (selectedRole === 'CUSTOMER') {
      try {
        const fetchedPlans: any = await subscriptionsApi.getPlans();
        setPlans(fetchedPlans || []);
      } catch {
        setPlans([]);
      }
      setStep('plan');
    } else {
      setStep('role');
    }
  };

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      const payload: any = {
        ...data,
        roles: [selectedRole],
      };

      const res: any = await authApi.register(payload);

      if (selectedRole === 'CUSTOMER' && selectedPlanId) {
        try {
          await api.post(`/subscriptions/subscribe/${selectedPlanId}`, {}, {
            headers: { Authorization: `Bearer ${res.accessToken}` },
          });
        } catch {
          // Subscription can be chosen later from the dashboard
        }
      }

      // Triggers navigation via AuthRedirect in _layout.tsx — subscription already created
      await setAuth(res.user, res.accessToken);
    } catch (e: any) {
      if (e.message === 'NETWORK_ERROR') {
        Alert.alert(
          'Cannot Connect to Server',
          'Your phone cannot reach the Houmi server.\n\nMake sure your phone is connected to your home WiFi (not cellular data).\n\nServer: 192.168.86.29',
        );
      } else {
        Alert.alert('Registration Failed', e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const isVendor = selectedRole === 'VENDOR';
  const accent = isVendor ? '#0B4A45' : '#0B4A45';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={22} color="#64748b" />
      </TouchableOpacity>

      <View style={styles.logoRow}>
        <HoumiLogo size="md" />
      </View>
      <Text style={styles.title}>Create Account</Text>

      <View style={[styles.roleBadge, { backgroundColor: isVendor ? '#e8f5e9' : '#EBF1EF' }]}>
        <Ionicons name={isVendor ? 'construct-outline' : 'home-outline'} size={16} color={accent} />
        <Text style={[styles.roleBadgeText, { color: accent }]}>
          {isVendor ? 'Service Provider Account' : 'Homeowner Account'}
        </Text>
      </View>

      {step === 'account' && (
        <>

          {(['firstName', 'lastName', 'email', 'phone'] as const).map((field) => (
            <Controller
              key={field}
              control={control}
              name={field}
              rules={{
                required: field !== 'phone' ? `${field === 'firstName' ? 'First name' : field === 'lastName' ? 'Last name' : 'Email'} is required` : false,
                validate: field === 'email'
                  ? (v: string) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Enter a valid email address'
                  : undefined,
              }}
              render={({ field: { onChange, value } }) => (
                <>
                  <TextInput
                    style={[styles.input, errors[field] && styles.inputError]}
                    placeholder={field === 'firstName' ? 'First Name' : field === 'lastName' ? 'Last Name' : field === 'email' ? 'Email' : 'Phone (optional)'}
                    placeholderTextColor="#94a3b8"
                    autoCapitalize={field === 'email' ? 'none' : 'words'}
                    keyboardType={field === 'email' ? 'email-address' : field === 'phone' ? 'phone-pad' : 'default'}
                    value={value}
                    onChangeText={onChange}
                  />
                  {errors[field] && <Text style={styles.errorText}>{(errors[field] as any)?.message}</Text>}
                </>
              )}
            />
          ))}

          <Controller
            control={control}
            name="password"
            rules={{ required: 'Password is required', minLength: { value: 8, message: 'Password must be at least 8 characters' } }}
            render={({ field: { onChange, value } }) => (
              <>
                <TextInput style={[styles.input, errors.password && styles.inputError]} placeholder="Password (min 8 chars)" placeholderTextColor="#94a3b8" secureTextEntry value={value} onChangeText={onChange} />
                {errors.password && <Text style={styles.errorText}>{(errors.password as any)?.message}</Text>}
              </>
            )}
          />

          {selectedRole === 'VENDOR' && (
            <>
              <Text style={styles.sectionLabel}>Company Details</Text>
              <Controller
                control={control}
                name="companyName"
                rules={{ required: 'Company name is required' }}
                render={({ field: { onChange, value } }) => (
                  <>
                    <TextInput
                      style={[styles.input, errors.companyName && styles.inputError]}
                      placeholder="Company / Business Name"
                      placeholderTextColor="#94a3b8"
                      value={value}
                      onChangeText={onChange}
                    />
                    {errors.companyName && <Text style={styles.errorText}>{(errors.companyName as any)?.message}</Text>}
                  </>
                )}
              />
            </>
          )}

          {selectedRole === 'CUSTOMER' && (
            <>
              <Text style={styles.sectionLabel}>Home Address</Text>
              {(['address', 'city', 'state', 'zipCode'] as const).map((field) => (
                <Controller
                  key={field}
                  control={control}
                  name={field}
                  rules={{ required: `${field === 'address' ? 'Street address' : field === 'city' ? 'City' : field === 'state' ? 'State' : 'Zip code'} is required` }}
                  render={({ field: { onChange, value } }) => (
                    <>
                      <TextInput
                        style={[styles.input, errors[field] && styles.inputError]}
                        placeholder={field === 'address' ? 'Street Address' : field === 'city' ? 'City' : field === 'state' ? 'State (e.g. FL)' : 'Zip Code'}
                        placeholderTextColor="#94a3b8"
                        value={value}
                        onChangeText={onChange}
                      />
                      {errors[field] && <Text style={styles.errorText}>{(errors[field] as any)?.message}</Text>}
                    </>
                  )}
                />
              ))}
            </>
          )}

          <TouchableOpacity style={styles.button} onPress={goToRoleStep}>
            <Text style={styles.buttonText}>Continue</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 'plan' && (
        <>
          <Text style={styles.sectionLabel}>Choose Your Plan</Text>
          {plans.length === 0 && (
            <View style={styles.emptyPlans}>
              <Text style={styles.emptyPlansText}>No plans available yet. You can select a plan after registering.</Text>
            </View>
          )}
          {plans.map((plan: any) => (
            <TouchableOpacity
              key={plan.id}
              style={[styles.planCard, selectedPlanId === plan.id && styles.planCardActive]}
              onPress={() => setSelectedPlanId(plan.id)}
            >
              <Text style={styles.planName}>{plan.name}</Text>
              <Text style={styles.planPrice}>${plan.price}/year</Text>
              {plan.features?.map((f: string, i: number) => (
                <Text key={i} style={styles.planFeature}>✓ {f}</Text>
              ))}
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={styles.button}
            onPress={handleSubmit(onSubmit)}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Account</Text>}
          </TouchableOpacity>
        </>
      )}

      {step === 'role' && (
        <>
          <Text style={styles.sectionLabel}>Almost done!</Text>
          <Text style={styles.hint}>Your account is set up as a service provider. You can complete Stripe onboarding from your profile to receive payments.</Text>
          <TouchableOpacity style={styles.button} onPress={handleSubmit(onSubmit)} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Account</Text>}
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity
        style={styles.loginRow}
        onPress={() => router.push({ pathname: '/(auth)/login', params: { role: selectedRole } })}
      >
        <Text style={styles.loginText}>Already have an account? </Text>
        <Text style={[styles.loginLink, { color: accent }]}>Sign in</Text>
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { padding: 24, paddingTop: 48, paddingBottom: 32 },
  backBtn: { marginBottom: 8 },
  logoRow: { alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a', textAlign: 'center', marginBottom: 12 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7, gap: 6, marginBottom: 20 },
  roleBadgeText: { fontSize: 13, fontWeight: '600' },
  sectionLabel: { fontSize: 16, fontWeight: '600', color: '#0B4A45', marginBottom: 12, marginTop: 8 },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 12,
    padding: 16, fontSize: 16, marginBottom: 4, color: '#0f172a',
  },
  inputError: { borderColor: '#e53e3e' },
  errorText: { color: '#e53e3e', fontSize: 12, marginBottom: 8, marginLeft: 4 },
  roleRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  roleChip: {
    flex: 1, padding: 16, borderRadius: 12, borderWidth: 2,
    borderColor: '#ddd', backgroundColor: '#fff', alignItems: 'center',
  },
  roleChipActive: { borderColor: '#0B4A45', backgroundColor: '#EBF1EF' },
  roleChipText: { fontSize: 14, fontWeight: '600', color: '#666' },
  roleChipTextActive: { color: '#0B4A45' },
  planCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 2, borderColor: '#ddd',
  },
  planCardActive: { borderColor: '#0B4A45', backgroundColor: '#EBF1EF' },
  planName: { fontSize: 18, fontWeight: '700', color: '#0B4A45', marginBottom: 4 },
  planPrice: { fontSize: 22, fontWeight: '800', color: '#17897D', marginBottom: 8 },
  planFeature: { fontSize: 14, color: '#555', lineHeight: 22 },
  button: {
    backgroundColor: '#0B4A45', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 8, marginBottom: 16,
  },
  buttonDisabled: { backgroundColor: '#ccc' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 32 },
  loginText: { color: '#64748b', fontSize: 14 },
  loginLink: { fontSize: 14, fontWeight: '600' },
  hint: { color: '#666', fontSize: 14, lineHeight: 22, marginBottom: 16 },
  emptyPlans: { backgroundColor: '#fff4e5', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#f6ad55' },
  emptyPlansText: { color: '#744210', fontSize: 14, lineHeight: 20 },
});
