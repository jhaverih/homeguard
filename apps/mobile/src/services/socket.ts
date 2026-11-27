import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';

// The API URL ends in /api (https://api.attenteve.com/api); socket.io lives
// at the host root. Strip only that trailing /api: a plain replace('/api')
// hit the "//api." in the host name and produced a broken URL.
export const SOCKET_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://192.168.86.29/api').replace(/\/api\/?$/, '');

let socket: Socket | null = null;

export async function connectSocket(): Promise<Socket> {
  if (socket) {
    if (!socket.connected) socket.connect();
    return socket;
  }

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
