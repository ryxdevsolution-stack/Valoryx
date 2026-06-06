import { useState } from 'react'
import LandingNavbar from '@/components/landing/LandingNavbar'
import HeroSection from '@/components/landing/HeroSection'
import FeatureBentoSection from '@/components/landing/FeatureBentoSection'
import HowItWorksSection from '@/components/landing/HowItWorksSection'
import IntegrationsSection from '@/components/landing/IntegrationsSection'
import WhyOfflineFirstSection from '@/components/landing/WhyOfflineFirstSection'
import TestimonialsSection from '@/components/landing/TestimonialsSection'
import FAQSection from '@/components/landing/FAQSection'
import CTASection from '@/components/landing/CTASection'
import LandingFooter from '@/components/landing/LandingFooter'
import DemoVideoModal from '@/components/landing/DemoVideoModal'

const DEMO_VIDEO = 'https://www.youtube.com/embed/wz8e0IfWaNM?autoplay=1'

/**
 * Valoryx marketing landing page — light-only, Rescale-template styling.
 * Content is sourced from `landing.config.ts`; sections are assembled here.
 */
export default function LandingPage() {
  const [videoOpen, setVideoOpen] = useState(false)

  return (
    <div className="min-h-screen overflow-x-hidden bg-canvas font-body text-ink antialiased">
      <LandingNavbar />

      <main>
        <HeroSection onWatchDemo={() => setVideoOpen(true)} />
        <FeatureBentoSection />
        <HowItWorksSection />
        <IntegrationsSection />
        <WhyOfflineFirstSection />
        <TestimonialsSection />
        <FAQSection />
        <CTASection />
      </main>

      <LandingFooter />

      {videoOpen && (
        <DemoVideoModal onClose={() => setVideoOpen(false)} videoSrc={DEMO_VIDEO} />
      )}
    </div>
  )
}
