import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const LeftSidebar: React.FC = () => {
  const location = useLocation();
  const [topicsExpanded, setTopicsExpanded] = useState(false);
  const [resourcesExpanded, setResourcesExpanded] = useState(false);

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <div className="py-4 px-3 space-y-3">
      
      {/* Primary Navigation */}
      <div className="space-y-1">
        <Link
          to="/"
          className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            isActive('/') 
              ? 'bg-gray-700 text-white' 
              : 'text-gray-300 hover:text-white hover:bg-gray-800'
          }`}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
          </svg>
          <span>Home</span>
        </Link>
        
        <Link
          to="/popular"
          className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            isActive('/popular') 
              ? 'bg-gray-700 text-white' 
              : 'text-gray-300 hover:text-white hover:bg-gray-800'
          }`}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.414 14.586 7H12z" clipRule="evenodd" />
          </svg>
          <span>Popular</span>
        </Link>
        
        <Link
          to="/all"
          className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            isActive('/all') 
              ? 'bg-gray-700 text-white' 
              : 'text-gray-300 hover:text-white hover:bg-gray-800'
          }`}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
          <span>All</span>
        </Link>
      </div>

      {/* Topics Section */}
      <div>
        <button
          onClick={() => setTopicsExpanded(!topicsExpanded)}
          className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
        >
          <span>TOPICS</span>
          <svg
            className={`w-4 h-4 transition-transform ${topicsExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {topicsExpanded && (
          <div className="mt-2 space-y-1">
            {[
              'Spine Surgery',
              'Orthopedic Trauma',
              'Sports Medicine',
              'Joint Replacement',
              'Implant Identification',
              'Case Studies'
            ].map((topic) => (
              <div key={topic} className="flex items-center justify-between px-3 py-1 text-sm text-gray-400 hover:text-gray-200 cursor-pointer">
                <span>{topic}</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            ))}
            <div className="px-3 py-1 text-sm text-gray-400 hover:text-gray-200 cursor-pointer">
              See more
            </div>
          </div>
        )}
      </div>

      {/* Resources Section */}
      <div>
        <button
          onClick={() => setResourcesExpanded(!resourcesExpanded)}
          className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
        >
          <span>RESOURCES</span>
          <svg
            className={`w-4 h-4 transition-transform ${resourcesExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {resourcesExpanded && (
          <div className="mt-2 space-y-1">
            <Link
              to="/about"
              className="flex items-center space-x-3 px-3 py-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span>About OrthoAndSpineTools</span>
            </Link>
            
            <Link
              to="/advertise"
              className="flex items-center space-x-3 px-3 py-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span>Advertise</span>
            </Link>

            <Link
              to="/pro"
              className="flex items-center space-x-3 px-3 py-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span>OrthoAndSpineTools Pro</span>
              <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">BETA</span>
            </Link>

            <Link
              to="/help"
              className="flex items-center space-x-3 px-3 py-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Help</span>
            </Link>

            <Link
              to="/blog"
              className="flex items-center space-x-3 px-3 py-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span>Blog</span>
            </Link>

            <Link
              to="/careers"
              className="flex items-center space-x-3 px-3 py-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Careers</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeftSidebar;
