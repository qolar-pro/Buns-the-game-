'use client';

/**
 * Catches a crash in the game and shows something recoverable.
 *
 * Without this, an exception in the render pass or a system unmounts the tree
 * and the player is left with a white screen and no idea their world is still
 * on disk. React only reports render-phase errors to a class component, so this
 * is deliberately not a hook.
 */
import React from 'react';
import { debugError } from '@/lib/debug';

interface Props {
  children: React.ReactNode;
  /** Shown as a way back; usually returns to the main menu. */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    debugError('Game crashed', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1e2629] p-6 font-mono">
        <div className="max-w-xl border-2 border-[#8e2020] bg-black/40 p-6 text-sm text-white">
          <h1 className="mb-3 text-xl font-bold text-[#ff9c9c]">The game crashed</h1>
          <p className="mb-4 text-white/80">
            Your saved worlds are safe — they are stored separately and were not touched.
          </p>
          <pre className="mb-5 max-h-40 overflow-auto whitespace-pre-wrap border border-white/10 bg-black/50 p-3 text-xs text-white/60">
            {error.message}
          </pre>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null });
                this.props.onReset?.();
              }}
              className="border-2 border-[#7c4d23] px-4 py-2 text-[#fed859] hover:bg-white/10"
            >
              Back to the menu
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="border-2 border-[#3b4b52] px-4 py-2 text-white/70 hover:bg-white/10"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
