import React from 'react';

interface PostAttachmentsProps {
  attachments?: Array<{
    id: string;
    filename: string;
    originalName: string;
    mimeType: string;
    path?: string;
    cloudinaryUrl?: string;
    size: number;
  }>;
}

const PostAttachments: React.FC<PostAttachmentsProps> = ({ attachments }) => {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <div className="mb-3">
      {attachments.slice(0, 1).map((attachment) => (
        <div key={attachment.id} className="relative">
          {attachment.mimeType.startsWith('image/') ? (
            <div className="relative bg-gray-100 rounded-md overflow-hidden" onClick={() => window.open(attachment.cloudinaryUrl || attachment.path || attachment.filename, '_blank')}>
              <img
                src={attachment.cloudinaryUrl || attachment.path || attachment.filename}
                alt={attachment.originalName}
                className="w-full h-auto object-contain cursor-pointer hover:opacity-95 transition-opacity rounded-md"
                style={{ maxHeight: '600px' }}
              />
              {/* Click to expand indicator */}
              <div className="absolute top-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded flex items-center space-x-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                <span>Expand</span>
              </div>
            </div>
          ) : attachment.mimeType.startsWith('video/') ? (
            <div className="relative bg-gray-100 rounded-md overflow-hidden">
              <video
                src={attachment.cloudinaryUrl || attachment.path || attachment.filename}
                className="w-full h-auto object-contain rounded-md"
                controls
                style={{ maxHeight: '600px' }}
              />
            </div>
          ) : (
            <div className="border border-gray-200 rounded-md p-4 bg-gray-50">
              <div className="flex items-center space-x-3">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{attachment.originalName}</p>
                  <p className="text-xs text-gray-500">
                    {(attachment.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <a
                  href={attachment.path || attachment.filename}
                  download={attachment.originalName}
                  className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                >
                  Download
                </a>
              </div>
            </div>
          )}
        </div>
      ))}
      {attachments.length > 1 && (
        <div className="text-xs text-gray-500 mt-2 text-center">
          +{attachments.length - 1} more attachment{attachments.length - 1 !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

export default PostAttachments;

