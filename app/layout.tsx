import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/auth-provider';
import { DesktopWindowControls } from '@/components/desktop-window-controls';
import { DesktopVoiceCallPopup } from '@/components/user-menu';

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
    <html lang="pt-BR" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider><DesktopWindowControls />{children}<DesktopVoiceCallPopup /></AuthProvider>
      </body>
    </html>
  );
}
