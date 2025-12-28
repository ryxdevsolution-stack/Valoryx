'use client'

import { useState } from 'react'
import { ThemeProvider } from '@/contexts/ThemeContext'
import LandingNavbar from '@/components/landing/LandingNavbar'
import LandingFooter from '@/components/landing/LandingFooter'
import { motion } from 'framer-motion'
import {
  Book,
  Receipt,
  Package,
  Users,
  BarChart3,
  Printer,
  CreditCard,
  Shield,
  DollarSign,
  MessageSquare,
  Settings,
  HelpCircle,
  BookOpen,
  ChevronRight,
  ChevronDown,
  Home,
  ArrowLeft
} from 'lucide-react'
import Link from 'next/link'

// Documentation sections configuration
const docSections = [
  {
    id: 'landing',
    title: '1. Landing Page',
    icon: Home,
    subsections: [
      'Landing Page Sections',
      'Features Section',
      'Benefits Section',
      'Statistics Section',
      'Industries Served',
      'Testimonials Section',
      'FAQ Section',
      'Call to Action Section',
      'Footer'
    ]
  },
  {
    id: 'introduction',
    title: '2. Introduction',
    icon: Book,
    subsections: [
      'What is RYX Billing Software?',
      'Who is it for?',
      'Key Benefits'
    ]
  },
  {
    id: 'getting-started',
    title: '3. Getting Started',
    icon: BookOpen,
    subsections: [
      'System Requirements',
      'Logging In',
      'Dashboard Overview',
      'Navigation'
    ]
  },
  {
    id: 'billing',
    title: '4. Billing System',
    icon: Receipt,
    subsections: [
      'GST Billing',
      'Non-GST Billing',
      'Managing Bills',
      'Bill Exchange / Returns'
    ]
  },
  {
    id: 'inventory',
    title: '5. Inventory Management',
    icon: Package,
    subsections: [
      'Stock Overview',
      'Adding New Products',
      'Managing Stock',
      'Bulk Operations',
      'Low Stock Alerts'
    ]
  },
  {
    id: 'customers',
    title: '6. Customer Management',
    icon: Users,
    subsections: [
      'Adding Customers',
      'Managing Customers',
      'Quick Customer Selection'
    ]
  },
  {
    id: 'reports',
    title: '7. Reports & Analytics',
    icon: BarChart3,
    subsections: [
      'Sales Reports',
      'Analytics Dashboard',
      'Stock Reports',
      'Exporting Reports'
    ]
  },
  {
    id: 'printing',
    title: '8. Printing',
    icon: Printer,
    subsections: [
      'Thermal Printer Setup',
      'Printing Bills',
      'Troubleshooting Printing'
    ]
  },
  {
    id: 'payments',
    title: '9. Payment Options',
    icon: CreditCard,
    subsections: [
      'Cash Payment',
      'UPI Payment',
      'Card Payment',
      'Credit / Due Payment',
      'Partial Payment'
    ]
  },
  {
    id: 'roles',
    title: '10. User Roles & Permissions',
    icon: Shield,
    subsections: [
      'Role Types',
      'Permission Matrix',
      'What You Can See'
    ]
  },
  {
    id: 'expenses',
    title: '11. Expenses Module',
    icon: DollarSign,
    subsections: [
      'Adding Expenses',
      'Expense Categories',
      'Expense Reports'
    ]
  },
  {
    id: 'notes',
    title: '12. Notes & Comments',
    icon: MessageSquare,
    subsections: [
      'Adding Notes',
      'Use Cases'
    ]
  },
  {
    id: 'settings',
    title: '13. Settings',
    icon: Settings,
    subsections: [
      'General Settings',
      'Payment Types',
      'Bill Settings'
    ]
  },
  {
    id: 'troubleshooting',
    title: '14. Troubleshooting',
    icon: HelpCircle,
    subsections: [
      'Common Issues & Solutions',
      'Getting Help'
    ]
  },
  {
    id: 'glossary',
    title: '15. Glossary',
    icon: BookOpen,
    subsections: []
  }
]

