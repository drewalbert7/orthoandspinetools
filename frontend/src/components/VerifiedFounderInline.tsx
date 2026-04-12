import React from 'react';

const VerifiedFounderInline: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`ml-1 inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-900 border border-amber-200 ${className}`}
    title="Verified founder"
  >
    Founder ✓
  </span>
);

export default VerifiedFounderInline;
