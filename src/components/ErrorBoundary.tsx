// =====================================================
// Leadflow Vloom - Error Boundary
// =====================================================
// Si algo lanza en la app, mostramos este mensaje en vez de pantalla en blanco.
// =====================================================
import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Leadflow Vloom ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="min-h-screen bg-vloom-bg flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-vloom-surface rounded-xl border border-vloom-border shadow-lg p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl" aria-hidden>⚠️</span>
            </div>
            <h1 className="text-xl font-bold text-vloom-text mb-2">Something went wrong</h1>
            <p className="text-vloom-muted text-sm mb-4 font-mono break-all">
              {this.state.error.message}
            </p>
            <p className="text-vloom-muted text-xs mb-6">
              Revisa la consola del navegador (F12) para más detalles.
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-vloom-accent text-white rounded-lg hover:bg-vloom-accent-hover text-sm font-medium"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
