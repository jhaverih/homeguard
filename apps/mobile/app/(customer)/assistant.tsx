import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, KeyboardAvoidingView, ActivityIndicator,
  SafeAreaView, Keyboard, Modal, Alert, Pressable, ScrollView, Dimensions, AppState,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { maintenanceBotApi, pricingApi, ServiceRequestDraft, SeasonalTip } from '../../src/services/api';
import { colors } from '../../src/theme';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  recommendations?: any[];
  serviceRequestDraft?: ServiceRequestDraft;
  inspectionReportLink?: { serviceRequestId: string };
};

// Tapping any of these sends immediately — each is a single, unambiguous
// action rather than a starting point for editing.
const QUICK_PROMPTS = [
  'Set my next inspection date',
  'Explain my last inspection report',
  'Which open issues are still pending?',
];

const SEASON_META: Record<string, { label: string; emoji: string }> = {
  spring: { label: 'Spring', emoji: '🌸' },
  summer: { label: 'Summer', emoji: '☀️' },
  fall: { label: 'Fall', emoji: '🍂' },
  winter: { label: 'Winter', emoji: '❄️' },
};

// Season + annual tips together can run to 16+ rows — bound the expanded
// list to a fraction of screen height and let it scroll internally, rather
// than overflowing past the input bar off the bottom of the screen.
const SEASONAL_LIST_MAX_HEIGHT = Math.round(Dimensions.get('window').height * 0.42);

let msgId = 0;
const uid = () => String(++msgId);

const INITIAL_MESSAGE: Message = {
  id: uid(),
  role: 'assistant',
  content: "Hi! I'm eveAi, your Attenteve maintenance assistant. I can answer questions about your home maintenance, explain your inspection results, or help you plan upkeep. What can I help you with?",
};

type ActivePanel = 'seasonal' | 'prompts' | null;
type ChatHistoryEntry = { role: 'user' | 'assistant'; content: string };

