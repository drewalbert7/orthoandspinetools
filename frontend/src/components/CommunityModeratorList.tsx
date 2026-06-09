import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Community } from '../services/apiService';
import AuthorVerificationsInline from './AuthorVerificationsInline';
import { buildCommunityModeratorRoster } from '../lib/communityModeratorRoster';

type CommunityModeratorListProps = {
  community: Community;
  titleClassName?: string;
};

const CommunityModeratorList: React.FC<CommunityModeratorListProps> = ({
  community,
  titleClassName = 'text-sm font-bold text-gray-900',
}) => {
  const roster = useMemo(() => buildCommunityModeratorRoster(community), [community]);

  return (
    <div>
      <h3 className={`${titleClassName} mb-3`}>Moderators</h3>
      {roster.length === 0 ? (
        <p className="text-sm text-gray-500">No moderators listed yet.</p>
      ) : (
        <div className="space-y-2">
          {roster.map((mod) => (
            <div key={mod.userId} className="flex items-center gap-2 text-sm min-w-0">
              {mod.profileImage ? (
                <img
                  src={mod.profileImage}
                  alt=""
                  className="w-6 h-6 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-bold">
                    {mod.username.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <Link
                to={`/u/${mod.username}`}
                className="text-gray-700 hover:text-blue-600 truncate"
              >
                u/{mod.username}
              </Link>
              {mod.role === 'owner' && (
                <span className="text-xs text-gray-500 shrink-0">Owner</span>
              )}
              {mod.role === 'admin' && (
                <span className="text-xs text-gray-500 shrink-0">Admin</span>
              )}
              <AuthorVerificationsInline author={mod} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CommunityModeratorList;
