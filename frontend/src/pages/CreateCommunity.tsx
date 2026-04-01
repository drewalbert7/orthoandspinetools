import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/apiService';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const CreateCommunity: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [permissionReady, setPermissionReady] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await refreshUser();
      } catch {
        /* keep cached user */
      } finally {
        if (!cancelled) setPermissionReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, navigate, refreshUser]);

  const explicitlyDenied = user?.canCreateCommunity === false;

  const mutation = useMutation({
    mutationFn: () =>
      apiService.createCommunity({
        name: name.trim(),
        description: description.trim(),
        ...(rules.trim() ? { rules: rules.trim() } : {}),
        ...(slug.trim() ? { slug: slug.trim().toLowerCase() } : {}),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['communities'] });
      toast.success('Community created');
      navigate(`/community/${data.slug}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Could not create community');
    },
  });

  if (!user) {
    return null;
  }

  if (permissionReady && explicitlyDenied) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Cannot create a community</h1>
        <p className="text-gray-600 mb-6">
          Only site administrators and users who already moderate or own a community can create new
          ones. Ask an admin if you need a new space.
        </p>
        <Link to="/" className="text-sm font-medium text-blue-600 hover:text-blue-800">
          ← Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-3 sm:px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Create a community</h1>
        <p className="text-sm text-gray-600 mt-1">
          You will be the owner and can manage settings, moderators, and topic tags.
        </p>
      </div>

      <form
        className="space-y-4 bg-white border border-gray-200 rounded-lg shadow-sm p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || description.trim().length < 10) {
            toast.error('Add a name and a description (at least 10 characters).');
            return;
          }
          mutation.mutate();
        }}
      >
        <div>
          <label htmlFor="cc-name" className="block text-sm font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            id="cc-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g. Foot & Ankle"
            required
          />
        </div>

        <div>
          <label htmlFor="cc-slug" className="block text-sm font-medium text-gray-700 mb-1">
            URL slug <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="cc-slug"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase())}
            maxLength={80}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="auto from name if empty"
          />
          <p className="text-xs text-gray-500 mt-1">Lowercase letters, numbers, and hyphens only.</p>
        </div>

        <div>
          <label htmlFor="cc-desc" className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            id="cc-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={2000}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="What is this community for?"
            required
          />
        </div>

        <div>
          <label htmlFor="cc-rules" className="block text-sm font-medium text-gray-700 mb-1">
            Rules <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            id="cc-rules"
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            rows={4}
            maxLength={10000}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Community guidelines for members"
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
          <Link
            to="/"
            className="inline-flex justify-center items-center min-h-[44px] px-4 rounded-full border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={mutation.isPending || !permissionReady}
            className="inline-flex justify-center items-center min-h-[44px] px-5 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating…' : 'Create community'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateCommunity;
