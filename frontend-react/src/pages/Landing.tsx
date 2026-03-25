

import { useState } from 'react'
import { ThemeProvider } from '@/contexts/ThemeContext'
import LandingNavbar from '@/components/landing/LandingNavbar'
import HeroSection from '@/components/landing/HeroSection'
import TrustedBySection from '@/components/landing/TrustedBySection'
import ProductShowcaseSection from '@/components/landing/ProductShowcaseSection'
import IntegrationsSection from '@/components/landing/IntegrationsSection'
import BenefitsSection from '@/components/landing/BenefitsSection'
import StatsSection from '@/components/landing/StatsSection'
import TestimonialsSection from '@/components/landing/TestimonialsSection'
import ContactSection from '@/components/landing/ContactSection'
import FAQSection from '@/components/landing/FAQSection'
import CTASection from '@/components/landing/CTASection'
import LandingFooter from '@/components/landing/LandingFooter'
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

          {/* Trusted By Section */}
          <TrustedBySection />

          {/* Product Showcase — BentoGrid (replaces Features + AppPreview + ModuleShowcase) */}
          <ProductShowcaseSection />

          {/* Integrations Section */}
          <IntegrationsSection />

          {/* Stats Section */}
          <StatsSection />

          {/* Benefits Section */}
          <BenefitsSection />

          {/* Testimonials Section */}
          <TestimonialsSection />

          {/* Contact Section */}
          <ContactSection />

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
