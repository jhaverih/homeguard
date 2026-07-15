import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image, Alert,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { requestsApi, inspectionsApi, subscriptionsApi } from '../../src/services/api';
import { fmtUSD } from '../../src/utils/currency';
import { colors } from '../../src/theme';

const TASK_STATUS_LABELS: Record<string, string> = {
  OK: 'Good',
  NEEDS_ATTENTION: 'Needs Attention',
  URGENT: 'Urgent',
  NOT_ACCESSIBLE: 'Not Accessible',
};

const C = {
  bg: colors.canvas,
  surface: colors.surface,
  sunken: colors.mist,
  ink: colors.ink,
  inkSoft: colors.steel,
  border: colors.border,
  teal: colors.lanternDeep,
  tealDeep: colors.lanternDeep,
  coral: colors.lanternDeep,
  ok: colors.lanternDeep,
  okBg: colors.mist,
  okBorder: colors.border,
  warn: '#B4620F',
  warnBg: '#FBEDDB',
  warnBorder: '#EEC087',
};

export default function InspectionReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [request, setRequest] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [taskResults, setTaskResults] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [goodExpanded, setGoodExpanded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [req, notesData, tasks]: any[] = await Promise.all([
        requestsApi.getOneWithPhotos(id),
        inspectionsApi.getNotes(id).catch(() => []),
        inspectionsApi.getTasks(id).catch(() => []),
      ]);
      setRequest(req);
      setNotes(notesData || []);
      setTaskResults(tasks || []);
      subscriptionsApi.getMySubscription().then(setSubscription).catch(() => {});
    } catch {
      Alert.alert('Error', 'Could not load inspection report.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const approveService = async (serviceId: string) => {
    setApprovingId(serviceId);
    try {
      await requestsApi.approveService(serviceId);
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setApprovingId(null);
    }
  };

  const declineService = (serviceId: string) => {
    Alert.alert(
      'Decline Service',
      'Are you sure you want to decline this recommended service?',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Decline', style: 'destructive',
          onPress: async () => {
            setDecliningId(serviceId);
            try {
              await requestsApi.declineService(serviceId);
              load();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setDecliningId(null);
            }
          },
        },
      ],
    );
  };

  if (loading || !request) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.teal} size="large" />
      </View>
    );
  }

  const findings = notes.filter((n: any) => n.type === 'FINDING');
  const observations = notes.filter((n: any) => n.type === 'OBSERVATION');
  const isSolarRequest = request.type === 'ADDITIONAL_SERVICE' &&
    (request.additionalServices?.[0]?.name || '').toLowerCase().includes('solar');
  const pendingServices = (request.additionalServices || [])
    .filter((s: any) => !s.approved && !(isSolarRequest && s.name?.toLowerCase().includes('solar')));
  const approvedServices = (request.additionalServices || [])
    .filter((s: any) => s.approved && !(isSolarRequest && s.name?.toLowerCase().includes('solar')));
  const totalNotes = notes.length;

  const hvacReportTask = taskResults.find((t: any) => t.taskKey === 'hvac_report');
  const hvacData: Record<string, string> = hvacReportTask?.structuredData || {};
  const isHvacReport = !!hvacReportTask;

  const regularTasks = taskResults.filter((t: any) => t.taskKey !== 'hvac_report');
  const okTasks = regularTasks.filter((t: any) => t.status === 'OK');
  const attentionTasks = regularTasks.filter((t: any) => t.status !== 'OK');
  const hasTaskResults = regularTasks.length > 0;

  const HVAC_EQUIP_COLS = [
    { key: 'make', label: 'Make/Brand' },
    { key: 'model_num', label: 'Model #' },
    { key: 'serial_num', label: 'Serial #' },
    { key: 'install_year', label: 'Year' },
  ];
  const HVAC_EQUIP_ROWS = [
    { key: 'air_handler', label: 'Air Handler / Furnace' },
    { key: 'condenser', label: 'Condenser / Heat Pump' },
    { key: 'thermostat', label: 'Thermostat' },
    { key: 'humidifier', label: 'Humidifier / Dehumidifier' },
  ];

  const HVAC_REPORT_SECTIONS = [
    {
      key: 'system_id', num: 1, title: 'System Identification',
      infoFields: [
        { key: 'equipment_location', label: 'Equipment Location' },
        { key: 'unit_age', label: 'Unit Age (years)' },
        { key: 'warranty_status', label: 'Warranty Status' },
        { key: 'service_history', label: 'Service History' },
      ],
      checks: [] as { key: string; label: string }[],
    },
    {
      key: 'thermostat_ctrl', num: 2, title: 'Thermostat & Controls',
      infoFields: [
        { key: 'type', label: 'Type' },
        { key: 'brand_model', label: 'Brand / Model' },
        { key: 'location', label: 'Location' },
      ],
      checks: [
        { key: 'display', label: 'Display functional' },
        { key: 'temp_response', label: 'Temperature response' },
        { key: 'heat_mode', label: 'Heating mode' },
        { key: 'cool_mode', label: 'Cooling mode' },
        { key: 'fan_mode', label: 'Fan mode' },
        { key: 'schedule', label: 'Schedule / programming' },
        { key: 'smart_features', label: 'Smart features' },
        { key: 'wiring', label: 'Wiring connections' },
      ],
    },
    {
      key: 'air_filter', num: 3, title: 'Air Filter & Airflow',
      infoFields: [
        { key: 'filter_size', label: 'Filter Size' },
        { key: 'filter_type', label: 'Filter Type' },
        { key: 'filter_merv', label: 'MERV Rating' },
      ],
      checks: [
        { key: 'filter_clean', label: 'Filter condition' },
        { key: 'airflow_normal', label: 'Airflow' },
        { key: 'filter_access', label: 'Filter access' },
        { key: 'return_air', label: 'Return air registers' },
      ],
    },
    {
      key: 'heating', num: 4, title: 'Heating System',
      infoFields: [
        { key: 'fuel_type', label: 'Fuel Type' },
        { key: 'temp_rise', label: 'Temperature Rise' },
      ],
      checks: [
        { key: 'heat_exchanger', label: 'Heat exchanger' },
        { key: 'burner_flame', label: 'Burner flame' },
        { key: 'ignition', label: 'Ignition sequence' },
        { key: 'flue_venting', label: 'Flue / venting' },
        { key: 'gas_valve', label: 'Gas valve & supply line' },
        { key: 'blower_operation', label: 'Blower operation' },
        { key: 'combustion_residue', label: 'No soot / scorch marks' },
      ],
    },
    {
      key: 'cooling', num: 5, title: 'Cooling System',
      infoFields: [
        { key: 'refrigerant_type', label: 'Refrigerant Type' },
        { key: 'temp_diff', label: 'Temperature Differential' },
      ],
      checks: [
        { key: 'condenser_unit', label: 'Condenser unit' },
        { key: 'evap_coil', label: 'Evaporator coil' },
        { key: 'compressor_op', label: 'Compressor operation' },
        { key: 'refrigerant_level', label: 'Refrigerant level' },
        { key: 'line_insulation', label: 'Line insulation' },
        { key: 'condenser_fan', label: 'Condenser fan' },
      ],
    },
    {
      key: 'electrical', num: 6, title: 'Electrical System',
      infoFields: [
        { key: 'voltage', label: 'Voltage' },
        { key: 'amperage', label: 'Amperage' },
      ],
      checks: [
        { key: 'wiring_condition', label: 'Wiring condition' },
        { key: 'disconnect_box', label: 'Disconnect box' },
        { key: 'breaker_sizing', label: 'Breaker sizing' },
        { key: 'safety_switches', label: 'Safety shutoffs' },
        { key: 'control_board', label: 'Control board' },
      ],
    },
    {
      key: 'ductwork', num: 7, title: 'Air Distribution & Ductwork',
      infoFields: [{ key: 'duct_material', label: 'Duct Material' }],
      checks: [
        { key: 'duct_condition', label: 'Duct condition' },
        { key: 'duct_insulation', label: 'Duct insulation' },
        { key: 'airflow_balance', label: 'Airflow balance' },
        { key: 'supply_registers', label: 'Supply registers' },
        { key: 'duct_noise', label: 'Duct noise' },
      ],
    },
    {
      key: 'condensate', num: 8, title: 'Condensate Management',
      infoFields: [] as { key: string; label: string }[],
      checks: [
        { key: 'drain_line', label: 'Drain line' },
        { key: 'condensate_pump', label: 'Condensate pump' },
        { key: 'drip_pan', label: 'Drip pan' },
        { key: 'safety_float', label: 'Safety float switch' },
      ],
    },
    {
      key: 'safety', num: 9, title: 'Safety & Compliance',
      infoFields: [{ key: 'emergency_shutoff', label: 'Emergency Shutoff' }],
      checks: [
        { key: 'co_detector', label: 'CO detector' },
        { key: 'high_limit', label: 'High-limit controls' },
        { key: 'clearances', label: 'Equipment clearances' },
        { key: 'combustion_air', label: 'Combustion air supply' },
        { key: 'pressure_relief', label: 'Pressure relief devices' },
      ],
    },
    {
      key: 'performance', num: 10, title: 'Operational Performance',
      infoFields: [{ key: 'summary_notes', label: 'Defects & Findings' }],
      checks: [
        { key: 'heating_cycle', label: 'Heating cycle' },
        { key: 'cooling_cycle', label: 'Cooling cycle' },
        { key: 'noise_level', label: 'Noise level' },
        { key: 'no_odors', label: 'No unusual odors' },
        { key: 'system_functional', label: 'System fully functional' },
      ],
    },
    {
      key: 'photos', num: 11, title: 'Photo Documentation',
      infoFields: [{ key: 'photo_notes', label: 'Photo Notes' }],
      checks: [] as { key: string; label: string }[],
    },
  ];

  const address = [request.address, request.city, request.state, request.zipCode]
    .filter(Boolean).join(', ');

  const completedDate = request.scheduledDate
    ? new Date(request.scheduledDate).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : 'Date not recorded';

  const vendor = request.vendor;
  const vendorName = vendor ? `${vendor.firstName} ${vendor.lastName}` : null;
  const vendorCompany = vendor?.vendorProfile?.companyName;
  const vendorInitials = vendorName
    ? vendorName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const inspUsed = subscription?.inspectionsUsed ?? 0;
  const inspTotal = subscription?.plan?.inspectionsPerYear ?? 0;
  const inspPct = inspTotal > 0 ? Math.min(inspUsed / inspTotal, 1) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusPillText}>{isHvacReport ? 'HVAC Inspection Complete' : 'Inspection Complete'}</Text>
        </View>
        <Text style={styles.headerDate}>{completedDate}</Text>
      </View>

      {!!address && <Text style={styles.addressText}>{address}</Text>}

      {vendorName && (
        <View style={styles.vendorRow}>
          <View style={styles.vendorAvatar}>
            <Text style={styles.vendorAvatarText}>{vendorInitials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.vendorName}>{vendorName}</Text>
            {vendorCompany ? <Text style={styles.vendorCompany}>{vendorCompany}</Text> : null}
          </View>
        </View>
      )}

      {/* ── HVAC Inspection Report ── */}
      {isHvacReport && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="thermometer-outline" size={14} color={C.tealDeep} />
            <Text style={[styles.sectionLabel, { color: C.tealDeep, flex: 1 }]}>HVAC Inspection Report</Text>
          </View>

          {HVAC_REPORT_SECTIONS.map((sec) => {
            const hasInfo = sec.infoFields.some((f) => hvacData[sec.key + '_' + f.key]);
            const hasEquip = sec.key === 'system_id' && HVAC_EQUIP_ROWS.some((row) =>
              HVAC_EQUIP_COLS.some((col) => hvacData[`equip_${row.key}_${col.key}`])
            );
            const checkResults = sec.checks.map((c) => ({
              ...c,
              status: hvacData[sec.key + '_' + c.key + '_status'] || '',
              notes: hvacData[sec.key + '_' + c.key + '_notes'] || '',
            })).filter((c) => c.status);
            if (!hasInfo && !hasEquip && checkResults.length === 0) return null;

            return (
              <View key={sec.key} style={hvacRpt.card}>
                {/* Section header */}
                <View style={hvacRpt.header}>
                  <View style={hvacRpt.badge}><Text style={hvacRpt.badgeText}>{sec.num}</Text></View>
                  <Text style={hvacRpt.title}>{sec.title}</Text>
                </View>

                {/* Equipment table */}
                {hasEquip && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                    <View>
                      <View style={hvacRpt.tableHeaderRow}>
                        <View style={hvacRpt.tableFirstCol}><Text style={hvacRpt.tableHeaderText}>Equipment</Text></View>
                        {HVAC_EQUIP_COLS.map((col) => (
                          <View key={col.key} style={hvacRpt.tableCol}>
                            <Text style={hvacRpt.tableHeaderText}>{col.label}</Text>
                          </View>
                        ))}
                      </View>
                      {HVAC_EQUIP_ROWS.map((row, rIdx) => {
                        const rowHasData = HVAC_EQUIP_COLS.some((col) => hvacData[`equip_${row.key}_${col.key}`]);
                        if (!rowHasData) return null;
                        return (
                          <View key={row.key} style={[hvacRpt.tableDataRow, rIdx % 2 === 1 && { backgroundColor: '#f8fafc' }]}>
                            <View style={hvacRpt.tableFirstCol}><Text style={hvacRpt.tableRowLabel}>{row.label}</Text></View>
                            {HVAC_EQUIP_COLS.map((col) => (
                              <View key={col.key} style={hvacRpt.tableCol}>
                                <Text style={hvacRpt.tableCellText}>{hvacData[`equip_${row.key}_${col.key}`] || '—'}</Text>
                              </View>
                            ))}
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                )}

                {/* Info fields */}
                {sec.infoFields.filter((f) => hvacData[sec.key + '_' + f.key]).map((f) => (
                  <View key={f.key} style={hvacRpt.infoRow}>
                    <Text style={hvacRpt.infoLabel}>{f.label}</Text>
                    <Text style={hvacRpt.infoValue}>{hvacData[sec.key + '_' + f.key]}</Text>
                  </View>
                ))}

                {/* Check item results */}
                {checkResults.length > 0 && (
                  <View style={hvacRpt.checksWrap}>
                    {checkResults.map((c, idx) => {
                      const isPASS = c.status === 'PASS';
                      const isFAIL = c.status === 'FAIL';
                      return (
                        <View key={c.key} style={[hvacRpt.checkRow, idx > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                          <View style={[hvacRpt.statusBadge,
                            isPASS && { backgroundColor: '#dcfce7', borderColor: '#86efac' },
                            isFAIL && { backgroundColor: '#fee2e2', borderColor: '#fca5a5' },
                            !isPASS && !isFAIL && { backgroundColor: colors.border, borderColor: colors.border },
                          ]}>
                            <Text style={[hvacRpt.statusText,
                              isPASS && { color: '#059669' },
                              isFAIL && { color: '#dc2626' },
                              !isPASS && !isFAIL && { color: '#6b7280' },
                            ]}>{c.status}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={hvacRpt.checkLabel}>{c.label}</Text>
                            {!!c.notes && <Text style={hvacRpt.checkNotes}>{c.notes}</Text>}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* ── Structured task results ── */}
      {hasTaskResults && (
        <>
          {/* Needs attention (expanded) */}
          {attentionTasks.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="warning-outline" size={14} color={C.warn} />
                <Text style={[styles.sectionLabel, { color: C.warn }]}>Needs your attention</Text>
                <View style={styles.coralCountBadge}>
                  <Text style={styles.coralCountBadgeText}>{attentionTasks.length}</Text>
                </View>
              </View>
              {attentionTasks.map((task: any) => {
                const isUrgent = task.status === 'URGENT';
                const linked = (request.additionalServices || []).find(
                  (s: any) => s.id === task.linkedAdditionalServiceId,
                );
                const pendingLinked = linked && !linked.approved;
                return (
                  <View key={task.id} style={[styles.findingCard, isUrgent && styles.findingCardUrgent]}>
                    <View style={[styles.findingPill, isUrgent && styles.findingPillUrgent]}>
                      <Ionicons name="warning-outline" size={12} color={isUrgent ? '#dc2626' : C.warn} />
                      <Text style={[styles.findingPillText, isUrgent && { color: '#dc2626' }]}>
                        {TASK_STATUS_LABELS[task.status]}
                      </Text>
                    </View>
                    <Text style={styles.noteTitle}>{task.taskKey.split('.').pop()?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}</Text>
                    {task.findings ? <Text style={styles.noteContent}>{task.findings}</Text> : null}
                    {task.photoUrls?.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
                        {task.photoUrls.map((url: string, i: number) => (
                          <Image key={i} source={{ uri: url }} style={styles.photoThumb} />
                        ))}
                      </ScrollView>
                    )}
                    {pendingLinked && (
                      <View style={styles.linkedQuote}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.linkedQuoteTitle}>Quote: {linked.name}</Text>
                          <Text style={styles.linkedQuotePrice}>{fmtUSD(linked.price)}</Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.approveBtn, { paddingHorizontal: 16 }, approvingId === linked.id && styles.btnDisabled]}
                          onPress={() => approveService(linked.id)}
                          disabled={approvingId === linked.id}
                        >
                          {approvingId === linked.id
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <Text style={styles.approveBtnText}>Approve</Text>}
                        </TouchableOpacity>
                      </View>
                    )}
                    {linked?.approved && (
                      <View style={styles.approvedBadge}>
                        <Ionicons name="checkmark-circle" size={14} color={C.ok} />
                        <Text style={styles.approvedText}>Quote approved</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* All good (collapsible) */}
          {okTasks.length > 0 && (
            <View style={styles.section}>
              <TouchableOpacity style={styles.sectionHeaderRow} onPress={() => setGoodExpanded((v) => !v)}>
                <Ionicons name="checkmark-circle-outline" size={14} color={C.ok} />
                <Text style={[styles.sectionLabel, { color: C.ok, flex: 1 }]}>Checked — all good</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{okTasks.length}</Text>
                </View>
                <Ionicons name={goodExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={C.inkSoft} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
              {goodExpanded && (
                <View style={styles.goodList}>
                  {okTasks.map((task: any, idx: number) => (
                    <View key={task.id} style={[styles.goodItem, idx > 0 && styles.goodItemBorder]}>
                      <Text style={styles.goodItemTitle} numberOfLines={2}>
                        {task.taskKey.split('.').pop()?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                      </Text>
                      <View style={styles.goodPill}>
                        <Text style={styles.goodPillText}>Good</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </>
      )}

      {/* Included in your inspection (legacy notes) */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>Included in your inspection</Text>
          {totalNotes > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{totalNotes}</Text>
            </View>
          )}
        </View>

        {totalNotes === 0 ? (
          <Text style={styles.emptyText}>No inspection notes recorded.</Text>
        ) : (
          <>
            {findings.map((note: any) => (
              <View key={note.id} style={styles.findingCard}>
                <View style={styles.findingPill}>
                  <Ionicons name="warning-outline" size={12} color={C.warn} />
                  <Text style={styles.findingPillText}>Needs attention</Text>
                </View>
                <Text style={styles.noteTitle}>{note.title}</Text>
                {note.content ? <Text style={styles.noteContent}>{note.content}</Text> : null}
                {note.photoUrls?.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
                    {note.photoUrls.map((url: string, i: number) => (
                      <Image key={i} source={{ uri: url }} style={styles.photoThumb} />
                    ))}
                  </ScrollView>
                )}
              </View>
            ))}

            {observations.length > 0 && (
              <View style={styles.goodList}>
                {observations.map((note: any, idx: number) => (
                  <View key={note.id} style={[styles.goodItem, idx > 0 && styles.goodItemBorder]}>
                    <Text style={styles.goodItemTitle} numberOfLines={2}>{note.title}</Text>
                    <View style={styles.goodPill}>
                      <Text style={styles.goodPillText}>Good</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </View>

      {/* Additional services */}
      {(pendingServices.length > 0 || approvedServices.length > 0) && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>Additional services</Text>
            <View style={styles.coralCountBadge}>
              <Text style={styles.coralCountBadgeText}>
                {pendingServices.length + approvedServices.length}
              </Text>
            </View>
          </View>

          {pendingServices.length > 0 && (
            <Text style={styles.serviceSubtext}>
              Nothing is charged until you approve. You can decline anything you don't want.
            </Text>
          )}

          {pendingServices.map((svc: any) => (
            <View key={svc.id} style={styles.svcCard}>
              <View style={styles.svcHeader}>
                <Text style={styles.svcName}>{svc.name}</Text>
                <Text style={styles.svcPrice}>{fmtUSD(svc.price)}</Text>
              </View>
              {svc.description ? <Text style={styles.svcDesc}>{svc.description}</Text> : null}
              <View style={styles.svcActions}>
                <TouchableOpacity
                  style={[styles.declineBtn, (decliningId === svc.id || approvingId === svc.id) && styles.btnDisabled]}
                  onPress={() => declineService(svc.id)}
                  disabled={decliningId === svc.id || approvingId !== null}
                >
                  {decliningId === svc.id
                    ? <ActivityIndicator color={C.coral} size="small" />
                    : <Text style={styles.declineBtnText}>Decline</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.approveBtn, (approvingId === svc.id || decliningId === svc.id) && styles.btnDisabled]}
                  onPress={() => approveService(svc.id)}
                  disabled={approvingId === svc.id || decliningId !== null}
                >
                  {approvingId === svc.id
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.approveBtnText}>Approve</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {approvedServices.map((svc: any) => (
            <View key={svc.id} style={styles.svcCardApproved}>
              <View style={styles.svcHeader}>
                <Text style={styles.svcName}>{svc.name}</Text>
                <Text style={styles.svcPrice}>{fmtUSD(svc.price)}</Text>
              </View>
              {svc.description ? <Text style={styles.svcDesc}>{svc.description}</Text> : null}
              <View style={styles.approvedBadge}>
                <Ionicons name="checkmark-circle" size={14} color={C.ok} />
                <Text style={styles.approvedText}>Approved</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Usage block */}
      {subscription && inspTotal > 0 && (
        <View style={styles.usageBlock}>
          <View style={styles.usageLabelRow}>
            <Text style={styles.usageLabel}>Inspection visits used</Text>
            <Text style={styles.usageCount}>{inspUsed} of {inspTotal} this year</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(inspPct * 100)}%` as any }]} />
          </View>
        </View>
      )}

      {/* Add-on inspection CTA */}
      <TouchableOpacity
        style={styles.addonCTA}
        onPress={() => router.push('/(customer)/request')}
        activeOpacity={0.75}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.addonCTATitle}>Request an add-on inspection</Text>
          <Text style={styles.addonCTASub}>Schedule an extra visit outside your plan</Text>
        </View>
        <Ionicons name="arrow-forward" size={18} color={C.teal} />
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 40 },

  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.ink, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34D399' },
  statusPillText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  headerDate: { fontSize: 13, color: C.inkSoft },
  addressText: { fontSize: 20, fontWeight: '700', color: C.ink, lineHeight: 27, marginBottom: 16 },
  vendorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingBottom: 20, marginBottom: 24,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  vendorAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.teal, justifyContent: 'center', alignItems: 'center',
  },
  vendorAvatarText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  vendorName: { fontSize: 14, fontWeight: '700', color: C.ink },
  vendorCompany: { fontSize: 12, color: C.inkSoft, marginTop: 2 },

  // Sections
  section: { marginBottom: 24 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: C.inkSoft,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  countBadge: {
    backgroundColor: C.sunken, borderWidth: 1, borderColor: C.border,
    borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3,
  },
  countBadgeText: { fontSize: 12, fontWeight: '700', color: C.inkSoft },
  coralCountBadge: {
    backgroundColor: '#FFE8DE', borderWidth: 1, borderColor: '#FFC4A8',
    borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3,
  },
  coralCountBadgeText: { fontSize: 12, fontWeight: '700', color: C.coral },
  emptyText: { fontSize: 14, color: colors.steel, fontStyle: 'italic' },

  // Finding cards
  findingCard: {
    backgroundColor: C.warnBg, borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: C.warnBorder,
  },
  findingCardUrgent: { backgroundColor: '#fff5f5', borderColor: '#fca5a5' },
  findingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(180, 98, 15, 0.10)', borderWidth: 1, borderColor: C.warnBorder,
    borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: 'flex-start', marginBottom: 8,
  },
  findingPillUrgent: { backgroundColor: 'rgba(220,38,38,0.08)', borderColor: '#fca5a5' },
  findingPillText: { fontSize: 11, fontWeight: '700', color: C.warn },
  linkedQuote: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, marginTop: 10,
    borderWidth: 1, borderColor: C.okBorder,
  },
  linkedQuoteTitle: { fontSize: 13, fontWeight: '700', color: C.ink },
  linkedQuotePrice: { fontSize: 12, color: C.inkSoft, marginTop: 2 },
  noteTitle: { fontSize: 14, fontWeight: '700', color: C.ink, marginBottom: 4 },
  noteContent: { fontSize: 13, color: C.inkSoft, lineHeight: 19 },
  photoRow: { marginTop: 10 },
  photoThumb: { width: 90, height: 68, borderRadius: 8, marginRight: 8 },

  // Good (observation) items
  goodList: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, overflow: 'hidden',
  },
  goodItem: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12,
  },
  goodItemBorder: { borderTopWidth: 1, borderTopColor: C.border },
  goodItemTitle: { fontSize: 14, color: C.ink, flex: 1, marginRight: 10 },
  goodPill: {
    backgroundColor: C.okBg, borderWidth: 1, borderColor: C.okBorder,
    borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3,
  },
  goodPillText: { fontSize: 11, fontWeight: '700', color: C.ok },

  // Additional service cards
  serviceSubtext: { fontSize: 13, color: C.inkSoft, lineHeight: 19, marginBottom: 12 },
  svcCard: {
    borderWidth: 1.5, borderColor: C.coral, borderRadius: 12,
    padding: 14, marginBottom: 10, backgroundColor: '#FFFAF8',
  },
  svcCardApproved: {
    borderWidth: 1, borderColor: C.okBorder, borderRadius: 12,
    padding: 14, marginBottom: 10, backgroundColor: '#F0F9F7',
  },
  svcHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  svcName: { fontSize: 14, fontWeight: '700', color: C.ink, flex: 1, marginRight: 8 },
  svcPrice: { fontSize: 14, fontWeight: '700', color: C.teal },
  svcDesc: { fontSize: 13, color: C.inkSoft, lineHeight: 18, marginBottom: 12 },
  svcActions: { flexDirection: 'row', gap: 8 },
  declineBtn: {
    flex: 1, borderWidth: 1.5, borderColor: C.coral, borderRadius: 10,
    paddingVertical: 11, alignItems: 'center',
  },
  declineBtnText: { fontSize: 13, fontWeight: '700', color: C.coral },
  approveBtn: {
    flex: 1, backgroundColor: C.teal, borderRadius: 10,
    paddingVertical: 11, alignItems: 'center',
  },
  approveBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  btnDisabled: { opacity: 0.55 },
  approvedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  approvedText: { fontSize: 13, fontWeight: '600', color: C.ok },

  // Usage
  usageBlock: {
    backgroundColor: C.surface, borderRadius: 14, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: C.border,
  },
  usageLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  usageLabel: { fontSize: 13, fontWeight: '700', color: C.ink },
  usageCount: { fontSize: 13, color: C.inkSoft },
  progressTrack: { height: 6, backgroundColor: C.sunken, borderRadius: 99, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: C.teal, borderRadius: 99 },

  // Add-on CTA
  addonCTA: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: C.teal, borderRadius: 14, padding: 16,
    marginBottom: 8,
  },
  addonCTATitle: { fontSize: 14, fontWeight: '700', color: C.teal, marginBottom: 2 },
  addonCTASub: { fontSize: 12, color: C.inkSoft },
});

const hvacRpt = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border, marginBottom: 12, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.ink, padding: 12, gap: 10 },
  badge: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.lantern, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 12, fontWeight: '800', color: colors.ink },
  title: { fontSize: 14, fontWeight: '700', color: colors.mist, flex: 1 },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: colors.slate },
  tableDataRow: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.border },
  tableFirstCol: { width: 130, padding: 8, borderRightWidth: 1, borderRightColor: colors.slateSoft, justifyContent: 'center' },
  tableCol: { width: 90, padding: 8, borderRightWidth: 1, borderRightColor: colors.border, justifyContent: 'center' },
  tableHeaderText: { fontSize: 10, fontWeight: '700', color: colors.mist },
  tableRowLabel: { fontSize: 11, fontWeight: '600', color: colors.slate },
  tableCellText: { fontSize: 12, color: colors.ink },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.border },
  infoLabel: { fontSize: 13, color: C.inkSoft, flex: 1 },
  infoValue: { fontSize: 13, fontWeight: '600', color: C.ink, flex: 1, textAlign: 'right' },
  checksWrap: { paddingHorizontal: 12, paddingBottom: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, gap: 10 },
  statusBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', minWidth: 48, alignItems: 'center' },
  statusText: { fontSize: 11, fontWeight: '700' },
  checkLabel: { fontSize: 13, color: C.ink, fontWeight: '500', lineHeight: 18 },
  checkNotes: { fontSize: 12, color: C.inkSoft, marginTop: 2, lineHeight: 17 },
});
