import React from 'react';
import LegalPageLayout from '../components/LegalPageLayout';
import { LEGAL_CONTACT_EMAIL, LEGAL_OPERATOR_NAME } from '../lib/legal';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

const PrivacyPolicy: React.FC = () => (
  <LegalPageLayout
    title="Privacy Policy"
    description="How OrthoAndSpineTools collects, uses, and protects information on our orthopedic and spine surgery community platform."
    canonicalPath="/privacy"
  >
    <Section title="1. Introduction">
      <p>
        {LEGAL_OPERATOR_NAME} (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates an online community for
        orthopedic and spine surgery professionals and related stakeholders. This Privacy Policy explains how we
        collect, use, disclose, and protect information when you use our website, applications, and related services
        (collectively, the &quot;Service&quot;).
      </p>
      <p>
        By using the Service, you agree to this Privacy Policy. If you do not agree, do not use the Service.
      </p>
    </Section>

    <Section title="2. Information we collect">
      <p>
        <strong className="text-gray-900">Account and profile information.</strong> When you register, we collect
        information such as your name, username, email address, password (stored in hashed form), specialty, and
        optional details you provide (for example, medical license number, institution, bio, location, website, and
        profile image).
      </p>
      <p>
        <strong className="text-gray-900">Physician verification information.</strong> If you register as a physician
        or resident in a specialty that requires verification, we may collect your country of practice and, for
        United States users, your 10-digit National Provider Identifier (NPI). We use your NPI and name to query the
        public CMS National Provider Identifier Registry during registration. For users practicing outside the United
        States, we may collect a local medical license or registration number you provide and flag your account for
        manual credential review by our administrators.
      </p>
      <p>
        <strong className="text-gray-900">User-generated content.</strong> We collect content you submit, including
        posts, comments, votes, community memberships, messages in notification content, and media you upload
        (images, videos, and related metadata).
      </p>
      <p>
        <strong className="text-gray-900">Usage and device information.</strong> We collect information about how
        you interact with the Service, such as pages viewed, features used, timestamps, referring URLs, and
        approximate location derived from IP address.
      </p>
      <p>
        <strong className="text-gray-900">Log and security data.</strong> Our servers and security systems record
        technical data including IP address, browser type, operating system, request logs, and audit events related
        to authentication and administrative actions.
      </p>
      <p>
        <strong className="text-gray-900">Cookies and analytics.</strong> We use cookies and similar technologies.
        We use Google Analytics (GA4) to understand aggregate site usage. You can limit cookies through your
        browser settings; some features may not work correctly if cookies are disabled.
      </p>
    </Section>

    <Section title="3. How we use information">
      <p>We use information we collect to:</p>
      <ul className="list-disc pl-5 space-y-2">
        <li>Provide, operate, maintain, and improve the Service</li>
        <li>Create and manage your account and authenticate you</li>
        <li>Verify physician credentials, including NPI lookup for U.S. users and manual review for international users</li>
        <li>Send transactional emails (for example, email verification, password reset, and notification digests you opt into)</li>
        <li>Display user-generated content and community features</li>
        <li>Enforce our Terms of Service, community rules, and platform policies</li>
        <li>Detect, prevent, and address fraud, abuse, security incidents, and technical issues</li>
        <li>Comply with legal obligations and respond to lawful requests</li>
        <li>Analyze usage in aggregate to improve performance and user experience</li>
      </ul>
      <p>
        We do not sell your personal information. We do not use your content to train third-party artificial
        intelligence models.
      </p>
    </Section>

    <Section title="4. How we share information">
      <p>
        <strong className="text-gray-900">Public content.</strong> Posts, comments, usernames, profile fields you
        choose to make visible, and community participation may be viewable by other users and, for public pages,
        by anyone on the internet. Do not post information you wish to keep private.
      </p>
      <p>
        <strong className="text-gray-900">Service providers.</strong> We use trusted third parties to help operate
        the Service, including:
      </p>
      <ul className="list-disc pl-5 space-y-2">
        <li>Hosting and infrastructure providers (for example, Hetzner)</li>
        <li>Cloudinary for media storage and delivery</li>
        <li>Amazon Web Services (SES) for transactional email</li>
        <li>The U.S. Centers for Medicare &amp; Medicaid Services (CMS) National Provider Identifier Registry, when
          verifying U.S. physician NPIs at registration</li>
        <li>Google Analytics for usage analytics</li>
      </ul>
      <p>
        These providers process data on our behalf under contractual obligations appropriate to their role.
      </p>
      <p>
        <strong className="text-gray-900">Legal and safety.</strong> We may disclose information if we believe it
        is reasonably necessary to comply with law, regulation, legal process, or governmental request; to protect
        the rights, property, or safety of users, the public, or {LEGAL_OPERATOR_NAME}; or to investigate fraud or
        security issues.
      </p>
      <p>
        <strong className="text-gray-900">Business transfers.</strong> If we are involved in a merger, acquisition,
        or sale of assets, information may be transferred as part of that transaction, subject to continued
        protection consistent with this policy.
      </p>
    </Section>

    <Section title="5. Patient privacy and sensitive information">
      <p>
        The Service is a professional discussion forum, not a HIPAA-covered clinical system.{' '}
        <strong className="text-gray-900">
          Do not post protected health information (PHI) or information that identifies individual patients
        </strong>
        , including names, dates of birth, medical record numbers, contact details, or identifiable imaging, unless
        you have all required authorizations and de-identification is not feasible under applicable law and
        professional standards.
      </p>
      <p>
        You are responsible for ensuring your posts comply with HIPAA, state privacy laws, institutional policies,
        and informed consent requirements. We may remove content that appears to contain PHI or other sensitive
        personal data and may suspend accounts that repeatedly violate this policy.
      </p>
    </Section>

    <Section title="6. Data retention">
      <p>
        We retain account and content information for as long as your account is active or as needed to provide the
        Service. We may retain certain information after account deletion where required for legal compliance,
        dispute resolution, enforcement, security, or backup integrity. Backup copies may persist for a limited
        period before being overwritten.
      </p>
    </Section>

    <Section title="7. Security">
      <p>
        We implement reasonable administrative, technical, and organizational measures designed to protect
        information, including encryption in transit (HTTPS), access controls, and audit logging. No method of
        transmission or storage is completely secure; we cannot guarantee absolute security.
      </p>
    </Section>

    <Section title="8. Your choices and rights">
      <p>
        You may update profile information in your account settings. You may request account deletion by
        contacting us at{' '}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-blue-600 hover:text-blue-800">
          {LEGAL_CONTACT_EMAIL}
        </a>
        .
      </p>
      <p>
        Depending on where you live, you may have rights to access, correct, delete, or port certain personal
        information, or to object to or restrict certain processing. We will honor applicable legal rights where
        required. California residents may have additional rights under the CCPA/CPRA; we do not sell personal
        information as defined by California law.
      </p>
      <p>
        To opt out of non-essential analytics cookies, adjust your browser settings or use browser-based opt-out
        tools provided by analytics vendors.
      </p>
    </Section>

    <Section title="9. International users">
      <p>
        The Service is operated from the United States. If you access the Service from outside the United States,
        your information may be processed in the United States and other countries where our service providers
        operate, which may have different data protection laws than your jurisdiction.
      </p>
    </Section>

    <Section title="10. Children">
      <p>
        The Service is intended for adults (18 years or older). We do not knowingly collect personal information
        from children under 18. If you believe a child has provided us information, contact us and we will take
        appropriate steps to delete it.
      </p>
    </Section>

    <Section title="11. Changes to this policy">
      <p>
        We may update this Privacy Policy from time to time. We will post the revised policy on this page and
        update the effective date. Material changes may be communicated through the Service or by email. Continued
        use after changes become effective constitutes acceptance of the updated policy.
      </p>
    </Section>

    <Section title="12. Contact">
      <p>
        Questions about this Privacy Policy or our data practices:{' '}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-blue-600 hover:text-blue-800">
          {LEGAL_CONTACT_EMAIL}
        </a>
        .
      </p>
    </Section>
  </LegalPageLayout>
);

export default PrivacyPolicy;