// Documentation content for each section
const docContent: Record<string, React.ReactNode> = {
  'landing': (
    <div className="space-y-8">
      <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
        The landing page is the first page visitors see when they access RYX Billing. It showcases all the features and benefits of the software.
      </p>

      <div className="space-y-6">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Hero Section</h3>
        <p className="text-gray-600 dark:text-gray-300">The main welcome area with:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-300 ml-4">
          <li><strong>Tagline:</strong> &ldquo;Modern Billing for Modern Businesses&rdquo;</li>
          <li><strong>Description:</strong> GST-compliant invoicing, real-time inventory, and powerful analytics</li>
          <li><strong>Call to Action:</strong> Login / Register buttons</li>
          <li><strong>Live Demo Stats:</strong> Today&apos;s sales, bills created, customers</li>
        </ul>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Trust Indicators</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {['GST Compliant', 'Bank-grade Security', 'Made in India', 'ISO Certified'].map((badge) => (
            <div key={badge} className="bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 px-4 py-2 rounded-lg text-center text-sm font-medium">
              {badge}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Core Features</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { title: 'GST & Non-GST Billing', desc: 'Automated tax calculations with full GST compliance' },
            { title: 'Real-time Inventory', desc: 'Low-stock alerts, barcode scanning, seamless stock management' },
            { title: 'Customer Analytics', desc: 'Track customer behavior with predictive insights' },
            { title: 'Role-based Access', desc: 'Multi-tenant system with granular permissions' },
            { title: 'Flexible Payments', desc: 'Split payments across multiple methods' },
            { title: 'Direct Printing', desc: 'Thermal printer support with customizable receipts' },
            { title: 'Dark Mode', desc: 'Full dark mode support across all features' },
            { title: 'Bulk Operations', desc: 'Import and export data easily with Excel support' }
          ].map((feature) => (
            <div key={feature.title} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <h4 className="font-semibold text-gray-900 dark:text-white">{feature.title}</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Key Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { value: '500+', label: 'Active Businesses' },
            { value: '1M+', label: 'Bills Generated' },
            { value: '99.9%', label: 'Uptime' },
            { value: '24/7', label: 'Support' }
          ].map((stat) => (
            <div key={stat.label} className="text-center p-4 bg-gradient-to-br from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 rounded-lg">
              <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">{stat.value}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Industries We Serve</h3>
        <div className="flex flex-wrap gap-3">
          {['Retail Stores', 'Salons & Spas', 'Service Centers', 'Restaurants', 'Boutiques', 'Wholesale Distributors'].map((industry) => (
            <span key={industry} className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-full text-sm">
              {industry}
            </span>
          ))}
        </div>
      </div>
    </div>
  ),

  'introduction': (
    <div className="space-y-8">
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">What is RYX Billing Software?</h3>
        <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
          RYX Billing is a comprehensive billing and inventory management software designed for retail businesses in India. It helps you manage your daily billing operations, track inventory, handle GST compliance, and generate business reports.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Who is it for?</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-300 ml-4">
          <li>Retail Shops</li>
          <li>Supermarkets</li>
          <li>Pharmacies</li>
          <li>Trading Companies</li>
          <li>Wholesale Distributors</li>
          <li>Any business that needs billing and stock management</li>
        </ul>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Key Benefits</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Benefit</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {[
                { benefit: 'Fast Billing', desc: 'Create bills quickly with barcode scanning and quick product search' },
                { benefit: 'GST Compliant', desc: 'Automatic GST calculation with all tax rates (5%, 12%, 18%, 28%)' },
                { benefit: 'Real-time Stock', desc: 'Stock updates automatically when you create a bill' },
                { benefit: 'Multi-user', desc: 'Multiple staff members can work simultaneously' },
                { benefit: 'Thermal Printing', desc: 'Direct printing to thermal receipt printers' },
                { benefit: 'Secure Data', desc: 'Role-based access and complete audit trail' },
                { benefit: 'Reports', desc: 'Daily, weekly, monthly sales and stock reports' }
              ].map((row) => (
                <tr key={row.benefit}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{row.benefit}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),

  'getting-started': (
    <div className="space-y-8">
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">System Requirements</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Component</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Requirement</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              <tr>
                <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">Operating System</td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">Windows 10/11 or Linux</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">Browser</td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">Chrome, Firefox, or Edge (latest version)</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">Internet</td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">Required for cloud version</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">Printer</td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">Any thermal printer (58mm/80mm) for receipts</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Logging In</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 dark:text-gray-300 ml-4">
          <li>Open the RYX Billing application</li>
          <li>Enter your <strong>Email</strong> address</li>
          <li>Enter your <strong>Password</strong></li>
          <li>Click <strong>Login</strong></li>
        </ol>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <p className="text-blue-700 dark:text-blue-300 text-sm">
            <strong>Note:</strong> Your login credentials are provided by your administrator.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Dashboard Overview</h3>
        <p className="text-gray-600 dark:text-gray-300">After logging in, you will see the main dashboard with:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { title: 'Sidebar Menu', desc: 'Navigation to all features (Billing, Stock, Customers, Reports, etc.)' },
            { title: 'Quick Stats', desc: "Today's sales, total bills, pending payments" },
            { title: 'Alerts', desc: 'Low stock warnings, draft bills, notifications' },
            { title: 'Quick Actions', desc: 'Create new bill, add stock, view reports' }
          ].map((item) => (
            <div key={item.title} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <h4 className="font-semibold text-gray-900 dark:text-white">{item.title}</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Navigation</h3>
        <p className="text-gray-600 dark:text-gray-300">The sidebar menu provides access to all modules:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-300 ml-4">
          <li><strong>Dashboard</strong> - Overview and quick stats</li>
          <li><strong>Billing</strong> - Create and manage bills</li>
          <li><strong>Inventory</strong> - Manage products and stock</li>
          <li><strong>Customers</strong> - Customer database</li>
          <li><strong>Reports</strong> - Sales and stock reports</li>
          <li><strong>Expenses</strong> - Track business expenses</li>
          <li><strong>Settings</strong> - Configuration options</li>
        </ul>
      </div>
    </div>
  ),

  'billing': (
    <div className="space-y-8">
      <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
        The billing system is the core of RYX Billing. It supports both GST and Non-GST billing.
      </p>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">GST Billing</h3>
        <p className="text-gray-600 dark:text-gray-300">GST billing is used when you need to issue tax invoices with GST breakdown.</p>

        <h4 className="font-semibold text-gray-800 dark:text-gray-200">When to Use GST Billing:</h4>
        <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-300 ml-4">
          <li>B2B (Business to Business) transactions</li>
          <li>When customer needs a tax invoice</li>
          <li>Transactions above a certain amount</li>
          <li>When customer provides GSTIN</li>
        </ul>

        <h4 className="font-semibold text-gray-800 dark:text-gray-200 mt-4">Creating a GST Bill - Step by Step:</h4>
        <div className="space-y-4 mt-4">
          {[
            { step: 1, title: 'Open Billing Page', desc: 'Click on Billing in the sidebar, select GST Billing or Create New Bill' },
            { step: 2, title: 'Add Customer Details', desc: 'Enter Customer Name, Phone Number, GSTIN (for B2B), and Address' },
            { step: 3, title: 'Add Products', desc: 'Search product by name or barcode, enter quantity, product rate and GST are automatically applied' },
            { step: 4, title: 'Review Bill', desc: 'Check item-wise breakdown, subtotal, GST amount, discount, and final amount' },
            { step: 5, title: 'Apply Discount (Optional)', desc: 'Apply percentage discount or flat amount reduction' },
            { step: 6, title: 'Select Payment Method', desc: 'Choose Cash, UPI, Card, or Credit (Due payment)' },
            { step: 7, title: 'Save & Print', desc: 'Click Save Bill, bill is automatically saved and stock is reduced' }
          ].map((item) => (
            <div key={item.step} className="flex gap-4 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <div className="flex-shrink-0 w-8 h-8 bg-primary-500 text-white rounded-full flex items-center justify-center font-bold">
                {item.step}
              </div>
              <div>
                <h5 className="font-semibold text-gray-900 dark:text-white">{item.title}</h5>
                <p className="text-sm text-gray-600 dark:text-gray-400">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">GST Rates Explained</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Typically Used For</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              <tr><td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">5%</td><td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">Essential items, food products</td></tr>
              <tr><td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">12%</td><td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">Processed food, electronics</td></tr>
              <tr><td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">18%</td><td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">Most goods and services</td></tr>
              <tr><td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">28%</td><td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">Luxury items, automobiles</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Non-GST Billing</h3>
        <p className="text-gray-600 dark:text-gray-300">Non-GST billing is used for simple sales without tax breakdown.</p>
        <h4 className="font-semibold text-gray-800 dark:text-gray-200">When to Use:</h4>
        <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-300 ml-4">
          <li>Small cash transactions</li>
          <li>When GST is not applicable</li>
          <li>Quick sales to walk-in customers</li>
          <li>Internal transactions</li>
        </ul>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Managing Bills</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-300 ml-4">
          <li><strong>Viewing All Bills:</strong> Go to Billing &gt; All Bills to see list of all bills with Bill Number, Customer Name, Date, Amount, Payment Status</li>
          <li><strong>Searching Bills:</strong> Search by bill number, customer name, filter by date range or payment type</li>
          <li><strong>Editing a Bill:</strong> Open the bill, click Edit, make changes, Save (may be restricted based on role)</li>
          <li><strong>Cancelling a Bill:</strong> Cancelled bills are not deleted but marked as cancelled for audit purposes</li>
          <li><strong>Draft Bills:</strong> Incomplete bills are saved as drafts and can be resumed later</li>
        </ul>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Bill Exchange / Returns</h3>
        <p className="text-gray-600 dark:text-gray-300">When a customer wants to exchange or return products:</p>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 dark:text-gray-300 ml-4">
          <li>Go to Billing &gt; Exchange</li>
          <li>Find the original bill</li>
          <li>Select items to return</li>
          <li>Add new items (if exchanging)</li>
          <li>Calculate difference</li>
          <li>Complete the exchange</li>
        </ol>
      </div>
    </div>
  ),

  'inventory': (
    <div className="space-y-8">
      <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
        The inventory module helps you track all your products and stock levels.
      </p>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Stock Overview</h3>
        <p className="text-gray-600 dark:text-gray-300">The inventory page shows:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-300 ml-4">
          <li>Total products</li>
          <li>Total stock value</li>
          <li>Low stock items</li>
          <li>Category-wise breakdown</li>
        </ul>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Adding New Products</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Field</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Required</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {[
                { field: 'Product Name', desc: 'Name of the product', required: 'Yes' },
                { field: 'Category', desc: 'Product category (e.g., Electronics, Grocery)', required: 'Yes' },
                { field: 'Cost Price', desc: 'Your purchase price', required: 'Yes' },
                { field: 'Selling Rate', desc: 'Price you sell at', required: 'Yes' },
                { field: 'MRP', desc: 'Maximum Retail Price', required: 'Optional' },
                { field: 'Quantity', desc: 'Current stock quantity', required: 'Yes' },
                { field: 'Unit', desc: 'Unit of measurement (Pcs, Kg, Ltr, etc.)', required: 'Yes' },
                { field: 'GST Percentage', desc: 'GST rate (5%, 12%, 18%, 28%)', required: 'For GST' },
                { field: 'HSN Code', desc: 'Harmonized System Nomenclature code', required: 'For GST' },
                { field: 'Barcode', desc: 'Product barcode number', required: 'Optional' },
                { field: 'Low Stock Alert', desc: 'Quantity at which to show alert', required: 'Optional' }
              ].map((row) => (
                <tr key={row.field}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{row.field}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{row.desc}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{row.required}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Managing Stock</h3>
        <div className="space-y-4">
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h4 className="font-semibold text-green-800 dark:text-green-300">Adding Stock</h4>
            <p className="text-green-700 dark:text-green-400 text-sm">When new stock arrives: Find the product &gt; Click Add Stock &gt; Enter quantity &gt; Stock is automatically increased</p>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <h4 className="font-semibold text-yellow-800 dark:text-yellow-300">Stock Adjustment</h4>
            <p className="text-yellow-700 dark:text-yellow-400 text-sm">For corrections or damaged goods, enter adjustment reason and stock is updated</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h4 className="font-semibold text-blue-800 dark:text-blue-300">Automatic Stock Reduction</h4>
            <p className="text-blue-700 dark:text-blue-400 text-sm">When you create a bill, stock is automatically reduced - no manual intervention needed!</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Bulk Operations</h3>
        <p className="text-gray-600 dark:text-gray-300"><strong>Importing Products from Excel:</strong></p>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 dark:text-gray-300 ml-4">
          <li>Download the Excel template</li>
          <li>Fill in your product data</li>
          <li>Upload the file</li>
          <li>Products are added in bulk</li>
        </ol>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Low Stock Alerts</h3>
        <p className="text-gray-600 dark:text-gray-300">
          The system automatically alerts you when product quantity falls below the set threshold. Alerts are shown on dashboard to help you reorder in time.
        </p>
      </div>
    </div>
  ),

  'customers': (
    <div className="space-y-8">
      <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
        Keep track of all your customers and their purchase history.
      </p>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Adding Customers</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Field</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {[
                { field: 'Customer Name', desc: 'Full name' },
                { field: 'Phone Number', desc: 'Contact number' },
                { field: 'Email', desc: 'Email address' },
                { field: 'Address', desc: 'Full address' },
                { field: 'City', desc: 'City name' },
                { field: 'State', desc: 'State name' },
                { field: 'GSTIN', desc: 'GST number (for B2B customers)' }
              ].map((row) => (
                <tr key={row.field}>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{row.field}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Managing Customers</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-300 ml-4">
          <li>View all customers in a list</li>
          <li>Search by name or phone</li>
          <li>Edit customer details</li>
          <li>View purchase history</li>
        </ul>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Quick Customer Selection in Billing</h3>
        <p className="text-gray-600 dark:text-gray-300">
          When creating a bill, start typing customer name or phone and select from suggestions - customer details will auto-fill!
        </p>
      </div>
    </div>
  ),

  'reports': (
    <div className="space-y-8">
      <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
        Generate reports to understand your business performance.
      </p>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Sales Reports</h3>
        <p className="text-gray-600 dark:text-gray-300">Available reports:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-300 ml-4">
          <li><strong>Daily Sales</strong> - All sales for a specific day</li>
          <li><strong>Weekly Sales</strong> - Week-wise summary</li>
          <li><strong>Monthly Sales</strong> - Month-wise summary</li>
          <li><strong>Custom Date Range</strong> - Select any date range</li>
        </ul>
        <p className="text-gray-600 dark:text-gray-300 mt-4">Reports show:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-300 ml-4">
          <li>Total bills created</li>
          <li>Total sales amount</li>
          <li>GST collected</li>
          <li>Payment method breakdown</li>
          <li>Top selling products</li>
        </ul>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Analytics Dashboard</h3>
        <p className="text-gray-600 dark:text-gray-300">Visual analytics include:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { title: 'Revenue Trend', desc: 'Sales graph over time' },
            { title: 'Top Products', desc: 'Best selling items' },
            { title: 'Payment Analysis', desc: 'Cash vs UPI vs Card breakdown' },
            { title: 'Comparison', desc: 'Compare periods' }
          ].map((item) => (
            <div key={item.title} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <h4 className="font-semibold text-gray-900 dark:text-white">{item.title}</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Stock Reports</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-300 ml-4">
          <li><strong>Inventory Valuation</strong> - Total value of current stock</li>
          <li><strong>Low Stock Report</strong> - Products running low</li>
          <li><strong>Stock Movement</strong> - In/out history</li>
        </ul>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Exporting Reports</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h4 className="font-semibold text-green-800 dark:text-green-300">Excel (.xlsx)</h4>
            <p className="text-green-700 dark:text-green-400 text-sm">For further analysis, accounting</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <h4 className="font-semibold text-red-800 dark:text-red-300">PDF</h4>
            <p className="text-red-700 dark:text-red-400 text-sm">For printing, sharing</p>
          </div>
        </div>
      </div>
    </div>
  ),

  'printing': (
    <div className="space-y-8">
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Thermal Printer Setup</h3>
        <p className="text-gray-600 dark:text-gray-300">RYX Billing supports thermal receipt printers.</p>

        <h4 className="font-semibold text-gray-800 dark:text-gray-200">Supported Printers:</h4>
        <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-300 ml-4">
          <li>58mm thermal printers</li>
          <li>80mm thermal printers</li>
          <li>Any Windows-compatible receipt printer</li>
        </ul>

        <h4 className="font-semibold text-gray-800 dark:text-gray-200 mt-4">Setup Steps:</h4>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 dark:text-gray-300 ml-4">
          <li>Connect printer to computer</li>
          <li>Install printer drivers (if required)</li>
          <li>Printer is automatically detected by the software</li>
          <li>Test print to verify</li>
        </ol>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Printing Bills</h3>
        <h4 className="font-semibold text-gray-800 dark:text-gray-200">Print Options:</h4>
        <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-300 ml-4">
          <li><strong>Print Preview</strong> - See how bill will look before printing</li>
          <li><strong>Direct Print</strong> - Print immediately without preview</li>
          <li><strong>Silent Print</strong> - Print without any dialogs</li>
        </ul>

        <h4 className="font-semibold text-gray-800 dark:text-gray-200 mt-4">Receipt Contents:</h4>
        <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-300 ml-4">
          <li>Business name and details</li>
          <li>Bill number and date</li>
          <li>Customer information</li>
          <li>Item-wise breakdown</li>
          <li>GST details (for GST bills)</li>
          <li>Payment information</li>
          <li>Thank you message</li>
        </ul>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Troubleshooting Printing</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Problem</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Solution</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              <tr><td className="px-6 py-4 text-sm text-gray-900 dark:text-white">Printer not detected</td><td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">Check USB connection, restart application</td></tr>
              <tr><td className="px-6 py-4 text-sm text-gray-900 dark:text-white">Blank prints</td><td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">Check paper roll, clean print head</td></tr>
              <tr><td className="px-6 py-4 text-sm text-gray-900 dark:text-white">Partial prints</td><td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">Check paper width settings</td></tr>
              <tr><td className="px-6 py-4 text-sm text-gray-900 dark:text-white">Slow printing</td><td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">Close other applications</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),

  'payments': (
    <div className="space-y-8">
      <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
        RYX Billing supports multiple payment methods for flexibility.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-green-800 dark:text-green-300 mb-2">Cash Payment</h3>
          <p className="text-green-700 dark:text-green-400 text-sm">Customer pays full amount in cash. No additional details required.</p>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-300 mb-2">UPI Payment</h3>
          <p className="text-blue-700 dark:text-blue-400 text-sm">Customer pays via UPI apps (GPay, PhonePe, Paytm, etc.). Can add transaction reference.</p>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-purple-800 dark:text-purple-300 mb-2">Card Payment</h3>
          <p className="text-purple-700 dark:text-purple-400 text-sm">Credit/Debit card payments. Can add last 4 digits for reference.</p>
        </div>

        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-orange-800 dark:text-orange-300 mb-2">Credit / Due Payment</h3>
          <p className="text-orange-700 dark:text-orange-400 text-sm">Customer pays later. Bill is saved with &ldquo;Due&rdquo; status. Track pending payments and mark as paid when received.</p>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Partial Payment</h3>
        <p className="text-gray-600 dark:text-gray-300 text-sm">Customer pays part of the amount. Remaining is marked as due. Track amount received vs pending.</p>
      </div>
    </div>
  ),

  'roles': (
    <div className="space-y-8">
      <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
        RYX Billing has a role-based access system to control what each user can do.
      </p>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Role Types</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { role: 'Staff', desc: 'Basic billing and viewing', color: 'blue' },
            { role: 'Manager', desc: 'Billing + Stock management + Reports', color: 'green' },
            { role: 'Admin', desc: 'All features + User management', color: 'purple' },
            { role: 'Finance', desc: 'Payment and financial reports', color: 'orange' }
          ].map((item) => (
            <div key={item.role} className={`bg-${item.color}-50 dark:bg-${item.color}-900/20 border border-${item.color}-200 dark:border-${item.color}-800 rounded-lg p-4`}>
              <h4 className={`font-semibold text-${item.color}-800 dark:text-${item.color}-300`}>{item.role}</h4>
              <p className={`text-sm text-${item.color}-700 dark:text-${item.color}-400`}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Permission Matrix</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Feature</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Staff</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Manager</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Admin</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Finance</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {[
                { feature: 'Create Bills', staff: true, manager: true, admin: true, finance: true },
                { feature: 'Edit Bills', staff: false, manager: true, admin: true, finance: false },
                { feature: 'Cancel Bills', staff: false, manager: true, admin: true, finance: false },
                { feature: 'View Stock', staff: true, manager: true, admin: true, finance: true },
                { feature: 'Add Stock', staff: false, manager: true, admin: true, finance: false },
                { feature: 'Add Products', staff: false, manager: true, admin: true, finance: false },
                { feature: 'View Customers', staff: true, manager: true, admin: true, finance: true },
                { feature: 'View Reports', staff: false, manager: true, admin: true, finance: true },
                { feature: 'Manage Users', staff: false, manager: false, admin: true, finance: false },
                { feature: 'System Settings', staff: false, manager: false, admin: true, finance: false }
              ].map((row) => (
                <tr key={row.feature}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{row.feature}</td>
                  <td className="px-4 py-3 text-center">{row.staff ? <span className="text-green-500">&#10003;</span> : <span className="text-red-500">&#10007;</span>}</td>
                  <td className="px-4 py-3 text-center">{row.manager ? <span className="text-green-500">&#10003;</span> : <span className="text-red-500">&#10007;</span>}</td>
                  <td className="px-4 py-3 text-center">{row.admin ? <span className="text-green-500">&#10003;</span> : <span className="text-red-500">&#10007;</span>}</td>
                  <td className="px-4 py-3 text-center">{row.finance ? <span className="text-green-500">&#10003;</span> : <span className="text-red-500">&#10007;</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="font-semibold text-blue-800 dark:text-blue-300">What You Can See</h4>
        <p className="text-blue-700 dark:text-blue-400 text-sm">
          Based on your role, some menu items may be hidden, some buttons may be disabled, and some data may be restricted.
        </p>
      </div>
    </div>
  ),

  'expenses': (
    <div className="space-y-8">
      <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
        Track your business expenses separately from sales.
      </p>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Adding Expenses</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Field</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {[
                { field: 'Expense Title', desc: 'What the expense is for' },
                { field: 'Amount', desc: 'Expense amount' },
                { field: 'Category', desc: 'Type (Rent, Utilities, Supplies, etc.)' },
                { field: 'Date', desc: 'When the expense occurred' },
                { field: 'Notes', desc: 'Additional details' }
              ].map((row) => (
                <tr key={row.field}>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{row.field}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Expense Categories</h3>
        <div className="flex flex-wrap gap-2">
          {['Rent', 'Utilities (Electricity, Water)', 'Salaries', 'Supplies', 'Transport', 'Marketing', 'Maintenance', 'Others'].map((cat) => (
            <span key={cat} className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-3 py-1 rounded-full text-sm">
              {cat}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Expense Reports</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-300 ml-4">
          <li>View all expenses by date range</li>
          <li>Category-wise breakdown</li>
          <li>Monthly expense summary</li>
          <li>Export to Excel</li>
        </ul>
      </div>
    </div>
  ),

  'notes': (
    <div className="space-y-8">
      <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
        Add notes to bills for internal reference.
      </p>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Adding Notes</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-600 dark:text-gray-300 ml-4">
          <li>Open any bill</li>
          <li>Click <strong>Add Note</strong></li>
          <li>Type your note</li>
          <li>Save</li>
        </ol>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Use Cases</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            'Special instructions',
            'Customer requests',
            'Follow-up reminders',
            'Delivery notes',
            'Internal communication'
          ].map((useCase) => (
            <div key={useCase} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-center">
              <span className="text-gray-700 dark:text-gray-300">{useCase}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),

  'settings': (
    <div className="space-y-8">
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">General Settings</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Setting</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {[
                { setting: 'Business Name', desc: 'Your company name (shown on receipts)' },
                { setting: 'Address', desc: 'Business address' },
                { setting: 'Phone', desc: 'Contact number' },
                { setting: 'GST Number', desc: 'Your GSTIN' },
                { setting: 'Logo', desc: 'Business logo for receipts' }
              ].map((row) => (
                <tr key={row.setting}>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{row.setting}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Payment Types</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-300 ml-4">
          <li>Add custom payment types</li>
          <li>Enable/disable payment options</li>
          <li>Set default payment method</li>
        </ul>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Bill Settings</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-300 ml-4">
          <li>Bill number prefix</li>
          <li>Starting bill number</li>
          <li>Receipt message</li>
          <li>Terms and conditions</li>
        </ul>
      </div>
    </div>
  ),

  'troubleshooting': (
    <div className="space-y-8">
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Common Issues & Solutions</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Issue</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Solution</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {[
                { issue: 'Cannot login', solution: 'Check email/password, contact admin for password reset' },
                { issue: 'Bill not saving', solution: 'Check internet connection, try again' },
                { issue: 'Stock not updating', solution: 'Refresh the page, check if bill was saved' },
                { issue: 'Printer not working', solution: 'Check connection, restart application' },
                { issue: 'Page loading slow', solution: 'Clear browser cache, check internet speed' },
                { issue: 'Report not generating', solution: 'Try smaller date range, check filters' }
              ].map((row) => (
                <tr key={row.issue}>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{row.issue}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">{row.solution}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-300 mb-2">Getting Help</h3>
        <p className="text-blue-700 dark:text-blue-400 text-sm mb-4">If you face any issue:</p>
        <ol className="list-decimal list-inside space-y-2 text-blue-700 dark:text-blue-400 text-sm">
          <li>Check this guide first</li>
          <li>Contact your administrator</li>
          <li>Contact support team at <strong>support@ryxbilling.com</strong></li>
        </ol>
      </div>
    </div>
  ),

  'glossary': (
    <div className="space-y-8">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Term</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Meaning</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {[
              { term: 'GST', meaning: "Goods and Services Tax - India's indirect tax" },
              { term: 'GSTIN', meaning: 'GST Identification Number - Unique 15-digit tax ID' },
              { term: 'HSN Code', meaning: 'Harmonized System Nomenclature - Product classification code' },
              { term: 'MRP', meaning: 'Maximum Retail Price - Maximum price at which product can be sold' },
              { term: 'Bill Number', meaning: 'Unique identifier for each bill' },
              { term: 'SKU', meaning: 'Stock Keeping Unit - Unique product identifier' },
              { term: 'Barcode', meaning: 'Machine-readable product code' },
              { term: 'Thermal Printer', meaning: 'Printer that uses heat to print on special paper' },
              { term: 'POS', meaning: 'Point of Sale - Where transactions happen' },
              { term: 'Audit Trail', meaning: 'Record of all actions for accountability' },
              { term: 'Credit Sale', meaning: 'Sale where payment is received later' },
              { term: 'Stock Entry', meaning: 'Record of product and its quantity' }
            ].map((row) => (
              <tr key={row.term}>
                <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{row.term}</td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">{row.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('landing')
  const [expandedSections, setExpandedSections] = useState<string[]>(['landing'])

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    )
  }

  const currentSection = docSections.find(s => s.id === activeSection)

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white">
        <LandingNavbar />

        <main className="pt-20">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary-500 to-blue-600 py-12">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-4 mb-4">
                <Link
                  href="/landing"
                  className="text-white/80 hover:text-white flex items-center gap-2 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Home
                </Link>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
                RYX Billing Documentation
              </h1>
              <p className="text-white/80 text-lg max-w-2xl">
                Complete user guide for RYX Billing Software. Learn about all features and how to use them effectively.
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Sidebar Navigation */}
              <aside className="lg:w-72 flex-shrink-0">
                <div className="sticky top-24 bg-gray-50 dark:bg-gray-900 rounded-xl p-4 max-h-[calc(100vh-120px)] overflow-y-auto">
                  <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Book className="w-5 h-5" />
                    Table of Contents
                  </h2>
                  <nav className="space-y-1">
                    {docSections.map((section) => (
                      <div key={section.id}>
                        <button
                          onClick={() => {
                            setActiveSection(section.id)
                            toggleSection(section.id)
                          }}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                            activeSection === section.id
                              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <section.icon className="w-4 h-4" />
                            <span className="truncate">{section.title}</span>
                          </span>
                          {section.subsections.length > 0 && (
                            expandedSections.includes(section.id)
                              ? <ChevronDown className="w-4 h-4 flex-shrink-0" />
                              : <ChevronRight className="w-4 h-4 flex-shrink-0" />
                          )}
                        </button>
                        {expandedSections.includes(section.id) && section.subsections.length > 0 && (
                          <div className="ml-6 mt-1 space-y-1">
                            {section.subsections.map((sub) => (
                              <button
                                key={sub}
                                onClick={() => setActiveSection(section.id)}
                                className="w-full text-left px-3 py-1.5 text-xs text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors truncate"
                              >
                                {sub}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </nav>
                </div>
              </aside>

              {/* Main Content */}
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="flex-1 min-w-0"
              >
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 md:p-8">
                  {currentSection && (
                    <>
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                          <currentSection.icon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                          {currentSection.title}
                        </h2>
                      </div>

                      {docContent[activeSection]}
                    </>
                  )}
                </div>

                {/* Navigation Buttons */}
                <div className="flex justify-between mt-6">
                  {docSections.findIndex(s => s.id === activeSection) > 0 && (
                    <button
                      onClick={() => {
                        const currentIndex = docSections.findIndex(s => s.id === activeSection)
                        if (currentIndex > 0) {
                          setActiveSection(docSections[currentIndex - 1].id)
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Previous
                    </button>
                  )}
                  <div className="flex-1" />
                  {docSections.findIndex(s => s.id === activeSection) < docSections.length - 1 && (
                    <button
                      onClick={() => {
                        const currentIndex = docSections.findIndex(s => s.id === activeSection)
                        if (currentIndex < docSections.length - 1) {
                          setActiveSection(docSections[currentIndex + 1].id)
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            </div>
          </div>
        </main>

        <LandingFooter />
      </div>
    </ThemeProvider>
  )
}
