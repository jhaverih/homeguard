import { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { requestsApi } from '../../services/api';
import { colors } from '../../theme';
import { fmtUSD } from '../../utils/currency';
import { describeUnit } from '../../utils/units';

// "$1,234.50" while typing; same as the job screen's money fields.
const formatCurrencyInput = (text: string): string => {
  const clean = text.replace(/[$,]/g, '').replace(/[^0-9.]/g, '');
  if (!clean) return '';
  const parts = clean.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.length > 1 ? `$${intPart}.${parts[1].slice(0, 2)}` : `$${intPart}`;
};
const parseCurrencyRaw = (s: string): number => parseFloat(s.replace(/[$,]/g, '')) || 0;

// Extra work the technician finds on site, on any job. Nothing is done or
// charged until someone in the customer's home approves it in the app.
// A catalog service is priced by the server at the customer price; for
// anything else the technician enters the price.
export function ExtraWorkCard({ job, catalogItems, onChanged, showList = true }: {
  job: any;
  catalogItems: any[];
  onChanged: () => void;
  showList?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<any | null>(null);
  const [qty, setQty] = useState(1);
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState('');
  const [details, setDetails] = useState('');
  const [price, setPrice] = useState('');
  const [sending, setSending] = useState(false);

  // Lines the customer is (or was) asked to approve: recommendations and
  // extra time, not the booked services or materials.
  const sent = (job.additionalServices || []).filter((s: any) => !s.servicePriceId && !s.isMaterial);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return catalogItems
      .filter((c) => !c.requiresQuote && c.isActive !== false && c.name?.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, catalogItems]);

  const reset = () => {
    setOpen(false); setQuery(''); setPicked(null); setQty(1); setCustom(false);
    setName(''); setDetails(''); setPrice('');
  };

  const send = async () => {
    let payload: any;
    let label: string;
    if (picked) {
      payload = { servicePriceId: picked.id, quantity: qty, ...(details.trim() ? { description: details.trim() } : {}) };
      label = picked.name;
    } else if (custom) {
      const amount = parseCurrencyRaw(price);
      if (!name.trim()) { Alert.alert('What is the work?', 'Enter a short name for the extra work.'); return; }
      if (isNaN(amount) || amount <= 0) { Alert.alert('Price needed', 'Enter the price for the customer.'); return; }
      payload = { name: name.trim(), description: details.trim(), price: amount };
      label = name.trim();
    } else {
      return;
    }
    setSending(true);
    try {
      await requestsApi.recommendService(job.id, payload);
      Alert.alert('Sent for approval', `"${label}" was sent to the customer. Wait for their approval in the app before doing it.`);
      reset();
      onChanged();
    } catch (e: any) {
      Alert.alert('Could not send', e.message);
    } finally {
      setSending(false);
    }
  };

  const unit = picked ? describeUnit(picked) : null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Extra work</Text>
      <Text style={styles.hint}>
        Found something else that needs doing? Send it to the customer to approve in the app first. Don’t do extra work or take payment outside the app.
      </Text>

      {showList && sent.map((s: any) => (
        <View key={s.id} style={[styles.sentRow, s.approved ? styles.sentApproved : styles.sentPending]}>
          <Text style={styles.sentName} numberOfLines={2}>{s.name}</Text>
          <Text style={styles.sentPrice}>{fmtUSD(s.price)}</Text>
          <Text style={[styles.badge, { color: s.approved ? '#059669' : '#d97706' }]}>{s.approved ? 'Approved' : 'Waiting'}</Text>
        </View>
      ))}

      {!open ? (
        <TouchableOpacity style={styles.openBtn} onPress={() => setOpen(true)}>
          <Ionicons name="add-circle-outline" size={18} color={colors.ink} />
          <Text style={styles.openBtnText}>Recommend extra work</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ marginTop: 10 }}>
          {!picked && !custom && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Search services (e.g. faucet, outlet)"
                placeholderTextColor={colors.steel}
                value={query}
                onChangeText={setQuery}
              />
              {matches.map((c) => (
                <TouchableOpacity key={c.id} style={styles.match} onPress={() => { setPicked(c); setQty(1); }}>
                  <Text style={styles.matchName}>{c.name}</Text>
                  {!!c.customerPriceDisplay && <Text style={styles.matchPrice}>{c.customerPriceDisplay}</Text>}
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.match} onPress={() => setCustom(true)}>
                <Text style={styles.matchName}>Something else…</Text>
                <Text style={styles.matchPrice}>Enter your own name and price</Text>
              </TouchableOpacity>
            </>
          )}

          {picked && (
            <>
              <Text style={styles.pickedName}>{picked.name}</Text>
              {picked.quantityLabel && picked.quantityLabel !== 'NONE' && (
                <View style={styles.qtyRow}>
                  <Text style={styles.qtyLabel}>{unit?.hourly ? 'Hours' : `How many ${unit?.many}?`}</Text>
                  <TouchableOpacity onPress={() => setQty((q) => Math.max(1, q - 1))}>
                    <Ionicons name="remove-circle-outline" size={26} color={colors.lanternDeep} />
                  </TouchableOpacity>
                  <Text style={styles.qtyValue}>{qty}</Text>
                  <TouchableOpacity onPress={() => setQty((q) => Math.min(99, q + 1))}>
                    <Ionicons name="add-circle-outline" size={26} color={colors.lanternDeep} />
                  </TouchableOpacity>
                </View>
              )}
              <Text style={styles.small}>The customer sees the standard Attenteve price for this service.</Text>
            </>
          )}

          {custom && (
            <>
              <TextInput style={styles.input} placeholder="What is the work? (e.g. Replace shut-off valve)" placeholderTextColor={colors.steel} value={name} onChangeText={setName} />
              <TextInput
                style={styles.input}
                placeholder="Price for the customer ($)"
                placeholderTextColor={colors.steel}
                keyboardType="decimal-pad"
                value={price}
                onChangeText={(t) => setPrice(formatCurrencyInput(t))}
              />
            </>
          )}

          {(picked || custom) && (
            <>
              <TextInput
                style={[styles.input, { minHeight: 60 }]}
                placeholder="Why it's needed (shown to the customer)"
                placeholderTextColor={colors.steel}
                value={details}
                onChangeText={setDetails}
                multiline
              />
              <TouchableOpacity style={[styles.sendBtn, sending && { opacity: 0.6 }]} onPress={send} disabled={sending}>
                {sending ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.sendBtnText}>Send to customer for approval</Text>}
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity onPress={reset} style={{ alignItems: 'center', padding: 10 }}>
            <Text style={{ color: colors.steel, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
  title: { fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 4 },
  hint: { fontSize: 13, color: colors.steel, lineHeight: 19 },
  sentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1 },
  sentApproved: { borderColor: '#6ee7b7', backgroundColor: '#ecfdf5' },
  sentPending: { borderColor: '#fde68a', backgroundColor: '#fffbeb' },
  sentName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.ink },
  sentPrice: { fontSize: 14, fontWeight: '700', color: colors.ink },
  badge: { fontSize: 12, fontWeight: '700' },
  openBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.lantern, borderRadius: 10, padding: 12, marginTop: 12 },
  openBtnText: { fontSize: 15, fontWeight: '800', color: colors.ink },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 15, color: colors.ink, backgroundColor: colors.canvas, marginBottom: 8 },
  match: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  matchName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  matchPrice: { fontSize: 13, color: colors.steel, marginTop: 2 },
  pickedName: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  qtyLabel: { flex: 1, fontSize: 14, color: colors.ink },
  qtyValue: { fontSize: 16, fontWeight: '700', minWidth: 28, textAlign: 'center', color: colors.ink },
  small: { fontSize: 12, color: colors.steel, marginBottom: 8 },
  sendBtn: { backgroundColor: colors.lantern, borderRadius: 10, padding: 14, alignItems: 'center' },
  sendBtnText: { fontSize: 15, fontWeight: '800', color: colors.ink },
});
