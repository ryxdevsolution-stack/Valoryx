import {
  Receipt,
  Package,
  Users,
  Shield,
  CreditCard,
  Printer,
  Moon,
  Upload,
  Clock,
  Globe,
  TrendingUp,
  Building2,
  Store,
  Scissors,
  Wrench,
  Coffee,
  ShoppingBag,
  Twitter,
  Linkedin,
  Facebook,
  Instagram,
  LucideIcon,
} from 'lucide-react'

// =============================================================================
// SITE CONFIGURATION
// =============================================================================

export const siteConfig = {
  name: 'RYX Billing',
  tagline: 'Modern Billing for Modern Businesses',
  description: 'GST-compliant invoicing, real-time inventory, and powerful analytics. Everything you need to run your retail or service business efficiently.',
  logoPath: '/RYX_Logo.png',
  appUrl: 'app.ryxbilling.com',

  // Routes
  routes: {
    home: '/landing',
    login: '/auth/login',
    register: '/auth/register',
    dashboard: '/dashboard',
  },

  // Contact Information
  contact: {
    email: 'support@ryxbilling.com',
    phone: '+91 12345 67890',
    address: 'Bangalore, Karnataka, India',
  },

  // Social Media Links
  social: {
    twitter: '#',
    linkedin: '#',
    facebook: '#',
    instagram: '#',
  },
}

// =============================================================================
// NAVIGATION
// =============================================================================

export const navLinks = [
  { href: '#features', label: 'Features' },
  { href: '#benefits', label: 'Benefits' },
  { href: '#testimonials', label: 'Testimonials' },
  { href: '#faq', label: 'FAQ' },
]

// =============================================================================
// TRUST INDICATORS
// =============================================================================

export const trustItems = [
  'No credit card required',
  '14-day free trial',
  'Cancel anytime',
  '24/7 support',
]

export const trustBadges = [
  { label: 'GST Compliant', color: 'green' },
  { label: 'Bank-grade Security', color: 'blue' },
  { label: 'Made in India', color: 'purple' },
  { label: 'ISO Certified', color: 'orange' },
]

// =============================================================================
// FEATURES
// =============================================================================

export interface Feature {
  icon: LucideIcon
  title: string
  description: string
}

export const features: Feature[] = [
  {
    icon: Receipt,
    title: 'GST & Non-GST Billing',
    description: 'Automated tax calculations with full GST compliance. CGST, SGST, IGST support with HSN codes for Indian businesses.',
  },
  {
    icon: Package,
    title: 'Real-time Inventory',
    description: 'Low-stock alerts, barcode scanning, and seamless stock management. Never miss a sale due to stockouts.',
  },
  {
    icon: Users,
    title: 'Customer Analytics',
    description: 'Track customer behavior with predictive insights, purchase history, and identify your most valuable customers.',
  },
  {
    icon: Shield,
    title: 'Role-based Access',
    description: 'Multi-tenant SaaS with granular permissions. Control who can access what with complete audit logging.',
  },
  {
    icon: CreditCard,
    title: 'Flexible Payments',
    description: 'Split payments across multiple methods. Support for cash, card, UPI, and bank transfers in a single bill.',
  },
  {
    icon: Printer,
    title: 'Direct Printing',
    description: 'Thermal printer support with customizable receipts. No driver installation needed, works out of the box.',
  },
  {
    icon: Moon,
    title: 'Dark Mode',
    description: 'Easy on the eyes with full dark mode support across all features. Work comfortably day or night.',
  },
  {
    icon: Upload,
    title: 'Bulk Operations',
    description: 'Import and export data easily with Excel support. Migrate your existing inventory in minutes.',
  },
]

// =============================================================================
// BENEFITS
// =============================================================================

export interface Benefit {
  icon: LucideIcon
  title: string
  description: string
  points: string[]
  color: 'primary' | 'green' | 'purple' | 'orange'
}

const benefitColors = {
  primary: {
    gradient: 'from-primary-500 to-blue-600',
    bgGradient: 'from-primary-50 to-blue-50 dark:from-primary-950/30 dark:to-blue-950/30',
    iconColor: '#0ea5e9',
  },
  green: {
    gradient: 'from-green-500 to-emerald-600',
    bgGradient: 'from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30',
    iconColor: '#22c55e',
  },
  purple: {
    gradient: 'from-purple-500 to-indigo-600',
    bgGradient: 'from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30',
    iconColor: '#a855f7',
  },
  orange: {
    gradient: 'from-orange-500 to-red-600',
    bgGradient: 'from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30',
    iconColor: '#f97316',
  },
}

