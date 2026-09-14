'use client';

/**
 * Shown while the sprite atlases decode.
 *
 * The game used to draw its first frames against half-loaded images, which is
 * why so much draw code carried `img.complete && img.naturalWidth !== 0` guards.
 * Waiting here instead means the renderer can assume its sprites exist.
 */
export function LoadingScreen({ loaded, total }: { loaded: number; total: number }) {
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;

  return (
    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-[#1e2629]">
      <h1
        className="mb-8 font-mono text-4xl font-black tracking-tighter text-[#fed859]"
        style={{ textShadow: '3px 3px 0 #1e2629' }}
      >
        BUNS
      </h1>

      <div className="h-4 w-64 border-2 border-[#3b4b52] bg-[#12181a]">
        <div
          className="h-full bg-[#fed859] transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-3 font-mono text-xs uppercase tracking-widest text-[#b2a89a]">
        Loading assets {loaded}/{total}
      </p>
    </div>
  );
}

export default LoadingScreen;
