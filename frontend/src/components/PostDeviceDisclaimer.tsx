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
    <p className="font-semibold text-amber-950">Conflict of interest & product discussion</p>
    <p className="mt-1.5">
      This post refers to specific devices, implants, instruments, biologics, or companies. Content is for professional
      discussion only—not medical advice, not an endorsement by OrthoAndSpineTools, and not a substitute for your own
      judgment, hospital policies, or the manufacturer&apos;s instructions for use.
    </p>
    <p className="mt-2">
      Authors may have financial or consulting relationships with industry; readers should assume potential conflicts
      unless the author states otherwise. Verify indications, contraindications, and labeling independently.{' '}
      <strong>OrthoAndSpineTools does not accept paid promotion for posts or product placement.</strong>
    </p>
  </>
);

const COMPACT_TEXT = (
  <span>
    <strong>Devices / implants mentioned.</strong> User content only—not medical advice or endorsement. Authors may
    have industry ties; verify IFU and conflicts independently. No paid promotions on this platform.
  </span>
);

const PostDeviceDisclaimer: React.FC<PostDeviceDisclaimerProps> = ({ post, variant = 'compact', className = '' }) => {
  if (!postMentionsDevicesOrTools(post)) return null;

  if (variant === 'full') {
    return (
      <aside
        className={`rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 [overflow-wrap:anywhere] ${className}`.trim()}
        role="note"
        aria-label="Conflict of interest and product discussion notice"
      >
        {FULL_TEXT}
      </aside>
    );
  }

  return (
    <p
      className={`rounded-md border border-amber-200/90 bg-amber-50/95 px-2.5 py-1.5 text-xs leading-snug text-amber-950 [overflow-wrap:anywhere] ${className}`.trim()}
      role="note"
    >
      {COMPACT_TEXT}
    </p>
  );
};

export default PostDeviceDisclaimer;
