"use client";
import React, { useState, useEffect } from 'react';
import chatbotFlow from '../chatbotFlow.json';

type ChatbotStep = {
  id: string;
  message: string;
  options?: ChatbotOption[];
  form?: { name: string; label: string; type: string }[];
  next?: string;
};

type ChatbotOption = {
  label: string;
  next?: string;
  cta?: string;
};
import { io } from 'socket.io-client';
import { motion } from 'framer-motion';
import type { Conversation, Message } from '../../../shared/types';

const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!);

export default function ChatbotWidget() {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [convError, setConvError] = useState<string | null>(null);
  const [step, setStep] = useState<string>('greeting');
  const [formData, setFormData] = useState<{ name: string; email: string; phone: string; company: string }>({ name: '', email: '', phone: '', company: '' });
  const currentStep: ChatbotStep | undefined = (chatbotFlow as ChatbotStep[]).find(s => s.id === step);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initialMessage: 'User started chat' })
    })
      .then(res => res.json())
      .then(data => {
        if (data && data._id) {
          setConversation(data);
          socket.emit('join', data._id);
          setConvError(null);
        } else {
          setConvError('Conversation creation failed. Please check your backend and MongoDB Atlas config.');
        }
      })
      .catch(() => setConvError('Conversation creation failed. Please check your backend and MongoDB Atlas config.'));
  }, []);

  function handleOption(option: ChatbotOption) {
    if (!conversation) return;
    setMessages(prev => [
      ...prev,
      {
        id: Math.random().toString(),
        conversationId: conversation.id,
        sender: 'user',
        message: option.label,
        createdAt: new Date().toISOString(),
      }
    ]);
    if (option.cta === 'call') {
      window.open('tel:+91XXXXXXXXXX', '_blank');
      return;
    }
    if (option.cta === 'schedule') {
      alert('Callback scheduling coming soon!');
      return;
    }
    if (option.cta === 'livechat') {
      socket.emit('livechat:request', { conversationId: conversation.id });
      setMessages(prev => [
        ...prev,
        {
          id: Math.random().toString(),
          conversationId: conversation.id,
          sender: 'bot',
          message: 'Connecting you to a live agent...',
          createdAt: new Date().toISOString(),
        }
      ]);
      return;
    }
    if (option.next) setStep(option.next);
  }

  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!conversation) return;
    socket.emit('lead:new', { conversationId: conversation.id, ...formData });
    setMessages(prev => [
      ...prev,
      {
        id: Math.random().toString(),
        conversationId: conversation.id,
        sender: 'user',
        message: `Lead: ${formData.name}, ${formData.email}, ${formData.phone}, ${formData.company}`,
        createdAt: new Date().toISOString(),
      }
    ]);
    setStep(currentStep?.next || 'closing');
    setFormData({ name: '', email: '', phone: '', company: '' });
  }

  return (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg bg-white rounded-2xl shadow-2xl p-4 flex flex-col items-center justify-center">
      <div className="flex flex-col w-full h-96 justify-between">
        {convError && (
          <div className="mb-2 p-2 bg-red-200 text-red-800 rounded-xl text-center">{convError}</div>
        )}
  <div className="mb-2 font-bold text-lg text-gray-900">Speicher Chat</div>
        <div className="flex-1 overflow-y-auto space-y-2 mb-4 w-full">
          {messages.map((msg, i) => (
            <div key={i} className={msg.sender === 'user' ? 'text-right' : 'text-left'}>
              <span className={msg.sender === 'user' ? 'bg-blue-100 text-blue-900 px-3 py-2 rounded-xl inline-block' : 'bg-gray-100 text-gray-900 px-3 py-2 rounded-xl inline-block'}>{msg.message}</span>
            </div>
          ))}
          {currentStep && (
            <div className="mt-2">
              <div className="text-left mb-2 text-gray-900 font-medium">{currentStep.message}</div>
              {currentStep.options && (
                <div className="flex flex-wrap gap-2">
                  {currentStep.options.map((option: ChatbotOption) => (
                    <button key={option.label} className="bg-blue-100 hover:bg-blue-200 rounded px-3 py-1 text-blue-900 border border-blue-300" onClick={() => handleOption(option)}>{option.label}</button>
                  ))}
                </div>
              )}
              {currentStep.form && (
                <form className="flex flex-col gap-2 mt-2" onSubmit={handleFormSubmit}>
                  {currentStep.form.map((field: { name: string; label: string; type: string }) => (
                    <input
                      key={field.name}
                      type={field.type}
                      required
                      className="p-2 rounded bg-gray-100 text-gray-900 border border-gray-300"
                      placeholder={field.label}
                      value={formData[field.name as keyof typeof formData]}
                      onChange={e => setFormData(f => ({ ...f, [field.name]: e.target.value }))}
                    />
                  ))}
                  <button type="submit" className="bg-green-100 hover:bg-green-200 rounded px-3 py-1 text-green-900 border border-green-300">Submit</button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}