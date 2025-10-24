import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ClientProvider } from '@/contexts/ClientContext'
import { DataProvider } from '@/contexts/DataContext'
import { ThemeProvider } from '@/contexts/ThemeContext'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'RYX Billing Software',
  description: 'Multi-tenant billing system with GST support',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <ClientProvider>
            <DataProvider>
              {children}
            </DataProvider>
          </ClientProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
