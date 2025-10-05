export interface Conversation {
  _id: string;
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  sender: 'user' | 'bot' | 'agent';
  message: string;
  createdAt: string;
}

export interface QuestionAnswerPair {
  id: string;
  conversationId: string;
  question: string;
  answer: string;
  stepId: string;
  createdAt: string;
}