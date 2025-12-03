'use client'

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
import LandingFooter from '@/components/landing/LandingFooter'

export default function LandingPage() {
  return (
    <ThemeProvider>
      <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white overflow-x-hidden">
        {/* Navigation */}
        <LandingNavbar />

        {/* Main Content */}
        <main>
          {/* Hero Section */}
          <HeroSection />

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

          {/* FAQ Section */}
          <FAQSection />

          {/* Final CTA Section */}
          <CTASection />
        </main>

        {/* Footer */}
        <LandingFooter />
      </div>
    </ThemeProvider>
  )
}
