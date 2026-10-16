import React from 'react';
import { Link } from 'react-router-dom';
import { DocumentMeta } from '../components/DocumentMeta';

const NotFound: React.FC = () => {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <DocumentMeta
        title="Page Not Found"
        description="The page you're looking for doesn't exist on OrthoAndSpineTools."
        noIndex
      />
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Page Not Found</h2>
        <p className="text-gray-600 mb-8">
          The page you're looking for doesn't exist or may have been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/"
            className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            Go to Home
          </Link>
          <Link
            to="/implants"
            className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-md hover:bg-gray-50 transition-colors"
          >
            Browse Implants
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
