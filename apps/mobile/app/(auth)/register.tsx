import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Linking,
} from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { Ionicons } from '@expo/vector-icons';
import { AttenteveLogo } from '../../src/components/AttenteveLogo';
import { PlanName } from '../../src/components/PlanName';
import { AddressPicker, AddressResult } from '../../src/components/AddressPicker';
import { authApi, subscriptionsApi, api, TERMS_URL, VENDOR_TERMS_URL, API_URL } from '../../src/services/api';
import { useAuthStore } from '../../src/store/auth.store';
import { colors } from '../../src/theme';

// Vendors only create the account and company here. Everything else the
// review needs (services, licenses, service area, documents, photo, the
// background check statement) is collected afterwards on the in-app
// application checklist — app/(vendor-onboarding).
type Step = 'select' | 'account' | 'plan' | 'vendor-confirm' | 'verify';

type AddressFields = { street: string; city: string; state: string; zipCode: string };
const ADDRESS_FIELD_NAMES: Record<'CUSTOMER' | 'VENDOR', AddressFields> = {
  CUSTOMER: { street: 'address', city: 'city', state: 'state', zipCode: 'zipCode' },
  VENDOR: { street: 'companyAddress', city: 'companyCity', state: 'companyState', zipCode: 'companyZipCode' },
};

