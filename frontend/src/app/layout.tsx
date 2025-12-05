import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ClientProvider } from '@/contexts/ClientContext'
import { DataProvider } from '@/contexts/DataContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { LoadingProvider } from '@/contexts/LoadingContext'
import { LoadingInitializer } from '@/components/LoadingInitializer'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'RYX Billing Software',
  description: 'Multi-tenant billing system with GST support',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'RYX Billing',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: '/RYX_Logo.png',
    apple: '/RYX_Logo.png',
    shortcut: '/RYX_Logo.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#3b82f6',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider>
          <LoadingProvider>
            <LoadingInitializer>
              <ClientProvider>
                <DataProvider>
                  {children}
                </DataProvider>
              </ClientProvider>
            </LoadingInitializer>
          </LoadingProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
