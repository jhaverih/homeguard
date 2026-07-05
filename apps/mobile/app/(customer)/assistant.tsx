import { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, KeyboardAvoidingView, ActivityIndicator,
  SafeAreaView, Keyboard, Modal, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { maintenanceBotApi } from '../../src/services/api';

type Message = { id: string; role: 'user' | 'assistant'; content: string };

const QUICK_PROMPTS = [
  'What needs attention in my home?',
  'When should I schedule my next inspection?',
  'What maintenance should I do this season?',
  'Explain my last inspection results',
];

function getCurrentSeason(): 'spring' | 'summer' | 'fall' | 'winter' {
  const m = new Date().getMonth();
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'fall';
  return 'winter';
}

const SEASON_META = {
  spring: { label: 'Spring', emoji: '🌸' },
  summer: { label: 'Summer', emoji: '☀️' },
  fall:   { label: 'Fall',   emoji: '🍂' },
  winter: { label: 'Winter', emoji: '❄️' },
};

const SEASONAL_TASKS: Record<string, string[]> = {
  spring: [
    'AC filter replacement & system inspection',
    'Gutter cleaning & downspout check',
    'Exterior siding & paint inspection',
    'Window & door weatherseal check',
    'Pest prevention inspection',
  ],
  summer: [
    'AC performance & efficiency check',
    'Ceiling fan inspection & cleaning',
    'Refrigerator coil & drain cleaning',
    'Deck, patio & outdoor structure inspection',
    'Irrigation & sprinkler system check',
  ],
  fall: [
    'Heating system tune-up & filter replacement',
    'Chimney & fireplace inspection',
    'Roof, gutters & shingle inspection',
    'Weatherstripping & door seal check',
    'Smoke & CO detector battery replacement',
  ],
  winter: [
    'Pipe insulation & freeze prevention check',
    'Water heater inspection & flush',
    'Heating efficiency & thermostat check',
    'Indoor air quality & humidity check',
    'Electrical panel & safety inspection',
  ],
};

let msgId = 0;
const uid = () => String(++msgId);

const INITIAL_MESSAGE: Message = {
  id: uid(),
  role: 'assistant',
  content: "Hi! I'm your Houmi AI assistant. I can answer questions about your home maintenance, explain your inspection results, or help you plan upkeep. What can I help you with?",
};

export default function AssistantScreen() {
  const season = getCurrentSeason();
  const tasks = SEASONAL_TASKS[season];
  const { emoji, label } = SEASON_META[season];

  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [seasonExpanded, setSeasonExpanded] = useState(true);
  const [checkedTasks, setCheckedTasks] = useState<Set<number>>(new Set());

  // History modal
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const toggleTask = (i: number) => {
    setCheckedTasks((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const requestSeasonalService = () => {
    if (checkedTasks.size === 0) return;
    const lines = [...checkedTasks].sort().map((i) => `• ${tasks[i]}`).join('\n');
    const notes = `${label} maintenance requested:\n${lines}`;
    router.push({ pathname: '/(customer)/request', params: { prefilledNotes: notes } });
  };

  const startNewChat = () => {
    setMessages([INITIAL_MESSAGE]);
    setSessionId(null);
    setCheckedTasks(new Set());
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
    setShowHistory(false);
    setLoading(true);
    try {
      const data: any = await maintenanceBotApi.getSession(id);
      const restored: Message[] = data.messages.map((m: any) => ({
        id: uid(),
        role: m.role,
        content: m.content,
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

  const sendMessage = useCallback(async (text: string) => {
    const userText = text.trim();
    if (!userText || loading) return;
    setInput('');

    const userMsg: Message = { id: uid(), role: 'user', content: userText };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    const history = messages
      .filter((m) => m.role !== 'assistant' || m.id !== INITIAL_MESSAGE.id)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res: any = await maintenanceBotApi.chat(userText, history, sessionId);
      const botMsg: Message = { id: uid(), role: 'assistant', content: res.reply };
      setMessages((prev) => [...prev, botMsg]);
      if (res.sessionId && !sessionId) setSessionId(res.sessionId);
    } catch (e: any) {
      const errMsg: Message = {
        id: uid(),
        role: 'assistant',
        content: e.message === 'NETWORK_ERROR'
          ? "I can't connect to the server right now. Make sure you're on your home WiFi."
          : "I'm having trouble responding right now. Please try again in a moment.",
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
      Keyboard.dismiss();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, loading, sessionId]);

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.bubbleRow, isUser ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
        {!isUser && (
          <View style={styles.botAvatar}>
            <Ionicons name="home" size={14} color="#fff" />
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}>
          <Text style={[styles.bubbleText, isUser ? styles.userBubbleText : styles.botBubbleText]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <SafeAreaView style={styles.container}>
      {/* Header action row */}
      <View style={styles.headerRow}>
        {sessionId && (
          <TouchableOpacity style={styles.newChatBtn} onPress={startNewChat}>
            <Ionicons name="add-circle-outline" size={18} color="#0B4A45" />
            <Text style={styles.newChatText}>New Chat</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.historyBtn, !sessionId && { marginLeft: 'auto' }]} onPress={openHistory}>
          <Ionicons name="time-outline" size={18} color="#64748b" />
          <Text style={styles.historyBtnText}>History</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={90}
      >
        <FlatList
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
                  <Ionicons name="home" size={14} color="#fff" />
                </View>
                <View style={styles.typingBubble}>
                  <ActivityIndicator size="small" color="#64748b" />
                  <Text style={styles.typingText}>AI thinking… (takes a few mins)</Text>
                </View>
              </View>
            ) : null
          }
        />

        {/* Seasonal maintenance checklist */}
        {!loading && (
          <View style={styles.seasonCard}>
            <TouchableOpacity
              style={styles.seasonHeader}
              onPress={() => setSeasonExpanded((e) => !e)}
              activeOpacity={0.7}
            >
              <Text style={styles.seasonTitle}>{emoji} {label} Maintenance</Text>
              <Ionicons name={seasonExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#0B4A45" />
            </TouchableOpacity>

            {seasonExpanded && (
              <>
                {tasks.map((task, i) => (
                  <TouchableOpacity key={i} style={styles.taskRow} onPress={() => toggleTask(i)} activeOpacity={0.7}>
                    <Ionicons
                      name={checkedTasks.has(i) ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={checkedTasks.has(i) ? '#0B4A45' : '#94a3b8'}
                    />
                    <Text style={[styles.taskText, checkedTasks.has(i) && styles.taskTextChecked]}>
                      {task}
                    </Text>
                  </TouchableOpacity>
                ))}
                {checkedTasks.size > 0 && (
                  <TouchableOpacity style={styles.requestBtn} onPress={requestSeasonalService}>
                    <Ionicons name="calendar-outline" size={15} color="#fff" />
                    <Text style={styles.requestBtnText}>
                      Request {checkedTasks.size} Service{checkedTasks.size > 1 ? 's' : ''}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        )}

        {/* Quick prompts */}
        {!loading && (
          <View style={styles.quickPrompts}>
            {QUICK_PROMPTS.map((q) => (
              <TouchableOpacity key={q} style={styles.chip} onPress={() => sendMessage(q)}>
                <Text style={styles.chipText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Ask about your home…"
            placeholderTextColor="#94a3b8"
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
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Chat history modal */}
      <Modal visible={showHistory} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>Conversation History</Text>
            <TouchableOpacity onPress={() => setShowHistory(false)}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          {historyLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color="#0B4A45" />
          ) : sessions.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Ionicons name="chatbubble-outline" size={48} color="#cbd5e1" />
              <Text style={{ marginTop: 16, color: '#94a3b8', fontSize: 16, textAlign: 'center' }}>
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
                    <Ionicons name="chatbubbles-outline" size={20} color="#0B4A45" />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', backgroundColor: '#fff', gap: 8 },
  newChatBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EBF1EF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  newChatText: { fontSize: 13, color: '#0B4A45', fontWeight: '600' },
  historyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6 },
  historyBtnText: { fontSize: 13, color: '#64748b' },
  messageList: { padding: 16, paddingBottom: 8 },
  bubbleRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  bubbleRowLeft: { justifyContent: 'flex-start' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  botAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#0B4A45', alignItems: 'center', justifyContent: 'center', marginRight: 8, flexShrink: 0 },
  bubble: { maxWidth: '78%', borderRadius: 18, padding: 12 },
  userBubble: { backgroundColor: '#0B4A45', borderBottomRightRadius: 4 },
  botBubble: { backgroundColor: '#fff', borderBottomLeftRadius: 4, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  userBubbleText: { color: '#fff' },
  botBubbleText: { color: '#1e293b' },
  typingIndicator: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 16 },
  typingBubble: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, borderBottomLeftRadius: 4, padding: 12, gap: 8, elevation: 1 },
  typingText: { fontSize: 13, color: '#64748b' },
  // Seasonal card
  seasonCard: { backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  seasonHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  seasonTitle: { fontSize: 13, fontWeight: '700', color: '#0B4A45' },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  taskText: { flex: 1, fontSize: 13, color: '#64748b' },
  taskTextChecked: { color: '#0B4A45', fontWeight: '600' },
  requestBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#0B4A45', margin: 10, borderRadius: 10, paddingVertical: 10 },
  requestBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  // Quick prompts
  quickPrompts: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  chip: { backgroundColor: '#EBF1EF', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: '#B8DAD6' },
  chipText: { fontSize: 13, color: '#0B4A45', fontWeight: '500' },
  // Input bar
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0', gap: 10 },
  input: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#0f172a', maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#0B4A45', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: '#94a3b8' },
  // History modal
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  historyTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  sessionIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EBF1EF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sessionTitle: { fontSize: 14, fontWeight: '600', color: '#1e293b', marginBottom: 4 },
  sessionMeta: { fontSize: 12, color: '#94a3b8' },
  sessionDeleteBtn: { padding: 6 },
});
