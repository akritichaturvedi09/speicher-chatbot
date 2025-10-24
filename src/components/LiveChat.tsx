'use client';
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { socketClient } from '../lib/socket-client';
import type { ChatSession, ChatMessage, QuestionAnswerPair } from '../shared/types';
import toast from 'react-hot-toast';
import { useErrorHandler } from '../hooks/useErrorHandler';
import ErrorBoundary from './ErrorBoundary';

interface LiveChatProps {
  userInfo: {
    name: string;
    email: string;
    phone: string;
    company: string;
  };
  questionAnswerPairs: QuestionAnswerPair[];
  onClose: () => void;
}

function LiveChatComponent({ userInfo, questionAnswerPairs, onClose }: LiveChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sessionStatus, setSessionStatus] = useState<'connecting' | 'waiting' | 'active' | 'closed' | 'error'>('connecting');
  const [agentName, setAgentName] = useState<string>('');
  const [session, setSession] = useState<ChatSession | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const {
    isError,
    errorMessage,
    retryCount,
    handleError,
    clearError,
    retryOperation,
    canRetry
  } = useErrorHandler({
    maxRetries: 3,
    retryDelay: 2000,
    showToast: true,
    fallbackMessage: 'Live chat connection failed'
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initializeConnection = async () => {
    try {
      setSessionStatus('connecting');
      clearError();
      
      // Connect to socket
      const socket = socketClient.connect();
      
      const sessionData: Omit<ChatSession, '_id'> = {
        id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: `user_${Date.now()}`,
        userEmail: userInfo.email,
        userName: userInfo.name,
        status: 'waiting',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        initialMessage: 'User requested live chat support',
        questionAnswerPairs
      };

      // Create session with timeout
      const createdSession = await socketClient.createChatSession(sessionData);

      setSession(createdSession as ChatSession);
      setSessionStatus('waiting');
      setIsReconnecting(false);
      console.log('✅ Session created and joined successfully');
      
    } catch (error) {
      console.error('❌ Failed to create session:', error);
      const errorObj = error instanceof Error ? error : new Error('Failed to create session');
      handleError(errorObj);
      setSessionStatus('error');
      setIsReconnecting(false);
    }
  };

  const handleRetryConnection = () => {
    retryOperation(initializeConnection);
  };

  useEffect(() => {
    initializeConnection();

    // Monitor connection state
    const unsubscribeConnection = socketClient.onConnectionStateChange((state) => {
      setIsReconnecting(state.isConnecting && state.reconnectAttempts > 0);
      
      if (state.lastError && !isError) {
        handleError(new Error(state.lastError.message));
        if (sessionStatus !== 'error') {
          setSessionStatus('error');
        }
      }
    });

    // Set up event listeners
    socketClient.onSessionCreated((createdSession) => {
      console.log('Session created:', createdSession);
      toast.success('Connected! Waiting for an agent...');
    });

    socketClient.onNewMessage((message) => {
      setMessages(prev => {
        // Check if message already exists to prevent duplicates
        const exists = prev.some(msg => msg.id === message.id);
        if (exists) {
          console.log('📨 Message already exists, skipping:', message.id);
          return prev;
        }
        console.log('📨 New message received:', message.id);
        return [...prev, message];
      });
    });

    socketClient.onAgentJoined((data) => {
      setAgentName(data.agentName);
      setSessionStatus('active');
      toast.success(`${data.agentName} joined the chat!`);
    });

    socketClient.onSessionClosed(() => {
      setSessionStatus('closed');
      toast.info('Chat session ended');
    });

    socketClient.onSessionError((error) => {
      console.error('Session error:', error);
      handleError(new Error(error.error || 'Session error occurred'));
      if (sessionStatus !== 'error') {
        setSessionStatus('error');
      }
    });

    socketClient.onMessageError((error) => {
      console.error('Message error:', error);
      handleError(new Error(error.error || 'Failed to send message'));
    });

    return () => {
      unsubscribeConnection();
      socketClient.disconnect();
    };
  }, [userInfo, questionAnswerPairs]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !session) return;

    const messageData: Omit<ChatMessage, '_id'> = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId: session.id,
      sender: 'user',
      message: newMessage.trim(),
      createdAt: new Date().toISOString()
    };

    // Optimistically add message to UI
    setMessages(prev => [...prev, messageData]);
    setNewMessage('');

    try {
      // Send message with error handling
      const confirmedMessage = await socketClient.sendMessage(messageData);
      console.log('✅ Message confirmed by server');
      
      // Update the message with server timestamp if different
      if (confirmedMessage && confirmedMessage.createdAt !== messageData.createdAt) {
        setMessages(prev => prev.map(msg => 
          msg.id === messageData.id 
            ? { ...msg, createdAt: confirmedMessage.createdAt }
            : msg
        ));
      }
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      handleError(error instanceof Error ? error : new Error('Failed to send message'));
      
      // Mark message as failed instead of removing it
      setMessages(prev => prev.map(msg => 
        msg.id === messageData.id 
          ? { ...msg, failed: true }
          : msg
      ));
    }
  };

  const retryMessage = async (message: ChatMessage) => {
    try {
      // Remove failed flag optimistically
      setMessages(prev => prev.map(msg => 
        msg.id === message.id 
          ? { ...msg, failed: false }
          : msg
      ));

      const confirmedMessage = await socketClient.sendMessage(message);
      console.log('✅ Message retry successful');
      
      if (confirmedMessage && confirmedMessage.createdAt !== message.createdAt) {
        setMessages(prev => prev.map(msg => 
          msg.id === message.id 
            ? { ...msg, createdAt: confirmedMessage.createdAt }
            : msg
        ));
      }
      
      toast.success('Message sent successfully');
    } catch (error) {
      console.error('❌ Message retry failed:', error);
      handleError(error instanceof Error ? error : new Error('Retry failed'));
      
      // Mark as failed again
      setMessages(prev => prev.map(msg => 
        msg.id === message.id 
          ? { ...msg, failed: true }
          : msg
      ));
    }
  };

  const getStatusMessage = () => {
    switch (sessionStatus) {
      case 'connecting':
        return isReconnecting 
          ? `Reconnecting... (${retryCount}/3)`
          : 'Connecting to live chat...';
      case 'waiting':
        return 'Waiting for an agent to join...';
      case 'active':
        return `Chatting with ${agentName}`;
      case 'closed':
        return 'Chat session ended';
      case 'error':
        return errorMessage || 'Connection failed';
      default:
        return '';
    }
  };

  const getStatusColor = () => {
    switch (sessionStatus) {
      case 'connecting':
        return 'text-blue-600';
      case 'waiting':
        return 'text-orange-600';
      case 'active':
        return 'text-green-600';
      case 'closed':
        return 'text-gray-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getStatusIcon = () => {
    switch (sessionStatus) {
      case 'connecting':
        return (
          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
        );
      case 'waiting':
        return (
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-orange-600 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-orange-600 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
            <div className="w-2 h-2 bg-orange-600 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
          </div>
        );
      case 'active':
        return <div className="w-3 h-3 bg-green-600 rounded-full"></div>;
      case 'closed':
        return <div className="w-3 h-3 bg-gray-600 rounded-full"></div>;
      case 'error':
        return <div className="w-3 h-3 bg-red-600 rounded-full"></div>;
      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col h-96"
      data-testid="live-chat-interface"
    >
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 rounded-t-2xl flex justify-between items-center">
        <div className="flex-1">
          <h3 className="font-bold text-lg">Live Chat Support</h3>
          <div className="flex items-center space-x-2 mt-1">
            {getStatusIcon()}
            <p className="text-sm text-blue-100" data-testid="connection-status">{getStatusMessage()}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-white hover:text-gray-200 text-2xl font-bold ml-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-blue-700 transition-colors"
          aria-label="Close chat"
        >
          ×
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {/* Show previous Q&A pairs as context */}
        {questionAnswerPairs.length > 0 && (
          <div className="bg-white border border-gray-200 p-3 rounded-lg shadow-sm" data-testid="conversation-context">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <p className="text-xs font-medium text-gray-600">Previous conversation</p>
            </div>
            <div className="max-h-24 overflow-y-auto">
              {questionAnswerPairs.slice(-3).map((pair, index) => (
                <div key={index} className="text-xs space-y-1 mb-2 last:mb-0">
                  <div className="text-gray-700 font-medium">Q: {pair.question}</div>
                  <div className="text-blue-700 ml-2">A: {pair.answer}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connection status messages */}
        {(sessionStatus === 'connecting' || sessionStatus === 'waiting' || sessionStatus === 'error') && (
          <div className="text-center py-4">
            {sessionStatus === 'error' ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center justify-center space-x-2 mb-2">
                  <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                  <p className="text-red-700 font-medium">Connection Error</p>
                </div>
                <p className="text-red-600 text-sm mb-3">{errorMessage}</p>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={handleRetryConnection}
                    disabled={!canRetry}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      canRetry 
                        ? 'bg-red-100 hover:bg-red-200 text-red-700' 
                        : 'bg-gray-100 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {canRetry ? 'Try Again' : 'Max Retries Reached'}
                  </button>
                  {!canRetry && (
                    <button
                      onClick={() => window.location.reload()}
                      className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      Reload Page
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-center space-x-2 mb-2">
                  {getStatusIcon()}
                  <p className="text-blue-700 font-medium">{getStatusMessage()}</p>
                </div>
                {sessionStatus === 'waiting' && (
                  <p className="text-blue-600 text-sm">
                    An agent will be with you shortly. Please wait...
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Live chat messages */}
        <div data-testid="message-list">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-xs ${message.sender === 'user' ? 'ml-12' : 'mr-12'}`}>
              {message.sender === 'agent' && (
                <p className="text-xs text-gray-500 mb-1 ml-1">{agentName}</p>
              )}
              <div
                className={`px-4 py-2 rounded-2xl shadow-sm ${
                  (message as any).failed
                    ? 'bg-red-100 border border-red-300 text-red-800'
                    : message.sender === 'user'
                    ? 'bg-blue-500 text-white rounded-br-md'
                    : 'bg-white text-gray-800 border border-gray-200 rounded-bl-md'
                }`}
              >
                <p className="text-sm leading-relaxed">{message.message}</p>
                <div className="flex items-center justify-between mt-2">
                  <p className={`text-xs ${
                    message.sender === 'user' ? 'text-blue-100' : 'text-gray-500'
                  }`}>
                    {new Date(message.createdAt).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </p>
                  {(message as any).failed && (
                    <button
                      onClick={() => retryMessage(message)}
                      className="text-xs bg-red-200 hover:bg-red-300 text-red-700 px-2 py-1 rounded-full transition-colors"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        </div>

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="border-t border-gray-200 bg-white p-4">
        {sessionStatus === 'error' ? (
          <div className="text-center">
            <p className="text-red-600 text-sm mb-2">Unable to send messages</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={handleRetryConnection}
                disabled={!canRetry}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  canRetry 
                    ? 'bg-red-100 hover:bg-red-200 text-red-700' 
                    : 'bg-gray-100 text-gray-500 cursor-not-allowed'
                }`}
              >
                {canRetry ? 'Reconnect' : 'Max Retries Reached'}
              </button>
              {!canRetry && (
                <button
                  onClick={() => window.location.reload()}
                  className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Reload
                </button>
              )}
            </div>
          </div>
        ) : sessionStatus === 'closed' ? (
          <div className="text-center">
            <p className="text-gray-600 text-sm mb-2">Chat session has ended</p>
            <button
              onClick={onClose}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Close Chat
            </button>
          </div>
        ) : (
          <form onSubmit={sendMessage} className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={
                  sessionStatus === 'active' 
                    ? 'Type your message...' 
                    : sessionStatus === 'connecting'
                    ? 'Connecting...'
                    : 'Waiting for agent...'
                }
                disabled={sessionStatus !== 'active'}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500 transition-colors"
                maxLength={500}
                data-testid="message-input"
              />
              <button
                type="submit"
                disabled={sessionStatus !== 'active' || !newMessage.trim()}
                className="px-6 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                data-testid="send-message"
              >
                Send
              </button>
            </div>
            {sessionStatus !== 'active' && (
              <p className="text-xs text-gray-500 text-center">
                {sessionStatus === 'connecting' && 'Establishing connection...'}
                {sessionStatus === 'waiting' && 'Waiting for an agent to join the chat'}
              </p>
            )}
          </form>
        )}
      </div>
    </motion.div>
  );
}

// Wrap with error boundary
export default function LiveChat(props: LiveChatProps) {
  return (
    <ErrorBoundary
      fallback={
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col h-96 items-center justify-center p-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Live Chat Error</h3>
            <p className="text-gray-600 text-sm mb-4">
              The live chat encountered an error. Please try refreshing the page.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Refresh Page
              </button>
              <button
                onClick={props.onClose}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Close Chat
              </button>
            </div>
          </div>
        </div>
      }
    >
      <LiveChatComponent {...props} />
    </ErrorBoundary>
  );
}