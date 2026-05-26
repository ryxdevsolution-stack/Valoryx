

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, Download } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AnimatedThemeToggler } from '@/components/AnimatedThemeToggler'
import { siteConfig, navLinks } from '@/config/landing.config'
import { scrollToSection } from '@/lib/landing/animations'

export default function LandingNavbar() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleNavClick = (href: string) => {
    setIsMobileMenuOpen(false)
    scrollToSection(href)
  }

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl shadow-lg border-b border-gray-200/50 dark:border-gray-700/50'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 lg:h-24">
            {/* Logo */}
            <Link to={siteConfig.routes.home} className="flex items-center">
              <img
                src={siteConfig.logoPath}
                alt={siteConfig.name}
                style={{ height: 72, width: 'auto' }}
              />
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-8">
              {navLinks.map((link) => (
                <button
                  key={link.href}
                  onClick={() => handleNavClick(link.href)}
                  className="font-medium text-gray-700 dark:text-gray-300 hover:text-primary-500 transition-colors"
                >
                  {link.label}
                </button>
              ))}
            </div>

            {/* Desktop Actions */}
            <div className="hidden lg:flex items-center gap-4">
              <AnimatedThemeToggler
                className={`p-2 rounded-lg transition-colors ${
                  isScrolled
                    ? 'hover:bg-gray-100 dark:hover:bg-gray-800'
                    : 'hover:bg-white/20 dark:hover:bg-gray-800/50'
                } text-gray-600 dark:text-yellow-500`}
              />

              <Link
                to={siteConfig.routes.login}
                className="font-medium px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Login
              </Link>

              <a
                href="#"
                className="inline-flex items-center gap-2 font-semibold px-5 py-2.5 rounded-xl border border-primary-500 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/30 transition-all duration-300"
              >
                <Download className="w-4 h-4" />
                Download
              </a>

              <Link
                to={siteConfig.routes.register}
                className="font-semibold px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 transition-all duration-300"
              >
                Start Free Trial
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <div className="flex items-center gap-2 lg:hidden">
              <AnimatedThemeToggler
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-yellow-500"
              />

              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? (
                  <X className="w-6 h-6 text-gray-900 dark:text-white" />
                ) : (
                  <Menu className="w-6 h-6 text-gray-900 dark:text-white" />
                )}
              </button>
            </div>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 top-16 z-40 lg:hidden bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-700/50 shadow-xl"
          >
            <div className="px-4 py-6 space-y-4">
              {navLinks.map((link, index) => (
                <motion.button
                  key={link.href}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  onClick={() => handleNavClick(link.href)}
                  className="block w-full text-left font-medium text-gray-700 dark:text-gray-300 hover:text-primary-500 py-2"
                >
                  {link.label}
                </motion.button>
              ))}

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                <Link
                  to={siteConfig.routes.login}
                  className="block w-full text-center font-medium text-gray-700 dark:text-gray-300 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Login
                </Link>
                <a
                  href="#"
                  className="flex items-center justify-center gap-2 w-full text-center font-semibold text-primary-600 dark:text-primary-400 py-3 rounded-xl border border-primary-500"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Download className="w-4 h-4" />
                  Download for Windows
                </a>
                <Link
                  to={siteConfig.routes.register}
                  className="block w-full text-center font-semibold text-white py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Start Free Trial
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
