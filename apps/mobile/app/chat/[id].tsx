import { useEffect, useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform,
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
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
        renderItem={({ item }) => (
          <View style={[styles.bubble, isMe(item.senderId) ? styles.myBubble : styles.theirBubble]}>
            <Text style={[styles.bubbleText, isMe(item.senderId) && styles.myBubbleText]}>{item.content}</Text>
            <Text style={styles.bubbleTime}>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
        )}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
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
  bubble: {
    maxWidth: '80%', borderRadius: 16, padding: 12, marginBottom: 8,
    backgroundColor: '#fff', alignSelf: 'flex-start',
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2,
  },
  myBubble: { alignSelf: 'flex-end', backgroundColor: '#1e3a5f' },
  bubbleText: { fontSize: 15, color: '#333', lineHeight: 22 },
  myBubbleText: { color: '#fff' },
  bubbleTime: { fontSize: 11, color: '#aaa', marginTop: 4, alignSelf: 'flex-end' },
  inputRow: { flexDirection: 'row', padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', gap: 8 },
  input: {
    flex: 1, backgroundColor: '#f8f9fa', borderRadius: 20, paddingHorizontal: 16,
    paddingVertical: 10, fontSize: 15, maxHeight: 100,
  },
  sendBtn: { backgroundColor: '#1e3a5f', borderRadius: 20, paddingHorizontal: 16, justifyContent: 'center' },
  sendBtnText: { color: '#fff', fontWeight: '600' },
});
