import React from 'react';
import VerifiedBadge from './VerifiedBadge';

interface UserAvatarProps {
  user: {
    firstName?: string;
    lastName?: string;
    username?: string;
    profileImage?: string | null;
    isVerifiedPhysician?: boolean;
  };
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showBadge?: boolean;
  className?: string;
}

const UserAvatar: React.FC<UserAvatarProps> = ({
  user,
  size = 'md',
  showBadge = true,
  className = ''
}) => {
  const sizeClasses = {
    xs: 'w-6 h-6',
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
    xl: 'w-20 h-20'
  };

  const textSizeClasses = {
    xs: 'text-xs',
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-xl',
    xl: 'text-2xl'
  };

  const badgeSize = size === 'xs' || size === 'sm' ? 'sm' : size === 'lg' || size === 'xl' ? 'lg' : 'md';

  const getInitials = () => {
    const first = user.firstName?.charAt(0).toUpperCase() || '';
    const last = user.lastName?.charAt(0).toUpperCase() || '';
    return first + last || user.username?.charAt(0).toUpperCase() || 'U';
  };

  const isValidImage = user.profileImage && 
    user.profileImage.trim() && 
    user.profileImage !== 'null' && 
    user.profileImage !== 'undefined';

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      <div className={`${sizeClasses[size]} rounded-full overflow-hidden`}>
        {isValidImage ? (
          <img
            src={user.profileImage!}
            alt={`${user.firstName} ${user.lastName}`}
            className="w-full h-full object-cover"
            onError={(e) => {
              // If image fails to load, fall back to initials
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent && !parent.querySelector('.fallback-initials')) {
                const fallback = document.createElement('div');
                fallback.className = `w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center fallback-initials ${textSizeClasses[size]}`;
                fallback.innerHTML = `<span class="text-white font-bold">${getInitials()}</span>`;
                parent.appendChild(fallback);
              }
            }}
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center ${textSizeClasses[size]}`}>
            <span className="text-white font-bold">
              {getInitials()}
            </span>
          </div>
        )}
      </div>
      {showBadge && user.isVerifiedPhysician && (
        <VerifiedBadge size={badgeSize} />
      )}
    </div>
  );
};

export default UserAvatar;



