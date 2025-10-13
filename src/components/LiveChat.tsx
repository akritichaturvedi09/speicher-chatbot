'use client';
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { socketClient } from '../lib/socket-client';
import type { ChatSession, ChatMessage, QuestionAnswerPair } from '../shared/types';
import toast from 'react-hot-toast';

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

export default function LiveChat({ userInfo, questionAnswerPairs, onClose }: LiveChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sessionStatus, setSessionStatus] = useState<'connecting' | 'waiting' | 'active' | 'closed'>('connecting');
  const [agentName, setAgentName] = useState<string>('');
  const [session, setSession] = useState<ChatSession | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Connect to socket and create session
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

    socketClient.createChatSession(sessionData);
    setSession(sessionData);
    setSessionStatus('waiting');

    // Set up event listeners
    socketClient.onSessionCreated((createdSession) => {
      console.log('Session created:', createdSession);
      toast.success('Connected! Waiting for an agent...');
    });

    socketClient.onNewMessage((message) => {
      setMessages(prev => [...prev, message]);
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
      toast.error('Connection error. Please try again.');
    });

    socketClient.onMessageError((error) => {
      console.error('Message error:', error);
      toast.error('Failed to send message');
    });

    return () => {
      socketClient.disconnect();
    };
  }, [userInfo, questionAnswerPairs]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !session) return;

    const messageData: Omit<ChatMessage, '_id'> = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId: session.id,
      sender: 'user',
      message: newMessage.trim(),
      createdAt: new Date().toISOString()
    };

    socketClient.sendMessage(messageData);
    setMessages(prev => [...prev, messageData]);
    setNewMessage('');
  };

  const getStatusMessage = () => {
    switch (sessionStatus) {
      case 'connecting':
        return 'Connecting...';
      case 'waiting':
        return 'Waiting for an agent to join...';
      case 'active':
        return `Chatting with ${agentName}`;
      case 'closed':
        return 'Chat session ended';
      default:
        return '';
    }
  };

  const getStatusColor = () => {
    switch (sessionStatus) {
      case 'connecting':
        return 'text-yellow-600';
      case 'waiting':
        return 'text-orange-600';
      case 'active':
        return 'text-green-600';
      case 'closed':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col h-96"
    >
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 rounded-t-2xl flex justify-between items-center">
        <div>
          <h3 className="font-bold">Live Chat Support</h3>
          <p className={`text-sm ${getStatusColor()}`}>{getStatusMessage()}</p>
        </div>
        <button
          onClick={onClose}
          className="text-white hover:text-gray-200 text-xl font-bold"
        >
          ×
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Show previous Q&A pairs as context */}
        {questionAnswerPairs.length > 0 && (
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-xs text-gray-500 mb-2">Previous conversation:</p>
            {questionAnswerPairs.slice(-3).map((pair, index) => (
              <div key={index} className="text-xs space-y-1 mb-2">
                <div className="text-gray-600">Q: {pair.question}</div>
                <div className="text-blue-600">A: {pair.answer}</div>
              </div>
            ))}
          </div>
        )}

        {/* Live chat messages */}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs px-3 py-2 rounded-lg ${
                message.sender === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              <p className="text-sm">{message.message}</p>
              <p className="text-xs opacity-70 mt-1">
                {new Date(message.createdAt).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}

        {sessionStatus === 'waiting' && (
          <div className="text-center text-gray-500 text-sm">
            <div className="animate-pulse">Waiting for an agent to join...</div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <form onSubmit={sendMessage} className="p-4 border-t">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={
              sessionStatus === 'active' 
                ? 'Type your message...' 
                : 'Please wait for an agent...'
            }
            disabled={sessionStatus !== 'active'}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
          <button
            type="submit"
            disabled={sessionStatus !== 'active' || !newMessage.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
    </motion.div>
  );
}