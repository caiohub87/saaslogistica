import type { Metadata, Viewport } from 'next';

import { SessionProvider } from '@/providers/SessionProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gestão Logística',
  description: 'Sistema de gestão logística — entregas, escala, estoque e agendamentos.',
  robots: { index: false, follow: false }, // sistema interno: fora dos buscadores
};

export const viewport: Viewport = {
  themeColor: '#14315b',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-marinho-800 focus:px-4 focus:py-2 focus:text-white"
        >
          Pular para o conteúdo
        </a>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
