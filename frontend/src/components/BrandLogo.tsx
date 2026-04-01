import React from 'react';

const LOGO_SRC = '/brand-logo.png';

export interface BrandLogoProps {
  className?: string;
  /** Tailwind height class (e.g. h-8, h-12, h-14) */
  heightClass?: string;
  /** Max width cap for wide wordmarks */
  maxWidthClass?: string;
}

const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  heightClass = 'h-8',
  maxWidthClass = 'max-w-[min(100%,14rem)]',
}) => (
  <img
    src={LOGO_SRC}
    alt=""
    className={`${heightClass} w-auto ${maxWidthClass} object-contain object-left ${className}`}
    decoding="async"
  />
);

export default BrandLogo;