export default function RegisterScreen() {
  const [step, setStep] = useState<Step>('select');
  const [selectedRole, setSelectedRole] = useState<'CUSTOMER' | 'VENDOR' | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [pendingAuth, setPendingAuth] = useState<{ user: any; accessToken: string } | null>(null);
  const [pendingEmail, setPendingEmail] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [emailSendFailed, setEmailSendFailed] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [editEmailValue, setEditEmailValue] = useState('');
  const [updatingEmail, setUpdatingEmail] = useState(false);

  const [addressValidated, setAddressValidated] = useState(false);
  const [pickedAddress, setPickedAddress] = useState<AddressResult | null>(null);
  // Which of city/state/zipCode Nominatim didn't return for the picked
  // suggestion (most commonly zip, for rural/new-subdivision addresses) —
  // drives the fallback manual-entry mini-form below the confirmed-address box.
  const [missingAddressFields, setMissingAddressFields] = useState<('city' | 'state' | 'zipCode')[]>([]);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const { setAuth } = useAuthStore();
  const { control, handleSubmit, trigger, reset, setValue, formState: { errors } } = useForm();
  const isVendor = selectedRole === 'VENDOR';
  const addressFields = ADDRESS_FIELD_NAMES[isVendor ? 'VENDOR' : 'CUSTOMER'];

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  const startCooldown = () => {
    setCooldown(60);
    cooldownRef.current = setInterval(() => {
      setCooldown((c) => { if (c <= 1) { clearInterval(cooldownRef.current!); return 0; } return c - 1; });
    }, 1000);
  };

  const clearAddress = () => {
    for (const field of Object.values(addressFields)) setValue(field, '');
    setPickedAddress(null);
    setAddressValidated(false);
    setMissingAddressFields([]);
  };

  const handleRoleSelect = async (role: 'CUSTOMER' | 'VENDOR') => {
    setSelectedRole(role);
    if (role === 'CUSTOMER') {
      try { setPlans(((await subscriptionsApi.getPlans()) as any) || []); } catch { setPlans([]); }
    }
    setStep('account');
  };

  // One step back, keeping what was typed — only leaving the account step
  // (back to "who are you signing up as") starts the form over.
  const handleBack = () => {
    if (step === 'verify') {
      Alert.alert('Verify Your Email', 'Please enter the code sent to your email to complete registration.');
    } else if (step === 'select') {
      router.back();
    } else if (step === 'account') {
      setStep('select');
      setSelectedRole(null);
      setSelectedPlanId('');
      setAcceptedTerms(false);
      setAddressValidated(false);
      setPickedAddress(null);
      setMissingAddressFields([]);
      reset();
    } else {
      setAcceptedTerms(false);
      setStep('account');
    }
  };

  const handleContinueFromAccount = async () => {
    if (!addressValidated) {
      Alert.alert(
        'Address Required',
        isVendor
          ? 'Search for and select your business address from the suggestions to continue.'
          : 'Please search for and select your home address from the suggestions to continue.',
      );
      return;
    }
    // The address fields carry real `required` rules (see the hidden
    // Controllers below) — Nominatim frequently omits one of them (most
    // often zip), so "picked a suggestion" alone isn't enough; this also
    // catches whatever the fallback mini-form below hasn't been filled in
    // yet, since setValue() from AddressPicker/the fallback inputs both
    // write into the same tracked fields this trigger() call checks.
    const fields = ['firstName', 'lastName', 'email', 'phone', 'password', ...Object.values(addressFields), ...(isVendor ? ['companyName', 'ein'] : [])];
    if (!await trigger(fields)) return;
    setStep(isVendor ? 'vendor-confirm' : 'plan');
  };

  const onSubmit = async (data: any) => {
    if ((selectedRole === 'CUSTOMER' && selectedPlanId && !acceptedTerms) || (isVendor && !acceptedTerms)) {
      Alert.alert('Terms Required', 'Please accept the Terms and Conditions to continue.');
      return;
    }
    setLoading(true);
    try {
      const payload: any = { ...data, roles: [selectedRole] };
      const res: any = await authApi.register(payload);
      const authHeader = { headers: { Authorization: `Bearer ${res.accessToken}` } };
      if (selectedRole === 'CUSTOMER' && selectedPlanId) {
        try {
          await api.post(`/subscriptions/subscribe/${selectedPlanId}`, { acceptedTerms }, authHeader);
        } catch {}
      }
      // Recorded now with the version and timestamp; if this call fails the
      // app's terms gate asks again right after the first sign-in.
      if (isVendor) {
        try { await api.patch('/users/me/accept-terms', { termsType: 'VENDOR' }, authHeader); } catch {}
      }
      setPendingEmail(data.email);
      setPendingAuth({ user: res.user, accessToken: res.accessToken });
      setEmailSendFailed(res.emailSent === false);
      startCooldown();
      setStep('verify');
    } catch (e: any) {
      Alert.alert(
        e.message === 'NETWORK_ERROR' ? 'Cannot Connect to Server' : 'Registration Failed',
        e.message === 'NETWORK_ERROR' ? `Check your internet connection and try again.\n\nServer: ${API_URL}` : e.message,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (verifyCode.trim().length !== 6) { setVerifyError('Enter the 6-digit code.'); return; }
    setVerifyLoading(true);
    setVerifyError('');
    try {
      await authApi.verifyEmail(pendingEmail, verifyCode.trim());
      // Re-read the user so a vendor's freshly recorded terms acceptance is
      // in the store and the terms gate doesn't ask a second time.
      let user = pendingAuth!.user;
      try {
        user = await api.get('/users/me', { headers: { Authorization: `Bearer ${pendingAuth!.accessToken}` } });
      } catch {}
      await setAuth(user, pendingAuth!.accessToken);
    } catch (e: any) {
      setVerifyError(e.message || 'Invalid or expired code. Try again.');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    try {
      await authApi.resendVerification(pendingEmail);
      setEmailSendFailed(false);
      startCooldown();
      Alert.alert('Code Sent', `A new code was sent to ${pendingEmail}`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not resend code. Try again.');
    }
  };

  const handleUpdatePendingEmail = async () => {
    const trimmed = editEmailValue.trim();
    if (!trimmed || !pendingAuth) return;
    setUpdatingEmail(true);
    try {
      await authApi.updatePendingEmail(trimmed, pendingAuth.accessToken);
      setPendingEmail(trimmed);
      setEmailSendFailed(false);
      setEditingEmail(false);
      setVerifyCode('');
      startCooldown();
      Alert.alert('Code Sent', `A new code was sent to ${trimmed}`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not update email. Try again.');
    } finally {
      setUpdatingEmail(false);
    }
  };

  const TermsCheckbox = ({ url }: { url: string }) => (
    <TouchableOpacity style={styles.termsRow} onPress={() => setAcceptedTerms((v) => !v)} activeOpacity={0.7}>
      <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
        {acceptedTerms && <Ionicons name="checkmark" size={14} color={colors.ink} />}
      </View>
      <Text style={styles.termsText}>
        I agree to the{' '}
        <Text style={styles.termsLink} onPress={() => Linking.openURL(url)}>
          {isVendor ? 'Vendor Terms and Conditions' : 'Terms and Conditions'}
        </Text>
        {isVendor ? ', and I confirm my company is an independent contractor, not an Attenteve employee.' : ''}
      </Text>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView ref={scrollViewRef} style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={22} color={colors.steel} />
          {step !== 'select' && step !== 'verify' && (
            <Text style={styles.backLabel}>Back</Text>
          )}
        </TouchableOpacity>

        <View style={styles.logoRow}><AttenteveLogo size="md" /></View>

        {/* ── Role selection ── */}
        {step === 'select' && (
          <>
            <Text style={styles.title}>Join Attenteve</Text>
            <Text style={styles.subtitle}>Who are you signing up as?</Text>

            <TouchableOpacity style={styles.roleCard} onPress={() => handleRoleSelect('CUSTOMER')}>
              <View style={[styles.roleIconCircle, { backgroundColor: colors.mist }]}>
                <Ionicons name="home" size={32} color={colors.lanternDeep} />
              </View>
              <View style={styles.roleCardText}>
                <Text style={styles.roleCardTitle}>Homeowner</Text>
                <Text style={styles.roleCardDesc}>Book assessments, maintenance, and home monitoring services.</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.steel} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.roleCard} onPress={() => handleRoleSelect('VENDOR')}>
              <View style={[styles.roleIconCircle, { backgroundColor: colors.mist }]}>
                <Ionicons name="construct" size={32} color={colors.lanternDeep} />
              </View>
              <View style={styles.roleCardText}>
                <Text style={styles.roleCardTitle}>Service Provider</Text>
                <Text style={styles.roleCardDesc}>List your business and get matched with homeowners in your area.</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.steel} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.loginRow} onPress={() => router.push('/(auth)/login')}>
              <Text style={styles.loginText}>Already have an account? </Text>
              <Text style={styles.loginLink}>Sign in</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Account details ── */}
        {step === 'account' && (
          <>
            <Text style={styles.title}>Create Account</Text>
            <View style={[styles.rolePill, { backgroundColor: colors.mist }]}>
              <Ionicons name={isVendor ? 'construct-outline' : 'home-outline'} size={14} color={colors.lanternDeep} />
              <Text style={[styles.rolePillText, { color: colors.lanternDeep }]}>
                {isVendor ? 'Service Provider' : 'Homeowner'}
              </Text>
            </View>
            {isVendor && <Text style={styles.stepHint}>Step 1 of 2 · About you and your company</Text>}

            {(['firstName', 'lastName'] as const).map((field) => (
              <Controller key={field} control={control} name={field}
                rules={{ required: `${field === 'firstName' ? 'First name' : 'Last name'} is required` }}
                render={({ field: { onChange, value } }) => (
                  <>
                    <TextInput
                      style={[styles.input, errors[field] && styles.inputError]}
                      placeholder={field === 'firstName' ? 'First Name' : 'Last Name'}
                      placeholderTextColor={colors.steel} autoCapitalize="words"
                      value={value} onChangeText={onChange}
                    />
                    {errors[field] && <Text style={styles.errorText}>{(errors[field] as any)?.message}</Text>}
                  </>
                )}
              />
            ))}

            <Controller control={control} name="email"
              rules={{ required: 'Email is required', validate: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Enter a valid email' }}
              render={({ field: { onChange, value } }) => (
                <>
                  <TextInput
                    style={[styles.input, errors.email && styles.inputError]}
                    placeholder="Email" placeholderTextColor={colors.steel}
                    autoCapitalize="none" keyboardType="email-address"
                    value={value} onChangeText={onChange}
                  />
                  {errors.email && <Text style={styles.errorText}>{(errors.email as any)?.message}</Text>}
                </>
              )}
            />

            <Controller control={control} name="phone"
              rules={{
                required: 'Phone number is required',
                validate: (v: string) => /^\+?[\d\s\-().]{7,}$/.test(v) || 'Enter a valid phone number',
              }}
              render={({ field: { onChange, value } }) => (
                <>
                  <TextInput
                    style={[styles.input, errors.phone && styles.inputError]}
                    placeholder="Phone Number" placeholderTextColor={colors.steel}
                    keyboardType="phone-pad" value={value} onChangeText={onChange}
                  />
                  {errors.phone && <Text style={styles.errorText}>{(errors.phone as any)?.message}</Text>}
                </>
              )}
            />

            <Controller control={control} name="password"
              rules={{ required: 'Password is required', minLength: { value: 8, message: 'Minimum 8 characters' } }}
              render={({ field: { onChange, value } }) => (
                <>
                  <View style={styles.passRow}>
                    <TextInput
                      style={[styles.input, styles.passInput, errors.password && styles.inputError]}
                      placeholder="Password (min 8 chars)" placeholderTextColor={colors.steel}
                      secureTextEntry={!showPass} value={value} onChangeText={onChange}
                    />
                    <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPass((v) => !v)}>
                      <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.steel} />
                    </TouchableOpacity>
                  </View>
                  {errors.password && <Text style={styles.errorText}>{(errors.password as any)?.message}</Text>}
                </>
              )}
            />

            {isVendor && (
              <>
                <Text style={styles.sectionLabel}>Company Details</Text>
                <Controller control={control} name="companyName"
                  rules={{ required: 'Company name is required' }}
                  render={({ field: { onChange, value } }) => (
                    <>
                      <TextInput
                        style={[styles.input, errors.companyName && styles.inputError]}
                        placeholder="Company / Business Name" placeholderTextColor={colors.steel}
                        value={value} onChangeText={onChange}
                      />
                      {errors.companyName && <Text style={styles.errorText}>{(errors.companyName as any)?.message}</Text>}
                    </>
                  )}
                />

                <Controller control={control} name="ein"
                  rules={{
                    required: 'EIN is required',
                    validate: (v: string) => /^\d{2}-\d{7}$/.test(v) || 'Format: XX-XXXXXXX',
                  }}
                  render={({ field: { onChange, value } }) => (
                    <>
                      <TextInput
                        style={[styles.input, errors.ein && styles.inputError]}
                        placeholder="EIN (XX-XXXXXXX)" placeholderTextColor={colors.steel}
                        keyboardType="numbers-and-punctuation" maxLength={10}
                        value={value}
                        onChangeText={(text) => {
                          const clean = text.replace(/[^\d]/g, '');
                          onChange(clean.length <= 2 ? clean : `${clean.slice(0, 2)}-${clean.slice(2, 9)}`);
                        }}
                      />
                      {errors.ein && <Text style={styles.errorText}>{(errors.ein as any)?.message}</Text>}
                    </>
                  )}
                />
              </>
            )}

            <Text style={styles.sectionLabel}>{isVendor ? 'Business Address' : 'Home Address'}</Text>
            <AddressPicker
              placeholder={isVendor ? 'Search your business address...' : undefined}
              validated={addressValidated}
              onSelect={(addr) => {
                setValue(addressFields.street, addr.address);
                setValue(addressFields.city, addr.city);
                setValue(addressFields.state, addr.state);
                setValue(addressFields.zipCode, addr.zipCode);
                setPickedAddress(addr);
                setAddressValidated(true);
                setMissingAddressFields((['city', 'state', 'zipCode'] as const).filter((f) => !addr[f]));
                // Keyboard stays open after picking a suggestion (the
                // TextInput keeps focus), so the confirmation box and
                // Continue button that just appeared below it can end up
                // hidden behind the keyboard. Nothing else renders below
                // Continue in this step, so scrolling to the bottom of
                // the form reliably brings both into view above it.
                setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
              }}
              onClear={clearAddress}
            />
            {addressValidated && pickedAddress && (
              <View style={styles.addrConfirmed}>
                <Ionicons name="checkmark-circle" size={18} color="#059669" />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.addrConfirmedStreet}>{pickedAddress.address}</Text>
                  <Text style={styles.addrConfirmedCity}>{pickedAddress.city}, {pickedAddress.state} {pickedAddress.zipCode}</Text>
                </View>
              </View>
            )}
            {/* Nominatim frequently omits one of city/state/zip (most
                often zip) for rural/new-subdivision addresses — rather
                than blocking selection outright, ask for just the
                missing piece(s) manually so a real address isn't a dead
                end. handleContinueFromAccount's trigger() re-validates
                these as `required`, so Continue stays blocked until
                they're filled either way. */}
            {addressValidated && missingAddressFields.length > 0 && (
              <View style={styles.addrMissingBox}>
                <Text style={styles.addrMissingLabel}>
                  We couldn't find the {missingAddressFields.map((f) => (f === 'zipCode' ? 'zip code' : f)).join(' / ')} for this address — please enter it:
                </Text>
                {missingAddressFields.includes('city') && (
                  <TextInput
                    style={styles.input}
                    placeholder="City" placeholderTextColor={colors.steel}
                    onChangeText={(t) => setValue(addressFields.city, t)}
                  />
                )}
                {missingAddressFields.includes('state') && (
                  <TextInput
                    style={styles.input}
                    placeholder="State (e.g. TN)" placeholderTextColor={colors.steel}
                    maxLength={2} autoCapitalize="characters"
                    onChangeText={(t) => setValue(addressFields.state, t.toUpperCase())}
                  />
                )}
                {missingAddressFields.includes('zipCode') && (
                  <TextInput
                    style={styles.input}
                    placeholder="Zip Code" placeholderTextColor={colors.steel}
                    keyboardType="number-pad" maxLength={5}
                    onChangeText={(t) => setValue(addressFields.zipCode, t)}
                  />
                )}
              </View>
            )}
            {!addressValidated && (
              <Text style={[styles.errorText, { marginBottom: 8 }]}>
                Search and select your address to continue
              </Text>
            )}
            {/* Hidden registered fields used in form submission — real
                `required` rules (values are written via setValue() from
                AddressPicker/the fallback inputs above, not this render
                prop) so handleContinueFromAccount's trigger() genuinely
                blocks an incomplete address. */}
            {(Object.entries(addressFields) as [keyof AddressFields, string][]).map(([part, field]) => (
              <Controller key={field} control={control} name={field}
                rules={{ required: `${part === 'street' ? 'Street address' : part === 'city' ? 'City' : part === 'state' ? 'State' : 'Zip code'} is required` }}
                render={() => <View style={{ display: 'none' }} />}
              />
            ))}

            <TouchableOpacity style={styles.button} onPress={handleContinueFromAccount}>
              <Text style={styles.buttonText}>Continue</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Plan selection (customer) ── */}
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
                    <Ionicons name="checkmark-circle" size={20} color={colors.lanternDeep} style={styles.planCheck} />
                  )}
                  <PlanName name={plan.name} style={styles.planName} />
                  <Text style={styles.planPrice}>${plan.price}/year</Text>
                  {plan.features?.map((f: string, i: number) => (
                    <Text key={i} style={styles.planFeature}>✓ {f}</Text>
                  ))}
                </TouchableOpacity>
              ))
            )}

            {selectedPlanId && <TermsCheckbox url={TERMS_URL} />}

            <TouchableOpacity
              style={[styles.button, selectedPlanId && !acceptedTerms && styles.buttonDisabled]}
              onPress={handleSubmit(onSubmit)}
              disabled={loading || (!!selectedPlanId && !acceptedTerms)}
            >
              {loading ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.buttonText}>Create Account</Text>}
            </TouchableOpacity>
          </>
        )}

        {/* ── Vendor confirm ── */}
        {step === 'vendor-confirm' && (
          <>
            <Text style={styles.title}>Almost Done</Text>
            <Text style={styles.stepHint}>Step 2 of 2 · Terms</Text>
            <View style={styles.confirmBox}>
              <Ionicons name="construct" size={40} color={colors.lanternDeep} style={{ marginBottom: 12 }} />
              <Text style={styles.confirmText}>
                After you verify your email, you'll finish your application in the app: the services you offer and any licenses they need, your service area, your business registration and insurance, a profile photo, and a background check statement.
                {'\n\n'}Attenteve reviews every application. You'll be able to see and accept jobs once your company is approved and Stripe payouts are set up.
              </Text>
            </View>
            <TermsCheckbox url={VENDOR_TERMS_URL} />
            <TouchableOpacity
              style={[styles.button, !acceptedTerms && styles.buttonDisabled]}
              onPress={handleSubmit(onSubmit)}
              disabled={loading || !acceptedTerms}
            >
              {loading ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.buttonText}>Create Account</Text>}
            </TouchableOpacity>
          </>
        )}

        {/* ── Email verification ── */}
        {step === 'verify' && (
          <>
            <Text style={styles.title}>Verify Your Email</Text>
            <View style={styles.verifyBox}>
              <Ionicons name="mail-outline" size={52} color={colors.lanternDeep} style={{ marginBottom: 12 }} />
              <Text style={styles.verifyText}>
                We sent a 6-digit code to{'\n'}
                <Text style={{ fontWeight: '700', color: colors.lanternDeep }}>{pendingEmail}</Text>
              </Text>
            </View>

            {emailSendFailed && (
              <View style={styles.addrMissingBox}>
                <Text style={styles.addrMissingLabel}>
                  We couldn't send that code right now. Tap Resend below, or Edit email if it might be mistyped.
                </Text>
              </View>
            )}

            {editingEmail ? (
              <View style={styles.addrMissingBox}>
                <TextInput
                  style={styles.input}
                  placeholder="Email address"
                  placeholderTextColor={colors.steel}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={editEmailValue}
                  onChangeText={setEditEmailValue}
                />
                <TouchableOpacity style={styles.button} onPress={handleUpdatePendingEmail} disabled={updatingEmail}>
                  {updatingEmail
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.buttonText}>Send to This Address</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.resendRow} onPress={() => setEditingEmail(false)}>
                  <Text style={styles.resendText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput
                  style={[styles.input, styles.codeInput, verifyError ? styles.inputError : null]}
                  placeholder="000000"
                  placeholderTextColor={colors.steel}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={verifyCode}
                  onChangeText={(t) => { setVerifyCode(t); setVerifyError(''); }}
                  textAlign="center"
                />
                {verifyError ? <Text style={styles.errorText}>{verifyError}</Text> : null}

                <TouchableOpacity style={styles.button} onPress={handleVerify} disabled={verifyLoading}>
                  {verifyLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify & Continue</Text>}
                </TouchableOpacity>

                <TouchableOpacity style={styles.resendRow} onPress={handleResend} disabled={cooldown > 0}>
                  <Text style={[styles.resendText, cooldown > 0 && { color: colors.steel }]}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Didn't get the code? Resend"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.resendRow}
                  onPress={() => { setEditEmailValue(pendingEmail); setEditingEmail(true); }}
                >
                  <Text style={[styles.resendText, { color: colors.steel }]}>Edit email</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 24, paddingTop: 48, paddingBottom: 40 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  backLabel: { fontSize: 13, color: colors.steel },
  logoRow: { alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 15, color: colors.steel, textAlign: 'center', marginBottom: 24 },
  stepHint: { fontSize: 13, color: colors.steel, textAlign: 'center', marginBottom: 16 },

  roleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 16, padding: 18,
    borderWidth: 1.5, borderColor: colors.border, marginBottom: 14,
  },
  roleIconCircle: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  roleCardText: { flex: 1 },
  roleCardTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, marginBottom: 3 },
  roleCardDesc: { fontSize: 13, color: colors.steel, lineHeight: 18 },

  rolePill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center',
    gap: 5, paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 99, marginBottom: 12,
  },
  rolePillText: { fontSize: 13, fontWeight: '600' },

  sectionLabel: { fontSize: 15, fontWeight: '600', color: colors.lanternDeep, marginBottom: 10, marginTop: 6 },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
    padding: 15, fontSize: 16, marginBottom: 4, color: colors.ink,
  },
  passRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passInput: { flex: 1 },
  eyeBtn: { padding: 12 },
  inputError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 12, marginBottom: 8, marginLeft: 2 },

  button: {
    backgroundColor: colors.lantern, borderRadius: 14, padding: 17,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
    marginTop: 12, marginBottom: 8,
  },
  buttonDisabled: { backgroundColor: colors.steel },
  buttonText: { color: colors.ink, fontSize: 16, fontWeight: '700' },

  termsRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 8, paddingHorizontal: 2 },
  checkbox: {
    width: 20, height: 20, borderRadius: 5, marginRight: 10, marginTop: 1,
    borderWidth: 1.5, borderColor: colors.steel, alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.lantern, borderColor: colors.lanternDeep },
  termsText: { flex: 1, fontSize: 13, color: colors.steel, lineHeight: 18 },
  termsLink: { color: colors.lanternDeep, fontWeight: '600', textDecorationLine: 'underline' },

  // Plans
  planCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 2, borderColor: colors.border,
  },
  planCardActive: { borderColor: colors.lanternDeep, backgroundColor: colors.mist },
  planCheck: { position: 'absolute', top: 14, right: 14 },
  planName: { fontSize: 17, fontWeight: '700', color: colors.lanternDeep, marginBottom: 2 },
  planPrice: { fontSize: 22, fontWeight: '800', color: colors.lanternDeep, marginBottom: 8 },
  planFeature: { fontSize: 14, color: colors.steel, lineHeight: 22 },

  emptyPlans: {
    backgroundColor: '#fff4e5', borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#f6ad55',
  },
  emptyPlansText: { color: '#744210', fontSize: 14, lineHeight: 20 },

  // Confirm
  confirmBox: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.border, marginBottom: 8,
  },
  confirmText: { fontSize: 15, color: colors.steel, lineHeight: 22, textAlign: 'center' },

  // Verify
  verifyBox: {
    backgroundColor: colors.mist, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 20,
  },
  verifyText: { fontSize: 15, color: colors.slate, lineHeight: 22, textAlign: 'center' },
  codeInput: {
    fontSize: 28, fontWeight: '700', letterSpacing: 8, textAlign: 'center',
    padding: 20, marginBottom: 4,
  },
  resendRow: { alignItems: 'center', marginTop: 12, padding: 8 },
  resendText: { fontSize: 14, color: colors.lanternDeep, fontWeight: '600' },

  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  loginText: { color: colors.steel, fontSize: 14 },
  loginLink: { fontSize: 14, fontWeight: '600', color: colors.lanternDeep },

  addrConfirmed: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#ecfdf5', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#86efac', marginBottom: 8,
  },
  addrConfirmedStreet: { fontSize: 14, fontWeight: '700', color: '#059669' },
  addrConfirmedCity: { fontSize: 13, color: '#374151', marginTop: 2 },
  addrMissingBox: {
    backgroundColor: '#fffbeb', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#fde68a', marginBottom: 8,
  },
  addrMissingLabel: { fontSize: 13, color: '#92400e', marginBottom: 10 },
});
