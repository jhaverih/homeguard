import { useEffect, useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '../../src/store/auth.store';
import { connectSocket } from '../../src/services/socket';
import { colors } from '../../src/theme';

export default function ChatScreen() {
  const { id: roomId, recipientName } = useLocalSearchParams<{ id: string; recipientName: string }>();
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const socketRef = useRef<any>(null);
  const flatListRef = useRef<FlatList>(null);

  // Shown above the input when the chat can't connect or a send fails,
  // instead of messages silently going nowhere.
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let socket: any = null;

    // Join (and reload the history) on every connect, so a dropped
    // connection that comes back picks the conversation up again.
    const onConnect = () => {
      socket.emit('join-room', { roomId }, (res: any) => {
        if (!isMounted) return;
        if (res && res.ok === false) { setProblem(res.error || "You can't open this chat."); return; }
        setProblem(null);
        socket.emit('get-messages', { roomId }, (msgs: any[]) => {
          if (isMounted) setMessages(msgs || []);
        });
        socket.emit('mark-read', { roomId });
      });
    };
    const onMessage = (msg: any) => {
      if (!isMounted || msg?.roomId !== roomId) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (msg.senderId !== user?.id) socket.emit('mark-read', { roomId });
    };
    const onConnectError = () => { if (isMounted) setProblem('Can’t reach the chat right now. Retrying…'); };
    const onChatError = (e: any) => { if (isMounted) setProblem(e?.message || 'Chat is unavailable.'); };

    connectSocket().then((s) => {
      if (!isMounted) return;
      socket = s;
      socketRef.current = s;
      s.on('connect', onConnect);
      s.on('new-message', onMessage);
      s.on('connect_error', onConnectError);
      s.on('chat-error', onChatError);
      if (s.connected) onConnect();
    });

    return () => {
      isMounted = false;
      if (socket) {
        socket.emit('leave-room', { roomId });
        socket.off('connect', onConnect);
        socket.off('new-message', onMessage);
        socket.off('connect_error', onConnectError);
        socket.off('chat-error', onChatError);
      }
    };
  }, [roomId, user?.id]);

  const sendMessage = () => {
    const content = text.trim();
    if (!content || !socketRef.current) return;
    if (!socketRef.current.connected) { setProblem('Not connected yet. Please try again in a moment.'); return; }
    setText('');
    socketRef.current.timeout(10000).emit('send-message', { roomId, content }, (err: any, res: any) => {
      if (err || !res?.ok) {
        setText(content);
        setProblem(res?.error || 'Your message wasn’t sent. Please try again.');
      } else {
        setProblem(null);
      }
    });
  };

  const isMe = (senderId: string) => senderId === user?.id;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={90}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chat with {recipientName || 'User'}</Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id || item.createdAt}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        renderItem={({ item }) => {
          const mine = isMe(item.senderId);
          return (
            <View style={[styles.bubbleWrapper, mine ? styles.wrapperRight : styles.wrapperLeft]}>
              {!mine && item.senderName && (
                <Text style={styles.senderName}>{item.senderName}</Text>
              )}
              <View style={[styles.bubble, mine ? styles.myBubble : styles.theirBubble]}>
                <Text style={[styles.bubbleText, mine && styles.myBubbleText]}>{item.content}</Text>
                <Text style={[styles.bubbleTime, mine && styles.myBubbleTime]}>
                  {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>
          );
        }}
      />

      {problem && <Text style={styles.problem}>{problem}</Text>}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor={colors.steel}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
          <Text style={styles.sendBtnText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  header: { backgroundColor: colors.ink, padding: 16 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.mist },
  messageList: { padding: 16, paddingBottom: 8 },
  bubbleWrapper: { marginBottom: 8, maxWidth: '80%' },
  wrapperLeft: { alignSelf: 'flex-start' },
  wrapperRight: { alignSelf: 'flex-end' },
  senderName: { fontSize: 11, fontWeight: '600', color: colors.steel, marginBottom: 3, marginLeft: 4 },
  bubble: {
    borderRadius: 16, padding: 12,
    backgroundColor: colors.surface,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2,
  },
  myBubble: { backgroundColor: colors.ink },
  theirBubble: { backgroundColor: colors.surface },
  bubbleText: { fontSize: 15, color: colors.ink, lineHeight: 22 },
  myBubbleText: { color: colors.mist },
  bubbleTime: { fontSize: 11, color: colors.steel, marginTop: 4, alignSelf: 'flex-end' },
  myBubbleTime: { color: colors.mistDim },
  inputRow: { flexDirection: 'row', padding: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 },
  input: {
    flex: 1, backgroundColor: colors.canvas, borderRadius: 20, paddingHorizontal: 16,
    paddingVertical: 10, fontSize: 15, maxHeight: 100, color: colors.ink,
  },
  sendBtn: { backgroundColor: colors.lantern, borderRadius: 20, paddingHorizontal: 16, justifyContent: 'center' },
  sendBtnText: { color: colors.ink, fontWeight: '600' },
  problem: { backgroundColor: '#fffbeb', color: '#92400e', fontSize: 13, paddingHorizontal: 16, paddingVertical: 8 },
});
