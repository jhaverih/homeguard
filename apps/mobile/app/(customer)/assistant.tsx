import { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, KeyboardAvoidingView, ActivityIndicator,
  SafeAreaView, Keyboard,
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

export default function AssistantScreen() {
  const season = getCurrentSeason();
  const tasks = SEASONAL_TASKS[season];
  const { emoji, label } = SEASON_META[season];

  const [messages, setMessages] = useState<Message[]>([
    {
      id: uid(),
      role: 'assistant',
      content: "Hi! I'm your HomeGuard AI assistant. I can answer questions about your home maintenance, explain your inspection results, or help you plan upkeep. What can I help you with?",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList>(null);
  const [seasonExpanded, setSeasonExpanded] = useState(true);
  const [checkedTasks, setCheckedTasks] = useState<Set<number>>(new Set());

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

  const sendMessage = useCallback(async (text: string) => {
    const userText = text.trim();
    if (!userText || loading) return;
    setInput('');

    const userMsg: Message = { id: uid(), role: 'user', content: userText };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    const history = messages
      .slice(1)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res: any = await maintenanceBotApi.chat(userText, history);
      const botMsg: Message = { id: uid(), role: 'assistant', content: res.reply };
      setMessages((prev) => [...prev, botMsg]);
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
  }, [messages, loading]);

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

  return (
    <SafeAreaView style={styles.container}>
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
              <Ionicons
                name={seasonExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#1e3a5f"
              />
            </TouchableOpacity>

            {seasonExpanded && (
              <>
                {tasks.map((task, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.taskRow}
                    onPress={() => toggleTask(i)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={checkedTasks.has(i) ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={checkedTasks.has(i) ? '#1e3a5f' : '#94a3b8'}
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

        {/* Quick prompts — always visible as shortcuts */}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  messageList: { padding: 16, paddingBottom: 8 },
  bubbleRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  bubbleRowLeft: { justifyContent: 'flex-start' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  botAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1e3a5f', alignItems: 'center', justifyContent: 'center', marginRight: 8, flexShrink: 0 },
  bubble: { maxWidth: '78%', borderRadius: 18, padding: 12 },
  userBubble: { backgroundColor: '#1e3a5f', borderBottomRightRadius: 4 },
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
  seasonTitle: { fontSize: 13, fontWeight: '700', color: '#1e3a5f' },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  taskText: { flex: 1, fontSize: 13, color: '#64748b' },
  taskTextChecked: { color: '#1e3a5f', fontWeight: '600' },
  requestBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1e3a5f', margin: 10, borderRadius: 10, paddingVertical: 10 },
  requestBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  // Quick prompts
  quickPrompts: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  chip: { backgroundColor: '#e8f0fe', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: '#c7d7f8' },
  chipText: { fontSize: 13, color: '#1e3a5f', fontWeight: '500' },
  // Input bar
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0', gap: 10 },
  input: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#0f172a', maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1e3a5f', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: '#94a3b8' },
});
