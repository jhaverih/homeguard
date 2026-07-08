import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { Ionicons } from '@expo/vector-icons';
import { HoumiLogo } from '../../src/components/HoumiLogo';
import { authApi, subscriptionsApi, api } from '../../src/services/api';
import { useAuthStore } from '../../src/store/auth.store';

type Step = 'select' | 'account' | 'plan' | 'vendor-confirm';

export default function RegisterScreen() {
  const [step, setStep] = useState<Step>('select');
  const [selectedRole, setSelectedRole] = useState<'CUSTOMER' | 'VENDOR' | null>(null);
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const { setAuth } = useAuthStore();
  const { control, handleSubmit, trigger, reset, formState: { errors } } = useForm();

  const isVendor = selectedRole === 'VENDOR';

  const handleRoleSelect = async (role: 'CUSTOMER' | 'VENDOR') => {
    setSelectedRole(role);
    if (role === 'CUSTOMER') {
      try {
        const fetchedPlans: any = await subscriptionsApi.getPlans();
        setPlans(fetchedPlans || []);
      } catch {
        setPlans([]);
      }
    }
    setStep('account');
  };

  const handleBack = () => {
    if (step === 'select') {
      router.back();
    } else {
      // Any step → cancel back to role selection, clear form
      setStep('select');
      setSelectedRole(null);
      setSelectedPlanId('');
      reset();
    }
  };

  const handleContinueFromAccount = async () => {
    const valid = await trigger();
    if (!valid) return;
    if (isVendor) {
      setStep('vendor-confirm');
    } else {
      setStep('plan');
    }
  };

  const onSubmit = async (data: any) => {
    setLoading(true);
    try {
      const res: any = await authApi.register({ ...data, roles: [selectedRole] });

      if (selectedRole === 'CUSTOMER' && selectedPlanId) {
        try {
          await api.post(`/subscriptions/subscribe/${selectedPlanId}`, {}, {
            headers: { Authorization: `Bearer ${res.accessToken}` },
          });
        } catch {
          // subscription can be chosen later from dashboard
        }
      }

      await setAuth(res.user, res.accessToken);
    } catch (e: any) {
      if (e.message === 'NETWORK_ERROR') {
        Alert.alert(
          'Cannot Connect to Server',
          'Make sure your phone is on your home WiFi.\n\nServer: 192.168.86.29',
        );
      } else {
        Alert.alert('Registration Failed', e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={22} color="#64748b" />
          {step !== 'select' && (
            <Text style={styles.backLabel}>Cancel — start over</Text>
          )}
        </TouchableOpacity>

        <View style={styles.logoRow}>
          <HoumiLogo size="md" />
        </View>

        {/* ── Step 1: Role selection ── */}
        {step === 'select' && (
          <>
            <Text style={styles.title}>Join Houmi</Text>
            <Text style={styles.subtitle}>Who are you signing up as?</Text>

            <TouchableOpacity style={styles.roleCard} onPress={() => handleRoleSelect('CUSTOMER')}>
              <View style={[styles.roleIconCircle, { backgroundColor: '#EBF1EF' }]}>
                <Ionicons name="home" size={32} color="#0B4A45" />
              </View>
              <View style={styles.roleCardText}>
                <Text style={styles.roleCardTitle}>Homeowner</Text>
                <Text style={styles.roleCardDesc}>Book inspections, maintenance, and home monitoring services.</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.roleCard} onPress={() => handleRoleSelect('VENDOR')}>
              <View style={[styles.roleIconCircle, { backgroundColor: '#fff8f0' }]}>
                <Ionicons name="construct" size={32} color="#FF7A45" />
              </View>
              <View style={styles.roleCardText}>
                <Text style={styles.roleCardTitle}>Service Provider</Text>
                <Text style={styles.roleCardDesc}>List your business and get matched with homeowners in your area.</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.loginRow} onPress={() => router.push('/(auth)/login')}>
              <Text style={styles.loginText}>Already have an account? </Text>
              <Text style={styles.loginLink}>Sign in</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Step 2: Account details ── */}
        {step === 'account' && (
          <>
            <Text style={styles.title}>Create Account</Text>
            <View style={[styles.rolePill, { backgroundColor: isVendor ? '#fff8f0' : '#EBF1EF' }]}>
              <Ionicons
                name={isVendor ? 'construct-outline' : 'home-outline'}
                size={14}
                color={isVendor ? '#FF7A45' : '#0B4A45'}
              />
              <Text style={[styles.rolePillText, { color: isVendor ? '#FF7A45' : '#0B4A45' }]}>
                {isVendor ? 'Service Provider' : 'Homeowner'}
              </Text>
            </View>

            {(['firstName', 'lastName', 'email', 'phone'] as const).map((field) => (
              <Controller
                key={field}
                control={control}
                name={field}
                rules={{
                  required: field !== 'phone'
                    ? `${field === 'firstName' ? 'First name' : field === 'lastName' ? 'Last name' : 'Email'} is required`
                    : false,
                  validate: field === 'email'
                    ? (v: string) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Enter a valid email'
                    : undefined,
                }}
                render={({ field: { onChange, value } }) => (
                  <>
                    <TextInput
                      style={[styles.input, errors[field] && styles.inputError]}
                      placeholder={
                        field === 'firstName' ? 'First Name' :
                        field === 'lastName' ? 'Last Name' :
                        field === 'email' ? 'Email' : 'Phone (optional)'
                      }
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
              rules={{ required: 'Password is required', minLength: { value: 8, message: 'Minimum 8 characters' } }}
              render={({ field: { onChange, value } }) => (
                <>
                  <TextInput
                    style={[styles.input, errors.password && styles.inputError]}
                    placeholder="Password (min 8 chars)"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry
                    value={value}
                    onChangeText={onChange}
                  />
                  {errors.password && <Text style={styles.errorText}>{(errors.password as any)?.message}</Text>}
                </>
              )}
            />

            {isVendor && (
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

            {!isVendor && (
              <>
                <Text style={styles.sectionLabel}>Home Address</Text>
                {(['address', 'city', 'state', 'zipCode'] as const).map((field) => (
                  <Controller
                    key={field}
                    control={control}
                    name={field}
                    rules={{
                      required: `${field === 'address' ? 'Street address' : field === 'city' ? 'City' : field === 'state' ? 'State' : 'Zip code'} is required`,
                    }}
                    render={({ field: { onChange, value } }) => (
                      <>
                        <TextInput
                          style={[styles.input, errors[field] && styles.inputError]}
                          placeholder={
                            field === 'address' ? 'Street Address' :
                            field === 'city' ? 'City' :
                            field === 'state' ? 'State (e.g. TN)' : 'Zip Code'
                          }
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

            <TouchableOpacity style={styles.button} onPress={handleContinueFromAccount}>
              <Text style={styles.buttonText}>Continue</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Step 3a: Plan selection (CUSTOMER) ── */}
        {step === 'plan' && (
          <>
            <Text style={styles.title}>Choose Your Plan</Text>
            <Text style={styles.subtitle}>Select the coverage that fits your home.</Text>

            {plans.length === 0 ? (
              <View style={styles.emptyPlans}>
                <Text style={styles.emptyPlansText}>No plans available yet. You can select a plan after registering.</Text>
              </View>
            ) : (
              plans.map((plan: any) => (
                <TouchableOpacity
                  key={plan.id}
                  style={[styles.planCard, selectedPlanId === plan.id && styles.planCardActive]}
                  onPress={() => setSelectedPlanId(plan.id)}
                >
                  {selectedPlanId === plan.id && (
                    <Ionicons name="checkmark-circle" size={20} color="#0B4A45" style={styles.planCheck} />
                  )}
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planPrice}>${plan.price}/year</Text>
                  {plan.features?.map((f: string, i: number) => (
                    <Text key={i} style={styles.planFeature}>✓ {f}</Text>
                  ))}
                </TouchableOpacity>
              ))
            )}

            <TouchableOpacity style={styles.button} onPress={handleSubmit(onSubmit)} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Account</Text>}
            </TouchableOpacity>
          </>
        )}

        {/* ── Step 3b: Vendor confirm ── */}
        {step === 'vendor-confirm' && (
          <>
            <Text style={styles.title}>Almost Done!</Text>
            <View style={styles.confirmBox}>
              <Ionicons name="construct" size={40} color="#FF7A45" style={{ marginBottom: 12 }} />
              <Text style={styles.confirmText}>
                Your Service Provider account will be created. You can complete your Stripe payout setup from your profile to start receiving payments.
              </Text>
            </View>
            <TouchableOpacity style={[styles.button, { backgroundColor: '#FF7A45' }]} onPress={handleSubmit(onSubmit)} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Account</Text>}
            </TouchableOpacity>
          </>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { padding: 24, paddingTop: 48, paddingBottom: 40 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  backLabel: { fontSize: 13, color: '#64748b' },
  logoRow: { alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '800', color: '#0f172a', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 15, color: '#64748b', textAlign: 'center', marginBottom: 24 },

  // Role selection cards
  roleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 16, padding: 18,
    borderWidth: 1.5, borderColor: '#e2e8f0', marginBottom: 14,
  },
  roleIconCircle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  roleCardText: { flex: 1 },
  roleCardTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a', marginBottom: 3 },
  roleCardDesc: { fontSize: 13, color: '#64748b', lineHeight: 18 },

  // Locked role pill on account step
  rolePill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center',
    gap: 5, paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 99, marginBottom: 20,
  },
  rolePillText: { fontSize: 13, fontWeight: '600' },

  sectionLabel: { fontSize: 15, fontWeight: '600', color: '#0B4A45', marginBottom: 10, marginTop: 6 },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12,
    padding: 15, fontSize: 16, marginBottom: 4, color: '#0f172a',
  },
  inputError: { borderColor: '#e53e3e' },
  errorText: { color: '#e53e3e', fontSize: 12, marginBottom: 8, marginLeft: 2 },

  button: {
    backgroundColor: '#0B4A45', borderRadius: 14, padding: 17,
    alignItems: 'center', marginTop: 12, marginBottom: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  planCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 2, borderColor: '#e2e8f0',
  },
  planCardActive: { borderColor: '#0B4A45', backgroundColor: '#EBF1EF' },
  planCheck: { position: 'absolute', top: 14, right: 14 },
  planName: { fontSize: 17, fontWeight: '700', color: '#0B4A45', marginBottom: 2 },
  planPrice: { fontSize: 22, fontWeight: '800', color: '#17897D', marginBottom: 8 },
  planFeature: { fontSize: 14, color: '#555', lineHeight: 22 },

  confirmBox: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#ffe0d0', marginBottom: 8,
  },
  confirmText: { fontSize: 15, color: '#555', lineHeight: 22, textAlign: 'center' },

  emptyPlans: {
    backgroundColor: '#fff4e5', borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#f6ad55',
  },
  emptyPlansText: { color: '#744210', fontSize: 14, lineHeight: 20 },

  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  loginText: { color: '#64748b', fontSize: 14 },
  loginLink: { fontSize: 14, fontWeight: '600', color: '#0B4A45' },
});
