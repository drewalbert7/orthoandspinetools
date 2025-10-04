import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Sidebar: React.FC = () => {
  const location = useLocation();

  const communities = [
    { id: 'spine', name: 'Spine', icon: '🦴' },
    { id: 'sports', name: 'Sports', icon: '🏃' },
    { id: 'ortho-trauma', name: 'Ortho Trauma', icon: '🚑' },
    { id: 'ortho-peds', name: 'Ortho Peds', icon: '👶' },
    { id: 'ortho-onc', name: 'Ortho Onc', icon: '🎗️' },
    { id: 'foot-ankle', name: 'Foot & Ankle', icon: '🦶' },
    { id: 'shoulder-elbow', name: 'Shoulder Elbow', icon: '💪' },
    { id: 'hip-knee-arthroplasty', name: 'Hip & Knee Arthroplasty', icon: '🦴' },
    { id: 'hand', name: 'Hand', icon: '✋' },
  ];

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <aside className="w-64 bg-white shadow-sm border-r border-gray-200 h-full overflow-y-auto">
      <div className="p-4">
        {/* Navigation Links */}
        <nav className="space-y-2 mb-6">
          <Link
            to="/"
            className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
              isActive('/') ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="font-medium">Home</span>
          </Link>

          <Link
            to="/popular"
            className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
              isActive('/popular') ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span className="font-medium">Popular</span>
          </Link>

          <Link
            to="/tools"
            className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
              isActive('/tools') ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="font-medium">Medical Tools</span>
          </Link>

        </nav>

        {/* Communities Section */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Communities
          </h3>
          <div className="space-y-1">
            {communities.map((community) => (
              <Link
                key={community.id}
                to={`/community/${community.id}`}
                className={`flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                  isActive(`/community/${community.id}`)
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-lg">{community.icon}</span>
                  <span className="text-sm font-medium">{community.name}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </aside>
  );
};

export default Sidebar;
