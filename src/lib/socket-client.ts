import { io, Socket } from 'socket.io-client';
import type { ChatSession, ChatMessage } from '../shared/types';

interface SocketError {
  message: string;
  code?: string;
  timestamp: string;
}

interface ConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  lastError: SocketError | null;
  reconnectAttempts: number;
}

class SocketClient {
  private socket: Socket | null = null;
  private sessionId: string | null = null;
  private messageQueue: Array<{ messageData: Omit<ChatMessage, '_id'>; resolve: Function; reject: Function }> = [];
  private isProcessingQueue = false;
  private connectionState: ConnectionState = {
    isConnected: false,
    isConnecting: false,
    lastError: null,
    reconnectAttempts: 0
  };
  private connectionListeners: Array<(state: ConnectionState) => void> = [];
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  connect() {
    if (this.socket?.connected) return this.socket;

    this.updateConnectionState({ isConnecting: true, lastError: null });

    const socketUrl = process.env.NEXT_PUBLIC_DASHBOARD_SOCKET_URL || 'http://localhost:3001';
    
    this.socket = io(socketUrl, {
      transports: ['websocket', 'polling'], // Prefer websocket, fallback to polling
      timeout: 20000,
      forceNew: true,
      reconnection: true,
      reconnectionDelay: this.reconnectDelay,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
      maxReconnectionAttempts: this.maxReconnectAttempts,
      randomizationFactor: 0.5,
      withCredentials: true,
      autoConnect: true,
      upgrade: true,
      rememberUpgrade: true
    });

    this.socket.on('connect', () => {
      console.log('✅ Connected to dashboard socket server');
      this.updateConnectionState({ 
        isConnected: true, 
        isConnecting: false, 
        lastError: null,
        reconnectAttempts: 0
      });
      
      // Register as chatbot client
      this.socket?.emit('register-client', { type: 'chatbot' });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('🔌 Disconnected from dashboard socket server:', reason);
      this.updateConnectionState({ 
        isConnected: false, 
        isConnecting: false,
        lastError: { 
          message: `Disconnected: ${reason}`, 
          timestamp: new Date().toISOString() 
        }
      });
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error);
      this.updateConnectionState({ 
        isConnected: false, 
        isConnecting: false,
        lastError: { 
          message: error.message || 'Connection failed', 
          code: error.code,
          timestamp: new Date().toISOString() 
        }
      });
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 Reconnected to socket server after', attemptNumber, 'attempts');
      this.updateConnectionState({ 
        isConnected: true, 
        isConnecting: false, 
        lastError: null,
        reconnectAttempts: 0
      });
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('🔄 Attempting to reconnect...', attemptNumber);
      this.updateConnectionState({ 
        isConnecting: true,
        reconnectAttempts: attemptNumber
      });
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('❌ Reconnection failed:', error);
      this.updateConnectionState({ 
        isConnecting: false,
        lastError: { 
          message: `Reconnection failed: ${error.message}`, 
          timestamp: new Date().toISOString() 
        }
      });
    });

    this.socket.on('reconnect_failed', () => {
      console.error('❌ All reconnection attempts failed');
      this.updateConnectionState({ 
        isConnected: false,
        isConnecting: false,
        lastError: { 
          message: 'All reconnection attempts failed', 
          timestamp: new Date().toISOString() 
        }
      });
    });

