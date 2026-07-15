import { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { paymentsApi } from '../../src/services/api';
import { fmtUSD } from '../../src/utils/currency';
import { colors } from '../../src/theme';

const STATUS_COLOR: Record<string, string> = {
  PENDING: '#f6ad55',
  AUTHORIZED: '#4299e1',
  SUCCEEDED: '#17897D',
  DISPUTED: '#c53030',
  FAILED: '#94a3b8',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Awaiting customer',
  AUTHORIZED: 'In dispute window',
  SUCCEEDED: 'Released',
  DISPUTED: 'Disputed',
  FAILED: 'Failed',
};

export default function EarningsScreen() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const data = await paymentsApi.getVendorHistory();
      setPayments(data || []);
    } catch (e) {}
    setLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const totalReleased = payments
    .filter((p) => p.status === 'SUCCEEDED')
    .reduce((sum, p) => sum + Number(p.vendorAmount), 0);

  const totalPending = payments
    .filter((p) => ['PENDING', 'AUTHORIZED'].includes(p.status))
    .reduce((sum, p) => sum + Number(p.vendorAmount), 0);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.lanternDeep} size="large" />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryAmount}>{fmtUSD(totalReleased)}</Text>
          <Text style={styles.summaryLabel}>Total Released</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryAmount, { color: '#4299e1' }]}>{fmtUSD(totalPending)}</Text>
          <Text style={styles.summaryLabel}>Pending</Text>
        </View>
      </View>

      <View style={styles.feeNote}>
        <Ionicons name="information-circle-outline" size={16} color={colors.steel} />
        <Text style={styles.feeNoteText}>
          Net payout = amount billed − Stripe processing fee (2.9% + $0.30)
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Payment History</Text>

      {payments.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="cash-outline" size={40} color={colors.steel} />
          <Text style={styles.emptyText}>No payments yet.</Text>
          <Text style={styles.emptySubText}>Completed jobs with approved add-ons will appear here.</Text>
        </View>
      ) : (
        payments.map((payment) => {
          const amount = Number(payment.amount);
          const stripeFee = Number(payment.stripeFee);
          const vendorAmount = Number(payment.vendorAmount);
          const color = STATUS_COLOR[payment.status] || colors.steel;

          return (
            <View key={payment.id} style={styles.paymentCard}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{payment.description}</Text>
                  <Text style={styles.cardDate}>
                    {new Date(payment.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: color + '20' }]}>
                  <Text style={[styles.statusText, { color }]}>{STATUS_LABEL[payment.status] || payment.status}</Text>
                </View>
              </View>

              <View style={styles.breakdown}>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Billed to Attenteve</Text>
                  <Text style={styles.breakdownValue}>{fmtUSD(amount)}</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Stripe processing fee</Text>
                  <Text style={[styles.breakdownValue, { color: '#c53030' }]}>−{fmtUSD(stripeFee)}</Text>
                </View>
                <View style={[styles.breakdownRow, styles.breakdownNetRow]}>
                  <Text style={styles.breakdownNetLabel}>Your net payout</Text>
                  <Text style={styles.breakdownNetValue}>{fmtUSD(vendorAmount)}</Text>
                </View>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  summary: {
    flexDirection: 'row', backgroundColor: colors.ink, padding: 24,
    justifyContent: 'space-around', alignItems: 'center',
  },
  summaryItem: { alignItems: 'center' },
  summaryAmount: { fontSize: 28, fontWeight: '800', color: colors.mist },
  summaryLabel: { fontSize: 12, color: colors.mistDim, marginTop: 4 },
  summaryDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.2)' },
  feeNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.border, margin: 16, borderRadius: 10, padding: 12,
  },
  feeNoteText: { flex: 1, fontSize: 12, color: colors.steel, lineHeight: 18 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.lanternDeep, marginHorizontal: 16, marginBottom: 8 },
  emptyCard: {
    margin: 16, backgroundColor: '#fff', borderRadius: 16, padding: 32,
    alignItems: 'center', gap: 8,
  },
  emptyText: { fontSize: 16, fontWeight: '600', color: colors.steel },
  emptySubText: { fontSize: 13, color: colors.steel, textAlign: 'center' },
  paymentCard: {
    marginHorizontal: 16, marginBottom: 10, backgroundColor: '#fff',
    borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  cardDate: { fontSize: 12, color: colors.steel, marginTop: 2 },
  statusBadge: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  breakdown: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 6 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between' },
  breakdownLabel: { fontSize: 13, color: colors.steel },
  breakdownValue: { fontSize: 13, fontWeight: '600', color: colors.ink },
  breakdownNetRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 },
  breakdownNetLabel: { fontSize: 14, fontWeight: '700', color: colors.ink },
  breakdownNetValue: { fontSize: 16, fontWeight: '800', color: colors.lanternDeep },
});
