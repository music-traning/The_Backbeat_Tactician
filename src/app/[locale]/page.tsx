'use client';
import {useTranslations, useLocale} from 'next-intl';
import {Link} from '@/i18n/routing';
import TacticianDebate from '@/components/TacticianDebate';

export default function HomePage() {
  return (
    <>
      <main>
        <TacticianDebate />
      </main>
    </>
  );
}
