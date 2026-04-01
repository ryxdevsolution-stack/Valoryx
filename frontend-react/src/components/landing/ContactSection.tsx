import { useState } from 'react'
import { motion } from 'framer-motion'
import { Mail, Phone, MapPin, Clock, Send, CheckCircle, Loader2, Building2, ShieldCheck, Users } from 'lucide-react'
import { siteConfig } from '@/config/landing.config'
import { viewportOnce } from '@/lib/landing/animations'
import api from '@/lib/api'

const highlights = [
  {
    icon: Building2,
    title: 'Built for Indian Businesses',
    description: 'GST-compliant invoicing, HSN codes, multi-branch support, and UPI payments — designed ground-up for retail and service businesses across India.',
  },
  {
    icon: ShieldCheck,
    title: 'Enterprise-Grade Security',
    description: 'Bank-grade 256-bit encryption, two-factor authentication, role-based access control, and complete audit trails for every transaction.',
  },
  {
    icon: Users,
    title: 'Dedicated Onboarding',
    description: 'Our team helps you migrate your data, train your staff, and get fully operational. Unlimited users with custom role permissions.',
  },
]

const contactChannels = [
  {
    icon: Mail,
    label: 'Email Us',
    value: siteConfig.contact.email,
    href: `mailto:${siteConfig.contact.email}`,
    description: 'For business inquiries and demos',
  },
  {
    icon: Phone,
    label: 'Call Us',
    value: `${siteConfig.contact.phone} / ${siteConfig.contact.altPhone}`,
    href: `tel:${siteConfig.contact.phone.replace(/\s/g, '')}`,
    description: 'Speak directly with our team',
  },
  {
    icon: MapPin,
    label: 'Visit Us',
    value: siteConfig.contact.address,
    href: undefined,
    description: 'Schedule an in-person meeting',
  },
  {
    icon: Clock,
    label: 'Business Hours',
    value: 'Mon – Sat, 9 AM – 7 PM IST',
    href: undefined,
    description: 'We respond within 2 hours',
  },
]

interface FormState {
  name: string
  email: string
  phone: string
  business: string
  message: string
}

export default function ContactSection() {
  const [form, setForm] = useState<FormState>({
    name: '',
    email: '',
    phone: '',
    business: '',
    message: '',
  })
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')

    try {
      const res = await api.post('/contact', form)
      if (res.data.success) {
        setStatus('sent')
        setForm({ name: '', email: '', phone: '', business: '', message: '' })
      } else {
        setErrorMsg(res.data.error || 'Something went wrong.')
        setStatus('error')
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to send message. Please try again.'
      setErrorMsg(msg)
      setStatus('error')
    }
  }

  return (
    <section id="contact" className="py-20 lg:py-28 bg-gray-50 dark:bg-gray-950 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          className="text-center mb-16"
        >
          <span className="inline-block text-primary-600 dark:text-primary-400 font-semibold text-sm tracking-wider uppercase mb-3">
            Get Started
          </span>
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Let's Discuss How Valoryx Fits Your Business
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Every business is different. Reach out to us for a personalized walkthrough,
            custom pricing, and to see how Valoryx can streamline your operations.
          </p>
        </motion.div>

        {/* Why Valoryx — Highlight Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {highlights.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewportOnce}
              transition={{ delay: index * 0.1 }}
              className="relative rounded-2xl border border-gray-200/50 dark:border-gray-700/50 bg-white dark:bg-gray-800/50 p-6"
            >
              <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mb-4">
                <item.icon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{item.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{item.description}</p>
            </motion.div>
          ))}
        </div>

        {/* Contact Cards + Form */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Contact Channels */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
            {contactChannels.map((channel, index) => (
              <motion.div
                key={channel.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={viewportOnce}
                transition={{ delay: index * 0.08 }}
                className="rounded-xl border border-gray-200/50 dark:border-gray-700/50 bg-white dark:bg-gray-800/50 p-5 hover:border-primary-300 dark:hover:border-primary-600 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0">
                    <channel.icon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium mb-1">
                      {channel.label}
                    </p>
                    {channel.href ? (
                      <a
                        href={channel.href}
                        className="text-gray-900 dark:text-white font-semibold text-sm hover:text-primary-600 dark:hover:text-primary-400 transition-colors break-all"
                      >
                        {channel.value}
                      </a>
                    ) : (
                      <p className="text-gray-900 dark:text-white font-semibold text-sm">{channel.value}</p>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{channel.description}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Contact Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewportOnce}
            transition={{ delay: 0.2 }}
            className="lg:col-span-3 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 bg-white dark:bg-gray-800/50 p-6 sm:p-8"
          >
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Send Us a Message</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Fill in the form and our team will get back to you within 24 hours.
            </p>

            {status === 'sent' ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
                <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Message Sent!</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  We've received your inquiry and sent a confirmation to your email. Our team will get back to you within 24 hours.
                </p>
                <button
                  type="button"
                  onClick={() => setStatus('idle')}
                  className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="contact-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="contact-name"
                      name="name"
                      type="text"
                      required
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Your full name"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="contact-email"
                      name="email"
                      type="email"
                      required
                      value={form.email}
                      onChange={handleChange}
                      placeholder="you@example.com"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="contact-phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Phone
                    </label>
                    <input
                      id="contact-phone"
                      name="phone"
                      type="tel"
                      value={form.phone}
                      onChange={handleChange}
                      placeholder="+91 98765 43210"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-business" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Business Name
                    </label>
                    <input
                      id="contact-business"
                      name="business"
                      type="text"
                      value={form.business}
                      onChange={handleChange}
                      placeholder="Your business name"
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="contact-message" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Message <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="contact-message"
                    name="message"
                    required
                    rows={4}
                    value={form.message}
                    onChange={handleChange}
                    placeholder="Tell us about your business and what you're looking for..."
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all resize-none"
                  />
                </div>

                {status === 'error' && (
                  <p className="text-sm text-red-500 dark:text-red-400">{errorMsg}</p>
                )}

                <button
                  type="submit"
                  disabled={status === 'sending'}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold text-sm shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {status === 'sending' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send Message
                    </>
                  )}
                </button>
              </form>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  )
}
