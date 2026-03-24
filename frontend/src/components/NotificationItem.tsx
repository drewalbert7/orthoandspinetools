import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { AppNotification } from '../services/apiService';
import { MessageCircle, Reply } from 'lucide-react';

interface NotificationItemProps {
  notification: AppNotification;
  onOpen: (n: AppNotification) => void;
  onDismiss: (e: React.MouseEvent, id: string) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification: n,
  onOpen,
  onDismiss,
}) => {
  const Icon = n.type === 'REPLY_TO_COMMENT' ? Reply : MessageCircle;

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(n);
        }
      }}
      className={`relative flex gap-3 px-4 py-3 border-b border-gray-100 text-left hover:bg-gray-50 cursor-pointer ${
        !n.isRead ? 'bg-sky-50/60' : ''
      }`}
      onClick={() => onOpen(n)}
    >
      <div
        className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
          !n.isRead ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-500'
        }`}
      >
        <Icon className="w-4 h-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 pr-6">
        <p className={`text-sm ${!n.isRead ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>
          {n.title}
        </p>
        <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.message}</p>
        <p className="text-xs text-gray-400 mt-1">
          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
        </p>
      </div>
      <button
        type="button"
        className="absolute top-2 right-2 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200"
        title="Dismiss"
        aria-label="Dismiss notification"
        onClick={(e) => onDismiss(e, n.id)}
      >
        <span className="text-lg leading-none">&times;</span>
      </button>
    </div>
  );
};

export default NotificationItem;
