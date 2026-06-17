import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';

const SOCKET_URL = process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://192.168.1.100';

let socket: Socket | null = null;

export async function connectSocket(): Promise<Socket> {
  if (socket?.connected) return socket;

  const token = await SecureStore.getItemAsync('accessToken');
  socket = io(`${SOCKET_URL}/chat`, {
    auth: { token },
    transports: ['websocket'],
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}
