'use client';

/**
 * A quiet confirmation that the world has been written to storage.
 *
 * Autosave that gives no feedback is indistinguishable from autosave that is
 * broken, so this appears briefly on each write — and stays up, loudly, if a
 * write fails.
 */
export function SaveIndicator({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null;

  const label =
    state === 'saving' ? 'Saving…' : state === 'saved' ? 'Game saved' : 'Save failed';

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute right-4 top-14 z-40 border-2 px-3 py-1 font-mono text-[11px]"
      style={{
        borderColor: state === 'error' ? '#8e2020' : '#7c4d23',
        background: 'rgba(0,0,0,0.6)',
        color: state === 'error' ? '#ff9c9c' : '#fed859',
        opacity: state === 'saved' ? 0.9 : 1,
      }}
    >
      {label}
    </div>
  );
}

export default SaveIndicator;
