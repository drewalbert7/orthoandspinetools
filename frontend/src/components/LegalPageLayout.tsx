import React from 'react';
import { Link } from 'react-router-dom';
import { DocumentMeta } from './DocumentMeta';
import { LEGAL_CONTACT_EMAIL, LEGAL_EFFECTIVE_DATE, LEGAL_SITE_URL } from '../lib/legal';

type LegalPageLayoutProps = {
  title: string;
  description: string;
  canonicalPath: string;
  children: React.ReactNode;
};

const LegalPageLayout: React.FC<LegalPageLayoutProps> = ({
  title,
  description,
  canonicalPath,
  children,
}) => (
  <>
    <DocumentMeta title={title} description={description} canonicalPath={canonicalPath} />
    <article className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-md p-5 sm:p-8 mb-6">
      <header className="mb-8 pb-6 border-b border-gray-200">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-gray-500">Effective date: {LEGAL_EFFECTIVE_DATE}</p>
        <p className="mt-4 text-sm text-gray-600 leading-relaxed">
          These policies apply to {LEGAL_SITE_URL}. For questions, contact{' '}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-blue-600 hover:text-blue-800">
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </header>
      <div className="space-y-8 text-sm sm:text-[15px] text-gray-700 leading-relaxed">{children}</div>
      <footer className="mt-10 pt-6 border-t border-gray-200 text-sm text-gray-500">
        <Link to="/terms" className="text-blue-600 hover:text-blue-800">
          Terms of Service
        </Link>
        <span className="mx-2">·</span>
        <Link to="/privacy" className="text-blue-600 hover:text-blue-800">
          Privacy Policy
        </Link>
        <span className="mx-2">·</span>
        <Link to="/" className="text-blue-600 hover:text-blue-800">
          Home
        </Link>
      </footer>
    </article>
  </>
);

export default LegalPageLayout;
