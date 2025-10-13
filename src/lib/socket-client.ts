import { io, Socket } from 'socket.io-client';
import type { ChatSession, ChatMessage } from '../shared/types';

class SocketClient {
  private socket: Socket | null = null;
  private sessionId: string | null = null;

  connect() {
    if (this.socket?.connected) return this.socket;

    this.socket = io(process.env.NEXT_PUBLIC_DASHBOARD_SOCKET_URL || 'http://localhost:3002', {
      transports: ['polling', 'websocket'],
      timeout: 20000,
      forceNew: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      maxReconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      console.log('Connected to dashboard socket server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from dashboard socket server');
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    return this.socket;
  }

  createChatSession(sessionData: Omit<ChatSession, '_id'>) {
    if (!this.socket) {
      console.error('Socket not connected');
      return;
    }

    this.sessionId = sessionData.id;
    this.socket.emit('create-session', sessionData);
    this.socket.emit('join-session', sessionData.id);
  }

  sendMessage(messageData: Omit<ChatMessage, '_id'>) {
    if (!this.socket) {
      console.error('Socket not connected');
      return;
    }

    this.socket.emit('send-message', messageData);
  }

  onSessionCreated(callback: (session: ChatSession) => void) {
    if (!this.socket) return;
    this.socket.on('session-created', callback);
  }

  onNewMessage(callback: (message: ChatMessage) => void) {
    if (!this.socket) return;
    this.socket.on('new-message', callback);
  }

  onAgentJoined(callback: (data: { sessionId: string; agentName: string }) => void) {
    if (!this.socket) return;
    this.socket.on('agent-joined', callback);
  }

  onSessionClosed(callback: (data: { sessionId: string }) => void) {
    if (!this.socket) return;
    this.socket.on('session-closed', callback);
  }

  onSessionError(callback: (error: { error: string }) => void) {
    if (!this.socket) return;
    this.socket.on('session-error', callback);
  }

  onMessageError(callback: (error: { error: string }) => void) {
    if (!this.socket) return;
    this.socket.on('message-error', callback);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.sessionId = null;
    }
  }

  getCurrentSessionId() {
    return this.sessionId;
  }
}

export const socketClient = new SocketClient();