import React from 'react';

const SitePolicyBanner: React.FC = () => (
  <div
    className="border-b border-amber-200/80 bg-amber-50 px-3 py-2 text-center text-xs sm:text-sm text-amber-950 [overflow-wrap:anywhere]"
    role="region"
    aria-label="Site policy: no paid promotions"
  >
    <strong className="font-semibold">No paid promotions:</strong>{' '}
    <span className="text-amber-900">
      OrthoAndSpineTools does not sell post placement, sponsored threads, or paid product promotion. Posts are
      user-submitted; the platform does not endorse devices, companies, or clinical decisions.
    </span>
  </div>
);

export default SitePolicyBanner;
