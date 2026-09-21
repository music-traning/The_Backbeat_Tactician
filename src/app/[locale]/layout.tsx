import {NextIntlClientProvider} from 'next-intl';
import {getMessages, setRequestLocale} from 'next-intl/server';
import {routing} from '@/i18n/routing';
import {notFound} from 'next/navigation';
import { GameProvider } from '@/contexts/GameContext';
import { Analytics } from '@vercel/analytics/react';
import '../globals.css'; // Assuming globals.css is in src/app

export function generateStaticParams() {
  return routing.locales.map((locale) => ({locale}));
}

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '裏拍の軍師',
  description: 'ミリ秒単位のリズム判定で、歴史シミュレーション風のAI軍師と舌戦を繰り広げる音楽トレーニングアプリ。',
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
  openGraph: {
    title: '裏拍の軍師',
    description: 'ミリ秒単位のリズム判定で、歴史シミュレーション風のAI軍師と舌戦を繰り広げる音楽トレーニングアプリ。',
    url: 'https://the-backbeat-tactician.vercel.app',
    siteName: '裏拍の軍師',
    locale: 'ja_JP',
    type: 'website',
    images: [{ url: '/icon.png' }]
  },
  twitter: {
    card: 'summary',
    title: '裏拍の軍師',
    description: 'ミリ秒単位のリズム判定で、歴史シミュレーション風のAI軍師と舌戦を繰り広げる音楽トレーニングアプリ。',
    images: ['/icon.png']
  }
};

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}) {
  const {locale} = await params;
  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="flex flex-col min-h-screen">
        <NextIntlClientProvider messages={messages}>
          <GameProvider>
            <div className="flex-1">
              {children}
            </div>
            <footer className="w-full text-center py-6 border-t border-[#3a2f24] bg-[#0a0806] mt-auto">
              <a 
                href="https://note.com/jazzy_begin" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[#8a7f62] hover:text-[#cda434] transition-colors text-sm tracking-widest"
              >
                &copy; 2026 buro
              </a>
            </footer>
          </GameProvider>
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
