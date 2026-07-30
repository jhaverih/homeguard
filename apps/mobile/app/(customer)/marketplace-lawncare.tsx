import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import RNDateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { marketplaceApi } from '../../src/services/api';
import { colors } from '../../src/theme';

type Mode = 'package' | 'service';
type AddOnSelection = { qty: string; frequency?: string };
type ServiceQuote = { price: number; discountRate: number; requiresQuote?: boolean; monthlyPrice?: number };

// One-off project services — quantity varies per project, not a standing
// property attribute, so these don't get a property-profile-derived default.
const MANUAL_QTY_SERVICES = new Set(['sod_installation', 'plant_installation', 'gravel_rock_installation']);

// Mirrors the qty portion of resolveServiceQty() in
// apps/api/src/marketplace/marketplace-lawncare-pricing.utils.ts, purely to
// pre-fill the editable qty input — the actual charged price always comes
// from the live quoteLawncare() call, never computed client-side. The 7
// non-size fields now live in profile.fieldValues (admin-manageable), keyed
// the same way as MarketplaceLawncarePropertyDetailField.key.
function displayQtyFromProfile(serviceKey: string, profile: any): number | null {
  if (!profile) return null;
  const field = (key: string) => Number(profile.fieldValues?.[key]) || 0;
  switch (serviceKey) {
    case 'mulch_installation': return Math.round((field('bedSqFt') * 0.25) / 27);
    case 'bed_weeding': return field('bedSqFt');
    case 'leaf_removal': return Number(profile.propertySizeSqFt) || 0;
    case 'shrub_trimming': return field('shrubPlantCount');
    case 'gutter_cleaning': return field('gutterLinearFt');
    case 'irrigation_startup':
    case 'irrigation_winterization': return field('irrigationZones');
    case 'small_tree_trimming': return field('treeCountSmall');
    case 'medium_tree_trimming': return field('treeCountMedium');
    case 'large_tree_trimming': return field('treeCountLarge');
    case 'landscape_lighting_maintenance': return field('lightingFixtureCount');
    default: return null; // flat services (lawn_mowing, spring_cleanup, seasonal_maintenance, drainage_correction)
  }
}

