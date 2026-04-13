import React from 'react';
import type { Post } from '../services/apiService';
import { postMentionsDevicesOrTools } from '../lib/productMentionDetection';

type Variant = 'compact' | 'full';

interface PostDeviceDisclaimerProps {
  post: Pick<Post, 'title' | 'content' | 'type' | 'linkUrl' | 'tags'>;
  variant?: Variant;
  className?: string;
}

const FULL_TEXT = (
  <>
    <p className="text-xs font-medium text-gray-700">Product discussion notice</p>
    <p className="mt-1.5 text-xs leading-relaxed text-gray-600">
      This post refers to specific devices, implants, instruments, biologics, or companies. Content is for professional
      discussion only—not medical advice, not an endorsement by OrthoAndSpineTools, and not a substitute for your own
      judgment, hospital policies, or the manufacturer&apos;s instructions for use.
    </p>
    <p className="mt-1.5 text-xs leading-relaxed text-gray-600">
      Authors may have financial or consulting relationships with industry; readers should assume potential conflicts
      unless the author states otherwise. Verify indications, contraindications, and labeling independently.{' '}
      <span className="text-gray-700">OrthoAndSpineTools does not accept paid promotion for posts or product placement.</span>
    </p>
  </>
);

const COMPACT_TEXT = (
  <span>
    <span className="text-gray-600">Devices or implants referenced.</span>{' '}
    <span className="text-gray-500">
      User content only—not medical advice or endorsement. Authors may have industry ties; verify IFU and conflicts
      independently. No paid promotions on this platform.
    </span>
  </span>
);

const PostDeviceDisclaimer: React.FC<PostDeviceDisclaimerProps> = ({ post, variant = 'compact', className = '' }) => {
  if (!postMentionsDevicesOrTools(post)) return null;

  if (variant === 'full') {
    return (
      <aside
        className={`rounded-md border border-gray-100 bg-white px-3 py-2 [overflow-wrap:anywhere] ${className}`.trim()}
        role="note"
        aria-label="Conflict of interest and product discussion notice"
      >
        {FULL_TEXT}
      </aside>
    );
  }

  return (
    <p
      className={`border-l border-gray-200 pl-2.5 py-0.5 text-[11px] sm:text-xs leading-snug text-gray-500 [overflow-wrap:anywhere] ${className}`.trim()}
      role="note"
    >
      {COMPACT_TEXT}
    </p>
  );
};

export default PostDeviceDisclaimer;
