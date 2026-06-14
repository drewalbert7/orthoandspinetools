import React from 'react';
import { Link } from 'react-router-dom';
import { LEGAL_OPERATOR_NAME } from '../lib/legal';

const SiteFooter: React.FC = () => (
  <footer
    className="border-t border-gray-200 bg-gray-50 px-4 py-4 text-center text-xs sm:text-sm text-gray-500"
    role="contentinfo"
  >
    <p className="[overflow-wrap:anywhere]">
      <span className="font-medium text-gray-600">{LEGAL_OPERATOR_NAME}</span>
      <span className="mx-2 text-gray-300">·</span>
      <Link to="/terms" className="text-blue-600 hover:text-blue-800">
        Terms
      </Link>
      <span className="mx-2 text-gray-300">·</span>
      <Link to="/privacy" className="text-blue-600 hover:text-blue-800">
        Privacy
      </Link>
      <span className="mx-2 text-gray-300">·</span>
      <span>© {new Date().getFullYear()}</span>
    </p>
    <p className="mt-1.5 text-[11px] sm:text-xs text-gray-400 max-w-2xl mx-auto leading-snug">
      Professional discussion only — not medical advice. Do not post identifiable patient information.
    </p>
  </footer>
);

export default SiteFooter;
