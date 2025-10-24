interface ErrorReport {
  message: string;
  stack?: string;
  componentStack?: string;
  timestamp: string;
  userAgent: string;
  url: string;
  userId?: string;
  sessionId?: string;
  additionalContext?: Record<string, any>;
}

class ErrorReporter {
  private static instance: ErrorReporter;
  private isEnabled: boolean = true;
  private endpoint: string | null = null;

  private constructor() {
    // Initialize error reporting
    this.setupGlobalErrorHandlers();
  }

  static getInstance(): ErrorReporter {
    if (!ErrorReporter.instance) {
      ErrorReporter.instance = new ErrorReporter();
    }
    return ErrorReporter.instance;
  }

  configure(options: { endpoint?: string; enabled?: boolean }) {
    if (options.endpoint) {
      this.endpoint = options.endpoint;
    }
    if (typeof options.enabled === 'boolean') {
      this.isEnabled = options.enabled;
    }
  }

  private setupGlobalErrorHandlers() {
    // Handle unhandled promise rejections
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', (event) => {
        this.reportError(event.reason, {
          type: 'unhandledrejection',
          promise: event.promise
        });
      });

      // Handle global JavaScript errors
      window.addEventListener('error', (event) => {
        this.reportError(event.error || new Error(event.message), {
          type: 'javascript',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        });
      });
    }
  }

  reportError(
    error: Error | string,
    additionalContext?: Record<string, any>
  ): void {
    if (!this.isEnabled) return;

    try {
      const errorObj = typeof error === 'string' ? new Error(error) : error;
      
      const report: ErrorReport = {
        message: errorObj.message,
        stack: errorObj.stack,
        timestamp: new Date().toISOString(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        url: typeof window !== 'undefined' ? window.location.href : 'unknown',
        additionalContext
      };

      // Log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.group('🚨 Error Report');
        console.error('Error:', errorObj);
        console.log('Report:', report);
        console.groupEnd();
      }

      // Send to monitoring service
      this.sendToMonitoringService(report);

      // Store locally for debugging
      this.storeLocalError(report);

    } catch (reportingError) {
      console.error('Failed to report error:', reportingError);
    }
  }

  private async sendToMonitoringService(report: ErrorReport): Promise<void> {
    if (!this.endpoint) return;

    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(report),
      });
    } catch (error) {
      console.error('Failed to send error to monitoring service:', error);
    }
  }

  private storeLocalError(report: ErrorReport): void {
    try {
      if (typeof localStorage === 'undefined') return;

      const key = 'chatbot_error_reports';
      const existing = localStorage.getItem(key);
      const reports = existing ? JSON.parse(existing) : [];
      
      reports.push(report);
      
      // Keep only last 10 errors
      if (reports.length > 10) {
        reports.splice(0, reports.length - 10);
      }
      
      localStorage.setItem(key, JSON.stringify(reports));
    } catch (error) {
      console.error('Failed to store error locally:', error);
    }
  }

  getStoredErrors(): ErrorReport[] {
    try {
      if (typeof localStorage === 'undefined') return [];
      
      const key = 'chatbot_error_reports';
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to retrieve stored errors:', error);
      return [];
    }
  }

  clearStoredErrors(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.removeItem('chatbot_error_reports');
    } catch (error) {
      console.error('Failed to clear stored errors:', error);
    }
  }
}

// Export singleton instance
export const errorReporter = ErrorReporter.getInstance();

// Convenience function for React Error Boundaries
export function reportReactError(error: Error, errorInfo: { componentStack: string }): void {
  errorReporter.reportError(error, {
    type: 'react',
    componentStack: errorInfo.componentStack
  });
}

export default errorReporter;