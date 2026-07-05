import { useEffect, useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '../../src/store/auth.store';
import { connectSocket } from '../../src/services/socket';

export default function ChatScreen() {
  const { id: roomId, recipientName } = useLocalSearchParams<{ id: string; recipientName: string }>();
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const socketRef = useRef<any>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    let isMounted = true;

    connectSocket().then((socket) => {
      if (!isMounted) return;
      socketRef.current = socket;
      socket.emit('join-room', { roomId });
      socket.emit('get-messages', { roomId }, (msgs: any[]) => {
        if (isMounted) setMessages(msgs || []);
      });
      socket.on('new-message', (msg: any) => {
        if (isMounted) setMessages((prev) => [...prev, msg]);
      });
      socket.emit('mark-read', { roomId });
    });

    return () => {
      isMounted = false;
      socketRef.current?.off('new-message');
    };
  }, [roomId]);

  const sendMessage = () => {
    if (!text.trim() || !socketRef.current) return;
    socketRef.current.emit('send-message', { roomId, content: text.trim(), recipientId: '' });
    setText('');
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

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor="#94a3b8"
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
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { backgroundColor: '#1e3a5f', padding: 16 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  messageList: { padding: 16, paddingBottom: 8 },
  bubbleWrapper: { marginBottom: 8, maxWidth: '80%' },
  wrapperLeft: { alignSelf: 'flex-start' },
  wrapperRight: { alignSelf: 'flex-end' },
  senderName: { fontSize: 11, fontWeight: '600', color: '#888', marginBottom: 3, marginLeft: 4 },
  bubble: {
    borderRadius: 16, padding: 12,
    backgroundColor: '#fff',
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2,
  },
  myBubble: { backgroundColor: '#1e3a5f' },
  theirBubble: { backgroundColor: '#fff' },
  bubbleText: { fontSize: 15, color: '#333', lineHeight: 22 },
  myBubbleText: { color: '#fff' },
  bubbleTime: { fontSize: 11, color: '#aaa', marginTop: 4, alignSelf: 'flex-end' },
  myBubbleTime: { color: 'rgba(255,255,255,0.6)' },
  inputRow: { flexDirection: 'row', padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', gap: 8 },
  input: {
    flex: 1, backgroundColor: '#f8f9fa', borderRadius: 20, paddingHorizontal: 16,
    paddingVertical: 10, fontSize: 15, maxHeight: 100, color: '#0f172a',
  },
  sendBtn: { backgroundColor: '#1e3a5f', borderRadius: 20, paddingHorizontal: 16, justifyContent: 'center' },
  sendBtnText: { color: '#fff', fontWeight: '600' },
});
