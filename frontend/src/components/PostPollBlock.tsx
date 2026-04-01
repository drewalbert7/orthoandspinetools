import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/apiService';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

function parsePollLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === 'string' ? x.trim() : String(x ?? '').trim()))
    .filter(Boolean);
}

export interface PostPollBlockProps {
  postId: string;
  pollOptions: unknown;
  pollEndsAt?: string | null;
  pollVoteCounts?: number[];
  userPollVoteIndex?: number | null;
  pollClosed?: boolean;
  compact?: boolean;
}

const PostPollBlock: React.FC<PostPollBlockProps> = ({
  postId,
  pollOptions,
  pollEndsAt,
  pollVoteCounts: initialCounts,
  userPollVoteIndex: initialUserIdx,
  pollClosed: initialClosed,
  compact,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const labels = useMemo(() => parsePollLabels(pollOptions), [pollOptions]);
  const [counts, setCounts] = useState<number[]>(initialCounts ?? []);
  const [userIdx, setUserIdx] = useState<number | null | undefined>(initialUserIdx);
  const [closed, setClosed] = useState(Boolean(initialClosed));

  useEffect(() => {
    setCounts(initialCounts ?? []);
    setUserIdx(initialUserIdx);
    setClosed(Boolean(initialClosed));
  }, [postId, initialCounts, initialUserIdx, initialClosed]);

  const total = counts.reduce((a, b) => a + b, 0);
  const endsMs = pollEndsAt ? new Date(pollEndsAt).getTime() : 0;
  const timeLeft =
    endsMs > Date.now()
      ? Math.max(0, endsMs - Date.now())
      : 0;
  const hoursLeft = Math.ceil(timeLeft / (1000 * 60 * 60));

  const voteMutation = useMutation({
    mutationFn: (optionIndex: number) => apiService.votePoll(postId, optionIndex),
    onSuccess: (data) => {
      setCounts(data.pollVoteCounts);
      setUserIdx(data.userPollVoteIndex);
      setClosed(data.pollClosed);
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Could not vote');
    },
  });

  if (labels.length < 2) return null;

  const showResults = closed || (userIdx !== null && userIdx !== undefined);
  const canVote = !closed && !!user;

  const onPick = (i: number) => {
    if (closed || voteMutation.isPending) return;
    if (!user) {
      navigate('/login');
      return;
    }
    voteMutation.mutate(i);
  };

  const optionDisabled = closed || voteMutation.isPending || (!user && !showResults);

  return (
    <div
      className={
        compact
          ? 'rounded-md border border-gray-200 bg-gray-50/80 p-2.5 mt-2'
          : 'rounded-lg border border-gray-200 bg-gray-50 p-4 my-4'
      }
      role="group"
      aria-label="Poll"
    >
      {!closed && pollEndsAt && (
        <p className="text-xs text-gray-500 mb-2">
          {timeLeft > 0 ? `Poll ends in ~${hoursLeft}h` : 'Poll ended'}
        </p>
      )}
      {closed && (
        <p className="text-xs font-medium text-gray-600 mb-2">Final results</p>
      )}
      <ul className="space-y-2">
        {labels.map((label, i) => {
          const c = counts[i] ?? 0;
          const pct = total > 0 ? Math.round((c / total) * 100) : 0;
          const isMine = userIdx === i;
          return (
            <li key={i}>
              <button
                type="button"
                disabled={optionDisabled}
                onClick={() => onPick(i)}
                className={`w-full text-left rounded-md border transition-colors ${
                  isMine
                    ? 'border-orange-400 bg-orange-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                } ${canVote && !optionDisabled ? 'cursor-pointer' : 'cursor-default'} ${compact ? 'px-2 py-1.5' : 'px-3 py-2'}`}
              >
                <div className="flex justify-between gap-2 items-center">
                  <span className={`text-gray-900 ${compact ? 'text-xs' : 'text-sm'} font-medium break-words`}>
                    {label}
                  </span>
                  {showResults && (
                    <span className="text-xs text-gray-600 tabular-nums shrink-0">
                      {pct}% · {c}
                    </span>
                  )}
                </div>
                {showResults && (
                  <div className="mt-1.5 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-orange-400 transition-[width] duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {showResults && (
        <p className="text-xs text-gray-500 mt-2">{total} vote{total !== 1 ? 's' : ''}</p>
      )}
      {!user && !closed && (
        <p className="text-xs text-gray-500 mt-2">Sign in to vote.</p>
      )}
    </div>
  );
};

export default PostPollBlock;