export const getBenefitColors = (color: Benefit['color']) => benefitColors[color]

export const benefits: Benefit[] = [
  {
    icon: Clock,
    title: 'Save Time, Increase Revenue',
    description: 'Automate your billing process and focus on growing your business instead of paperwork.',
    points: [
      '70% faster billing with automation',
      'Real-time inventory prevents stockouts',
      'Analytics identify profitable products',
    ],
    color: 'primary',
  },
  {
    icon: Shield,
    title: 'Stay Compliant, Stay Confident',
    description: 'Built-in GST compliance ensures you never have to worry about tax regulations.',
    points: [
      '100% GST compliant with GSTIN validation',
      'Complete audit trail for every transaction',
      'Export-ready reports for tax filing',
    ],
    color: 'green',
  },
  {
    icon: Globe,
    title: 'Works Everywhere',
    description: 'Access your business data anytime, anywhere. Your store is always at your fingertips.',
    points: [
      'Mobile responsive for on-the-go billing',
      'Cloud-based, access from anywhere',
      'Works offline with auto-sync',
    ],
    color: 'purple',
  },
  {
    icon: TrendingUp,
    title: 'Scale with Your Business',
    description: 'Whether you have one store or many, RYX Billing grows alongside your success.',
    points: [
      'Multi-store support',
      'Unlimited users with role management',
      'Enterprise-ready infrastructure',
    ],
    color: 'orange',
  },
]

// =============================================================================
// STATISTICS
// =============================================================================

export interface Stat {
  value: number
  suffix: string
  label: string
  description: string
}

export const stats: Stat[] = [
  { value: 500, suffix: '+', label: 'Active Businesses', description: 'Trust us daily' },
  { value: 1, suffix: 'M+', label: 'Bills Generated', description: 'And counting' },
  { value: 99.9, suffix: '%', label: 'Uptime', description: 'Guaranteed reliability' },
  { value: 24, suffix: '/7', label: 'Support', description: 'Always available' },
]

// =============================================================================
// INDUSTRIES / TRUSTED BY
// =============================================================================

export interface Industry {
  icon: LucideIcon
  name: string
}

export const industries: Industry[] = [
  { icon: Store, name: 'Retail Stores' },
  { icon: Scissors, name: 'Salons & Spas' },
  { icon: Wrench, name: 'Service Centers' },
  { icon: Coffee, name: 'Restaurants' },
  { icon: ShoppingBag, name: 'Boutiques' },
  { icon: Building2, name: 'Wholesale' },
]

// =============================================================================
// TESTIMONIALS
// =============================================================================

export interface Testimonial {
  name: string
  business: string
  location: string
  rating: number
  quote: string
}

export const testimonials: Testimonial[] = [
  {
    name: 'Rajesh Kumar',
    business: 'Kumar Electronics',
    location: 'Delhi',
    rating: 5,
    quote: 'RYX Billing transformed how we manage our retail store. The GST calculations are automatic and always accurate. We saved hours every week!',
  },
  {
    name: 'Priya Sharma',
    business: 'Sharma Textiles',
    location: 'Mumbai',
    rating: 5,
    quote: 'Finally, a billing software that understands Indian businesses. The low-stock alerts have saved us from countless lost sales. Highly recommended!',
  },
  {
    name: 'Amit Patel',
    business: 'Patel Service Center',
    location: 'Ahmedabad',
    rating: 5,
    quote: 'The customer analytics helped us identify our best customers and increase repeat purchases by 40%. The ROI has been incredible.',
  },
  {
    name: 'Sunita Reddy',
    business: 'Reddy Beauty Salon',
    location: 'Hyderabad',
    rating: 5,
    quote: 'Simple to use, yet powerful. My staff learned it in a day. The appointment booking combined with billing is a game-changer.',
  },
  {
    name: 'Mohammed Farhan',
    business: 'Farhan Auto Parts',
    location: 'Bangalore',
    rating: 5,
    quote: 'Managing 5000+ SKUs was a nightmare before RYX. Now inventory management is a breeze. Best investment for our business.',
  },
  {
    name: 'Kavita Joshi',
    business: 'Joshi General Store',
    location: 'Pune',
    rating: 5,
    quote: 'The offline mode is perfect for our area with unstable internet. Bills sync automatically when we are back online. Brilliant!',
  },
]

