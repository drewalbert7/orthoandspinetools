import React from 'react';
import { Link } from 'react-router-dom';

type StartupPostBadgeProps = {
  className?: string;
  compact?: boolean;
};

const StartupPostBadge: React.FC<StartupPostBadgeProps> = ({ className = '', compact = false }) => (
  <Link
    to="/startups"
    title="Startup launch — view all startup posts"
    className={`inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 font-semibold text-amber-900 hover:bg-amber-100 hover:border-amber-400 transition-colors no-touch-target ${
      compact ? 'px-1.5 py-0.5 text-[10px] leading-none' : 'px-2 py-0.5 text-[11px] leading-tight'
    } ${className}`}
  >
    <svg
      className={compact ? 'w-2.5 h-2.5 shrink-0' : 'w-3 h-3 shrink-0'}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path d="M10.894 2.553a1 1 0 00-1.788 0l-2 4a1 1 0 01-.95.69H4.5a1 1 0 00-.832 1.555l3.182 4.675A1 1 0 009 14.5V17a1 1 0 102 0v-2.5a1 1 0 00.15-.494l3.182-4.675A1 1 0 0015.5 7.24h-1.656a1 1 0 01-.95-.69l-2-4z" />
    </svg>
    <span>Startup</span>
  </Link>
);

export default StartupPostBadge;
