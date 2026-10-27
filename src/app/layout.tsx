import type { Metadata } from 'next';
import '@/index.css';

export const metadata: Metadata = {
  title: 'SpinMonitor AI | Textile Spinning Mill Performance & Incentive System',
  description: 'Enterprise operations, daily production statement, GPS incentive engine, and performance monitoring for spinning mills.',
  icons: {
    icon: [
      { url: '/scm-emblem-transparent.png', type: 'image/png' },
      { url: '/favicon.ico' },
      { url: '/icon.png', type: 'image/png' }
    ],
    shortcut: '/scm-emblem-transparent.png',
    apple: '/scm-emblem-transparent.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/png" href="/scm-emblem-transparent.png" />
        <link rel="shortcut icon" href="/scm-emblem-transparent.png" />
        <link rel="apple-touch-icon" href="/scm-emblem-transparent.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Playfair+Display:ital,wght@0,700;1,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning className="font-sans bg-stone-100 text-stone-900 antialiased selection:bg-emerald-700 selection:text-white">
        {children}
      </body>
    </html>
  );
}
