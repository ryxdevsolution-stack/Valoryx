import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, Download, ArrowRight } from 'lucide-react'
import { siteConfig, navLinks } from '@/config/landing.config'
import { scrollToSection } from '@/lib/landing/animations'
import DownloadButton from './DownloadButton'

/**
 * Light, airy top navigation matching the Rescale template:
 * logo · centered links · pill CTAs. Becomes a frosted floating pill on scroll.
 */
export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleNavClick = (href: string) => {
    setMenuOpen(false)
    if (href.startsWith('#')) scrollToSection(href)
  }

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', damping: 22, stiffness: 120 }}
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-3 sm:pt-4"
    >
      <nav
        className={`flex w-full max-w-6xl items-center justify-between rounded-full px-3 py-2 transition-all duration-300 sm:px-4 ${
          scrolled ? 'glass-card shadow-soft' : 'bg-white/40 backdrop-blur-sm'
        }`}
      >
        {/* Logo */}
        <Link
          to={siteConfig.routes.home}
          className="flex items-center gap-2 pl-2"
          aria-label={`${siteConfig.name} home`}
        >
          <img
            src={siteConfig.logoPath}
            alt={siteConfig.name}
            className="h-8 w-8 rounded-lg object-contain"
          />
          <span className="font-heading text-xl font-bold tracking-tight text-ink">
            {siteConfig.name}
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => {
                e.preventDefault()
                handleNavClick(link.href)
              }}
              className="rounded-full px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
            >
              {link.label}
            </a>
          ))}
          <Link
            to="/developers"
            className="rounded-full px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            Developers
          </Link>
        </div>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-2 lg:flex">
          <DownloadButton className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-ink/30 hover:text-ink">
            <Download className="h-4 w-4" />
            Download
          </DownloadButton>
          <Link
            to={siteConfig.routes.login}
            className="rounded-full px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
          >
            Sign In
          </Link>
          <Link
            to={siteConfig.routes.register}
            className="group inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white shadow-pill transition-all hover:scale-[1.03] hover:bg-[#3a4666]"
          >
            Start Free Trial
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-ink/5 lg:hidden"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="glass-card absolute inset-x-4 top-[4.5rem] rounded-3xl p-4 shadow-soft lg:hidden"
          >
            <div className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => {
                    e.preventDefault()
                    handleNavClick(link.href)
                  }}
                  className="rounded-2xl px-4 py-3 text-base font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
                >
                  {link.label}
                </a>
              ))}
              <Link
                to="/developers"
                onClick={() => setMenuOpen(false)}
                className="rounded-2xl px-4 py-3 text-base font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
              >
                Developers
              </Link>
              <div className="mt-2 flex flex-col gap-2 border-t border-ink/10 pt-3">
                <DownloadButton className="inline-flex items-center justify-center gap-2 rounded-full border border-ink/15 px-5 py-3 text-base font-medium text-ink-soft">
                  <Download className="h-4 w-4" />
                  Download for Windows
                </DownloadButton>
                <Link
                  to={siteConfig.routes.login}
                  className="rounded-full px-4 py-3 text-center text-base font-medium text-ink-soft hover:text-ink"
                >
                  Sign In
                </Link>
                <Link
                  to={siteConfig.routes.register}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-ink px-5 py-3 text-base font-semibold text-white shadow-pill"
                >
                  Start Free Trial
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
