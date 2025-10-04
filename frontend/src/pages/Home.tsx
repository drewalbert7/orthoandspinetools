import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiService, Post } from '../services/apiService';
import { Link } from 'react-router-dom';

// PostCard component for displaying individual posts
const PostCard: React.FC<{ post: Post }> = ({ post }) => {
  const [voteScore, setVoteScore] = React.useState(post.voteScore || 0);
  const [userVote, setUserVote] = React.useState(post.userVote);
  const [isVoting, setIsVoting] = React.useState(false);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'now';
    if (diffInHours < 24) return `${diffInHours}h`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleVote = async (voteType: 'upvote' | 'downvote') => {
    if (isVoting) return;
    
    setIsVoting(true);
    try {
      // Optimistic update
      const newVote = userVote === voteType ? null : voteType;
      const voteChange = newVote === 'upvote' ? 1 : newVote === 'downvote' ? -1 : 0;
      const previousVoteChange = userVote === 'upvote' ? -1 : userVote === 'downvote' ? 1 : 0;
      const totalChange = voteChange - previousVoteChange;
      
      setVoteScore(prev => prev + totalChange);
      setUserVote(newVote);

      // Make API call
      await apiService.votePost(post.id, voteType === 'upvote' ? 1 : -1);
    } catch (error) {
      // Revert on error
      console.error('Vote failed:', error);
      setVoteScore(post.voteScore || 0);
      setUserVote(post.userVote);
    } finally {
      setIsVoting(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 hover:border-gray-300 transition-colors">
      {/* Content Section */}
      <div className="p-3">
        {/* Post Header */}
        <div className="flex items-center space-x-1 text-xs text-gray-500 mb-1">
          <Link 
            to={`/community/${post.community.slug}`}
            className="font-medium text-gray-900 hover:underline"
          >
            r/{post.community.name}
          </Link>
          <span>•</span>
          <span>Posted by u/{post.author.username}</span>
          <span>•</span>
          <span>{formatDate(post.createdAt)}</span>
        </div>

        {/* Post Title and Content */}
        <Link to={`/post/${post.id}`} className="block">
          <h3 className="text-lg font-medium text-gray-900 mb-2 hover:text-blue-600 transition-colors leading-tight">
            {post.title}
          </h3>
          <p className="text-gray-800 text-sm leading-relaxed mb-3 line-clamp-3">
            {post.content}
          </p>
        </Link>

        {/* Action Bar with Voting - Reddit Style */}
        <div className="flex items-center space-x-2 text-xs text-gray-500 pt-2 border-t border-gray-100">
          {/* Voting Section - Combined Button */}
          <button 
            onClick={() => handleVote('upvote')}
            disabled={isVoting}
            className={`flex items-center space-x-1 px-2 py-1 rounded-md border border-gray-200 hover:border-gray-300 transition-colors ${
              userVote === 'upvote' ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <svg className={`w-4 h-4 ${userVote === 'upvote' ? 'text-orange-500' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
            <span className={`text-sm font-medium ${userVote === 'upvote' ? 'text-orange-600' : 'text-gray-700'}`}>
              {voteScore}
            </span>
            <svg className={`w-4 h-4 ${userVote === 'downvote' ? 'text-blue-500' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Comments */}
          <button className="flex items-center space-x-1 px-2 py-1 rounded-md border border-gray-200 hover:border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-sm font-medium text-gray-700">{post._count?.comments || 0}</span>
          </button>

          {/* Awards */}
          <button className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 hover:border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </button>

          {/* Share */}
          <button className="flex items-center space-x-1 px-2 py-1 rounded-md border border-gray-200 hover:border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.632-2.684 3 3 0 00-5.632 2.684zm0 9.316a3 3 0 105.632 2.684 3 3 0 00-5.632-2.684z" />
            </svg>
            <span className="text-sm font-medium text-gray-700">Share</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const Home: React.FC = () => {

  // Fetch posts from all communities
  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ['posts', 'home'],
    queryFn: () => apiService.getPosts({ limit: 20, sort: 'newest' }),
  });

  const posts = postsData?.posts || [];

  return (
    <div className="max-w-4xl mx-auto bg-gray-100 min-h-screen">
      {/* Posts Feed */}
      <div className="space-y-2 p-4">
        {postsLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Loading posts...</span>
          </div>
        ) : posts.length > 0 ? (
          posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))
        ) : (
          <div className="bg-white border border-gray-200 p-6 text-center">
            <p className="text-gray-500">No posts available yet</p>
            <p className="text-sm text-gray-400 mt-2">Be the first to share something with the community!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
