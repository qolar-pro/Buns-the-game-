import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css'; // Global styles

const DESCRIPTION =
  'A top-down survival game for the browser. Gather wood and stone, craft tools, ' +
  'smelt ore, farm, keep animals, and stay fed through a day/night cycle.';

export const metadata: Metadata = {
  title: 'Buns the Game',
  description: DESCRIPTION,
  applicationName: 'Buns the Game',
  // app/icon.png and app/opengraph-image.png are picked up by the app router
  // automatically; both are generated from the shipped art by scripts.
  openGraph: {
    title: 'Buns the Game',
    description: DESCRIPTION,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Buns the Game',
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  // The game is full-bleed and handles its own scaling; let it use the notch
  // area and stop double-tap zoom fighting the touch controls.
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#1e2629',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- app router has no pages/_document; this is the documented place for it */}
        <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
