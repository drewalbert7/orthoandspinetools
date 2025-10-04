import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const Home: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Welcome to OrthoAndSpineTools
        </h1>
        <p className="text-lg text-gray-600">
          The premier community platform for orthopedic and spine professionals to share knowledge, 
          discuss cases, and discover the latest tools and techniques.
        </p>
      </div>

      {user ? (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Welcome back, Dr. {user.lastName}!
          </h2>
          <p className="text-gray-600 mb-4">
            You're logged in as a {user.specialty} professional. Here's what's happening in your community:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold text-blue-900">Recent Posts</h3>
              <p className="text-blue-700 text-sm">Check out the latest discussions in your specialty</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="font-semibold text-green-900">New Tools</h3>
              <p className="text-green-700 text-sm">Discover the latest medical tools and equipment</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <h3 className="font-semibold text-purple-900">Medical Tools</h3>
              <p className="text-purple-700 text-sm">Discover and review medical equipment</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Join the Medical Community
          </h2>
          <p className="text-gray-600 mb-4">
            Connect with thousands of orthopedic and spine professionals worldwide. 
            Share knowledge, discuss cases, and stay updated with the latest medical tools and techniques.
          </p>
          <div className="flex space-x-4">
            <a
              href="/register"
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Join Now
            </a>
            <a
              href="/login"
              className="border border-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Sign In
            </a>
          </div>
        </div>
      )}

      {/* Featured Communities */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Featured Communities
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { name: 'Spine', icon: '🦴' },
            { name: 'Sports', icon: '🏃' },
            { name: 'Ortho Trauma', icon: '🚑' },
            { name: 'Ortho Peds', icon: '👶' },
            { name: 'Ortho Onc', icon: '🎗️' },
            { name: 'Foot & Ankle', icon: '🦶' },
            { name: 'Shoulder Elbow', icon: '💪' },
            { name: 'Hip & Knee Arthroplasty', icon: '🦴' },
            { name: 'Hand', icon: '✋' },
          ].map((community) => (
            <div key={community.name} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center space-x-3">
                <span className="text-2xl">{community.icon}</span>
                <h3 className="font-semibold text-gray-900">{community.name}</h3>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Recent Activity
        </h2>
        <div className="text-center py-8">
          <p className="text-gray-500">No recent activity to display</p>
          <p className="text-sm text-gray-400 mt-2">Join a community to see the latest discussions and posts</p>
        </div>
      </div>
    </div>
  );
};

export default Home;
