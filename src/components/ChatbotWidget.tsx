'use client';
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
import { motion } from 'framer-motion';
import type { Conversation, QuestionAnswerPair } from '../shared/types';
import toast from 'react-hot-toast';
import LiveChat from './LiveChat';

export default function ChatbotWidget() {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [questionAnswerPairs, setQuestionAnswerPairs] = useState<
    QuestionAnswerPair[]
  >([]);
  const [convError] = useState<string | null>(null);
  const [step, setStep] = useState<string>('greeting');
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [isSubmiting, setIsSubmiting] = useState<boolean>(false);
  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    phone: string;
    company: string;
  }>({ name: '', email: '', phone: '', company: '' });
  const [showLiveChat, setShowLiveChat] = useState<boolean>(false);
  const [liveChatUserInfo, setLiveChatUserInfo] = useState<{
    name: string;
    email: string;
    phone: string;
    company: string;
  } | null>(null);
  const currentStep: ChatbotStep | undefined = (
    chatbotFlow as ChatbotStep[]
  ).find((s) => s.id === step);

  useEffect(() => {
    const mockConversation: Conversation = {
      _id: 'mock-conversation-id',
      id: 'mock-conversation-id',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setConversation(mockConversation);

    const greetingStep = (chatbotFlow as ChatbotStep[]).find(
      (s) => s.id === 'greeting'
    );
    if (greetingStep) {
      setCurrentQuestion(greetingStep.message);
    }
  }, []);

  function handleOption(option: ChatbotOption) {
    if (!conversation) return;

    const questionAnswerPair: QuestionAnswerPair = {
      id: Math.random().toString(),
      conversationId: conversation.id,
      question: currentQuestion,
      answer: option.label,
      stepId: step,
      createdAt: new Date().toISOString(),
    };

    setQuestionAnswerPairs((prev) => [...prev, questionAnswerPair]);

    if (option.cta === 'call') {
      window.open('tel:01204297427', '_blank');
      return;
    }
    if (option.cta === 'schedule') {
      alert('Callback scheduling coming soon!');
      return;
    }
    if (option.cta === 'livechat') {
      // Check if user has provided contact info
      if (!liveChatUserInfo) {
        // If no user info, redirect to lead capture first
        setStep('leadCapture');
        const leadCaptureStep = (chatbotFlow as ChatbotStep[]).find(
          (s) => s.id === 'leadCapture'
        );
        if (leadCaptureStep) {
          setCurrentQuestion(leadCaptureStep.message);
        }
        return;
      }
      
      const livechatPair: QuestionAnswerPair = {
        id: Math.random().toString(),
        conversationId: conversation.id,
        question: 'Live Chat Request',
        answer: 'Connecting you to a live agent...',
        stepId: 'livechat',
        createdAt: new Date().toISOString(),
      };
      setQuestionAnswerPairs((prev) => [...prev, livechatPair]);
      setShowLiveChat(true);
      return;
    }

    if (option.next) {
      setStep(option.next);
      const nextStep = (chatbotFlow as ChatbotStep[]).find(
        (s) => s.id === option.next
      );
      if (nextStep) {
        setCurrentQuestion(nextStep.message);
      }
    }
  }

  async function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!conversation) return;

    const formAnswerText = `Name: ${formData.name}, Email: ${formData.email}, Phone: ${formData.phone}, Company: ${formData.company}`;
    const formQuestionAnswerPair: QuestionAnswerPair = {
      id: Math.random().toString(),
      conversationId: conversation.id,
      question: currentQuestion,
      answer: formAnswerText,
      stepId: step,
      createdAt: new Date().toISOString(),
    };

    const updatedPairs = [...questionAnswerPairs, formQuestionAnswerPair];
    setQuestionAnswerPairs(updatedPairs);

    try {
      setIsSubmiting(true);
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          company: formData.company,
          questionAnswerPairs: updatedPairs,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Lead saved successfully:', result);
        
        // Store user info for potential live chat
        setLiveChatUserInfo({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          company: formData.company
        });
       
      } else {
        throw new Error('Failed to save lead');
      }
    } catch (error) {
      console.error('Error saving lead:', error);
    } finally{
      setIsSubmiting(false)
    }

    const nextStepId = currentStep?.next || 'closing';
    setStep(nextStepId);
    setFormData({ name: '', email: '', phone: '', company: '' });

    const nextStep = (chatbotFlow as ChatbotStep[]).find(
      (s) => s.id === nextStepId
    );
    if (nextStep) {
      setTimeout(() => {
        setCurrentQuestion(nextStep.message);
      }, 1000);
    }
  }

  // Show live chat if requested
  if (showLiveChat && liveChatUserInfo) {
    return (
      <LiveChat
        userInfo={liveChatUserInfo}
        questionAnswerPairs={questionAnswerPairs}
        onClose={() => setShowLiveChat(false)}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg bg-white rounded-2xl shadow-2xl p-4 flex flex-col items-center justify-center"
    >
      <div className="flex flex-col w-full h-96 justify-between">
        {convError && (
          <div className="mb-2 p-2 bg-red-200 text-red-800 rounded-xl text-center">
            {convError}
          </div>
        )}
        <div className="mb-2 font-bold text-lg text-gray-900">
          Speicher Chat
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 mb-4 w-full">
          {questionAnswerPairs.map((pair, i) => (
            <div key={i} className="space-y-2">
              <div className="text-left">
                <span className="bg-gray-100 text-gray-900 px-3 py-2 rounded-xl inline-block">
                  {pair.question}
                </span>
              </div>
              <div className="text-right">
                <span className="bg-blue-100 text-blue-900 px-3 py-2 rounded-xl inline-block">
                  {pair.answer}
                </span>
              </div>
            </div>
          ))}

          {currentQuestion && (
            <div className="text-left">
              <span className="bg-gray-100 text-gray-900 px-3 py-2 rounded-xl inline-block">
                {currentQuestion}
              </span>
            </div>
          )}
          {currentStep && (
            <div className="mt-2">
              {currentStep.options && (
                <div className="flex flex-wrap gap-2">
                  {currentStep.options.map((option: ChatbotOption) => (
                    <button
                      key={option.label}
                      className="bg-blue-100 hover:bg-blue-200 rounded px-3 py-1 text-blue-900 border border-blue-300"
                      onClick={() => handleOption(option)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
              {currentStep.form && (
                <form
                  className="flex flex-col gap-2 mt-2"
                  onSubmit={handleFormSubmit}
                >
                  {currentStep.form.map(
                    (field: { name: string; label: string; type: string }) => (
                      <input
                        key={field.name}
                        type={field.type}
                        required
                        className="p-2 rounded bg-gray-100 text-gray-900 border border-gray-300"
                        placeholder={field.label}
                        value={formData[field.name as keyof typeof formData]}
                        onChange={(e) =>
                          setFormData((f) => ({
                            ...f,
                            [field.name]: e.target.value,
                          }))
                        }
                      />
                    )
                  )}
                  <button
                    type="submit"
                    disabled={isSubmiting}
                    className="bg-green-100 hover:bg-green-200 rounded px-3 py-1 text-green-900 border border-green-300"
                  >
                    Submit
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
