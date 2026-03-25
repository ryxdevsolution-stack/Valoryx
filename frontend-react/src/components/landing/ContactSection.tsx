import { motion } from 'framer-motion'
import { Mail, Phone, MapPin, MessageCircle, Clock, ArrowRight, Building2, ShieldCheck, Users } from 'lucide-react'
import { siteConfig } from '@/config/landing.config'
import { viewportOnce } from '@/lib/landing/animations'

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
    value: siteConfig.contact.phone,
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

export default function ContactSection() {
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

        {/* Contact Cards + CTA */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Contact Channels */}
          <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          {/* CTA Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewportOnce}
            transition={{ delay: 0.3 }}
            className="lg:col-span-2 rounded-2xl bg-gradient-to-br from-primary-600 to-primary-700 dark:from-primary-600 dark:to-primary-900 p-8 flex flex-col justify-between text-white shadow-lg dark:shadow-primary-900/20"
          >
            <div>
              <MessageCircle className="w-10 h-10 mb-4 opacity-80" />
              <h3 className="text-xl font-bold mb-3">Request a Free Demo</h3>
              <p className="text-primary-100 text-sm leading-relaxed mb-6">
                See Valoryx in action with a live, personalized demo tailored to your business type.
                No commitment, no credit card — just a conversation about what you need.
              </p>
              <ul className="space-y-2 text-sm text-primary-100 mb-8">
                <li className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 flex-shrink-0" />
                  Personalized setup for your industry
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 flex-shrink-0" />
                  Data migration assistance included
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 flex-shrink-0" />
                  Custom pricing based on your needs
                </li>
              </ul>
            </div>
            <a
              href={`mailto:${siteConfig.contact.email}?subject=Demo%20Request%20-%20${siteConfig.name}&body=Hi%20Valoryx%20Team%2C%0A%0AI'd%20like%20to%20schedule%20a%20demo.%0A%0ABusiness%20Name%3A%20%0AIndustry%3A%20%0ANumber%20of%20Locations%3A%20%0A%0AThanks!`}
              className="inline-flex items-center justify-center gap-2 w-full py-3 px-6 rounded-xl bg-white text-primary-700 font-bold text-sm hover:bg-primary-50 dark:hover:bg-gray-100 transition-colors"
            >
              <Mail className="w-4 h-4" />
              Request Demo
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
