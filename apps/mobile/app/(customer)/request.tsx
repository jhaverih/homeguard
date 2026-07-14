import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Modal, Platform, KeyboardAvoidingView,
} from 'react-native';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { requestsApi, userApi, subscriptionsApi, pricingApi, standaloneServiceApi } from '../../src/services/api';
import { fmtUSD } from '../../src/utils/currency';

function DateTimeField({ label, value, onChange }: { label: string; value: Date; onChange: (d: Date) => void }) {
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [tempDate, setTempDate] = useState(value);

  const formatted = value.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });

  if (Platform.OS === 'android') {
    return (
      <View style={styles.fieldWrap}>
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDate(true)}>
          <Text style={styles.dateBtnText}>{formatted}</Text>
          <Text style={styles.dateIcon}>📅</Text>
        </TouchableOpacity>
        {showDate && (
          <RNDateTimePicker
            value={value} mode="date" minimumDate={new Date()}
            onChange={(_, d) => { setShowDate(false); if (d) { setTempDate(d); setShowTime(true); } }}
          />
        )}
        {showTime && (
          <RNDateTimePicker
            value={tempDate} mode="time"
            onChange={(_, d) => { setShowTime(false); if (d) onChange(d); }}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDate(true)}>
        <Text style={styles.dateBtnText}>{formatted}</Text>
        <Text style={styles.dateIcon}>📅</Text>
      </TouchableOpacity>
      <Modal visible={showDate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.pickerCard}>
            <RNDateTimePicker
              value={value} mode="datetime" minimumDate={new Date()} display="inline"
              onChange={(_, d) => { if (d) onChange(d); }} style={{ alignSelf: 'center' }}
            />
            <TouchableOpacity style={styles.doneBtn} onPress={() => setShowDate(false)}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function RequestScreen() {
  const [tab, setTab] = useState<'inspection' | 'service'>('inspection');
  const [loading, setLoading] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);
  const [addonConfirmModal, setAddonConfirmModal] = useState(false);

  // Catalog for service tab
  const [catalog, setCatalog] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedServices, setSelectedServices] = useState<any[]>([]);
  const [serviceQuantities, setServiceQuantities] = useState<Record<string, string>>({});
  const [serviceConfirmModal, setServiceConfirmModal] = useState(false);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const [preferredDate, setPreferredDate] = useState(tomorrow);
  const [serviceDate, setServiceDate] = useState(new Date(tomorrow));
  const { prefilledNotes, preselectServicePriceId } = useLocalSearchParams<{ prefilledNotes?: string; preselectServicePriceId?: string }>();
  const [notes, setNotes] = useState('');
  const [serviceNotes, setServiceNotes] = useState('');
  const [solarMonthlyBill, setSolarMonthlyBill] = useState('');
  const [solarInterest, setSolarInterest] = useState<'solar_only' | 'solar_battery'>('solar_only');
  const [solarCoverage, setSolarCoverage] = useState<'whole_home' | 'partial'>('whole_home');

  // Profile address — loaded silently, not shown to customer
  const [profileAddress, setProfileAddress] = useState<{ address: string; city: string; state: string; zipCode: string } | null>(null);

  useEffect(() => {
    if (prefilledNotes) setNotes(prefilledNotes);
  }, [prefilledNotes]);

  useEffect(() => {
    if (preselectServicePriceId) setTab('service');
  }, [preselectServicePriceId]);

  useEffect(() => {
    userApi.getMe().then((res: any) => {
      const p = res?.customerProfile;
      if (p?.address) {
        setProfileAddress({ address: p.address, city: p.city, state: p.state, zipCode: p.zipCode });
      }
    }).catch(() => {});
    subscriptionsApi.getMySubscription().then((s: any) => setSubscription(s)).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'service' && catalog.length === 0) {
      setCatalogLoading(true);
      pricingApi.getAll()
        .then((items: any) => {
          const filtered = (items || []).filter((i: any) => i.customerRequestable !== false);
          setCatalog(filtered);
          if (preselectServicePriceId) {
            const match = filtered.find((i: any) => i.id === preselectServicePriceId);
            if (match) setSelectedServices((prev) => (prev.some((s) => s.id === match.id) ? prev : [...prev, match]));
          }
        })
        .catch(() => {})
        .finally(() => setCatalogLoading(false));
    }
  }, [tab]);

  const inspectionsRemaining = subscription
    ? Math.max(0, (subscription.plan?.inspectionsPerYear ?? 0) - (subscription.inspectionsUsed ?? 0))
    : null;
  const limitReached = inspectionsRemaining !== null && inspectionsRemaining <= 0;
  const addonPrice = subscription?.plan?.addonInspectionPrice
    ? parseFloat(subscription.plan.addonInspectionPrice)
    : 79;

  const customerPrice = (item: any, qty = 1) => {
    const base = parseFloat(item.basePrice);
    const markup = item.markupPercent != null ? parseFloat(item.markupPercent) : 15;
    return Math.ceil(base * qty * (1 + markup / 100) * 1.029 + 0.30);
  };

  const totalServicePrice = selectedServices.reduce((sum, item) => {
    if (item.requiresQuote) return sum;
    const qty = item.quantityLabel ? (parseFloat(serviceQuantities[item.id] || '1') || 1) : 1;
    return sum + customerPrice(item, qty);
  }, 0);

  const toggleService = (item: any) => {
    setSelectedServices((prev) => {
      if (prev.some((s) => s.id === item.id)) return prev.filter((s) => s.id !== item.id);
      if (item.quantityLabel) {
        const minQty = item.minimumQuantity ? String(Math.ceil(item.minimumQuantity)) : '';
        setServiceQuantities((q) => ({ ...q, [item.id]: q[item.id] || minQty }));
      }
      return [...prev, item];
    });
  };

  const getAddress = () => profileAddress || { address: '', city: '', state: '', zipCode: '' };

  // --- Inspection tab ---
  const handleInspectionSubmit = () => {
    if (limitReached) {
      setAddonConfirmModal(true);
    } else {
      doSubmitInspection(false);
    }
  };

  const doSubmitInspection = async (isPaidAddon: boolean) => {
    setAddonConfirmModal(false);
    setLoading(true);
    const addr = getAddress();
    try {
      await requestsApi.create({
        preferredDate: preferredDate.toISOString(),
        customerNotes: notes,
        ...addr,
        isPaidAddon,
      });
      Alert.alert(
        'Request Sent!',
        isPaidAddon
          ? `Your additional inspection has been requested. You will be billed ${fmtUSD(addonPrice)} upon completion.`
          : 'We are finding available vendors. You will be notified when one accepts.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Service tab ---
  const handleServiceSubmit = () => {
    if (selectedServices.length === 0) {
      Alert.alert('Select a Service', 'Please choose at least one service from the list.');
      return;
    }
    setServiceConfirmModal(true);
  };

  const doSubmitServices = async () => {
    // Validate quantity minimums
    for (const svc of selectedServices) {
      if (svc.quantityLabel) {
        const qty = parseFloat(serviceQuantities[svc.id] || '0');
        const minQty = svc.minimumQuantity ? parseFloat(svc.minimumQuantity) : 0;
        if (!qty || qty <= 0) {
          Alert.alert('Quantity Required', `Please enter the number of ${svc.quantityLabel} for ${svc.name}.`);
          return;
        }
        if (minQty > 0 && qty < minQty) {
          Alert.alert('Minimum Quantity', `The minimum for ${svc.name} is ${minQty} ${svc.quantityLabel}.`);
          return;
        }
      }
    }
    setServiceConfirmModal(false);
    setLoading(true);
    const addr = getAddress();
    // Correlates multiple services from this one submission so a vendor
    // qualified for all of them can claim the whole visit in one action —
    // not a security-sensitive id, just needs to be unique per submission.
    const bookingGroupId = selectedServices.length > 1
      ? `bg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      : undefined;
    try {
      for (const svc of selectedServices) {
        const qty = svc.quantityLabel ? parseFloat(serviceQuantities[svc.id] || '0') : undefined;
        let notes = qty ? `${qty} ${svc.quantityLabel}${serviceNotes ? ` — ${serviceNotes}` : ''}` : serviceNotes;
        if (svc.name?.toLowerCase().includes('solar') && solarMonthlyBill) {
          const interestLabel = solarInterest === 'solar_battery' ? `Solar + Battery (${solarCoverage === 'whole_home' ? 'Whole Home' : 'Partial Backup'})` : 'Solar Only';
          notes = `Monthly Bill: $${solarMonthlyBill}\nInterest: ${interestLabel}${notes ? `\n${notes}` : ''}`;
        }
        await standaloneServiceApi.create({
          servicePriceId: svc.id,
          preferredDate: serviceDate.toISOString(),
          customerNotes: notes,
          ...(bookingGroupId ? { bookingGroupId } : {}),
          ...addr,
        });
      }
      Alert.alert(
        'Service Requested!',
        selectedServices.length === 1
          ? `Your request for ${selectedServices[0].name} has been sent.`
          : `${selectedServices.length} service requests have been sent. You will be notified when vendors accept.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  if (subscription === null && !loading) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView style={styles.container} contentContainerStyle={[styles.content, { alignItems: 'center', paddingTop: 60 }]}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#EBF1EF', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <Ionicons name="shield-outline" size={38} color="#0B4A45" />
          </View>
          <Text style={[styles.title, { textAlign: 'center' }]}>Subscription Required</Text>
          <Text style={[styles.subtitle, { textAlign: 'center' }]}>
            A Houmi plan is required to request services. Choose a plan to get started.
          </Text>
          <TouchableOpacity
            style={[styles.button, { marginTop: 16, width: '100%' }]}
            onPress={() => router.push('/(customer)/subscribe')}
          >
            <Text style={styles.buttonText}>View Plans & Subscribe</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Request a Service</Text>

        {/* Tab switcher */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'inspection' && styles.tabBtnActive]}
            onPress={() => setTab('inspection')}
          >
            <Ionicons name="clipboard-outline" size={16} color={tab === 'inspection' ? '#fff' : '#0B4A45'} />
            <Text style={[styles.tabBtnText, tab === 'inspection' && styles.tabBtnTextActive]}>Inspection</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'service' && styles.tabBtnActive]}
            onPress={() => setTab('service')}
          >
            <Ionicons name="construct-outline" size={16} color={tab === 'service' ? '#fff' : '#0B4A45'} />
            <Text style={[styles.tabBtnText, tab === 'service' && styles.tabBtnTextActive]}>Additional Services</Text>
          </TouchableOpacity>
        </View>

        {/* ─── INSPECTION TAB ─── */}
        {tab === 'inspection' && (
          <>
            <Text style={styles.subtitle}>
              Tell us when works best. An available vendor will accept and confirm.
            </Text>

            {subscription && (
              <View style={[styles.quotaBanner, limitReached ? styles.quotaBannerWarn : styles.quotaBannerOk]}>
                <Ionicons
                  name={limitReached ? 'alert-circle-outline' : 'shield-checkmark-outline'}
                  size={18}
                  color={limitReached ? '#92400e' : '#065f46'}
                />
                <Text style={[styles.quotaText, limitReached ? styles.quotaTextWarn : styles.quotaTextOk]}>
                  {limitReached
                    ? `All ${subscription.plan?.inspectionsPerYear} plan inspections used. Additional inspections available for ${fmtUSD(addonPrice)} each.`
                    : `${inspectionsRemaining} inspection${inspectionsRemaining === 1 ? '' : 's'} remaining on your plan.`
                  }
                </Text>
              </View>
            )}

            <DateTimeField label="Preferred Date & Time" value={preferredDate} onChange={setPreferredDate} />

            <Text style={styles.label}>Notes for the Vendor (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Any special instructions..."
              placeholderTextColor="#94a3b8"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
            />

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>What's included in your inspection:</Text>
              <Text style={styles.infoItem}>✓ AC visual inspection & filter replacement</Text>
              <Text style={styles.infoItem}>✓ Toilet water leakage check</Text>
              <Text style={styles.infoItem}>✓ Sink & washer pan leak check</Text>
              <Text style={styles.infoItem}>✓ Light bulb replacement</Text>
              <Text style={styles.infoItem}>✓ Full checklist report after inspection</Text>
            </View>

            <View style={styles.noShowNotice}>
              <Ionicons name="information-circle-outline" size={16} color="#92400e" />
              <Text style={styles.noShowText}>
                You must be home when the vendor arrives. A missed appointment forfeits the inspection visit. Service calls may incur a truck roll fee.
              </Text>
            </View>

            <TouchableOpacity style={styles.button} onPress={handleInspectionSubmit} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>
                    {limitReached ? `Book Additional Inspection (${fmtUSD(addonPrice)})` : 'Send Request'}
                  </Text>
              }
            </TouchableOpacity>
          </>
        )}

        {/* ─── SERVICE TAB ─── */}
        {tab === 'service' && (
          <>
            <Text style={styles.subtitle}>
              Select one or more services. A vendor will come to your home on the requested date.
            </Text>

            {catalogLoading ? (
              <ActivityIndicator color="#0B4A45" style={{ marginVertical: 24 }} />
            ) : (
              catalog.map((item) => {
                const price = customerPrice(item);
                const isSelected = selectedServices.some((s) => s.id === item.id);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.serviceCard, isSelected && styles.serviceCardSelected]}
                    onPress={() => toggleService(item)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.serviceCardRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.serviceName, isSelected && styles.serviceNameSelected]}>{item.name}</Text>
                        <Text style={styles.serviceDesc}>{item.description}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4, marginLeft: 12 }}>
                        <Text style={[styles.servicePrice, isSelected && styles.servicePriceSelected]}>
                          {item.requiresQuote ? 'Request a Quote' : `$${Number(price).toLocaleString('en-US')}`}
                        </Text>
                        {isSelected && (
                          <Ionicons name="checkmark-circle" size={22} color="#0B4A45" />
                        )}
                      </View>
                    </View>
                    {item.priceNote && !item.requiresQuote && (
                      <Text style={styles.priceNote}>{item.priceNote}</Text>
                    )}
                    {isSelected && item.quantityLabel && (
                      <View style={styles.qtyRow}>
                        <Text style={styles.qtyLabel}>
                          {item.quantityLabel.charAt(0).toUpperCase() + item.quantityLabel.slice(1)}
                          {item.minimumQuantity ? ` (min ${item.minimumQuantity})` : ''}
                        </Text>
                        <TextInput
                          style={styles.qtyInput}
                          placeholder={item.minimumQuantity ? String(Math.ceil(item.minimumQuantity)) : '0'}
                          placeholderTextColor="#94a3b8"
                          keyboardType="number-pad"
                          value={serviceQuantities[item.id] || ''}
                          onChangeText={(v) => setServiceQuantities((q) => ({ ...q, [item.id]: v }))}
                          onPress={(e) => e.stopPropagation?.()}
                        />
                      </View>
                    )}
                    {isSelected && item.name?.toLowerCase().includes('solar') && (
                      <View style={styles.solarFields}>
                        <Text style={styles.solarFieldsTitle}>Tell us about your energy needs</Text>

                        <Text style={styles.label}>Average Monthly Electric Bill</Text>
                        <View style={styles.billInputRow}>
                          <Text style={styles.billDollar}>$</Text>
                          <TextInput
                            style={styles.billInput}
                            keyboardType="number-pad"
                            placeholder="e.g. 250"
                            placeholderTextColor="#94a3b8"
                            value={solarMonthlyBill}
                            onChangeText={setSolarMonthlyBill}
                          />
                        </View>

                        <Text style={styles.label}>What are you interested in?</Text>
                        <View style={styles.choiceRow}>
                          <TouchableOpacity
                            style={[styles.choiceBtn, solarInterest === 'solar_only' && styles.choiceBtnActive]}
                            onPress={() => setSolarInterest('solar_only')}
                          >
                            <Text style={[styles.choiceBtnText, solarInterest === 'solar_only' && styles.choiceBtnTextActive]}>Solar Only</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.choiceBtn, solarInterest === 'solar_battery' && styles.choiceBtnActive]}
                            onPress={() => setSolarInterest('solar_battery')}
                          >
                            <Text style={[styles.choiceBtnText, solarInterest === 'solar_battery' && styles.choiceBtnTextActive]}>Solar + Battery</Text>
                          </TouchableOpacity>
                        </View>

                        {solarInterest === 'solar_battery' && (
                          <>
                            <Text style={styles.label}>Backup Coverage</Text>
                            <View style={styles.choiceRow}>
                              <TouchableOpacity
                                style={[styles.choiceBtn, solarCoverage === 'whole_home' && styles.choiceBtnActive]}
                                onPress={() => setSolarCoverage('whole_home')}
                              >
                                <Text style={[styles.choiceBtnText, solarCoverage === 'whole_home' && styles.choiceBtnTextActive]}>Whole Home</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.choiceBtn, solarCoverage === 'partial' && styles.choiceBtnActive]}
                                onPress={() => setSolarCoverage('partial')}
                              >
                                <Text style={[styles.choiceBtnText, solarCoverage === 'partial' && styles.choiceBtnTextActive]}>Partial Backup</Text>
                              </TouchableOpacity>
                            </View>
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}

            {catalog.length > 0 && (
              <>
                <DateTimeField label="Preferred Date & Time" value={serviceDate} onChange={setServiceDate} />

                <Text style={styles.label}>Notes for the Vendor (optional)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Any special instructions..."
                  placeholderTextColor="#94a3b8"
                  value={serviceNotes}
                  onChangeText={setServiceNotes}
                  multiline
                  numberOfLines={4}
                />

                <View style={styles.noShowNotice}>
                  <Ionicons name="information-circle-outline" size={16} color="#92400e" />
                  <Text style={styles.noShowText}>
                    You must be home when the vendor arrives. No-shows for service calls incur a truck roll fee.
                  </Text>
                </View>

                {/* Total bar */}
                {selectedServices.length > 0 && (
                  <View style={styles.totalBar}>
                    <View>
                      <Text style={styles.totalLabel}>{selectedServices.length} service{selectedServices.length !== 1 ? 's' : ''} selected</Text>
                      <Text style={styles.totalSub}>
                        {selectedServices.map((s) => s.name).join(', ')}
                      </Text>
                    </View>
                    <Text style={styles.totalAmount}>
                      {selectedServices.every((s) => s.requiresQuote)
                        ? 'Request Quote'
                        : selectedServices.some((s) => s.requiresQuote)
                        ? `$${Number(totalServicePrice).toLocaleString('en-US')}+`
                        : `$${Number(totalServicePrice).toLocaleString('en-US')}`
                      }
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.button, selectedServices.length === 0 && styles.buttonDisabled]}
                  onPress={handleServiceSubmit}
                  disabled={loading || selectedServices.length === 0}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.buttonText}>
                        {selectedServices.length === 0
                          ? 'Select Services Above'
                          : selectedServices.length === 1 && selectedServices[0].requiresQuote
                            ? `Request ${selectedServices[0].name} Quote`
                            : selectedServices.length === 1
                            ? `Request ${selectedServices[0].name}`
                            : selectedServices.every((s) => s.requiresQuote)
                            ? `Request ${selectedServices.length} Quotes`
                            : `Request ${selectedServices.length} Services`
                        }
                      </Text>
                  }
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>

        {/* Addon inspection confirmation modal */}
        <Modal visible={addonConfirmModal} transparent animationType="fade">
          <View style={styles.addonOverlay}>
            <View style={styles.addonCard}>
              <Ionicons name="calendar-outline" size={40} color="#0B4A45" style={{ alignSelf: 'center', marginBottom: 12 }} />
              <Text style={styles.addonTitle}>Book Additional Inspection</Text>
              <Text style={styles.addonBody}>
                You've used all inspections included in your {subscription?.plan?.name}. This additional
                inspection will be billed separately.
              </Text>
              <View style={styles.addonPriceRow}>
                <Text style={styles.addonPriceLabel}>Additional Inspection Fee</Text>
                <Text style={styles.addonPrice}>{fmtUSD(addonPrice)}</Text>
              </View>
              <Text style={styles.addonNote}>Payment will be processed upon completion of the inspection.</Text>
              <TouchableOpacity style={styles.addonConfirmBtn} onPress={() => doSubmitInspection(true)}>
                <Text style={styles.addonConfirmText}>Confirm & Book — {fmtUSD(addonPrice)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addonCancelBtn} onPress={() => setAddonConfirmModal(false)}>
                <Text style={styles.addonCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Service confirmation modal */}
        <Modal visible={serviceConfirmModal} transparent animationType="fade">
          <View style={styles.addonOverlay}>
            <View style={styles.addonCard}>
              <Ionicons name="construct-outline" size={40} color="#0B4A45" style={{ alignSelf: 'center', marginBottom: 12 }} />
              <Text style={styles.addonTitle}>Confirm Service Request</Text>
              <Text style={styles.addonBody}>
                A vendor will come to your home on your requested date to perform {selectedServices.length === 1 ? 'this service' : 'these services'}.
              </Text>
              {selectedServices.map((svc) => (
                <View key={svc.id} style={styles.addonPriceRow}>
                  <Text style={styles.addonPriceLabel}>
                    {svc.name}{svc.quantityLabel && serviceQuantities[svc.id] ? ` (${serviceQuantities[svc.id]} ${svc.quantityLabel})` : ''}
                  </Text>
                  <Text style={styles.addonPrice}>
                    {svc.requiresQuote ? 'Quote' : `$${Number(customerPrice(svc)).toLocaleString('en-US')}`}
                  </Text>
                </View>
              ))}
              {selectedServices.length > 1 && (
                <View style={[styles.addonPriceRow, { borderTopWidth: 1, borderTopColor: '#e2e8f0', marginTop: 4, paddingTop: 12 }]}>
                  <Text style={[styles.addonPriceLabel, { fontWeight: '800' }]}>Total</Text>
                  <Text style={[styles.addonPrice, { fontSize: 20 }]}>${totalServicePrice}</Text>
                </View>
              )}
              <Text style={[styles.addonNote, { marginTop: 12 }]}>Payment will be processed upon completion.</Text>
              <TouchableOpacity style={styles.addonConfirmBtn} onPress={doSubmitServices}>
                <Text style={styles.addonConfirmText}>Confirm Request</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addonCancelBtn} onPress={() => setServiceConfirmModal(false)}>
                <Text style={styles.addonCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { padding: 24 },
  title: { fontSize: 24, fontWeight: '700', color: '#0B4A45', marginBottom: 12 },
  subtitle: { fontSize: 14, color: '#666', lineHeight: 22, marginBottom: 16 },
  tabRow: { flexDirection: 'row', backgroundColor: '#EBF1EF', borderRadius: 12, padding: 4, marginBottom: 20, gap: 4 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  tabBtnActive: { backgroundColor: '#0B4A45' },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: '#0B4A45' },
  tabBtnTextActive: { color: '#fff' },
  quotaBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1 },
  quotaBannerOk: { backgroundColor: '#ecfdf5', borderColor: '#6ee7b7' },
  quotaBannerWarn: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  quotaText: { fontSize: 13, lineHeight: 20, flex: 1 },
  quotaTextOk: { color: '#065f46' },
  quotaTextWarn: { color: '#92400e' },
  fieldWrap: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  dateBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateBtnText: { fontSize: 15, color: '#0B4A45', fontWeight: '500', flex: 1 },
  dateIcon: { fontSize: 20 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 16, color: '#0f172a' },
  textArea: { height: 100, textAlignVertical: 'top' },
  infoBox: { backgroundColor: '#EBF1EF', borderRadius: 12, padding: 16, marginBottom: 16 },
  infoTitle: { fontSize: 14, fontWeight: '700', color: '#0B4A45', marginBottom: 8 },
  infoItem: { fontSize: 14, color: '#17897D', lineHeight: 24 },
  noShowNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#fffbeb', borderRadius: 10, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: '#fde68a' },
  noShowText: { fontSize: 12, color: '#92400e', lineHeight: 18, flex: 1 },
  button: { backgroundColor: '#0B4A45', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  buttonDisabled: { backgroundColor: '#94a3b8' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelText: { color: '#888', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  doneBtn: { backgroundColor: '#0B4A45', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  serviceCard: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, padding: 16, marginBottom: 10 },
  serviceCardSelected: { borderColor: '#0B4A45', backgroundColor: '#f0faf8' },
  serviceCardRow: { flexDirection: 'row', alignItems: 'center' },
  serviceName: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  serviceNameSelected: { color: '#0B4A45' },
  serviceDesc: { fontSize: 13, color: '#64748b', lineHeight: 18 },
  servicePrice: { fontSize: 15, fontWeight: '700', color: '#64748b' },
  servicePriceSelected: { color: '#0B4A45' },
  priceNote: { fontSize: 12, color: '#94a3b8', marginTop: 6 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, backgroundColor: '#EBF1EF', borderRadius: 8, padding: 10 },
  qtyLabel: { fontSize: 13, color: '#0B4A45', fontWeight: '600', flex: 1 },
  qtyInput: { width: 80, backgroundColor: '#fff', borderWidth: 1, borderColor: '#b7d5ce', borderRadius: 8, padding: 8, fontSize: 14, color: '#0f172a', textAlign: 'right' },
  totalBar: { backgroundColor: '#0B4A45', borderRadius: 14, padding: 16, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 2 },
  totalSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', maxWidth: 220 },
  totalAmount: { fontSize: 22, fontWeight: '800', color: '#fff' },
  addonOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  addonCard: { backgroundColor: '#fff', borderRadius: 20, padding: 24, maxHeight: '85%' },
  addonTitle: { fontSize: 20, fontWeight: '700', color: '#0B4A45', textAlign: 'center', marginBottom: 12 },
  addonBody: { fontSize: 14, color: '#64748b', lineHeight: 22, textAlign: 'center', marginBottom: 20 },
  addonPriceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#EBF1EF', borderRadius: 12, padding: 14, marginBottom: 8 },
  addonPriceLabel: { fontSize: 14, fontWeight: '600', color: '#374151', flex: 1, marginRight: 8 },
  addonPrice: { fontSize: 18, fontWeight: '800', color: '#0B4A45' },
  addonNote: { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginBottom: 4 },
  addonConfirmBtn: { backgroundColor: '#0B4A45', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 10, marginTop: 12 },
  addonConfirmText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  addonCancelBtn: { alignItems: 'center', padding: 12 },
  addonCancelText: { color: '#888', fontSize: 14 },
  solarFields: { marginTop: 12, backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#86efac' },
  solarFieldsTitle: { fontSize: 13, fontWeight: '700', color: '#065f46', marginBottom: 8 },
  billInputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, backgroundColor: '#fff', paddingHorizontal: 12, marginBottom: 12 },
  billDollar: { fontSize: 16, color: '#374151', marginRight: 4 },
  billInput: { flex: 1, fontSize: 16, padding: 10, color: '#0f172a' },
  choiceRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  choiceBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1.5, borderColor: '#e2e8f0', alignItems: 'center', backgroundColor: '#fff' },
  choiceBtnActive: { borderColor: '#0B4A45', backgroundColor: '#EBF1EF' },
  choiceBtnText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  choiceBtnTextActive: { color: '#0B4A45' },
});
