import React from 'react';

const SitePolicyBanner: React.FC = () => (
  <div
    className="border-b border-gray-100 bg-white px-3 py-1.5 text-center text-[11px] sm:text-xs leading-snug text-gray-500 [overflow-wrap:anywhere] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
    role="region"
    aria-label="Site policy: no paid promotions"
  >
    <span className="font-medium text-gray-600 dark:text-slate-300">No paid promotions.</span>{' '}
    <span className="hidden sm:inline">
      OrthoAndSpineTools does not sell post placement, sponsored threads, or paid product promotion. Posts are
      user-submitted; the platform does not endorse devices, companies, or clinical decisions.
    </span>
    <span className="sm:hidden">No sponsored posts or paid placement. Not medical advice.</span>
  </div>
);

export default SitePolicyBanner;
