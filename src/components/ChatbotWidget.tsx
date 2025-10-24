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
import ErrorBoundary from './ErrorBoundary';
import { useErrorHandler } from '../hooks/useErrorHandler';

function ChatbotWidgetComponent() {
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
  const [formErrors, setFormErrors] = useState<{
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
  }>({});
  
  const { handleError, withErrorHandling } = useErrorHandler({
    maxRetries: 2,
    showToast: true,
    fallbackMessage: 'An error occurred in the chatbot'
  });
  
  const currentStep: ChatbotStep | undefined = (
    chatbotFlow as ChatbotStep[]
  ).find((s) => s.id === step);

  // Validation functions
  const isUserInfoComplete = (userInfo: typeof liveChatUserInfo) => {
    if (!userInfo) return false;
    return !!(
      userInfo.name?.trim() &&
      userInfo.email?.trim() &&
      userInfo.phone?.trim() &&
      userInfo.company?.trim()
    );
  };

  const validateFormField = (name: string, value: string) => {
    switch (name) {
      case 'name':
        if (!value.trim()) return 'Name is required';
        if (value.trim().length < 2) return 'Name must be at least 2 characters';
        break;
      case 'email':
        if (!value.trim()) return 'Email is required';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) return 'Please enter a valid email address';
        break;
      case 'phone':
        if (!value.trim()) return 'Phone number is required';
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        if (!phoneRegex.test(value.replace(/[\s\-\(\)]/g, ''))) return 'Please enter a valid phone number';
        break;
      case 'company':
        if (!value.trim()) return 'Company name is required';
        if (value.trim().length < 2) return 'Company name must be at least 2 characters';
        break;
      default:
        return '';
    }
    return '';
  };

  const validateForm = () => {
    const errors: typeof formErrors = {};
    let isValid = true;

    Object.keys(formData).forEach((key) => {
      const error = validateFormField(key, formData[key as keyof typeof formData]);
      if (error) {
        errors[key as keyof typeof formErrors] = error;
        isValid = false;
      }
    });

    setFormErrors(errors);
    return isValid;
  };

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
      // Validate user information before starting live chat
      if (!liveChatUserInfo || !isUserInfoComplete(liveChatUserInfo)) {
        toast.error('Please provide your contact information first to start live chat.');
        // If no user info or incomplete, redirect to lead capture
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

  const handleFormSubmit = withErrorHandling(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!conversation) return;

    // Validate form before submission
    if (!validateForm()) {
      toast.error('Please fix the errors in the form');
      return;
    }

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
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          company: formData.company.trim(),
          questionAnswerPairs: updatedPairs,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Server error: ${response.status}`);
      }

      const result = await response.json();
      console.log('Lead saved successfully:', result);
      
      // Store user info for potential live chat
      const userInfo = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        company: formData.company.trim()
      };
      setLiveChatUserInfo(userInfo);
      
      toast.success('Information saved successfully!');

      // Proceed to next step
      const nextStepId = currentStep?.next || 'closing';
      setStep(nextStepId);
      setFormData({ name: '', email: '', phone: '', company: '' });
      setFormErrors({});

      const nextStep = (chatbotFlow as ChatbotStep[]).find(
        (s) => s.id === nextStepId
      );
      if (nextStep) {
        setTimeout(() => {
          setCurrentQuestion(nextStep.message);
        }, 1000);
      }
    } catch (error) {
      console.error('Error saving lead:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save information. Please try again.';
      toast.error(errorMessage);
      handleError(error instanceof Error ? error : new Error(errorMessage));
      // Don't proceed to next step if save failed
    } finally {
      setIsSubmiting(false);
    }
  });

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
      data-testid="chatbot-widget"
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
                      data-testid={option.cta === 'livechat' ? 'chat-with-agent' : `option-${option.label.toLowerCase().replace(/\s+/g, '-')}`}
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
                      <div key={field.name} className="flex flex-col">
                        <input
                          type={field.type}
                          required
                          className={`p-2 rounded bg-gray-100 text-gray-900 border ${
                            formErrors[field.name as keyof typeof formErrors]
                              ? 'border-red-500 bg-red-50'
                              : 'border-gray-300'
                          }`}
                          placeholder={field.label}
                          value={formData[field.name as keyof typeof formData]}
                          data-testid={`user-${field.name}`}
                          onChange={(e) => {
                            const value = e.target.value;
                            setFormData((f) => ({
                              ...f,
                              [field.name]: value,
                            }));
                            
                            // Clear error when user starts typing
                            if (formErrors[field.name as keyof typeof formErrors]) {
                              setFormErrors((prev) => ({
                                ...prev,
                                [field.name]: undefined,
                              }));
                            }
                          }}
                          onBlur={(e) => {
                            // Validate field on blur
                            const error = validateFormField(field.name, e.target.value);
                            if (error) {
                              setFormErrors((prev) => ({
                                ...prev,
                                [field.name]: error,
                              }));
                            }
                          }}
                        />
                        {formErrors[field.name as keyof typeof formErrors] && (
                          <span className="text-red-600 text-xs mt-1">
                            {formErrors[field.name as keyof typeof formErrors]}
                          </span>
                        )}
                      </div>
                    )
                  )}
                  <button
                    type="submit"
                    disabled={isSubmiting}
                    className={`rounded px-3 py-2 border transition-colors ${
                      isSubmiting
                        ? 'bg-gray-200 text-gray-500 border-gray-300 cursor-not-allowed'
                        : 'bg-green-100 hover:bg-green-200 text-green-900 border-green-300'
                    }`}
                    data-testid="submit-info"
                  >
                    {isSubmiting ? 'Submitting...' : 'Submit'}
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

// Wrap with error boundary
export default function ChatbotWidget() {
  return (
    <ErrorBoundary
      fallback={
        <div className="w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg bg-white rounded-2xl shadow-2xl p-4 flex flex-col items-center justify-center h-96">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Chatbot Error</h3>
            <p className="text-gray-600 text-sm mb-4">
              The chatbot encountered an error. Please refresh the page to try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      }
    >
      <ChatbotWidgetComponent />
    </ErrorBoundary>
  );
}
