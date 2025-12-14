import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Menu, X } from 'lucide-react';
import UserAvatar from './UserAvatar';

interface HeaderProps {
  isMobileSidebarOpen: boolean;
  onMobileSidebarToggle: () => void;
}

const Header: React.FC<HeaderProps> = ({ isMobileSidebarOpen, onMobileSidebarToggle }) => {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  // Refresh user data when component mounts if user exists but profileImage might be missing
  useEffect(() => {
    if (user && (!user.profileImage || user.profileImage === 'null' || user.profileImage === 'undefined')) {
      // Silently refresh user data to get latest profileImage
      refreshUser().catch(err => {
        // Silently fail - don't show errors for background refresh
        console.debug('Background user refresh failed:', err);
      });
    }
  }, [user?.id]); // Only run when user ID changes, not on every render

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Mobile Hamburger Menu and Logo */}
          <div className="flex items-center">
            {/* Mobile Hamburger Menu Button */}
            <button
              onClick={onMobileSidebarToggle}
              className="lg:hidden p-2 text-gray-600 hover:text-gray-900 transition-colors mr-2"
              aria-label="Toggle mobile menu"
            >
              {isMobileSidebarOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
            
            {/* Logo and Brand */}
            <Link to="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-reddit-orange rounded-lg flex items-center justify-center">
                {/* Hammer Icon - exact match to provided image, resized to fit */}
                <svg 
                  className="w-6 h-6 text-white" 
                  viewBox="0 0 24 24" 
                  fill="currentColor"
                  preserveAspectRatio="xMidYMid meet"
                >
                  {/* Thick circular border - unbroken black line */}
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" />
                  {/* Hammer head - left rectangular striking face (solid thick black) */}
                  <rect x="6.5" y="7.5" width="3.8" height="2.5" />
                  {/* Hammer head - right tapering side (wedge-like, tapers outward then narrows) */}
                  <path d="M10.3 7.5 L14 6.8 L14 10 L10.3 10 Z" />
                  {/* Small rectangular protrusion on top center of hammer head */}
                  <rect x="9.5" y="6" width="1.8" height="1.5" />
                  {/* Hammer handle - thick vertical line/rectangle extending down from center */}
                  <rect x="10.8" y="10" width="2.4" height="5" />
                </svg>
              </div>
              <span className="text-xl font-bold text-reddit hidden sm:block">
                OrthoAndSpineTools
              </span>
            </Link>
          </div>

          {/* Search Bar - Hidden on mobile */}
          <div className="flex-1 max-w-lg mx-8 hidden md:block">
            <div className="relative">
              <input
                type="text"
                placeholder="Search"
                className="w-full pl-10 pr-4 py-2 bg-reddit-card border border-reddit rounded-full focus:outline-none focus:ring-2 focus:ring-reddit-blue focus:border-transparent text-reddit placeholder-reddit-text-muted"
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-reddit-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Right Side Navigation */}
          <div className="flex items-center space-x-3">
            {user ? (
              <>
                {/* Create Post Button - White background with black text */}
                <Link
                  to="/create-post"
                  className="flex items-center space-x-1 bg-white text-black px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors text-sm font-medium border border-gray-200"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Create</span>
                </Link>

                {/* Notification Bell Icon */}
                <div className="relative">
                  <button
                    onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                    className="p-2 text-black hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-5 5v-5zM4.5 19.5a2.5 2.5 0 01-2.5-2.5V6a2.5 2.5 0 012.5-2.5h15A2.5 2.5 0 0122 6v11a2.5 2.5 0 01-2.5 2.5h-15z" />
                    </svg>
                    {/* Notification dot */}
                    <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-black rounded-full"></div>
                  </button>

                  {/* Notification Dropdown */}
                  {isNotificationOpen && (
                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200">
                      <div className="px-4 py-2 border-b border-gray-200">
                        <h3 className="text-sm font-medium text-gray-900">Notifications</h3>
                      </div>
                      <div className="px-4 py-3 text-sm text-gray-500">
                        No new notifications
                      </div>
                    </div>
                  )}
                </div>

                {/* User Profile Avatar */}
                <div className="relative">
                  <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="flex items-center space-x-2 hover:bg-gray-100 rounded-md px-2 py-1 transition-colors"
                  >
                    {/* User Avatar */}
                    <UserAvatar user={user} size="sm" />
                    {/* User Name - Hidden on mobile, shown on larger screens */}
                    <div className="hidden md:block text-left">
                      <p className="text-sm font-medium text-gray-900">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-xs text-gray-500">u/{user.username}</p>
                    </div>
                    {/* Dropdown Arrow */}
                    <svg 
                      className={`w-4 h-4 text-gray-500 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* User Dropdown Menu */}
                  {isMenuOpen && (
                    <>
                      {/* Backdrop */}
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsMenuOpen(false)}
                      />
                      <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200" onClick={(e) => e.stopPropagation()}>
                        {/* User Info Header */}
                        <div className="px-4 py-3 border-b border-gray-200">
                          <div className="flex items-center space-x-3">
                            <UserAvatar user={user} size="md" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {user.firstName} {user.lastName}
                              </p>
                              <p className="text-xs text-gray-500 truncate">u/{user.username}</p>
                              {user.specialty && (
                                <p className="text-xs text-blue-600 truncate">{user.specialty}</p>
                              )}
                            </div>
                          </div>
                        </div>
                        {/* Menu Items */}
                        <Link
                          to="/profile"
                          className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          Profile
                        </Link>
                        <Link
                          to="/profile/settings"
                          className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Settings
                        </Link>
                        {user.isAdmin && (
                          <Link
                            to="/admin"
                            className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            onClick={() => setIsMenuOpen(false)}
                          >
                            <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            Admin Dashboard
                          </Link>
                        )}
                        <div className="border-t border-gray-200 my-1" />
                        <button
                          onClick={handleLogout}
                          className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          Sign Out
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Login/Register Links */}
                <Link
                  to="/login"
                  className="text-reddit hover:text-reddit-text px-3 py-2 rounded-md text-sm font-medium"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="bg-reddit-orange text-white px-4 py-2 rounded-full hover:bg-orange-600 transition-colors text-sm font-medium"
                >
                  Join Now
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