    this.socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
      this.updateConnectionState({ 
        lastError: { 
          message: error.message || 'Socket error', 
          timestamp: new Date().toISOString() 
        }
      });
    });

    return this.socket;
  }

  private updateConnectionState(updates: Partial<ConnectionState>) {
    this.connectionState = { ...this.connectionState, ...updates };
    this.notifyConnectionListeners();
  }

  private notifyConnectionListeners() {
    this.connectionListeners.forEach(listener => {
      try {
        listener(this.connectionState);
      } catch (error) {
        console.error('Error in connection listener:', error);
      }
    });
  }

  onConnectionStateChange(listener: (state: ConnectionState) => void) {
    this.connectionListeners.push(listener);
    // Immediately call with current state
    listener(this.connectionState);
    
    // Return unsubscribe function
    return () => {
      const index = this.connectionListeners.indexOf(listener);
      if (index > -1) {
        this.connectionListeners.splice(index, 1);
      }
    };
  }

  getConnectionState(): ConnectionState {
    return { ...this.connectionState };
  }

  forceReconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket.connect();
    } else {
      this.connect();
    }
  }

  createChatSession(sessionData: Omit<ChatSession, '_id'>) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connectionState.isConnected) {
        reject(new Error('Socket not connected. Please check your internet connection.'));
        return;
      }

      this.sessionId = sessionData.id;
      
      // Set timeout for the entire operation
      const timeout = setTimeout(() => {
        reject(new Error('Session creation timed out. Please try again.'));
      }, 15000);

      // Create session with callback for acknowledgment
      this.socket.emit('create-session', sessionData, (response: any) => {
        if (response && response.success) {
          console.log('✅ Session created successfully:', response.session.id);
          
          // Join session room with callback
          this.socket?.emit('join-session', sessionData.id, (joinResponse: any) => {
            clearTimeout(timeout);
            
            if (joinResponse && joinResponse.success) {
              console.log('✅ Joined session room:', sessionData.id);
              resolve(response.session);
            } else {
              const error = joinResponse?.error || 'Failed to join session room';
              console.error('❌ Failed to join session room:', error);
              reject(new Error(error));
            }
          });
        } else {
          clearTimeout(timeout);
          const error = response?.error || 'Failed to create session';
          console.error('❌ Failed to create session:', error);
          reject(new Error(error));
        }
      });
    });
  }

  sendMessage(messageData: Omit<ChatMessage, '_id'>) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connectionState.isConnected) {
        reject(new Error('Cannot send message: Not connected to server'));
        return;
      }

      // Add to message queue for ordered processing
      this.messageQueue.push({ messageData, resolve, reject });
      this.processMessageQueue();
    });
  }

  private async processMessageQueue() {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.messageQueue.length > 0) {
      const { messageData, resolve, reject } = this.messageQueue.shift()!;
      
      try {
        await this.sendMessageInternal(messageData);
        resolve(messageData);
      } catch (error) {
        reject(error);
      }
    }

    this.isProcessingQueue = false;
  }

  private sendMessageInternal(messageData: Omit<ChatMessage, '_id'>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connectionState.isConnected) {
        reject(new Error('Cannot send message: Socket not connected'));
        return;
      }

      // Ensure consistent timestamp
      const messageWithTimestamp = {
        ...messageData,
        createdAt: new Date().toISOString()
      };

      // Send message with acknowledgment and retry logic
      let retryCount = 0;
      const maxRetries = 3;
      let timeoutId: NodeJS.Timeout;
      
      const attemptSend = () => {
        // Clear previous timeout
        if (timeoutId) clearTimeout(timeoutId);
        
        // Set timeout for this attempt
        timeoutId = setTimeout(() => {
          retryCount++;
          if (retryCount <= maxRetries) {
            console.log(`🔄 Message send timeout, retrying (attempt ${retryCount}/${maxRetries})`);
            attemptSend();
          } else {
            reject(new Error('Message send failed: Timeout after multiple attempts'));
          }
        }, 10000); // 10 second timeout per attempt

        this.socket?.emit('send-message', messageWithTimestamp, (response: any) => {
          clearTimeout(timeoutId);
          
          if (response && response.success) {
            console.log('✅ Message sent successfully');
            resolve(response.message || messageWithTimestamp);
          } else {
            retryCount++;
            if (retryCount <= maxRetries) {
              console.log(`🔄 Retrying message send (attempt ${retryCount}/${maxRetries})`);
              setTimeout(attemptSend, 1000 * retryCount); // Exponential backoff
            } else {
              const errorMessage = response?.error || 'Failed to send message after multiple attempts';
              console.error('❌ Message send failed:', errorMessage);
              reject(new Error(errorMessage));
            }
          }
        });
      };

      attemptSend();
    });
  }

  onSessionCreated(callback: (session: ChatSession) => void) {
    if (!this.socket) return;
    this.socket.on('session-created', (response: any) => {
      if (response.success && response.session) {
        callback(response.session);
      }
    });
  }

  onClientRegistered(callback: (data: { clientId: string; type: string }) => void) {
    if (!this.socket) return;
    this.socket.on('client-registered', callback);
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
    
    this.updateConnectionState({
      isConnected: false,
      isConnecting: false,
      lastError: null,
      reconnectAttempts: 0
    });
    
    // Clear message queue
    this.messageQueue.forEach(({ reject }) => {
      reject(new Error('Connection closed'));
    });
    this.messageQueue = [];
  }

  getCurrentSessionId() {
    return this.sessionId;
  }

  isConnected() {
    return this.connectionState.isConnected;
  }

  getLastError() {
    return this.connectionState.lastError;
  }
}

export const socketClient = new SocketClient();