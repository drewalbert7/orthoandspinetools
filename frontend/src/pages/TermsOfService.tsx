import React from 'react';
import { Link } from 'react-router-dom';
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

const TermsOfService: React.FC = () => (
  <LegalPageLayout
    title="Terms of Service"
    description="Terms governing use of OrthoAndSpineTools, a professional community for orthopedic and spine surgery discussion."
    canonicalPath="/terms"
  >
    <Section title="1. Agreement to terms">
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of {LEGAL_OPERATOR_NAME} and
        related services (the &quot;Service&quot;) operated by {LEGAL_OPERATOR_NAME} (&quot;we,&quot; &quot;us,&quot;
        or &quot;our&quot;). By creating an account or using the Service, you agree to these Terms and our{' '}
        <Link to="/privacy" className="text-blue-600 hover:text-blue-800">
          Privacy Policy
        </Link>
        .
      </p>
      <p>If you do not agree, do not use the Service.</p>
    </Section>

    <Section title="2. What the Service is (and is not)">
      <p>
        {LEGAL_OPERATOR_NAME} is an online community for orthopedic and spine surgery professionals and related
        stakeholders to discuss cases, techniques, tools, biologics, startups, and professional topics.
      </p>
      <p>
        <strong className="text-gray-900">The Service is not medical advice.</strong> Content on the Service
        represents opinions and experiences of individual users, not {LEGAL_OPERATOR_NAME}. Nothing on the Service
        creates a doctor–patient relationship between you and {LEGAL_OPERATOR_NAME} or any other user. You are solely
        responsible for your clinical judgment and patient care decisions.
      </p>
      <p>
        <strong className="text-gray-900">The Service is not a HIPAA-covered clinical platform.</strong> You must
        not post protected health information (PHI) or other information that identifies individual patients unless
        you have all required permissions and comply with applicable law and institutional policy.
      </p>
      <p>
        <strong className="text-gray-900">No paid promotions.</strong> {LEGAL_OPERATOR_NAME} does not sell post
        placement, sponsored threads, or paid product promotion. User posts are user-submitted; we do not endorse
        devices, companies, or clinical decisions expressed in user content.
      </p>
    </Section>

    <Section title="3. Eligibility and accounts">
      <p>
        You must be at least 18 years old and capable of forming a binding contract. You agree to provide accurate
        registration information and keep it current.
      </p>
      <p>
        You are responsible for safeguarding your password and all activity under your account. Notify us promptly
        at{' '}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-blue-600 hover:text-blue-800">
          {LEGAL_CONTACT_EMAIL}
        </a>{' '}
        if you suspect unauthorized access.
      </p>
      <p>
        Email verification is required before you can sign in. Optional profile fields (such as medical license
        number) are self-reported unless otherwise noted below.
      </p>
      <p>
        <strong className="text-gray-900">Physician verification.</strong> Certain specialties require credential
        verification at registration. If you practice in the United States, you must provide a valid 10-digit NPI.
        We verify that NPI against the public CMS National Provider Identifier Registry and check that the name on
        the registry record matches the name you provide. If you practice outside the United States, your account
        may be marked for manual review by our administrators; you may use the Service while review is pending.
      </p>
      <p>
        A &quot;verified physician&quot; or similar badge, if displayed, indicates that we have completed our
        platform verification process (NPI match for U.S. users, or administrator approval for international users).
        It is not a substitute for independent credential verification, hospital privileging, or licensure approval
        by {LEGAL_OPERATOR_NAME} or any government authority. We may revoke a verification badge if we believe
        credentials were misrepresented or accounts were abused.
      </p>
    </Section>

    <Section title="4. User content">
      <p>
        You retain ownership of content you submit. By posting content, you grant {LEGAL_OPERATOR_NAME} a
        worldwide, non-exclusive, royalty-free license to host, store, reproduce, display, distribute, and
        otherwise use your content solely to operate, promote, and improve the Service (including showing previews
        when links are shared on other platforms).
      </p>
      <p>
        You represent that you have the rights to post your content and that your content does not violate these
        Terms or applicable law.
      </p>
    </Section>

    <Section title="5. Acceptable use and prohibited conduct">
      <p>You agree not to:</p>
      <ul className="list-disc pl-5 space-y-2">
        <li>Post PHI, identifiable patient images, or other sensitive personal data without proper authorization</li>
        <li>Post content that is unlawful, defamatory, harassing, hateful, threatening, or discriminatory</li>
        <li>Engage in undisclosed paid promotion, astroturfing, spam, or deceptive commercial activity</li>
        <li>Impersonate any person or misrepresent your affiliation or credentials, including by submitting another person&apos;s NPI or false license information</li>
        <li>Upload malware or attempt to disrupt, scrape, or reverse engineer the Service</li>
        <li>Circumvent access controls, rate limits, or security measures</li>
        <li>Use the Service in any manner that could harm users, patients, or the reputation of the platform</li>
        <li>Violate community rules, moderator instructions, or applicable professional standards</li>
      </ul>
      <p>
        Community moderators and administrators may remove content, lock threads, or restrict accounts that violate
        these Terms or community rules.
      </p>
    </Section>

    <Section title="6. Professional responsibility">
      <p>
        If you are a licensed healthcare professional, you remain bound by your licensing board rules, institutional
        policies, confidentiality obligations, and standards of professional conduct. Case discussions should be
        de-identified. Imaging shared for educational purposes should not contain identifiers unless appropriately
        authorized.
      </p>
      <p>
        You understand that content may be visible to other users and, for public pages, to the general internet.
      </p>
    </Section>

    <Section title="7. Intellectual property">
      <p>
        The Service, including its design, branding, software, and documentation (excluding user content), is owned
        by {LEGAL_OPERATOR_NAME} or its licensors and protected by intellectual property laws. You may not copy,
        modify, or create derivative works of the Service except as expressly permitted.
      </p>
      <p>
        If you believe content on the Service infringes your copyright, contact{' '}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-blue-600 hover:text-blue-800">
          {LEGAL_CONTACT_EMAIL}
        </a>{' '}
        with sufficient detail to identify the material and your rights.
      </p>
    </Section>

    <Section title="8. Third-party services and links">
      <p>
        The Service may contain links to third-party websites or reference third-party products. We do not control
        and are not responsible for third-party sites or services. Your use of third-party services is at your own
        risk and subject to their terms.
      </p>
    </Section>

    <Section title="9. Termination">
      <p>
        You may stop using the Service at any time. We may suspend or terminate your account or access to the
        Service at any time, with or without notice, for conduct we believe violates these Terms, creates risk, or
        is otherwise harmful.
      </p>
      <p>
        Provisions that by their nature should survive termination (including disclaimers, limitations of liability,
        indemnification, and dispute provisions) will survive.
      </p>
    </Section>

    <Section title="10. Disclaimers">
      <p>
        THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND,
        WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
        PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED,
        SECURE, ERROR-FREE, OR THAT CONTENT WILL BE ACCURATE OR COMPLETE.
      </p>
    </Section>

    <Section title="11. Limitation of liability">
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, {LEGAL_OPERATOR_NAME.toUpperCase()} AND ITS OPERATORS, AFFILIATES,
        OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
        CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, GOODWILL, OR OTHER INTANGIBLE
        LOSSES, ARISING FROM OR RELATED TO YOUR USE OF THE SERVICE.
      </p>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO
        THESE TERMS OR THE SERVICE WILL NOT EXCEED THE GREATER OF (A) ONE HUNDRED U.S. DOLLARS (US $100) OR (B) THE
        AMOUNT YOU PAID US, IF ANY, IN THE TWELVE (12) MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM.
      </p>
      <p>
        Some jurisdictions do not allow certain limitations; in those jurisdictions, our liability is limited to the
        maximum extent permitted by law.
      </p>
    </Section>

    <Section title="12. Indemnification">
      <p>
        You agree to defend, indemnify, and hold harmless {LEGAL_OPERATOR_NAME} and its operators, affiliates,
        officers, directors, employees, and agents from and against any claims, damages, losses, liabilities, costs,
        and expenses (including reasonable attorneys&apos; fees) arising from your content, your use of the Service,
        or your violation of these Terms or applicable law.
      </p>
    </Section>

    <Section title="13. Dispute resolution and governing law">
      <p>
        These Terms are governed by the laws of the United States and the state in which the operator of the Service
        maintains its principal place of business, without regard to conflict-of-law principles.
      </p>
      <p>
        Except where prohibited by law, you agree that disputes arising from these Terms or the Service will be
        resolved in the state or federal courts located in that jurisdiction, and you consent to personal
        jurisdiction there.
      </p>
    </Section>

    <Section title="14. Changes">
      <p>
        We may modify these Terms from time to time. We will post updated Terms on this page and update the
        effective date. Material changes may be communicated through the Service or by email. Continued use after
        changes become effective constitutes acceptance.
      </p>
    </Section>

    <Section title="15. Contact">
      <p>
        Questions about these Terms:{' '}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-blue-600 hover:text-blue-800">
          {LEGAL_CONTACT_EMAIL}
        </a>
        .
      </p>
    </Section>
  </LegalPageLayout>
);

export default TermsOfService;
