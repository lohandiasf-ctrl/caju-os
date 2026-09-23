import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/auth-provider';
import { DesktopWindowControls } from '@/components/desktop-window-controls';
import { PullRefreshGuard } from '@/components/pull-refresh-guard';
import { GlobalAssistant } from '@/components/global-assistant';
import { MotionProvider } from '@/components/motion-provider';
import { themeBootScript } from '@/lib/theme';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Caju OS - Central de Operacoes',
  description: 'Gestao de chamados, tecnicos, lojas e atendimentos em campo.',
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: '/caju-tech-emblem.png', type: 'image/png' }],
    shortcut: ['/caju-tech-emblem.png'],
    apple: ['/caju-tech-emblem.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // O servidor sempre entrega "dark" (padrão); o script do <head> troca a
    // classe antes da pintura para quem escolheu o claro — daí o
    // suppressHydrationWarning só neste elemento.
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <MotionProvider>
          <AuthProvider>
            <PullRefreshGuard />
            <DesktopWindowControls />
            {children}
            <GlobalAssistant />
          </AuthProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
