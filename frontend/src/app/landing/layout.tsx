import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'RYX Billing - Modern Billing Software for Indian Businesses',
  description: 'GST-compliant billing software with real-time inventory, customer analytics, and multi-tenant support. Perfect for retail stores and service businesses in India.',
  keywords: 'billing software, GST billing, inventory management, retail software, POS, India, invoice software',
  openGraph: {
    title: 'RYX Billing - Modern Billing Software',
    description: 'GST-compliant billing with real-time inventory and analytics for Indian businesses',
    type: 'website',
  },
}

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {children}
    </div>
  )
}
