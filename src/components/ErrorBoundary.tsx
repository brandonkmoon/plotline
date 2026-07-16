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
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="screen text-center">
          <h1 className="font-serif font-bold text-[28px] text-ink mb-4">
            Something went wrong
          </h1>
          <p className="font-body text-[16px] text-text-dim mb-8">
            An unexpected error occurred. Please return to the home page.
          </p>
          {/* Full reload (not next/link) is intentional: it guarantees a clean
              slate out of the errored state. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="inline-block font-serif font-medium text-[16px] uppercase bg-ink text-white py-4 px-6 hover:bg-[#333] transition-colors"
            style={{ letterSpacing: "3px", borderRadius: 0 }}
          >
            Return to Home
          </a>
        </div>
      );
    }

    return this.props.children;
  }
}
