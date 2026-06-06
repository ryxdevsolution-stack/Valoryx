import LegalLayout, { Section, List } from '@/components/landing/LegalLayout'
import { siteConfig } from '@/config/landing.config'

const LAST_UPDATED = 'June 5, 2026'

/**
 * Public Terms of Service. Describes the offline-first service, account and
 * billing terms, data ownership, the offline/sync disclaimer, and India
 * governing law. Contact details come from siteConfig.
 */
export default function TermsOfService() {
  const { name, contact } = siteConfig

  return (
    <LegalLayout title="Terms of Service" lastUpdated={LAST_UPDATED}>
      <Section heading="1. Acceptance of Terms">
        <p>
          These Terms of Service (&quot;Terms&quot;) govern your access to and use of {name} (the
          &quot;Service&quot;). By creating an account, downloading, or using the Service, you agree
          to these Terms. If you do not agree, do not use the Service.
        </p>
      </Section>

      <Section heading="2. The Service">
        <p>
          {name} is a point-of-sale and business-management application offering billing, inventory,
          stock transfers, suppliers, customers, expenses, payroll, reporting, and related features.
          The Service works online and offline: it can run on local storage without an internet
          connection and syncs to the cloud when connectivity is available.
        </p>
      </Section>

      <Section heading="3. Accounts &amp; Responsibilities">
        <List
          items={[
            'You must provide accurate information and keep your account credentials secure.',
            'You are responsible for all activity under your account and for your users’ access and permissions.',
            'You must comply with applicable laws, including tax and GST obligations relevant to your business.',
            'Notify us promptly of any unauthorized use of your account.',
          ]}
        />
      </Section>

      <Section heading="4. Subscriptions, Trials &amp; Billing">
        <List
          items={[
            'Paid plans are billed in advance on the cycle shown at purchase (monthly, yearly, or lifetime).',
            'Free trials and free tiers may have feature or usage limits that can change over time.',
            'Fees are non-refundable except where required by law or expressly stated.',
            'We may change pricing with reasonable advance notice for upcoming billing periods.',
          ]}
        />
      </Section>

      <Section heading="5. Your Data &amp; Ownership">
        <p>
          You retain ownership of the business data you enter into {name}. You grant us a limited
          license to host, process, and sync that data solely to provide and improve the Service. We
          handle your data as described in our Privacy Policy.
        </p>
      </Section>

      <Section heading="6. Offline Mode, Sync &amp; Backups">
        <p>
          When used offline, your data is stored on your device and synced to the cloud once a
          connection is available. While we provide sync and backup features, you are responsible for
          maintaining your own backups and for the security of devices holding local data. We are not
          liable for data loss resulting from device failure, uninstallation, or actions outside our
          reasonable control.
        </p>
      </Section>

      <Section heading="7. Acceptable Use">
        <p>You agree not to:</p>
        <List
          items={[
            'Use the Service for unlawful, fraudulent, or harmful purposes.',
            'Attempt to reverse engineer, copy, resell, or disrupt the Service.',
            'Access another organization’s data without authorization.',
            'Upload malware or interfere with the Service’s security or performance.',
          ]}
        />
      </Section>

      <Section heading="8. Intellectual Property">
        <p>
          The Service, including its software, design, and branding, is owned by {name} and its
          licensors and is protected by intellectual-property laws. These Terms do not grant you any
          rights to our trademarks or software except the limited right to use the Service.
        </p>
      </Section>

      <Section heading="9. Disclaimers">
        <p>
          The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of
          any kind, whether express or implied, including fitness for a particular purpose and
          non-infringement. We do not warrant that the Service will be uninterrupted or error-free.
        </p>
      </Section>

      <Section heading="10. Limitation of Liability">
        <p>
          To the maximum extent permitted by law, {name} shall not be liable for any indirect,
          incidental, or consequential damages, or for loss of profits, revenue, or data. Our total
          liability for any claim shall not exceed the amount you paid for the Service in the twelve
          months preceding the claim.
        </p>
      </Section>

      <Section heading="11. Termination">
        <p>
          You may stop using the Service at any time. We may suspend or terminate access if you breach
          these Terms or use the Service in a way that risks harm to others or to the Service. Upon
          termination, your right to use the Service ends; data handling follows our Privacy Policy.
        </p>
      </Section>

      <Section heading="12. Governing Law">
        <p>
          These Terms are governed by the laws of India. Any disputes shall be subject to the
          exclusive jurisdiction of the courts of Coimbatore, Tamil Nadu, India.
        </p>
      </Section>

      <Section heading="13. Changes to These Terms">
        <p>
          We may update these Terms from time to time. Continued use of the Service after changes take
          effect constitutes acceptance of the updated Terms. The &quot;Last updated&quot; date above
          reflects the latest revision.
        </p>
      </Section>

      <Section heading="14. Contact Us">
        <p>Questions about these Terms? Contact us at:</p>
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
