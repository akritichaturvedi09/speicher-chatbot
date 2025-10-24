'use client';
import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';

export interface ErrorState {
  error: Error | null;
  isError: boolean;
  errorMessage: string | null;
  errorCode?: string;
  retryCount: number;
}

export interface ErrorHandlerOptions {
  maxRetries?: number;
  retryDelay?: number;
  showToast?: boolean;
  logError?: boolean;
  fallbackMessage?: string;
}

export function useErrorHandler(options: ErrorHandlerOptions = {}) {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    showToast = true,
    logError = true,
    fallbackMessage = 'An unexpected error occurred'
  } = options;

  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    isError: false,
    errorMessage: null,
    retryCount: 0
  });

  const clearError = useCallback(() => {
    setErrorState({
      error: null,
      isError: false,
      errorMessage: null,
      retryCount: 0
    });
  }, []);

  const handleError = useCallback((error: Error | string, errorCode?: string) => {
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    const message = errorObj.message || fallbackMessage;

    if (logError) {
      console.error('Error handled:', {
        message,
        stack: errorObj.stack,
        code: errorCode,
        timestamp: new Date().toISOString()
      });
    }

    setErrorState(prev => ({
      error: errorObj,
      isError: true,
      errorMessage: message,
      errorCode,
      retryCount: prev.retryCount
    }));

    if (showToast) {
      toast.error(message);
    }
  }, [logError, showToast, fallbackMessage]);

  const retryOperation = useCallback(async (operation: () => Promise<any>) => {
    const currentRetryCount = errorState.retryCount;
    
    if (currentRetryCount >= maxRetries) {
      handleError(new Error(`Operation failed after ${maxRetries} attempts`));
      return;
    }

    try {
      setErrorState(prev => ({
        ...prev,
        retryCount: prev.retryCount + 1
      }));

      // Add delay before retry (exponential backoff)
      if (currentRetryCount > 0) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, currentRetryCount - 1)));
      }

      const result = await operation();
      clearError();
      return result;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      
      if (currentRetryCount + 1 >= maxRetries) {
        handleError(errorObj);
      } else {
        if (showToast) {
          toast.error(`Attempt ${currentRetryCount + 1}/${maxRetries} failed. Retrying...`);
        }
        // Recursively retry
        setTimeout(() => retryOperation(operation), retryDelay * Math.pow(2, currentRetryCount));
      }
    }
  }, [errorState.retryCount, maxRetries, retryDelay, handleError, clearError, showToast]);

  const withErrorHandling = useCallback(<T extends any[], R>(
    fn: (...args: T) => Promise<R>
  ) => {
    return async (...args: T): Promise<R | undefined> => {
      try {
        clearError();
        return await fn(...args);
      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        handleError(errorObj);
        throw error; // Re-throw to allow caller to handle if needed
      }
    };
  }, [handleError, clearError]);

  const getErrorMessage = useCallback((error: unknown): string => {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as any).message);
    }
    return fallbackMessage;
  }, [fallbackMessage]);

  return {
    ...errorState,
    handleError,
    clearError,
    retryOperation,
    withErrorHandling,
    getErrorMessage,
    canRetry: errorState.retryCount < maxRetries
  };
}

export default useErrorHandler;