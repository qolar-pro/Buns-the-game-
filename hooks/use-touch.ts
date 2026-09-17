import * as React from 'react';

/**
 * Whether this device is actually driven by touch.
 *
 * Screen width is the wrong question — a narrow desktop window is not a phone,
 * and a tablet is wide but has no keyboard. This watches for a real touch event
 * and flips on the first one, so a hybrid device gets whichever layer the player
 * actually reaches for.
 */
export function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = React.useState(false);

  React.useEffect(() => {
    // Coarse pointer is a strong hint before any interaction happens.
    if (window.matchMedia?.('(pointer: coarse)').matches) setIsTouch(true);

    const onTouch = () => setIsTouch(true);
    window.addEventListener('touchstart', onTouch, { passive: true, once: true });
    return () => window.removeEventListener('touchstart', onTouch);
  }, []);

  return isTouch;
}

/** True while the viewport is taller than it is wide. */
export function useIsPortrait(): boolean {
  const [portrait, setPortrait] = React.useState(false);

  React.useEffect(() => {
    const check = () => setPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  return portrait;
}
