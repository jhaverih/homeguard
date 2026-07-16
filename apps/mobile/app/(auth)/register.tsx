import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Image, Linking,
} from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AttenteveLogo } from '../../src/components/AttenteveLogo';
import { authApi, subscriptionsApi, api, TERMS_URL } from '../../src/services/api';
import { useAuthStore } from '../../src/store/auth.store';
import { colors } from '../../src/theme';

const US_STATES: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
  'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
  'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
  'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
  'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
  'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
  'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
};

type AddressResult = { address: string; city: string; state: string; zipCode: string };

function AddressPicker({
  onSelect,
  validated,
  onClear,
}: {
  onSelect: (addr: AddressResult) => void;
  validated: boolean;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 5) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=us&q=${encodeURIComponent(text)}&limit=6`,
          { headers: { 'User-Agent': 'AttenteveApp/1.0' } }
        );
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 500);
  };

  const pick = (item: any) => {
    const addr = item.address || {};
    const houseNumber = addr.house_number || '';
    const road = addr.road || addr.pedestrian || addr.footway || '';
    const streetAddr = [houseNumber, road].filter(Boolean).join(' ');
    const city = addr.city || addr.town || addr.village || addr.hamlet || addr.county || '';
    const stateName = addr.state || '';
    const stateCode = US_STATES[stateName] || stateName.slice(0, 2).toUpperCase();
    const zip = (addr.postcode || '').slice(0, 5);
    setSuggestions([]);
    setQuery(streetAddr || item.display_name.split(',')[0]);
    onSelect({ address: streetAddr || query, city, state: stateCode, zipCode: zip });
  };

  return (
    <View style={{ zIndex: 200 }}>
      <View style={addrStyles.inputWrap}>
        <Ionicons name="search-outline" size={18} color={colors.steel} style={addrStyles.searchIcon} />
        <TextInput
          style={addrStyles.searchInput}
          placeholder="Search your home address..."
          placeholderTextColor={colors.steel}
          value={query}
          onChangeText={search}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searching && <ActivityIndicator size="small" color={colors.lanternDeep} style={{ marginRight: 8 }} />}
        {validated && !searching && (
          <TouchableOpacity onPress={() => { setQuery(''); setSuggestions([]); onClear(); }}>
            <Ionicons name="close-circle" size={20} color={colors.steel} style={{ marginRight: 8 }} />
          </TouchableOpacity>
        )}
      </View>
      {suggestions.length > 0 && (
        <View style={addrStyles.dropdown}>
          {suggestions.map((item) => (
            <TouchableOpacity
              key={item.place_id}
              onPress={() => pick(item)}
              style={addrStyles.suggestion}
            >
              <Ionicons name="location-outline" size={14} color={colors.lanternDeep} style={{ marginRight: 8, flexShrink: 0 }} />
              <Text style={addrStyles.suggestionText} numberOfLines={2}>{item.display_name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const addrStyles = StyleSheet.create({
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.border,
    borderRadius: 12, marginBottom: 4,
  },
  searchIcon: { marginLeft: 14 },
  searchInput: {
    flex: 1, padding: 15, fontSize: 16, color: colors.ink,
  },
  dropdown: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.border,
    borderRadius: 12, marginBottom: 8, overflow: 'hidden',
  },
  suggestion: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  suggestionText: { fontSize: 13, color: colors.ink, flex: 1, lineHeight: 18 },
});

type Step = 'select' | 'account' | 'vendor-licenses' | 'plan' | 'vendor-confirm' | 'verify';

const LICENSE_TYPES = [
  { value: 'GENERAL_CONTRACTOR', label: 'General Contractor' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'PLUMBING', label: 'Plumbing' },
  { value: 'HVAC', label: 'HVAC / AC' },
  { value: 'ROOFING', label: 'Roofing' },
  { value: 'PEST_CONTROL', label: 'Pest Control' },
  { value: 'LANDSCAPING', label: 'Landscaping' },
  { value: 'PAINTING', label: 'Painting' },
  { value: 'POOL', label: 'Pool & Spa' },
  { value: 'OTHER', label: 'Other' },
];

type License = {
  id: string;
  licenseType: string;
  licenseNumber: string;
  licenseState: string;
  expiryDate: string;
  imageUri?: string;
};

let _licenseId = 0;

export default function RegisterScreen() {
  const [step, setStep] = useState<Step>('select');
  const [selectedRole, setSelectedRole] = useState<'CUSTOMER' | 'VENDOR' | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [licenses, setLicenses] = useState<License[]>([]);
  const [adding, setAdding] = useState<Partial<License>>({ licenseType: 'GENERAL_CONTRACTOR' });
  const [pendingAuth, setPendingAuth] = useState<{ user: any; accessToken: string } | null>(null);
  const [pendingEmail, setPendingEmail] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [addressValidated, setAddressValidated] = useState(false);
  const [pickedAddress, setPickedAddress] = useState<AddressResult | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const { setAuth } = useAuthStore();
  const { control, handleSubmit, trigger, reset, setValue, formState: { errors } } = useForm();
  const isVendor = selectedRole === 'VENDOR';

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  const startCooldown = () => {
    setCooldown(60);
    cooldownRef.current = setInterval(() => {
      setCooldown((c) => { if (c <= 1) { clearInterval(cooldownRef.current!); return 0; } return c - 1; });
    }, 1000);
  };

  const resetFlow = () => {
    setStep('select');
    setSelectedRole(null);
    setSelectedPlanId('');
    setLicenses([]);
    setAdding({ licenseType: 'GENERAL_CONTRACTOR' });
    setAddressValidated(false);
    setPickedAddress(null);
    setAcceptedTerms(false);
    reset();
  };

  const handleRoleSelect = async (role: 'CUSTOMER' | 'VENDOR') => {
    setSelectedRole(role);
    if (role === 'CUSTOMER') {
      try { setPlans((await subscriptionsApi.getPlans()) || []); } catch { setPlans([]); }
    }
    setStep('account');
  };

  const handleBack = () => {
    if (step === 'verify') {
      Alert.alert('Verify Your Email', 'Please enter the code sent to your email to complete registration.');
    } else if (step === 'select') {
      router.back();
    } else {
      resetFlow();
    }
  };

  const handleContinueFromAccount = async () => {
    if (!await trigger(['firstName', 'lastName', 'email', 'phone', 'password', ...(isVendor ? ['companyName', 'ein', 'companyAddress', 'companyCity', 'companyState', 'companyZip'] : [])])) return;
    if (!isVendor && !addressValidated) {
      Alert.alert('Address Required', 'Please search for and select your home address from the suggestions to continue.');
      return;
    }
    setStep(isVendor ? 'vendor-licenses' : 'plan');
  };

  const addLicense = () => {
    if (!adding.licenseNumber?.trim()) { Alert.alert('Required', 'Enter the license number.'); return; }
    if (!adding.licenseState?.trim()) { Alert.alert('Required', 'Enter the issuing state.'); return; }
    setLicenses((prev) => [...prev, {
      id: String(++_licenseId),
      licenseType: adding.licenseType || 'GENERAL_CONTRACTOR',
      licenseNumber: adding.licenseNumber!.trim(),
      licenseState: adding.licenseState!.trim().toUpperCase().slice(0, 2),
      expiryDate: adding.expiryDate || '',
      imageUri: adding.imageUri,
    }]);
    setAdding({ licenseType: 'GENERAL_CONTRACTOR' });
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) {
      setAdding((prev) => ({ ...prev, imageUri: result.assets[0].uri }));
    }
  };

  const onSubmit = async (data: any) => {
    if (selectedRole === 'CUSTOMER' && selectedPlanId && !acceptedTerms) {
      Alert.alert('Terms Required', 'Please accept the Terms and Conditions to continue.');
      return;
    }
    setLoading(true);
    try {
      const payload: any = {
        ...data,
        roles: [selectedRole],
        ...(isVendor && licenses.length > 0 && {
          licenses: licenses.map(({ id, imageUri, ...l }) => l),
        }),
      };
      const res: any = await authApi.register(payload);
      if (selectedRole === 'CUSTOMER' && selectedPlanId) {
        try {
          await api.post(`/subscriptions/subscribe/${selectedPlanId}`, { acceptedTerms }, {
            headers: { Authorization: `Bearer ${res.accessToken}` },
          });
        } catch {}
      }
      setPendingEmail(data.email);
      setPendingAuth({ user: res.user, accessToken: res.accessToken });
      startCooldown();
      setStep('verify');
    } catch (e: any) {
      Alert.alert(
        e.message === 'NETWORK_ERROR' ? 'Cannot Connect to Server' : 'Registration Failed',
        e.message === 'NETWORK_ERROR' ? 'Make sure your phone is on your home WiFi.\n\nServer: 192.168.86.29' : e.message,
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
      await setAuth(pendingAuth!.user, pendingAuth!.accessToken);
    } catch (e: any) {
      // If endpoint not yet deployed, fall through to login
      if ((e as any)?.response?.status === 404 || (e as any)?.response?.status === 405) {
        await setAuth(pendingAuth!.user, pendingAuth!.accessToken);
        return;
      }
      setVerifyError(e.message || 'Invalid or expired code. Try again.');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleSkipVerify = async () => {
    if (!pendingAuth) return;
    await setAuth(pendingAuth.user, pendingAuth.accessToken);
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    try {
      await authApi.resendVerification(pendingEmail);
      startCooldown();
      Alert.alert('Code Sent', `A new code was sent to ${pendingEmail}`);
    } catch {
      Alert.alert('Error', 'Could not resend code. Try again.');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={22} color={colors.steel} />
          {step !== 'select' && step !== 'verify' && (
            <Text style={styles.backLabel}>Cancel — start over</Text>
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
                <Text style={styles.roleCardDesc}>Book inspections, maintenance, and home monitoring services.</Text>
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

                <Text style={styles.sectionLabel}>Company Address</Text>
                {(['companyAddress', 'companyCity', 'companyState', 'companyZip'] as const).map((field) => (
                  <Controller key={field} control={control} name={field}
                    rules={{ required: `${field === 'companyAddress' ? 'Street address' : field === 'companyCity' ? 'City' : field === 'companyState' ? 'State' : 'Zip code'} is required` }}
                    render={({ field: { onChange, value } }) => (
                      <>
                        <TextInput
                          style={[styles.input, errors[field] && styles.inputError]}
                          placeholder={field === 'companyAddress' ? 'Street Address' : field === 'companyCity' ? 'City' : field === 'companyState' ? 'State (e.g. TN)' : 'Zip Code'}
                          placeholderTextColor={colors.steel} value={value} onChangeText={onChange}
                        />
                        {errors[field] && <Text style={styles.errorText}>{(errors[field] as any)?.message}</Text>}
                      </>
                    )}
                  />
                ))}
              </>
            )}

            {!isVendor && (
              <>
                <Text style={styles.sectionLabel}>Home Address</Text>
                <AddressPicker
                  validated={addressValidated}
                  onSelect={(addr) => {
                    setValue('address', addr.address);
                    setValue('city', addr.city);
                    setValue('state', addr.state);
                    setValue('zipCode', addr.zipCode);
                    setPickedAddress(addr);
                    setAddressValidated(true);
                  }}
                  onClear={() => {
                    setValue('address', '');
                    setValue('city', '');
                    setValue('state', '');
                    setValue('zipCode', '');
                    setPickedAddress(null);
                    setAddressValidated(false);
                  }}
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
                {!addressValidated && (
                  <Text style={[styles.errorText, { marginBottom: 8 }]}>
                    Search and select your address to continue
                  </Text>
                )}
                {/* Hidden registered fields used in form submission */}
                {(['address', 'city', 'state', 'zipCode'] as const).map((field) => (
                  <Controller key={field} control={control} name={field}
                    render={() => <View style={{ display: 'none' }} />}
                  />
                ))}
              </>
            )}

            <TouchableOpacity style={styles.button} onPress={handleContinueFromAccount}>
              <Text style={styles.buttonText}>Continue</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── State Licenses (vendor) ── */}
        {step === 'vendor-licenses' && (
          <>
            <Text style={styles.title}>State Licenses</Text>
            <Text style={styles.subtitle}>Add your professional licenses to be matched with relevant jobs.</Text>

            {licenses.length > 0 && (
              <View style={styles.licenseList}>
                {licenses.map((lic) => (
                  <View key={lic.id} style={styles.licenseChip}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.licenseChipType}>
                        {LICENSE_TYPES.find((t) => t.value === lic.licenseType)?.label ?? lic.licenseType}
                      </Text>
                      <Text style={styles.licenseChipDetail}>
                        {lic.licenseState} · {lic.licenseNumber}{lic.expiryDate ? ` · exp ${lic.expiryDate}` : ''}
                      </Text>
                    </View>
                    {lic.imageUri && (
                      <Image source={{ uri: lic.imageUri }} style={styles.licenseThumbSm} />
                    )}
                    <TouchableOpacity onPress={() => setLicenses((p) => p.filter((l) => l.id !== lic.id))}>
                      <Ionicons name="close-circle" size={22} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.addBox}>
              <Text style={styles.addBoxTitle}>Add License</Text>

              <Text style={styles.addBoxLabel}>License Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {LICENSE_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type.value}
                      onPress={() => setAdding((p) => ({ ...p, licenseType: type.value }))}
                      style={[styles.typeChip, adding.licenseType === type.value && styles.typeChipActive]}
                    >
                      <Text style={[styles.typeChipText, adding.licenseType === type.value && styles.typeChipTextActive]}>
                        {type.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 4 }]}
                  placeholder="License Number" placeholderTextColor={colors.steel}
                  value={adding.licenseNumber || ''}
                  onChangeText={(v) => setAdding((p) => ({ ...p, licenseNumber: v }))}
                />
                <TextInput
                  style={[styles.input, { width: 70, marginBottom: 4 }]}
                  placeholder="State" placeholderTextColor={colors.steel}
                  autoCapitalize="characters" maxLength={2}
                  value={adding.licenseState || ''}
                  onChangeText={(v) => setAdding((p) => ({ ...p, licenseState: v.toUpperCase() }))}
                />
              </View>

              <TextInput
                style={[styles.input, { marginTop: 4 }]}
                placeholder="Expiry Date (MM/YYYY) — optional"
                placeholderTextColor={colors.steel}
                keyboardType="numbers-and-punctuation"
                value={adding.expiryDate || ''}
                onChangeText={(v) => setAdding((p) => ({ ...p, expiryDate: v }))}
              />

              <TouchableOpacity style={styles.uploadBtn} onPress={pickImage}>
                <Ionicons name="camera-outline" size={18} color={colors.lanternDeep} />
                <Text style={styles.uploadBtnText}>
                  {adding.imageUri ? 'Change Photo' : 'Upload License Photo (Optional)'}
                </Text>
              </TouchableOpacity>
              {adding.imageUri && (
                <Image source={{ uri: adding.imageUri }} style={styles.licenseThumb} />
              )}

              <TouchableOpacity style={[styles.button, styles.addLicenseBtn]} onPress={addLicense}>
                <Ionicons name="add" size={18} color={colors.mist} />
                <Text style={[styles.buttonText, { marginLeft: 4, color: colors.mist }]}>Add License</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.button, licenses.length === 0 && styles.buttonOutline]}
              onPress={() => setStep('vendor-confirm')}
            >
              <Text style={[styles.buttonText, licenses.length === 0 && { color: colors.lanternDeep }]}>
                {licenses.length === 0 ? 'Skip for Now' : `Continue with ${licenses.length} License${licenses.length !== 1 ? 's' : ''}`}
              </Text>
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
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planPrice}>${plan.price}/year</Text>
                  {plan.features?.map((f: string, i: number) => (
                    <Text key={i} style={styles.planFeature}>✓ {f}</Text>
                  ))}
                </TouchableOpacity>
              ))
            )}

            {selectedPlanId && (
              <TouchableOpacity style={styles.termsRow} onPress={() => setAcceptedTerms((v) => !v)} activeOpacity={0.7}>
                <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
                  {acceptedTerms && <Ionicons name="checkmark" size={14} color={colors.ink} />}
                </View>
                <Text style={styles.termsText}>
                  I agree to the{' '}
                  <Text style={styles.termsLink} onPress={() => Linking.openURL(TERMS_URL)}>
                    Terms and Conditions
                  </Text>
                </Text>
              </TouchableOpacity>
            )}

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
            <Text style={styles.title}>Almost Done!</Text>
            <View style={styles.confirmBox}>
              <Ionicons name="construct" size={40} color={colors.lanternDeep} style={{ marginBottom: 12 }} />
              <Text style={styles.confirmText}>
                Your Service Provider account will be created.
                {licenses.length > 0
                  ? ` ${licenses.length} license${licenses.length !== 1 ? 's' : ''} will be submitted for review.`
                  : ''}
                {'\n\n'}Complete your Stripe payout setup from your profile to start receiving payments.
              </Text>
            </View>
            <TouchableOpacity style={styles.button} onPress={handleSubmit(onSubmit)} disabled={loading}>
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

            <TouchableOpacity style={styles.skipRow} onPress={handleSkipVerify}>
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
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
    borderRadius: 99, marginBottom: 20,
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
  buttonOutline: {
    backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.lantern,
  },
  buttonDisabled: { backgroundColor: colors.steel },
  buttonText: { color: colors.ink, fontSize: 16, fontWeight: '700' },

  termsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 2 },
  checkbox: {
    width: 20, height: 20, borderRadius: 5, marginRight: 10,
    borderWidth: 1.5, borderColor: colors.steel, alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.lantern, borderColor: colors.lanternDeep },
  termsText: { flex: 1, fontSize: 13, color: colors.steel, lineHeight: 18 },
  termsLink: { color: colors.lanternDeep, fontWeight: '600', textDecorationLine: 'underline' },

  // Licenses
  licenseList: { marginBottom: 16, gap: 10 },
  licenseChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, padding: 12,
    borderWidth: 1.5, borderColor: colors.border,
  },
  licenseChipType: { fontSize: 14, fontWeight: '700', color: colors.lanternDeep },
  licenseChipDetail: { fontSize: 12, color: colors.steel, marginTop: 2 },
  licenseThumbSm: { width: 40, height: 40, borderRadius: 6, borderWidth: 1, borderColor: colors.border },

  addBox: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: colors.border, marginBottom: 4,
  },
  addBoxTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 12 },
  addBoxLabel: { fontSize: 13, fontWeight: '600', color: colors.steel, marginBottom: 8 },

  typeChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99,
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.canvas,
  },
  typeChipActive: { borderColor: colors.lanternDeep, backgroundColor: colors.mist },
  typeChipText: { fontSize: 13, color: colors.steel, fontWeight: '500' },
  typeChipTextActive: { color: colors.lanternDeep, fontWeight: '700' },

  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: colors.lanternDeep, borderRadius: 10,
    padding: 12, marginTop: 8,
  },
  uploadBtnText: { fontSize: 14, color: colors.lanternDeep, fontWeight: '600' },
  licenseThumb: { width: '100%', height: 120, borderRadius: 10, marginTop: 8, resizeMode: 'cover' },

  addLicenseBtn: { backgroundColor: colors.slate, marginTop: 12, marginBottom: 0 },

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
  skipRow: { alignItems: 'center', marginTop: 4, padding: 8 },
  skipText: { fontSize: 13, color: colors.steel },

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
});
