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

export interface ChatSession {
  _id?: string;
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  status: 'waiting' | 'active' | 'closed';
  agentId?: string;
  agentName?: string;
  createdAt: string;
  updatedAt: string;
  initialMessage: string;
  questionAnswerPairs?: QuestionAnswerPair[];
}

export interface ChatMessage {
  _id?: string;
  id: string;
  sessionId: string;
  sender: 'user' | 'agent';
  message: string;
  createdAt: string;
}