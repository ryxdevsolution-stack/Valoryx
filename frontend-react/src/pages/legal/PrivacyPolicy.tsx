import LegalLayout, { Section, List } from '@/components/landing/LegalLayout'
import { siteConfig } from '@/config/landing.config'

const LAST_UPDATED = 'June 5, 2026'

/**
 * Public Privacy Policy. Reflects how Valoryx actually handles data:
 * offline-first local storage that syncs to the cloud, business data the
 * shop enters, and the email captured at download. Contact details are
 * sourced from siteConfig so they stay in sync with the rest of the site.
 */
export default function PrivacyPolicy() {
  const { name, contact } = siteConfig

  return (
    <LegalLayout title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <Section heading="1. Introduction">
        <p>
          {name} (&quot;{name}&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) provides a
          point-of-sale and business-management application for retail shops, supermarkets, and
          multi-outlet chains. This Privacy Policy explains what information we collect, how we use
          it, and the choices you have. By using {name}, you agree to the practices described here.
        </p>
      </Section>

      <Section heading="2. Information We Collect">
        <p>We collect the following categories of information:</p>
        <List
          items={[
            <>
              <strong>Account information</strong> — your name, email address, phone number, and shop
              details provided when you register or are invited to a workspace.
            </>,
            <>
              <strong>Business data you enter</strong> — bills and invoices, products and stock,
              customers, suppliers, deliveries, expenses, employees, payroll, and notes. This is your
              data; you control it.
            </>,
            <>
              <strong>Download lead information</strong> — if you provide your email to download the
              desktop app, we store that email to send you your download link and product updates.
            </>,
            <>
              <strong>Usage &amp; device information</strong> — basic technical data such as IP
              address, login times, device/browser type, and session activity, used for security and
              reliability.
            </>,
            <>
              <strong>Payment information</strong> — processed by our payment provider. We do not store
              full card numbers on our servers.
            </>,
          ]}
        />
      </Section>

      <Section heading="3. Offline-First Storage &amp; Cloud Sync">
        <p>
          {name} is offline-first. In offline mode your data is stored locally on your own device so
          the app keeps working without an internet connection. When a connection is available, data
          is synced to our cloud database so it is backed up and available across your devices. You
          are responsible for the physical security of devices that hold local copies of your data.
        </p>
      </Section>

      <Section heading="4. How We Use Your Information">
        <List
          items={[
            'To provide, operate, and maintain the application and its features.',
            'To authenticate users, enforce permissions, and keep your account secure.',
            'To sync, back up, and restore your business data.',
            'To process subscriptions and payments.',
            'To respond to support requests and send service-related communications.',
            'To improve performance, fix bugs, and develop new features.',
          ]}
        />
      </Section>

      <Section heading="5. How We Share Information">
        <p>
          We do not sell your personal information. We share data only with service providers who help
          us operate {name}, under appropriate confidentiality obligations:
        </p>
        <List
          items={[
            'Cloud hosting and database providers (for cloud sync and backups).',
            'Payment gateway providers (to process subscription payments).',
            'Email/communication providers (to send transactional and account emails).',
            'Authorities, where required by law or to protect rights, safety, and security.',
          ]}
        />
      </Section>

      <Section heading="6. Data Security">
        <p>
          We apply industry-standard safeguards including encrypted connections, two-factor
          authentication (2FA), role-based access control, session and IP tracking, and a full audit
          trail of changes. No method of transmission or storage is completely secure, but we work to
          protect your information and limit access to it.
        </p>
      </Section>

      <Section heading="7. Data Retention">
        <p>
          We retain your data for as long as your account is active or as needed to provide the
          service. Important records use soft deletion so they can be restored and audited; you may
          request permanent deletion of your account and associated data, subject to legal and
          accounting retention requirements.
        </p>
      </Section>

      <Section heading="8. Your Rights">
        <p>
          Subject to applicable law, you may request to access, correct, export, or delete your
          personal information, and withdraw consent for non-essential communications. To exercise
          these rights, contact us using the details below.
        </p>
      </Section>

      <Section heading="9. Cookies &amp; Local Storage">
        <p>
          We use cookies and browser local storage to keep you signed in, remember preferences, and
          enable offline functionality. You can control cookies through your browser settings, though
          some features may not work without them.
        </p>
      </Section>

      <Section heading="10. Children's Privacy">
        <p>
          {name} is a business tool and is not directed to individuals under 18. We do not knowingly
          collect personal information from children.
        </p>
      </Section>

      <Section heading="11. Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time. Material changes will be reflected by
          updating the &quot;Last updated&quot; date above and, where appropriate, by additional
          notice.
        </p>
      </Section>

      <Section heading="12. Contact Us">
        <p>If you have questions about this Privacy Policy or your data, contact us at:</p>
        <List
          items={[
            <>
              Email: <a href={`mailto:${contact.email}`} className="text-accent-blue hover:underline">{contact.email}</a>
            </>,
            <>Phone: {contact.phone}</>,
            <>Address: {contact.address}</>,
          ]}
        />
      </Section>
    </LegalLayout>
  )
}