export default function AssistantScreen() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [checkedTasks, setCheckedTasks] = useState<Set<number>>(new Set());

  const [seasonalData, setSeasonalData] = useState<{ season: string; tips: SeasonalTip[]; annualTips: SeasonalTip[] } | null>(null);

  // History modal
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // A message that failed with a network error while the app was
  // backgrounded (screen locked / switched apps) — confirmed live via server
  // logs that the client abruptly cancels the connection when this happens,
  // so retrying immediately can't help since networking may still be
  // suspended at that exact instant. Held here and retried once the app is
  // actually back in the foreground instead.
  const pendingRetryRef = useRef<{ userText: string; history: ChatHistoryEntry[] } | null>(null);

  useEffect(() => {
    maintenanceBotApi.getSeasonalTips().then(setSeasonalData).catch(() => setSeasonalData(null));
  }, []);

  const allTips = useMemo<SeasonalTip[]>(
    () => (seasonalData ? [...seasonalData.tips, ...seasonalData.annualTips] : []),
    [seasonalData],
  );

  const toggleTask = (i: number) => {
    setCheckedTasks((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const requestSeasonalService = async () => {
    if (checkedTasks.size === 0 || !seasonalData) return;
    const label = SEASON_META[seasonalData.season]?.label ?? seasonalData.season;
    const lines = [...checkedTasks].sort((a, b) => a - b).map((i) => `• ${allTips[i].text}`).join('\n');
    const notes = `${label} maintenance requested:\n${lines}`;
    setActivePanel(null);
    // Seasonal tasks aren't tied to a specific catalog item, so this hands
    // off to the same "Preventative Home Assessment" visit the dashboard's
    // Inspect group offers — preselecting it (rather than leaving preselect
    // empty) is what keeps this landing on the trimmed review screen instead
    // of the retired full tabbed browse UI (see request.tsx's isPreselectedFlow).
    let generalInspectionId: string | undefined;
    try {
      const catalog = await pricingApi.getAll() as any;
      generalInspectionId = catalog.find((i: any) => i.name === 'Preventative Home Assessment')?.id;
    } catch {}
    router.push({
      pathname: '/(customer)/request',
      params: generalInspectionId
        ? { preselectServicePriceIds: generalInspectionId, prefilledNotes: notes }
        : { prefilledNotes: notes },
    });
  };

  const startNewChat = () => {
    pendingRetryRef.current = null;
    setMessages([INITIAL_MESSAGE]);
    setSessionId(null);
    setCheckedTasks(new Set());
    setActivePanel(null);
  };

  const openHistory = async () => {
    setShowHistory(true);
    setHistoryLoading(true);
    try {
      const data = await maintenanceBotApi.getSessions();
      setSessions(data);
    } catch {
      setSessions([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadSession = async (id: string) => {
    pendingRetryRef.current = null;
    setShowHistory(false);
    setLoading(true);
    try {
      const data: any = await maintenanceBotApi.getSession(id);
      const recsByMessage = new Map<string, any[]>();
      for (const r of data.recommendations || []) {
        const list = recsByMessage.get(r.messageId) || [];
        list.push(r);
        recsByMessage.set(r.messageId, list);
      }
      const restored: Message[] = data.messages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        recommendations: recsByMessage.get(m.id),
      }));
      setMessages(restored.length > 0 ? restored : [INITIAL_MESSAGE]);
      setSessionId(id);
    } catch {
      Alert.alert('Error', 'Could not load that conversation.');
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = (id: string, title: string) => {
    Alert.alert(
      'Delete Conversation',
      `Delete "${title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await maintenanceBotApi.deleteSession(id);
              setSessions((prev) => prev.filter((s) => s.id !== id));
              if (sessionId === id) startNewChat();
            } catch {
              Alert.alert('Error', 'Could not delete that conversation.');
            }
          },
        },
      ],
    );
  };

  const finishTurn = () => {
    setLoading(false);
    Keyboard.dismiss();
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // A reply can take anywhere from a few seconds to over a minute. Confirmed
  // live via server logs: if the phone locks or the app gets backgrounded
  // during that wait, the OS can abruptly kill the connection before eveAi
  // replies (nginx logs a 499, cloudflared logs "context canceled" — the
  // request reached the server, the client gave up on it). Retrying
  // immediately in that situation doesn't reliably help, since networking
  // may still be suspended at that exact instant — so:
  //   - if the app is still in the foreground when a network error happens,
  //     it's a genuine blip; retry once immediately.
  //   - if the app was backgrounded, hold the message and retry once we're
  //     actually back in the foreground (the AppState listener below).
  // Either way the customer just keeps seeing "eveAi is thinking…" — no
  // error shown unless a foreground attempt genuinely fails.
  const attemptChat = useCallback(async (userText: string, history: ChatHistoryEntry[], isRetry = false) => {
    try {
      const res = await maintenanceBotApi.chat(userText, history, sessionId);
      const botMsg: Message = {
        id: uid(),
        role: 'assistant',
        content: res.reply,
        recommendations: res.recommendations,
        serviceRequestDraft: res.serviceRequestDraft,
        inspectionReportLink: res.inspectionReportLink,
      };
      setMessages((prev) => [...prev, botMsg]);
      if (res.sessionId && !sessionId) setSessionId(res.sessionId);
      finishTurn();
    } catch (e: any) {
      if (e.message === 'NETWORK_ERROR') {
        if (AppState.currentState !== 'active') {
          pendingRetryRef.current = { userText, history };
          return; // stay in "thinking" state; the AppState listener resumes this
        }
        if (!isRetry) {
          attemptChat(userText, history, true);
          return;
        }
      }
      const errMsg: Message = {
        id: uid(),
        role: 'assistant',
        content: e.message === 'NETWORK_ERROR'
          ? "I couldn't reach the server — please check your connection and try again. (If your phone locked or you switched apps while I was replying, that can interrupt the connection — try again and keep the app open until I respond.)"
          : "I'm having trouble responding right now. Please try again in a moment.",
      };
      setMessages((prev) => [...prev, errMsg]);
      finishTurn();
    }
  }, [sessionId]);

  // Resumes a message that failed while backgrounded, once the app is
  // actually visible again — see attemptChat's comment for why this can't
  // just retry immediately at the moment of failure.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && pendingRetryRef.current) {
        const pending = pendingRetryRef.current;
        pendingRetryRef.current = null;
        attemptChat(pending.userText, pending.history, true);
      }
    });
    return () => sub.remove();
  }, [attemptChat]);

  const sendMessage = useCallback(async (text: string) => {
    const userText = text.trim();
    if (!userText || loading) return;
    setInput('');
    setActivePanel(null);
    // Dismiss immediately on send, not just once the reply arrives — the
    // keyboard was still open and covering the "eveAi is thinking…"
    // indicator for the entire wait (which can run to several minutes),
    // not just a brief flash.
    Keyboard.dismiss();

    const userMsg: Message = { id: uid(), role: 'user', content: userText };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    const history = messages
      .filter((m) => m.role !== 'assistant' || m.id !== INITIAL_MESSAGE.id)
      .map((m) => ({ role: m.role, content: m.content }));

    await attemptChat(userText, history);
  }, [messages, loading, attemptChat]);

  const respondToRecommendation = async (rec: any, status: 'ACCEPTED' | 'DECLINED') => {
    setMessages((prev) => prev.map((m) => (
      m.recommendations
        ? { ...m, recommendations: m.recommendations.map((r: any) => (r.id === rec.id ? { ...r, status } : r)) }
        : m
    )));
    try {
      await maintenanceBotApi.respondToRecommendation(rec.id, status);
      if (status === 'ACCEPTED') {
        router.push({ pathname: '/(customer)/request', params: { preselectServicePriceId: rec.servicePriceId } });
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    const pendingRecs = (item.recommendations || []).filter((r: any) => r.status === 'SUGGESTED');
    return (
      <View>
        <View style={[styles.bubbleRow, isUser ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
          {!isUser && (
            <View style={styles.botAvatar}>
              <Ionicons name="home" size={14} color={colors.mist} />
            </View>
          )}
          <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}>
            <Text style={[styles.bubbleText, isUser ? styles.userBubbleText : styles.botBubbleText]}>
              {item.content}
            </Text>
          </View>
        </View>
        {pendingRecs.map((rec: any) => (
          <View key={rec.id} style={styles.recCard}>
            <Text style={styles.recCardTitle}>💡 {rec.name}</Text>
            {rec.customerPriceDisplay && <Text style={styles.recCardPrice}>{rec.customerPriceDisplay}</Text>}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity style={styles.recDeclineBtn} onPress={() => respondToRecommendation(rec, 'DECLINED')}>
                <Text style={styles.recDeclineText}>Not now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.recAcceptBtn} onPress={() => respondToRecommendation(rec, 'ACCEPTED')}>
                <Text style={styles.recAcceptText}>Book Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        {item.serviceRequestDraft && (
          <TouchableOpacity
            style={styles.draftCta}
            onPress={() => router.push({ pathname: '/(customer)/request', params: item.serviceRequestDraft as any })}
          >
            <Ionicons name="calendar-outline" size={15} color={colors.ink} />
            <Text style={styles.draftCtaText}>Request This Service</Text>
          </TouchableOpacity>
        )}
        {item.inspectionReportLink && (
          <TouchableOpacity
            style={styles.reportLinkBtn}
            onPress={() => router.push(`/(customer)/inspection-report?id=${item.inspectionReportLink!.serviceRequestId}`)}
          >
            <Ionicons name="document-text-outline" size={15} color={colors.lanternDeep} />
            <Text style={styles.reportLinkText}>View Full Report</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  const seasonMeta = seasonalData ? SEASON_META[seasonalData.season] : null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header action row */}
      <View style={styles.headerRow}>
        {sessionId && (
          <TouchableOpacity style={styles.newChatBtn} onPress={startNewChat}>
            <Ionicons name="add-circle-outline" size={18} color={colors.lanternDeep} />
            <Text style={styles.newChatText}>New Chat</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.historyBtn, !sessionId && { marginLeft: 'auto' }]} onPress={openHistory}>
          <Ionicons name="time-outline" size={18} color={colors.steel} />
          <Text style={styles.historyBtnText}>History</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={90}
      >
        <FlatList
          style={{ flex: 1 }}
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListFooterComponent={
            loading ? (
              <View style={styles.typingIndicator}>
                <View style={styles.botAvatar}>
                  <Ionicons name="home" size={14} color={colors.mist} />
                </View>
                <View style={styles.typingBubble}>
                  <ActivityIndicator size="small" color={colors.steel} />
                  <Text style={styles.typingText}>eveAi is thinking… (takes a few mins)</Text>
                </View>
              </View>
            ) : null
          }
        />

        {/* Backdrop — only present while a panel is open, so it never
            interferes with normal chat scrolling. Sits on top of the chat
            area (dismissing on tap) but under the panel/input bar below,
            which render after it and stay fully interactive. */}
        {activePanel !== null && (
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setActivePanel(null)} />
        )}

        {/* Seasonal Tips — collapsed by default, opened via the header tap */}
        {!loading && seasonMeta && (
          <View style={styles.seasonCard}>
            <TouchableOpacity
              style={styles.seasonHeader}
              onPress={() => setActivePanel((p) => (p === 'seasonal' ? null : 'seasonal'))}
              activeOpacity={0.7}
            >
              <Text style={styles.seasonTitle}>{seasonMeta.emoji} Seasonal Tips</Text>
              <Ionicons name={activePanel === 'seasonal' ? 'chevron-up' : 'chevron-down'} size={16} color={colors.lanternDeep} />
            </TouchableOpacity>

            {activePanel === 'seasonal' && (
              <>
                <ScrollView
                  style={{ maxHeight: SEASONAL_LIST_MAX_HEIGHT }}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                >
                  {seasonalData!.tips.map((tip, i) => (
                    <SeasonalTipRow key={i} tip={tip} checked={checkedTasks.has(i)} onToggle={() => toggleTask(i)} />
                  ))}
                  <View style={styles.annualDivider}>
                    <Text style={styles.annualDividerText}>Annual — Tennessee-Specific Priorities</Text>
                  </View>
                  {seasonalData!.annualTips.map((tip, i) => {
                    const idx = seasonalData!.tips.length + i;
                    return <SeasonalTipRow key={idx} tip={tip} checked={checkedTasks.has(idx)} onToggle={() => toggleTask(idx)} />;
                  })}
                </ScrollView>
                {checkedTasks.size > 0 && (
                  <TouchableOpacity style={styles.requestBtn} onPress={requestSeasonalService}>
                    <Ionicons name="calendar-outline" size={15} color={colors.ink} />
                    <Text style={styles.requestBtnText}>
                      Request {checkedTasks.size} Service{checkedTasks.size > 1 ? 's' : ''}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        )}

        {/* Quick prompts — hidden until the toggle button is tapped */}
        {!loading && activePanel === 'prompts' && (
          <View style={styles.quickPrompts}>
            {QUICK_PROMPTS.map((q) => (
              <TouchableOpacity key={q} style={styles.chip} onPress={() => sendMessage(q)}>
                <Text style={styles.chipText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.inputBar}>
          <TouchableOpacity
            style={styles.promptsToggleBtn}
            onPress={() => setActivePanel((p) => (p === 'prompts' ? null : 'prompts'))}
          >
            <Ionicons name="bulb-outline" size={22} color={colors.lanternDeep} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Ask about your home…"
            placeholderTextColor={colors.steel}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={() => sendMessage(input)}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || loading}
          >
            <Ionicons name="send" size={20} color={colors.ink} />
          </TouchableOpacity>
        </View>
        <Text style={styles.disclaimer}>eveAi can make mistakes. Consider checking important information.</Text>
      </KeyboardAvoidingView>

      {/* Chat history modal */}
      <Modal visible={showHistory} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>Conversation History</Text>
            <TouchableOpacity onPress={() => setShowHistory(false)}>
              <Ionicons name="close" size={24} color={colors.steel} />
            </TouchableOpacity>
          </View>

          {historyLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.lanternDeep} />
          ) : sessions.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Ionicons name="chatbubble-outline" size={48} color={colors.border} />
              <Text style={{ marginTop: 16, color: colors.steel, fontSize: 16, textAlign: 'center' }}>
                No conversations yet.{'\n'}Start chatting to save your first conversation.
              </Text>
            </View>
          ) : (
            <FlatList
              data={sessions}
              keyExtractor={(s) => s.id}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.sessionRow} onPress={() => loadSession(item.id)}>
                  <View style={styles.sessionIcon}>
                    <Ionicons name="chatbubbles-outline" size={20} color={colors.lanternDeep} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sessionTitle} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.sessionMeta}>
                      {formatDate(item.createdAt)} · {item.messageCount} message{item.messageCount !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.sessionDeleteBtn}
                    onPress={() => deleteSession(item.id, item.title)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#e53e3e" />
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function SeasonalTipRow({ tip, checked, onToggle }: { tip: SeasonalTip; checked: boolean; onToggle: () => void }) {
  if (!tip.orderable) {
    return (
      <View style={styles.tipRowInfo}>
        <View style={styles.tipDot} />
        <Text style={styles.tipTextInfo}>{tip.text}</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity style={styles.taskRow} onPress={onToggle} activeOpacity={0.7}>
      <Ionicons
        name={checked ? 'checkbox' : 'square-outline'}
        size={20}
        color={checked ? colors.lanternDeep : colors.steel}
      />
      <Text style={[styles.taskText, checked && styles.taskTextChecked]}>
        {tip.text}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#fff', gap: 8 },
  newChatBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.mist, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  newChatText: { fontSize: 13, color: colors.lanternDeep, fontWeight: '600' },
  historyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6 },
  historyBtnText: { fontSize: 13, color: colors.steel },
  messageList: { padding: 16, paddingBottom: 8 },
  bubbleRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  bubbleRowLeft: { justifyContent: 'flex-start' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  botAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', marginRight: 8, flexShrink: 0 },
  bubble: { maxWidth: '78%', borderRadius: 18, padding: 12 },
  userBubble: { backgroundColor: colors.ink, borderBottomRightRadius: 4 },
  botBubble: { backgroundColor: '#fff', borderBottomLeftRadius: 4, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  userBubbleText: { color: colors.mist },
  botBubbleText: { color: colors.ink },
  typingIndicator: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 16 },
  typingBubble: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, borderBottomLeftRadius: 4, padding: 12, gap: 8, elevation: 1 },
  typingText: { fontSize: 13, color: colors.steel },
  disclaimer: { fontSize: 11, color: colors.steel, textAlign: 'center', paddingVertical: 6, paddingHorizontal: 16, backgroundColor: colors.canvas },
  // AI recommendation card
  recCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, marginLeft: 36, marginRight: 40, marginBottom: 12, marginTop: -4 },
  recCardTitle: { fontSize: 13, fontWeight: '700', color: colors.lanternDeep },
  recCardPrice: { fontSize: 12, color: colors.steel, marginTop: 2 },
  recDeclineBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, backgroundColor: colors.border },
  recDeclineText: { fontSize: 13, fontWeight: '600', color: colors.steel },
  recAcceptBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, backgroundColor: colors.lantern },
  recAcceptText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  // Service-request draft / report-link CTAs
  draftCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.lantern, borderRadius: 10, paddingVertical: 10, marginLeft: 36, marginRight: 40, marginBottom: 12, marginTop: -4 },
  draftCtaText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  reportLinkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 10, marginLeft: 36, marginRight: 40, marginBottom: 12, marginTop: -4 },
  reportLinkText: { fontSize: 13, fontWeight: '700', color: colors.lanternDeep },
  // Seasonal card
  seasonCard: { backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  seasonHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  seasonTitle: { fontSize: 13, fontWeight: '700', color: colors.lanternDeep },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  taskText: { flex: 1, fontSize: 13, color: colors.steel },
  taskTextChecked: { color: colors.lanternDeep, fontWeight: '600' },
  tipRowInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  tipDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.border, marginTop: 7 },
  tipTextInfo: { flex: 1, fontSize: 13, color: colors.steel, opacity: 0.75 },
  annualDivider: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, borderTopWidth: 1, borderTopColor: colors.border },
  annualDividerText: { fontSize: 11, fontWeight: '700', color: colors.steel, textTransform: 'uppercase', letterSpacing: 0.4 },
  requestBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.lantern, margin: 10, borderRadius: 10, paddingVertical: 10 },
  requestBtnText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  // Quick prompts
  quickPrompts: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  chip: { backgroundColor: colors.mist, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: colors.border },
  chipText: { fontSize: 13, color: colors.lanternDeep, fontWeight: '500' },
  // Input bar
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.border, gap: 10 },
  promptsToggleBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mist },
  input: { flex: 1, backgroundColor: colors.border, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: colors.ink, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.lantern, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: colors.steel },
  // History modal
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  historyTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  sessionIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.mist, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sessionTitle: { fontSize: 14, fontWeight: '600', color: colors.ink, marginBottom: 4 },
  sessionMeta: { fontSize: 12, color: colors.steel },
  sessionDeleteBtn: { padding: 6 },
});
