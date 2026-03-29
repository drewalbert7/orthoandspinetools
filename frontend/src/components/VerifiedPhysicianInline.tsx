import React from 'react';

/** Compact badge for post/comment bylines (full profile uses larger chips on Profile page). */
const VerifiedPhysicianInline: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`ml-1 inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800 border border-blue-200 ${className}`}
    title="Verified physician"
  >
    Physician ✓
  </span>
);

export default VerifiedPhysicianInline;
