import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import LandingNavbar from './LandingNavbar'
import LandingFooter from './LandingFooter'
import { siteConfig } from '@/config/landing.config'

/**
 * Shared shell for static legal pages (Privacy, Terms). Reuses the landing
 * navbar/footer for brand consistency and renders a centered prose column.
 */
interface LegalLayoutProps {
  title: string
  lastUpdated: string
  children: ReactNode
}

export default function LegalLayout({ title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-canvas font-body text-ink antialiased">
      <LandingNavbar />

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-32 sm:px-6 sm:pt-36">
        <Link
          to={siteConfig.routes.home}
          className="font-body text-sm font-medium text-accent-blue hover:underline"
        >
          ← Back to home
        </Link>

        <h1 className="heading-display mt-6 text-4xl sm:text-5xl">{title}</h1>
        <p className="mt-3 font-body text-sm text-ink-faint">Last updated: {lastUpdated}</p>

        <div className="mt-10 space-y-8">{children}</div>
      </main>

      <LandingFooter />
    </div>
  )
}

/** A titled legal section with consistent spacing. */
export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-heading text-xl font-bold text-ink">{heading}</h2>
      <div className="mt-3 space-y-3 font-body text-sm leading-relaxed text-ink-soft">{children}</div>
    </section>
  )
}

/** Bulleted list styled for legal prose. */
export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="ml-5 list-disc space-y-2 font-body text-sm leading-relaxed text-ink-soft">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}