// =============================================================================
// FAQ
// =============================================================================

export interface FAQ {
  question: string
  answer: string
}

export const faqs: FAQ[] = [
  {
    question: 'Is RYX Billing GST compliant?',
    answer: 'Yes, RYX Billing is fully GST compliant with support for CGST, SGST, IGST, and CESS calculations. It automatically computes taxes based on your business location and customer location. HSN/SAC codes, GSTIN validation, and GST-ready invoice formats are all built-in.',
  },
  {
    question: 'Can I use it offline?',
    answer: 'Yes! RYX Billing works as a Progressive Web App (PWA) that functions offline. You can create bills, manage inventory, and serve customers even without internet. All data automatically syncs when you are back online, ensuring you never lose any transactions.',
  },
  {
    question: 'How many users can I add?',
    answer: 'You can add unlimited users with our plans. Each user can have customized role-based permissions, allowing you to control exactly who can access what. From cashiers who can only create bills to managers who can view reports, you have full control.',
  },
  {
    question: 'Is my data secure?',
    answer: 'Absolutely. We use bank-grade 256-bit SSL encryption for all data transfers. Your data is stored on secure cloud servers with daily backups. We also maintain complete audit logs of all actions for compliance and security purposes.',
  },
  {
    question: 'Can I import my existing data?',
    answer: 'Yes, we support bulk import from Excel and CSV files. You can import products, customers, and opening stock balances. Our import wizard guides you through the process, and our support team is available to help with data migration.',
  },
  {
    question: 'What payment methods are supported?',
    answer: 'RYX Billing supports all major payment methods including Cash, Card (Credit/Debit), UPI, Net Banking, Cheque, and Credit (customer credit). You can even split a single bill across multiple payment methods for maximum flexibility.',
  },
  {
    question: 'Do you provide customer support?',
    answer: 'Yes, we provide 24/7 customer support via chat, email, and phone. Our support team is based in India and understands the unique needs of Indian businesses. We also offer onboarding assistance and training for your team.',
  },
  {
    question: 'Can I cancel anytime?',
    answer: 'Absolutely. There are no long-term contracts or cancellation fees. You can cancel your subscription at any time. If you cancel, you will have access until the end of your billing period, and you can export all your data.',
  },
]

// =============================================================================
// FOOTER LINKS
// =============================================================================

export interface FooterLink {
  label: string
  href: string
}

export interface FooterSection {
  title: string
  links: FooterLink[]
}

export const footerSections: FooterSection[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Integrations', href: '#' },
      { label: 'Changelog', href: '#' },
      { label: 'Roadmap', href: '#' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation', href: '#' },
      { label: 'Help Center', href: '#' },
      { label: 'Blog', href: '#' },
      { label: 'Tutorials', href: '#' },
      { label: 'API Reference', href: '#' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Us', href: '#' },
      { label: 'Careers', href: '#' },
      { label: 'Contact', href: '#' },
      { label: 'Partners', href: '#' },
      { label: 'Press Kit', href: '#' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '#' },
      { label: 'Terms of Service', href: '#' },
      { label: 'Cookie Policy', href: '#' },
      { label: 'GDPR', href: '#' },
      { label: 'Security', href: '#' },
    ],
  },
]

// =============================================================================
// SOCIAL LINKS
// =============================================================================

export interface SocialLink {
  icon: LucideIcon
  href: string
  label: string
}

export const socialLinks: SocialLink[] = [
  { icon: Twitter, href: siteConfig.social.twitter, label: 'Twitter' },
  { icon: Linkedin, href: siteConfig.social.linkedin, label: 'LinkedIn' },
  { icon: Facebook, href: siteConfig.social.facebook, label: 'Facebook' },
  { icon: Instagram, href: siteConfig.social.instagram, label: 'Instagram' },
]

// =============================================================================
// HERO MOCKUP DATA
// =============================================================================

export const heroMockupStats = [
  { label: "Today's Sales", value: '₹45,230', color: 'from-primary-500 to-primary-600' },
  { label: 'Bills Created', value: '127', color: 'from-green-500 to-emerald-600' },
  { label: 'Customers', value: '89', color: 'from-purple-500 to-indigo-600' },
]

export const heroMockupBills = [
  { id: 'INV-001', customer: 'Kumar Electronics', amount: '₹12,450' },
  { id: 'INV-002', customer: 'Sharma Textiles', amount: '₹8,320' },
]

export const heroChartHeights = [40, 65, 45, 80, 55, 90, 70]
