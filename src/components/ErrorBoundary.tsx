"use client";

import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Sentry will capture this automatically if initialized
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen px-6">
          <div
            className="flex flex-col items-center w-full text-center"
            style={{ maxWidth: 420 }}
          >
            <p className="font-serif italic text-[22px] text-text-dim mb-4">
              Something went wrong.
            </p>
            <p className="font-sans text-[14px] text-text-muted mb-8">
              An unexpected error occurred. Please try returning to the home
              page.
            </p>
            <a
              href="/"
              className="gold-gradient-bg text-[#0a0a08] font-sans text-[14px] font-bold uppercase tracking-widest py-[16px] px-[40px] text-center inline-block"
              style={{ borderRadius: 0 }}
            >
              Return to Home
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
