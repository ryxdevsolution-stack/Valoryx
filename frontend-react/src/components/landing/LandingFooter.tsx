import { Link } from 'react-router-dom'
import { Mail, Phone, MapPin } from 'lucide-react'
import { siteConfig, footerSections, socialLinks } from '@/config/landing.config'
import { scrollToSection } from '@/lib/landing/animations'

/**
 * Light Rescale-style footer: brand + contact, link columns, a "talk to us"
 * contact CTA, an oversized brand wordmark, and a bottom bar with socials.
 */
export default function LandingFooter() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="relative overflow-hidden border-t border-ink/8 bg-white">
      <div className="mx-auto w-full max-w-screen-2xl px-4 pb-8 pt-16 sm:px-6 lg:px-12 xl:px-20">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:grid-cols-6 lg:gap-12">
          {/* Brand + contact */}
          <div className="col-span-2 lg:col-span-2">
            <Link to={siteConfig.routes.home} className="flex items-center gap-2">
              <img
                src={siteConfig.logoPath}
                alt={siteConfig.name}
                className="h-9 w-9 rounded-lg object-contain"
              />
              <span className="font-heading text-xl font-bold tracking-tight text-ink">
                {siteConfig.name}
              </span>
            </Link>
            <p className="mt-5 max-w-xs font-body text-sm leading-relaxed text-ink-soft">
              The offline-first POS &amp; business suite for Indian retail. Run your
              entire shop from one app — online or offline.
            </p>

            <div className="mt-6 space-y-2.5 font-body text-sm text-ink-soft">
              <a href={`mailto:${siteConfig.contact.email}`} className="flex items-center gap-2.5 hover:text-ink">
                <Mail className="h-4 w-4 text-ink-faint" />
                {siteConfig.contact.email}
              </a>
              <a href={`tel:${siteConfig.contact.phone.replace(/\s/g, '')}`} className="flex items-center gap-2.5 hover:text-ink">
                <Phone className="h-4 w-4 text-ink-faint" />
                {siteConfig.contact.phone}
              </a>
              <div className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                <span>{siteConfig.contact.address}</span>
              </div>
            </div>
          </div>

          {/* Link columns */}
          {footerSections.map((section) => (
            <div key={section.title}>
              <h3 className="font-heading text-sm font-semibold text-ink">{section.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('#') ? (
                      <button
                        type="button"
                        onClick={() => scrollToSection(link.href)}
                        className="font-body text-sm text-ink-soft transition-colors hover:text-ink"
                      >
                        {link.label}
                      </button>
                    ) : (
                      <Link
                        to={link.href}
                        className="font-body text-sm text-ink-soft transition-colors hover:text-ink"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Contact CTA */}
        <div className="mt-12 flex flex-col items-start justify-between gap-4 rounded-3xl border border-ink/8 bg-canvas p-6 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-heading text-base font-semibold text-ink">
              Questions? We&apos;re here to help
            </h3>
            <p className="mt-1 font-body text-sm text-ink-soft">
              Talk to our India-based team about onboarding, data migration, or a
              live demo at your counter.
            </p>
          </div>
          <a
            href={`mailto:${siteConfig.contact.email}`}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-ink px-6 py-3 font-body text-sm font-semibold text-white shadow-pill transition-transform hover:scale-105"
          >
            <Mail className="h-4 w-4" />
            Email us
          </a>
        </div>

        {/* Oversized wordmark */}
        <div
          aria-hidden="true"
          className="pointer-events-none mt-14 select-none text-center font-heading text-[22vw] font-extrabold leading-none tracking-tighter text-transparent"
          style={{
            backgroundImage: 'linear-gradient(180deg, rgba(70,84,120,0.14), rgba(70,84,120,0.02))',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
          }}
        >
          {siteConfig.name.toLowerCase()}
        </div>

        {/* Bottom bar */}
        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-ink/8 pt-8 sm:flex-row">
          <div className="flex flex-col items-center gap-2 font-body text-sm text-ink-faint sm:flex-row sm:gap-4">
            <span>&copy; {currentYear} {siteConfig.name}. All rights reserved.</span>
            <span className="hidden sm:inline">•</span>
            <span className="inline-flex items-center gap-1.5">
              Made with <span className="text-[#EC8FC0]">❤</span> in India 🇮🇳
            </span>
          </div>
          <div className="flex items-center gap-2">
            {socialLinks.map((social) => (
              <a
                key={social.label}
                href={social.href}
                aria-label={social.label}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 text-ink-soft transition-all hover:border-ink/30 hover:text-ink"
              >
                <social.icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
