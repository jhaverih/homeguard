import { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { maintenanceBotApi } from '../../src/services/api';

type Message = { id: string; role: 'user' | 'assistant'; content: string };

const QUICK_PROMPTS = [
  'What needs attention in my home?',
  'When should I schedule my next inspection?',
  'What maintenance should I do this season?',
  'Explain my last inspection results',
];

let msgId = 0;
const uid = () => String(++msgId);

export default function AssistantScreen() {
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

  const sendMessage = useCallback(async (text: string) => {
    const userText = text.trim();
    if (!userText || loading) return;
    setInput('');

    const userMsg: Message = { id: uid(), role: 'user', content: userText };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    // Build history from current messages (exclude the welcome message for brevity)
    const history = messages
      .slice(1) // skip welcome
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
                  <Text style={styles.typingText}>Thinking…</Text>
                </View>
              </View>
            ) : null
          }
        />

        {/* Quick prompts — only show when conversation is fresh */}
        {messages.length === 1 && !loading && (
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
  typingIndicator: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  typingBubble: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, borderBottomLeftRadius: 4, padding: 12, gap: 8, elevation: 1 },
  typingText: { fontSize: 13, color: '#64748b' },
  quickPrompts: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  chip: { backgroundColor: '#e8f0fe', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: '#c7d7f8' },
  chipText: { fontSize: 13, color: '#1e3a5f', fontWeight: '500' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0', gap: 10 },
  input: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#0f172a', maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1e3a5f', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: '#94a3b8' },
});
