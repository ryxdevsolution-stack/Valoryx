

import { useState } from 'react'
import { ThemeProvider } from '@/contexts/ThemeContext'
import LandingNavbar from '@/components/landing/LandingNavbar'
import HeroSection from '@/components/landing/HeroSection'
import TrustedBySection from '@/components/landing/TrustedBySection'
import FeaturesSection from '@/components/landing/FeaturesSection'
import BenefitsSection from '@/components/landing/BenefitsSection'
import StatsSection from '@/components/landing/StatsSection'
import TestimonialsSection from '@/components/landing/TestimonialsSection'
import FAQSection from '@/components/landing/FAQSection'
import CTASection from '@/components/landing/CTASection'
import PricingSection from '@/components/landing/PricingSection'
import LandingFooter from '@/components/landing/LandingFooter'
import AppPreviewSection from '@/components/landing/AppPreviewSection'
import DemoVideoModal from '@/components/landing/DemoVideoModal'

const DEMO_VIDEO = 'https://www.youtube.com/embed/wz8e0IfWaNM?autoplay=1'

export default function LandingPage() {
  const [videoOpen, setVideoOpen] = useState(false)

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white overflow-x-hidden">
        {/* Navigation */}
        <LandingNavbar />

        {/* Main Content */}
        <main>
          {/* Hero Section */}
          <HeroSection onWatchDemo={() => setVideoOpen(true)} />

          {/* App Preview Section */}
          <AppPreviewSection />

          {/* Trusted By Section */}
          <TrustedBySection />

          {/* Features Section */}
          <FeaturesSection />

          {/* Stats Section */}
          <StatsSection />

          {/* Benefits Section */}
          <BenefitsSection />

          {/* Testimonials Section */}
          <TestimonialsSection />

          {/* Pricing Section */}
          <PricingSection />

          {/* FAQ Section */}
          <FAQSection />

          {/* Final CTA Section */}
          <CTASection />
        </main>

        {/* Footer */}
        <LandingFooter />
      </div>

      {videoOpen && (
        <DemoVideoModal
          onClose={() => setVideoOpen(false)}
          videoSrc={DEMO_VIDEO}
        />
      )}
    </ThemeProvider>
  )
}
