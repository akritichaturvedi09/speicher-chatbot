import { z } from 'zod';

// Lead validation schema
export const createLeadSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().email('Invalid email format'),
  phone: z.string().min(1, 'Phone is required').max(20, 'Phone too long'),
  company: z.string().max(100, 'Company name too long').optional(),
  questionAnswerPairs: z.array(z.object({
    id: z.string(),
    conversationId: z.string(),
    question: z.string().max(500, 'Question too long'),
    answer: z.string().max(1000, 'Answer too long'),
    stepId: z.string(),
    createdAt: z.string()
  })).optional()
});

// Validation helper
export function validateRequestBody<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      ).join(', ');
      throw new ValidationError(`Validation failed: ${errorMessage}`);
    }
    throw error;
  }
}

// Custom error class
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}