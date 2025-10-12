import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/apiService';

interface VoteButtonProps {
  postId: string;
  initialVoteScore: number;
  initialUserVote: 'upvote' | 'downvote' | null;
  onVoteChange?: (newScore: number, newUserVote: 'upvote' | 'downvote' | null) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const VoteButton: React.FC<VoteButtonProps> = ({
  postId,
  initialVoteScore,
  initialUserVote,
  onVoteChange,
  disabled = false,
  size = 'md'
}) => {
  const queryClient = useQueryClient();
  const [voteScore, setVoteScore] = useState(initialVoteScore);
  const [userVote, setUserVote] = useState(initialUserVote);
  const [isVoting, setIsVoting] = useState(false);

  // Sync state with props when they change (e.g., after page reload)
  useEffect(() => {
    setVoteScore(initialVoteScore);
    setUserVote(initialUserVote);
  }, [initialVoteScore, initialUserVote]);

  const handleVote = async (voteType: 'upvote' | 'downvote') => {
    if (isVoting || disabled) return;
    
    setIsVoting(true);
    try {
      // Optimistic update
      const newVote = userVote === voteType ? null : voteType;
      const voteChange = newVote === 'upvote' ? 1 : newVote === 'downvote' ? -1 : 0;
      const previousVoteChange = userVote === 'upvote' ? 1 : userVote === 'downvote' ? -1 : 0;
      const totalChange = voteChange - previousVoteChange;
      
      const newScore = voteScore + totalChange;
      setVoteScore(newScore);
      setUserVote(newVote);

      // Make API call
      await apiService.votePost(postId, voteType === 'upvote' ? 1 : -1);
      
      // Invalidate posts cache to refresh vote data across all devices
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      
      // Notify parent component
      if (onVoteChange) {
        onVoteChange(newScore, newVote);
      }
    } catch (error) {
      // Revert on error
      console.error('Vote failed:', error);
      setVoteScore(initialVoteScore);
      setUserVote(initialUserVote);
    } finally {
      setIsVoting(false);
    }
  };

  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  return (
    <div className={`flex items-center space-x-1 px-2 py-1 rounded-md border border-gray-200 hover:border-gray-300 transition-colors ${
      userVote === 'upvote' ? 'bg-orange-50 border-orange-200' : 
      userVote === 'downvote' ? 'bg-blue-50 border-blue-200' : 
      'bg-gray-50 hover:bg-gray-100'
    } ${isVoting || disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      {/* Upvote Arrow */}
      <button 
        onClick={() => handleVote('upvote')}
        disabled={isVoting || disabled}
        className="p-1 hover:bg-gray-200 rounded transition-colors"
      >
        <svg className={`${sizeClasses[size]} ${userVote === 'upvote' ? 'text-orange-500' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>
      
      {/* Vote Score */}
      <span className={`${textSizeClasses[size]} font-medium px-1 ${
        userVote === 'upvote' ? 'text-orange-600' : 
        userVote === 'downvote' ? 'text-blue-600' : 
        'text-gray-700'
      }`}>
        {voteScore}
      </span>
      
      {/* Downvote Arrow */}
      <button 
        onClick={() => handleVote('downvote')}
        disabled={isVoting || disabled}
        className="p-1 hover:bg-gray-200 rounded transition-colors"
      >
        <svg className={`${sizeClasses[size]} ${userVote === 'downvote' ? 'text-blue-500' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>
  );
};

export default VoteButton;
