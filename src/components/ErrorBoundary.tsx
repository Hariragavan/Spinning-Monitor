import React, { Component, ReactNode } from 'react';
import { Trash2 } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-10 text-center">
          <div className="w-20 h-20 bg-red-100 rounded-3xl flex items-center justify-center text-red-600 mb-6 font-black">
            <Trash2 size={40} />
          </div>
          <h1 className="text-3xl font-black text-stone-900 uppercase tracking-tight mb-4">Application Error</h1>
          <p className="text-stone-500 font-bold mb-8 max-w-md">
            Something went wrong while loading the dashboard. This might be due to a connectivity issue or record corruption.
          </p>
          <pre className="p-4 bg-stone-200 rounded-xl text-[10px] font-mono text-stone-700 mb-8 max-w-xl overflow-auto text-left">
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            className="px-8 py-3 bg-stone-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-stone-800 transition-colors"
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