export default function MarketplaceLawncareScreen() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [config, setConfig] = useState<{ services: any[]; packages: any[]; propertyDetailFields: any[] } | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState<Record<string, string>>({});
  const [tierDraft, setTierDraft] = useState<string>('');
  const [tierPickerOpen, setTierPickerOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [mode, setMode] = useState<Mode>('package');
  const [packageKey, setPackageKey] = useState<string | null>(null);
  const [packageQuote, setPackageQuote] = useState<{ monthlyPrice: number; requiresQuote: boolean } | null>(null);
  const [packageQuoting, setPackageQuoting] = useState(false);

  const [selectedAddOns, setSelectedAddOns] = useState<Record<string, AddOnSelection>>({});
  const [addOnQuotes, setAddOnQuotes] = useState<Record<string, ServiceQuote>>({});
  const [addOnQuoting, setAddOnQuoting] = useState<Record<string, boolean>>({});
  const quoteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [preferredDate, setPreferredDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 3); return d; });
  const [showDate, setShowDate] = useState(false);

  useEffect(() => {
    Promise.all([marketplaceApi.getLawncareConfig(), marketplaceApi.getLawncarePropertyProfile()])
      .then(([c, p]) => {
        setConfig(c);
        setProfile(p);
        if (!p) setEditingProfile(true);
      })
      .catch(() => Alert.alert('Error', 'Could not load Lawncare options.'))
      .finally(() => setLoading(false));
  }, []);

  const selectedPackage = config?.packages.find((p) => p.key === packageKey) ?? null;
  const hasProfile = !!profile;
  const includedServiceKeys = new Set(selectedPackage?.composition?.map((c: any) => c.serviceKey) ?? []);
  const visibleServices = config?.services.filter((s) => !includedServiceKeys.has(s.key)) ?? [];
  const sizeTiers: any[] = config?.services.find((s) => s.key === 'lawn_mowing')?.sizeTiers ?? [];
  const propertyDetailFields: any[] = config?.propertyDetailFields ?? [];
  const selectedTier = sizeTiers.find((t) => t.key === profile?.propertySizeTier) ?? null;

  const openProfileEditor = () => {
    setProfileDraft(Object.fromEntries(propertyDetailFields.map((f) => [f.key, profile?.fieldValues?.[f.key] != null ? String(profile.fieldValues[f.key]) : ''])));
    setTierDraft(profile?.propertySizeTier ?? '');
    setEditingProfile(true);
  };

  const saveProfile = async () => {
    if (!tierDraft) { Alert.alert('Property Size Required', 'Please select your estimated property size.'); return; }
    setSavingProfile(true);
    try {
      const fieldValues: Record<string, number> = {};
      for (const f of propertyDetailFields) {
        const raw = profileDraft[f.key];
        if (raw != null && raw !== '') fieldValues[f.key] = Number(raw);
      }
      const payload: any = { fieldValues };
      if (tierDraft) payload.propertySizeTier = tierDraft;
      const saved = await marketplaceApi.saveLawncarePropertyProfile(payload);
      setProfile(saved);
      setEditingProfile(false);
    } catch (e: any) {
      Alert.alert('Error', e.message === 'NETWORK_ERROR' ? 'Cannot connect to server.' : e.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const togglePackage = (key: string) => {
    setPackageKey((prev) => (prev === key ? null : key));
  };

  // Package price stays live regardless of which tab is currently shown —
  // the combined order summary at the bottom needs it whether the customer
  // is browsing "Choose a Plan" or "Add-on Services".
  useEffect(() => {
    if (!selectedPackage || !hasProfile || editingProfile) { setPackageQuote(null); return; }
    setPackageQuoting(true);
    marketplaceApi.quoteLawncare({ mode: 'package', packageKey: selectedPackage.key })
      .then((q: any) => setPackageQuote(q)).catch(() => setPackageQuote(null)).finally(() => setPackageQuoting(false));
  }, [selectedPackage, hasProfile, editingProfile]);

  const toggleAddOn = (service: any) => {
    setSelectedAddOns((prev) => {
      const next = { ...prev };
      if (next[service.key]) {
        delete next[service.key];
      } else {
        // lawn_mowing is tier-priced — qty is meaningless to the price, but
        // book() still requires a positive number, so fix it at 1 and hide
        // the input entirely rather than asking the customer to enter it.
        const defaultQty = service.key === 'lawn_mowing' ? '1' : MANUAL_QTY_SERVICES.has(service.key) ? '' : String(displayQtyFromProfile(service.key, profile) ?? 0);
        next[service.key] = { qty: defaultQty, frequency: service.frequencyDiscounts?.length > 0 ? 'MONTHLY' : undefined };
      }
      return next;
    });
  };

  const updateAddOnQty = (key: string, qty: string) => {
    setSelectedAddOns((prev) => ({ ...prev, [key]: { ...prev[key], qty: qty.replace(/[^0-9.]/g, '') } }));
  };

  const updateAddOnFrequency = (key: string, frequency: string) => {
    setSelectedAddOns((prev) => ({ ...prev, [key]: { ...prev[key], frequency } }));
  };

  // Debounced live quote, per selected add-on row. Also re-quotes whenever
  // the selected (not-yet-subscribed) package changes, since a
  // membershipBenefit-gated discount (e.g. Leaf Removal's Seasonal Package
  // rate) needs to preview correctly for a package the customer is about to
  // subscribe to in this same order, not just one they already have active.
  useEffect(() => {
    for (const [key, sel] of Object.entries(selectedAddOns)) {
      if (quoteTimers.current[key]) clearTimeout(quoteTimers.current[key]);
      const qtyNum = Number(sel.qty);
      if (!sel.qty || Number.isNaN(qtyNum) || qtyNum <= 0) { setAddOnQuotes((p) => { const n = { ...p }; delete n[key]; return n; }); continue; }
      setAddOnQuoting((p) => ({ ...p, [key]: true }));
      quoteTimers.current[key] = setTimeout(() => {
        marketplaceApi.quoteLawncare({ mode: 'service', serviceKey: key, qty: qtyNum, frequency: sel.frequency, assumePackageKey: selectedPackage?.key })
          .then((q: any) => setAddOnQuotes((p) => ({ ...p, [key]: q })))
          .catch(() => setAddOnQuotes((p) => { const n = { ...p }; delete n[key]; return n; }))
          .finally(() => setAddOnQuoting((p) => ({ ...p, [key]: false })));
      }, 400);
    }
    // Drop quotes for rows that are no longer selected.
    setAddOnQuotes((p) => {
      const n: Record<string, ServiceQuote> = {};
      for (const k of Object.keys(p)) if (selectedAddOns[k]) n[k] = p[k];
      return n;
    });
    return () => { Object.values(quoteTimers.current).forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAddOns, selectedPackage]);

  // Combined total across everything selected: subscribable rows contribute
  // their real monthly charge, one-time rows contribute their per-visit
  // price — added together into one number, since that's what the customer
  // actually wants to see, with a per-row breakdown clarifying which parts
  // are auto-billed vs. billed per visit (the underlying billing mechanics
  // genuinely differ; the combined number doesn't paper over that).
  const addOnTotal = Object.values(addOnQuotes).reduce((sum, q) => sum + (q.requiresQuote ? 0 : (q.monthlyPrice ?? q.price)), 0);
  const anyAddOnQuoting = Object.values(addOnQuoting).some(Boolean);
  const anyAddOnRequiresQuote = Object.values(addOnQuotes).some((q) => q.requiresQuote);
  const selectedAddOnKeys = Object.keys(selectedAddOns);
  const subscribableSelections = Object.entries(addOnQuotes).filter(([, q]) => q.monthlyPrice != null);
  const subscribableKeys = new Set(subscribableSelections.map(([key]) => key));
  const hasOneTimeSelection = selectedAddOnKeys.some((key) => !subscribableKeys.has(key));
  const quotedSelections = Object.entries(addOnQuotes).filter(([, q]) => !q.requiresQuote);

  // Package + add-ons combine into one order, reviewed together and placed
  // in a single tap — a customer can select a package (not yet subscribed)
  // and add-ons (some of which may only be discounted because of that
  // package) at the same time, from either tab.
  const packageUsable = !!(selectedPackage && packageQuote && !packageQuote.requiresQuote);
  const orderTotal = (packageUsable ? packageQuote!.monthlyPrice : 0) + addOnTotal;
  const orderHasMonthlyComponent = packageUsable || subscribableSelections.length > 0;
  const anyRequiresQuote = anyAddOnRequiresQuote || !!packageQuote?.requiresQuote;
  const anyQuoting = anyAddOnQuoting || packageQuoting;
  const hasAnySelection = !!selectedPackage || selectedAddOnKeys.length > 0;

  const presentStripeSheet = async (clientSecret: string | null): Promise<boolean> => {
    if (!clientSecret) return true;
    const { error: initError } = await initPaymentSheet({ paymentIntentClientSecret: clientSecret, merchantDisplayName: 'Attenteve', allowsDelayedPaymentMethods: false });
    if (initError) { Alert.alert('Payment Setup Failed', initError.message); return false; }
    const { error: presentError } = await presentPaymentSheet();
    if (presentError) { if (presentError.code !== 'Canceled') Alert.alert('Payment Failed', presentError.message); return false; }
    return true;
  };

  // Package subscription + every selected add-on go out together as one
  // order. The package (if any) is subscribed FIRST — by the time the
  // add-ons are booked/subscribed, that package is a real active
  // subscription, so any membershipBenefit-gated discount (e.g. Leaf
  // Removal's Seasonal Package rate) applies automatically and correctly,
  // no special-casing needed on the booking side.
  const placeOrder = async () => {
    if (!hasAnySelection || anyRequiresQuote) return;
    setSubmitting(true);
    try {
      if (packageUsable) {
        const res = await marketplaceApi.subscribeLawncarePackage({ packageKey: selectedPackage.key });
        if (!res.charged) {
          const ok = await presentStripeSheet(res.clientSecret);
          if (!ok) { setSubmitting(false); return; } // stop entirely — add-ons priced assuming this package shouldn't proceed without it
        }
      }
      for (const key of selectedAddOnKeys) {
        const sel = selectedAddOns[key];
        if (addOnQuotes[key]?.monthlyPrice != null) {
          // Subscribable (e.g. Lawn Mowing Weekly/Biweekly) — real recurring
          // monthly Stripe subscription, not a one-time booking.
          const res = await marketplaceApi.subscribeLawncareService({ serviceKey: key, frequency: sel.frequency });
          if (!res.charged) {
            const ok = await presentStripeSheet(res.clientSecret);
            if (!ok) continue;
          }
        } else {
          await marketplaceApi.bookLawncareService({
            serviceKey: key,
            qty: Number(sel.qty),
            frequency: sel.frequency,
            preferredDate: preferredDate.toISOString(),
          });
        }
      }
      Alert.alert('Order Placed!', 'Any subscriptions are active now, and one-time services are being matched to a vendor.', [{ text: 'OK', onPress: () => router.back() }]);
      setPackageKey(null);
      setSelectedAddOns({});
    } catch (e: any) {
      Alert.alert('Error', e.message === 'NETWORK_ERROR' ? 'Cannot connect to server.' : e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmPlaceOrder = () => {
    const lines: string[] = [];
    if (packageUsable) lines.push(`${selectedPackage.label}: ${fmtUSD(packageQuote!.monthlyPrice)}/month`);
    if (selectedAddOnKeys.length > 0) lines.push(`${selectedAddOnKeys.length} add-on service${selectedAddOnKeys.length > 1 ? 's' : ''} selected`);
    Alert.alert(
      'Confirm Order',
      `${lines.join('\n')}\n\nSubscriptions are billed today using the card on file; one-time services are billed when completed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Place Order', onPress: placeOrder },
      ],
    );
  };

  if (loading || !config) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Lawncare</Text>
        <Text style={styles.subtitle}>Choose a monthly plan, add specific services, or both — review everything together before you place your order.</Text>

        <Text style={styles.sectionLabel}>Property Details</Text>
        {editingProfile ? (
          <>
            <Text style={styles.helperText}>Entered once and reused for every Lawncare price — no need to enter it again.</Text>

            <Text style={styles.profileFieldLabel}>Estimated Property Size</Text>
            <TouchableOpacity style={styles.dropdownField} onPress={() => setTierPickerOpen(true)}>
              <Text style={sizeTiers.find((t) => t.key === tierDraft) ? styles.dropdownValueText : styles.dropdownPlaceholderText}>
                {sizeTiers.find((t) => t.key === tierDraft)?.label ?? 'Select property size'}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colors.steel} />
            </TouchableOpacity>

            <Modal visible={tierPickerOpen} transparent animationType="fade" onRequestClose={() => setTierPickerOpen(false)}>
              <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setTierPickerOpen(false)}>
                <TouchableOpacity style={styles.modalSheet} activeOpacity={1} onPress={() => {}}>
                  <Text style={styles.modalTitle}>Estimated Property Size</Text>
                  <ScrollView>
                    {sizeTiers.map((t) => (
                      <TouchableOpacity
                        key={t.key}
                        style={[styles.tierRow, tierDraft === t.key && styles.tierRowActive]}
                        onPress={() => { setTierDraft(t.key); setTierPickerOpen(false); }}
                      >
                        <Ionicons name={tierDraft === t.key ? 'radio-button-on' : 'radio-button-off'} size={18} color={tierDraft === t.key ? colors.lanternDeep : colors.steel} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.tierRowLabel}>{t.label}</Text>
                          <Text style={styles.tierRowSub}>{t.maxSF != null ? `up to ${Number(t.maxSF).toLocaleString('en-US')} sq ft` : 'over 5 acres — custom quote'}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>

            {propertyDetailFields.map((f) => (
              <View key={f.key} style={styles.profileFieldRow}>
                <Text style={styles.profileFieldLabel}>{f.label}</Text>
                <TextInput
                  style={styles.profileFieldInput}
                  keyboardType="numeric"
                  placeholder={f.unit}
                  placeholderTextColor={colors.steel}
                  value={profileDraft[f.key] ?? ''}
                  onChangeText={(v) => setProfileDraft((p) => ({ ...p, [f.key]: v.replace(/[^0-9.]/g, '') }))}
                />
              </View>
            ))}
            <TouchableOpacity style={[styles.submitBtn, savingProfile && styles.submitBtnDisabled]} onPress={saveProfile} disabled={savingProfile}>
              {savingProfile ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.submitBtnText}>Save Property Details</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.profileSummary} onPress={openProfileEditor}>
            <Ionicons name="home-outline" size={18} color={colors.lanternDeep} />
            <Text style={styles.profileSummaryText}>{selectedTier ? `Property size: ${selectedTier.label}` : 'Property details saved'}</Text>
            <Text style={styles.profileEditLink}>Edit</Text>
          </TouchableOpacity>
        )}

        {!editingProfile && (
          <>
            <View style={styles.choiceRow}>
              <TouchableOpacity style={[styles.choiceBtn, mode === 'package' && styles.choiceBtnActive]} onPress={() => setMode('package')}>
                <Text style={[styles.choiceBtnText, mode === 'package' && styles.choiceBtnTextActive]}>Subscribe to a Package</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.choiceBtn, mode === 'service' && styles.choiceBtnActive]} onPress={() => setMode('service')}>
                <Text style={[styles.choiceBtnText, mode === 'service' && styles.choiceBtnTextActive]}>Add-on Services</Text>
              </TouchableOpacity>
            </View>

            {mode === 'package' ? (
              <>
                <Text style={styles.sectionLabel}>Choose a Plan</Text>
                <Text style={styles.helperText}>Tap a plan to select it; tap again to deselect. Add services from the other tab before placing your order — everything combines into one order below.</Text>
                {config.packages.map((p) => {
                  const selected = p.key === packageKey;
                  return (
                    <TouchableOpacity key={p.key} style={[styles.packageCard, selected && styles.packageCardActive]} onPress={() => togglePackage(p.key)}>
                      <View style={styles.packageCardHeader}>
                        <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={18} color={selected ? colors.lanternDeep : colors.steel} />
                        <Text style={styles.packageLabel}>{p.label}</Text>
                        <Ionicons name={selected ? 'chevron-up' : 'chevron-down'} size={16} color={colors.steel} />
                      </View>
                      {selected && <Text style={styles.packageDescription}>{p.description}</Text>}
                    </TouchableOpacity>
                  );
                })}
              </>
            ) : (
              <>
                <Text style={styles.sectionLabel}>Add-on Services</Text>
                {!!selectedPackage && (
                  <Text style={styles.helperText}>Services already included in {selectedPackage.label} are hidden below.</Text>
                )}
                {visibleServices.map((s) => {
                  const sel = selectedAddOns[s.key];
                  const selected = !!sel;
                  const quote = addOnQuotes[s.key];
                  const quotingRow = addOnQuoting[s.key];
                  return (
                    <View key={s.key} style={styles.addOnCard}>
                      <TouchableOpacity style={styles.addOnHeader} onPress={() => toggleAddOn(s)}>
                        <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={18} color={selected ? colors.lanternDeep : colors.steel} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.serviceLabel}>{s.label}</Text>
                          <Text style={styles.serviceMeta}>{s.pricingUnit} · {s.recommendedFrequency}</Text>
                        </View>
                        {quote && (
                          <Text style={styles.addOnPrice}>
                            {quote.requiresQuote ? 'Custom Quote' : quote.monthlyPrice != null ? `${fmtUSD(quote.monthlyPrice)}/mo` : fmtUSD(quote.price)}
                          </Text>
                        )}
                      </TouchableOpacity>

                      {selected && (
                        <View style={styles.addOnDetails}>
                          {s.key !== 'lawn_mowing' && (
                            <View style={styles.qtyRow}>
                              <Text style={styles.qtyLabel}>Quantity ({s.pricingUnit})</Text>
                              {MANUAL_QTY_SERVICES.has(s.key) ? (
                                <TextInput
                                  style={styles.profileFieldInput}
                                  keyboardType="numeric"
                                  value={sel.qty}
                                  onChangeText={(v) => updateAddOnQty(s.key, v)}
                                />
                              ) : (
                                <Text style={styles.qtyValue}>{sel.qty || '0'}</Text>
                              )}
                            </View>
                          )}

                          {s.frequencyDiscounts?.length > 0 && (
                            <View style={styles.freqRow}>
                              {s.frequencyDiscounts.map((f: any) => (
                                <TouchableOpacity
                                  key={f.frequency}
                                  style={[styles.freqChip, sel.frequency === f.frequency && styles.freqChipActive]}
                                  onPress={() => updateAddOnFrequency(s.key, f.frequency)}
                                >
                                  <Text style={[styles.freqChipText, sel.frequency === f.frequency && styles.freqChipTextActive]}>{f.label}{f.ratePercent > 0 ? ` (-${f.ratePercent}%)` : ''}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                          {(() => {
                            const selectedFreqDescription = s.frequencyDiscounts?.find((f: any) => f.frequency === sel.frequency)?.description;
                            return selectedFreqDescription ? <Text style={styles.helperText}>{selectedFreqDescription}</Text> : null;
                          })()}

                          {quotingRow && <ActivityIndicator color={colors.lanternDeep} style={{ marginTop: 8 }} />}
                          {quote?.requiresQuote && <Text style={styles.helperText}>Your selected property size requires a custom quote — contact support.</Text>}
                          {quote?.monthlyPrice != null && <Text style={styles.helperText}>Billed automatically each month while active.</Text>}
                        </View>
                      )}
                    </View>
                  );
                })}

              </>
            )}

            {hasAnySelection && (
              <>
                {hasOneTimeSelection && (
                  <>
                    <Text style={styles.sectionLabel}>Preferred Date</Text>
                    <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDate(true)}>
                      <Text style={styles.dateBtnText}>{preferredDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                      <Ionicons name="calendar-outline" size={18} color={colors.lanternDeep} />
                    </TouchableOpacity>
                    {showDate && (
                      <RNDateTimePicker value={preferredDate} mode="date" minimumDate={new Date()} onChange={(_, d) => { setShowDate(Platform.OS === 'ios'); if (d) setPreferredDate(d); }} />
                    )}
                  </>
                )}

                <View style={styles.priceCard}>
                  {anyQuoting ? (
                    <ActivityIndicator color={colors.lanternDeep} />
                  ) : anyRequiresQuote ? (
                    <>
                      <Text style={styles.priceAmount}>Custom Quote</Text>
                      <Text style={styles.priceSub}>One or more selections require a custom quote — contact support.</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.priceLabel}>Order Total</Text>
                      <Text style={styles.priceAmount}>
                        {fmtUSD(orderTotal)}{orderHasMonthlyComponent ? <Text style={styles.pricePer}>/mo</Text> : null}
                      </Text>
                    </>
                  )}
                </View>

                {!anyQuoting && !anyRequiresQuote && (packageUsable || quotedSelections.length > 0) && (
                  <View style={styles.totalBreakdown}>
                    {packageUsable && (
                      <Text style={styles.totalBreakdownLine}>{selectedPackage!.label} — {fmtUSD(packageQuote!.monthlyPrice)}/mo · auto-billed</Text>
                    )}
                    {quotedSelections.map(([key, q]) => {
                      const s = visibleServices.find((svc) => svc.key === key);
                      const freqLabel = s?.frequencyDiscounts?.find((f: any) => f.frequency === selectedAddOns[key]?.frequency)?.label;
                      const label = freqLabel ? `${s?.label ?? key} (${freqLabel})` : (s?.label ?? key);
                      const priceText = q.monthlyPrice != null ? `${fmtUSD(q.monthlyPrice)}/mo · auto-billed` : `${fmtUSD(q.price)} · billed per visit`;
                      return (
                        <Text key={key} style={styles.totalBreakdownLine}>{label} — {priceText}</Text>
                      );
                    })}
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.submitBtn, (submitting || anyQuoting || anyRequiresQuote) && styles.submitBtnDisabled]}
                  onPress={confirmPlaceOrder}
                  disabled={submitting || anyQuoting || anyRequiresQuote}
                >
                  {submitting ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.submitBtnText}>Place Order</Text>}
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function fmtUSD(n: number) {
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: '700', color: colors.lanternDeep, marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 20 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.steel, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 20, marginBottom: 10 },
  helperText: { fontSize: 12, color: colors.steel, marginBottom: 10, marginTop: -4 },
  choiceRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  choiceBtn: { flex: 1, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff', alignItems: 'center' },
  choiceBtnActive: { borderColor: colors.lanternDeep, backgroundColor: colors.mist },
  choiceBtnText: { fontSize: 13, fontWeight: '600', color: colors.steel, textAlign: 'center' },
  choiceBtnTextActive: { color: colors.lanternDeep },
  dropdownField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8 },
  dropdownValueText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  dropdownPlaceholderText: { fontSize: 14, color: colors.steel },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.canvas, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, maxHeight: '75%' },
  modalTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 12 },
  tierRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 },
  tierRowActive: { borderColor: colors.lanternDeep, backgroundColor: colors.mist },
  tierRowLabel: { fontSize: 13, fontWeight: '600', color: colors.ink },
  tierRowSub: { fontSize: 11, color: colors.steel, marginTop: 2 },
  profileFieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 },
  profileFieldLabel: { fontSize: 13, color: colors.ink, flex: 1 },
  profileFieldInput: { width: 90, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, textAlign: 'right', color: colors.ink },
  profileSummary: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 14 },
  profileSummaryText: { fontSize: 14, color: colors.ink, flex: 1 },
  profileEditLink: { fontSize: 13, fontWeight: '600', color: colors.lanternDeep },
  packageCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 },
  packageCardActive: { borderColor: colors.lanternDeep, backgroundColor: colors.mist },
  packageCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  packageLabel: { fontSize: 15, fontWeight: '700', color: colors.ink, flex: 1 },
  packageDescription: { fontSize: 12, color: colors.steel, lineHeight: 18, marginLeft: 26 },
  addOnCard: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 },
  addOnHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addOnPrice: { fontSize: 13, fontWeight: '700', color: colors.lanternDeep },
  addOnDetails: { marginTop: 10, marginLeft: 28 },
  serviceLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
  serviceMeta: { fontSize: 11, color: colors.steel, marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  qtyLabel: { fontSize: 13, color: colors.ink, flex: 1 },
  qtyValue: { fontSize: 13, fontWeight: '600', color: colors.ink },
  freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  freqChip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.canvas },
  freqChipActive: { borderColor: colors.lanternDeep, backgroundColor: colors.mist },
  freqChipText: { fontSize: 11, color: colors.steel, fontWeight: '600' },
  freqChipTextActive: { color: colors.lanternDeep },
  totalBreakdown: { backgroundColor: colors.mist, borderRadius: 10, padding: 12, marginTop: 10 },
  totalBreakdownLine: { fontSize: 12, color: colors.ink, marginTop: 2 },
  dateBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateBtnText: { fontSize: 15, color: colors.lanternDeep, fontWeight: '500' },
  priceCard: { backgroundColor: colors.ink, borderRadius: 14, padding: 18, marginTop: 24, alignItems: 'center', minHeight: 80, justifyContent: 'center' },
  priceLabel: { fontSize: 12, color: colors.mistDim, marginBottom: 2 },
  priceAmount: { fontSize: 26, fontWeight: '800', color: colors.mist },
  pricePer: { fontSize: 14, fontWeight: '500' },
  priceSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  submitBtn: { backgroundColor: colors.lantern, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16 },
  submitBtnDisabled: { backgroundColor: colors.steel },
  submitBtnText: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelText: { color: colors.steel, fontSize: 14 },
});
