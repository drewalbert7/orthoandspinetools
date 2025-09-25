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
              <h3 className="font-semibold text-purple-900">Case Studies</h3>
              <p className="text-purple-700 text-sm">Learn from real-world medical cases</p>
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
          Featured Medical Communities
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { name: 'Orthopedic Surgery', members: '1,250', icon: '🦴' },
            { name: 'Spine Surgery', members: '890', icon: '🦴' },
            { name: 'Sports Medicine', members: '650', icon: '🏃' },
            { name: 'Trauma Surgery', members: '420', icon: '🚑' },
            { name: 'Pediatric Orthopedics', members: '380', icon: '👶' },
            { name: 'Hand Surgery', members: '320', icon: '✋' },
          ].map((community) => (
            <div key={community.name} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center space-x-3 mb-2">
                <span className="text-2xl">{community.icon}</span>
                <h3 className="font-semibold text-gray-900">{community.name}</h3>
              </div>
              <p className="text-sm text-gray-600">{community.members} members</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Recent Activity
        </h2>
        <div className="space-y-4">
          {[
            {
              type: 'post',
              title: 'New Technique for Minimally Invasive Spine Surgery',
              author: 'Dr. Sarah Johnson',
              community: 'Spine Surgery',
              time: '2 hours ago',
            },
            {
              type: 'tool',
              title: 'Review: Latest Generation Hip Replacement Implant',
              author: 'Dr. Michael Chen',
              community: 'Joint Replacement',
              time: '4 hours ago',
            },
            {
              type: 'case',
              title: 'Complex Pediatric Scoliosis Case Discussion',
              author: 'Dr. Emily Rodriguez',
              community: 'Pediatric Orthopedics',
              time: '6 hours ago',
            },
          ].map((activity, index) => (
            <div key={index} className="border-l-4 border-blue-500 pl-4 py-2">
              <h3 className="font-semibold text-gray-900">{activity.title}</h3>
              <p className="text-sm text-gray-600">
                by {activity.author} in {activity.community} • {activity.time}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Home;
