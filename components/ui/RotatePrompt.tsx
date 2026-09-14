'use client';

/**
 * Portrait gate.
 *
 * The world is wider than it is tall and the HUD assumes horizontal room, so
 * portrait is asked to rotate rather than served a cramped layout.
 */
export function RotatePrompt() {
  return (
    <div className="absolute inset-0 z-[80] flex flex-col items-center justify-center bg-[#1e2629] p-8 text-center font-mono">
      <div className="mb-6 text-5xl" aria-hidden>
        ⟳
      </div>
      <h2 className="mb-2 text-xl font-bold text-[#fed859]">Rotate your device</h2>
      <p className="text-sm text-white/70">Buns is played in landscape.</p>
    </div>
  );
}

export default RotatePrompt;
