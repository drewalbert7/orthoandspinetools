import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Mock notification count - in real app this would come from API
  const notificationCount = 1;

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and Brand */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-reddit-orange rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">O</span>
              </div>
              <span className="text-xl font-bold text-reddit hidden sm:block">
                OrthoAndSpineTools
              </span>
            </Link>
          </div>

          {/* Search Bar */}
          <div className="flex-1 max-w-lg mx-8">
            <div className="relative">
              <input
                type="text"
                placeholder="Search Reddit"
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
                {/* Create Post Button */}
                <Link
                  to="/create-post"
                  className="flex items-center space-x-1 bg-reddit-orange text-white px-3 py-1.5 rounded-full hover:bg-orange-600 transition-colors text-sm font-medium"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="hidden sm:inline">Create</span>
                </Link>

                {/* Notification Icon */}
                <div className="relative">
                  <button
                    onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                    className="p-2 text-reddit-text-muted hover:text-reddit transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5zM4.5 19.5a2.5 2.5 0 01-2.5-2.5V6a2.5 2.5 0 012.5-2.5h15A2.5 2.5 0 0122 6v11a2.5 2.5 0 01-2.5 2.5h-15z" />
                    </svg>
                    {notificationCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-reddit-orange text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                        {notificationCount}
                      </span>
                    )}
                  </button>

                  {/* Notification Dropdown */}
                  {isNotificationOpen && (
                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-md shadow-lg py-1 z-50 border border-reddit">
                      <div className="px-4 py-2 border-b border-reddit">
                        <h3 className="text-sm font-medium text-reddit">Notifications</h3>
                      </div>
                      <div className="px-4 py-3 text-sm text-reddit-text-muted">
                        No new notifications
                      </div>
                    </div>
                  )}
                </div>

                {/* User Avatar */}
                <div className="relative">
                  <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="flex items-center space-x-2 text-reddit hover:text-reddit-text transition-colors"
                  >
                    <div className="w-8 h-8 bg-gradient-to-br from-reddit-orange to-orange-600 rounded-full flex items-center justify-center border-2 border-reddit">
                      <span className="text-white text-sm font-bold">
                        {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                      </span>
                    </div>
                  </button>

                  {/* User Dropdown Menu */}
                  {isMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-reddit">
                      <div className="px-4 py-2 border-b border-reddit">
                        <p className="text-sm font-medium text-reddit">{user.firstName} {user.lastName}</p>
                        <p className="text-xs text-reddit-text-muted">u/{user.username}</p>
                      </div>
                      <Link
                        to="/profile"
                        className="block px-4 py-2 text-sm text-reddit hover:bg-reddit-card"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        Profile
                      </Link>
                      <Link
                        to="/settings"
                        className="block px-4 py-2 text-sm text-reddit hover:bg-reddit-card"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        Settings
                      </Link>
                      <Link
                        to="/tools"
                        className="block px-4 py-2 text-sm text-reddit hover:bg-reddit-card"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        Medical Tools
                      </Link>
                      <hr className="my-1 border-reddit" />
                      <button
                        onClick={handleLogout}
                        className="block w-full text-left px-4 py-2 text-sm text-reddit hover:bg-reddit-card"
                      >
                        Sign Out
                      </button>
                    </div>
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
