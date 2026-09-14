import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'Buns the Game',
  description: 'A 2D top-down pixel art survival game.',
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
