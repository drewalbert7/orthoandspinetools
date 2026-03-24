import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Menu, X } from 'lucide-react';
import toast from 'react-hot-toast';
import UserAvatar from './UserAvatar';
import NotificationItem from './NotificationItem';
import { useNotifications } from '../hooks/useNotifications';
import type { AppNotification } from '../services/apiService';

interface HeaderProps {
  isMobileSidebarOpen: boolean;
  onMobileSidebarToggle: () => void;
}

const Header: React.FC<HeaderProps> = ({ isMobileSidebarOpen, onMobileSidebarToggle }) => {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');

  const {
    unreadCount,
    notifications,
    isLoadingList,
    listError,
    markRead,
    markAllRead,
    remove,
  } = useNotifications(isNotificationOpen, !!user);

  const handleNotificationNavigate = async (n: AppNotification) => {
    try {
      if (!n.isRead) {
        await markRead.mutateAsync(n.id);
      }
    } catch {
      // Still navigate if mark-read fails
    }
    setIsNotificationOpen(false);
    if (n.link) {
      navigate(n.link);
    }
  };

  const handleNotificationDismiss = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    remove.mutate(id, {
      onError: () => toast.error('Could not remove notification'),
    });
  };

  const handleMarkAllNotificationsRead = () => {
    markAllRead.mutate(undefined, {
      onError: () => toast.error('Could not mark all as read'),
    });
  };

  useEffect(() => {
    if (location.pathname === '/search') {
      const params = new URLSearchParams(location.search);
      setSearchInput(params.get('q') || '');
    }
  }, [location.pathname, location.search]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    if (q) {
      navigate(`/search?q=${encodeURIComponent(q)}`);
    }
  };

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
                {/* Hammer Icon - exact match to provided image */}
                <svg 
                  className="w-6 h-6 text-white" 
                  viewBox="0 0 24 24" 
                  fill="currentColor"
                  preserveAspectRatio="xMidYMid meet"
                >
                  {/* Thick circular border - unbroken black line, consistent line weight */}
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" />
                  {/* Hammer head - left rectangular striking face (solid thick black block) */}
                  <rect x="6.5" y="7.2" width="3.5" height="2.6" />
                  {/* Hammer head - right side tapers outward then narrows to flat wedge-like shape */}
                  <path d="M10 7.2 L13.2 6.5 L13.8 8.5 L13.2 9.8 L10 9.8 Z" />
                  {/* Small rectangular protrusion on top center of hammer head (eye where handle inserts) */}
                  <rect x="9.3" y="5.8" width="1.4" height="1.4" />
                  {/* Hammer handle - thick vertical line/rectangle extending down from center of head */}
                  <rect x="10.8" y="9.8" width="2.4" height="5.2" />
                </svg>
              </div>
              <span className="text-xl font-bold text-reddit hidden sm:block">
                OrthoAndSpineTools
              </span>
            </Link>
          </div>

          {/* Search — works on mobile and desktop */}
          <form
            onSubmit={handleSearchSubmit}
            className="flex-1 min-w-0 max-w-lg mx-2 sm:mx-4 md:mx-8"
            role="search"
            aria-label="Search posts and communities"
          >
            <div className="relative">
              <input
                type="search"
                name="q"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search posts & communities"
                autoComplete="off"
                className="w-full pl-9 pr-3 py-1.5 sm:py-2 text-sm sm:text-base bg-reddit-card border border-reddit rounded-full focus:outline-none focus:ring-2 focus:ring-reddit-blue focus:border-transparent text-reddit placeholder-reddit-text-muted"
              />
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                <svg className="h-4 w-4 sm:h-5 sm:w-5 text-reddit-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </form>

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

                {/* Notification Bell */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                    className="relative p-2 text-black hover:text-gray-600 transition-colors flex items-center justify-center"
                    aria-expanded={isNotificationOpen}
                    aria-haspopup="true"
                    aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {unreadCount > 0 && (
                      <span className="absolute top-0.5 right-0.5 min-w-[1.125rem] h-[1.125rem] px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold leading-none">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </button>

                  {isNotificationOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        aria-hidden
                        onClick={() => setIsNotificationOpen(false)}
                      />
                      <div className="absolute right-0 mt-2 w-[min(100vw-2rem,22rem)] max-w-sm bg-white rounded-md shadow-lg z-50 border border-gray-200 flex flex-col max-h-[min(24rem,70vh)]">
                        <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between gap-2 flex-shrink-0">
                          <h3 className="text-sm font-medium text-gray-900">Notifications</h3>
                          {notifications.some((n) => !n.isRead) && (
                            <button
                              type="button"
                              onClick={handleMarkAllNotificationsRead}
                              disabled={markAllRead.isPending}
                              className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                            >
                              Mark all read
                            </button>
                          )}
                        </div>
                        <div className="overflow-y-auto flex-1 min-h-0">
                          {isLoadingList && (
                            <div className="px-4 py-6 text-sm text-gray-500 text-center">Loading…</div>
                          )}
                          {listError && !isLoadingList && (
                            <div className="px-4 py-4 text-sm text-red-600">
                              Could not load notifications.
                            </div>
                          )}
                          {!isLoadingList && !listError && notifications.length === 0 && (
                            <div className="px-4 py-6 text-sm text-gray-500 text-center">
                              No notifications yet. You’ll see alerts when someone comments on your posts or replies to
                              your comments.
                            </div>
                          )}
                          {!isLoadingList &&
                            notifications.map((n) => (
                              <NotificationItem
                                key={n.id}
                                notification={n}
                                onOpen={handleNotificationNavigate}
                                onDismiss={handleNotificationDismiss}
                              />
                            ))}
                        </div>
                      </div>
                    </>
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
