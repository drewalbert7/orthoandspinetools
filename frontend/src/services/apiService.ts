import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://orthoandspinetools.com/api';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid, clear storage and redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface Post {
  id: string;
  title: string;
  content: string;
  authorId: string;
  communityId: string;
  type?: 'discussion' | 'case_study' | 'tool_review' | 'question';
  postType?: 'discussion' | 'case_study' | 'tool_review';
  specialty?: string;
  patientAge?: number;
  procedureType?: string;
  attachments: Attachment[];
  votes: Vote[];
  comments?: Comment[];
  createdAt: string;
  updatedAt: string;
  author: User;
  community: Community;
  // Derived fields from API transforms
  voteScore?: number;
  upvotes?: number;
  downvotes?: number;
  userVote?: 'upvote' | 'downvote' | null;
  commentsCount?: number;
  _count?: { comments: number; votes: number };
  // Moderation fields
  isLocked?: boolean;
  isPinned?: boolean;
  isDeleted?: boolean;
}

export interface Comment {
  id: string;
  content: string;
  authorId: string;
  postId: string;
  parentId?: string;
  votes: Vote[];
  replies: Comment[];
  createdAt: string;
  updatedAt: string;
  author: User;
  // Derived/optional fields used by UI
  isDeleted?: boolean;
  voteScore?: number;
  upvotes?: number;
  downvotes?: number;
  userVote?: 'upvote' | 'downvote' | null;
  _count?: { replies: number; votes: number };
  post?: { 
    id: string; 
    title: string;
    community?: {
      id: string;
      name: string;
      slug: string;
    };
  };
}

export interface Community {
  id: string;
  name: string;
  slug: string;
  description: string;
  profileImage?: string;
  bannerImage?: string;
  ownerId?: string;
  moderators?: Array<{ 
    userId: string; 
    role: string;
    user?: {
      id: string;
      username: string;
      firstName: string;
      lastName: string;
      specialty?: string;
      profileImage?: string;
    }
  }>;
  specialty?: string;
  memberCount?: number;
  postCount?: number;
  weeklyVisitors?: number;
  weeklyContributions?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin?: boolean;
  specialty?: string;
  subSpecialty?: string;
  medicalLicense?: string;
  institution?: string;
  yearsExperience?: number;
  bio?: string;
  profileImage?: string;
  location?: string;
  website?: string;
  isEmailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface UserProfile {
  user: User;
  stats: {
    karma: number;
    postKarma: number;
    commentKarma: number;
    awardKarma: number;
    totalKarma: number;
    postsCount: number;
    commentsCount: number;
    communitiesCount: number;
  };
  posts: Post[];
  comments?: Comment[];
  communities: Community[];
}

export interface Vote {
  id: string;
  userId: string;
  postId?: string;
  commentId?: string;
  value: 1 | -1; // 1 for upvote, -1 for downvote
  type?: 'upvote' | 'downvote';
  createdAt: string;
}

export interface Attachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  postId: string;
  createdAt: string;
  // Cloudinary fields
  cloudinaryPublicId?: string;
  cloudinaryUrl?: string;
  optimizedUrl?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface MedicalTool {
  id: string;
  name: string;
  manufacturer: string;
  category: string;
  description: string;
  specifications: Record<string, any>;
  imageUrl?: string;
  reviews: ToolReview[];
  averageRating: number;
  createdAt: string;
  updatedAt: string;
}

export interface ToolReview {
  id: string;
  toolId: string;
  userId: string;
  rating: number;
  review: string;
  pros: string[];
  cons: string[];
  createdAt: string;
  updatedAt: string;
  user: User;
}

class ApiService {
  // Posts
  async getPosts(params: { page?: number; limit?: number; sort?: string; community?: string } = {}): Promise<{ posts: Post[]; pagination: { page: number; pages: number } }> {
    try {
      const search = new URLSearchParams();
      if (params.page) search.set('page', String(params.page));
      if (params.limit) search.set('limit', String(params.limit));
      if (params.sort) search.set('sort', params.sort);
      if (params.community) search.set('community', params.community);
      const response = await api.get(`/posts?${search.toString()}`);
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch posts');
    }
  }

  async getFeed(params: { page?: number; limit?: number; sort?: string } = {}): Promise<{ posts: Post[]; pagination: { page: number; pages: number } }> {
    try {
      const search = new URLSearchParams();
      if (params.page) search.set('page', String(params.page));
      if (params.limit) search.set('limit', String(params.limit));
      if (params.sort) search.set('sort', params.sort);
      const response = await api.get(`/posts/feed?${search.toString()}`);
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch feed');
    }
  }

  async getPost(id: string): Promise<Post> {
    try {
      const response = await api.get(`/posts/${id}`);
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch post');
    }
  }

  async createPost(postData: {
    title: string;
    content: string;
    communityId: string;
    postType: 'discussion' | 'case_study' | 'tool_review';
    patientAge?: number;
    procedureType?: string;
    attachments?: Array<{ path: string; filename: string; originalName: string; type: 'image' | 'video' }>;
  }): Promise<Post> {
    try {
      // Map postType to type for backend compatibility
      const { postType, ...rest } = postData;
      const backendData = {
        ...rest,
        type: postType,
      };
      
      const response = await api.post('/posts', backendData);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to create post');
    }
  }

  async updatePost(id: string, postData: Partial<Post>): Promise<Post> {
    try {
      const response = await api.put(`/posts/${id}`, postData);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to update post');
    }
  }

  async deletePost(id: string): Promise<void> {
    try {
      await api.delete(`/posts/${id}`);
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to delete post');
    }
  }

  // Comments
  async getComments(postId: string): Promise<Comment[]> {
    try {
      const response = await api.get(`/comments/post/${postId}`);
      // Backend returns { success: true, data: { comments: [...], pagination: {...} } }
      if (response.data.data?.comments) {
        return response.data.data.comments;
      }
      // Fallback for different response structures
      if (Array.isArray(response.data.data)) {
        return response.data.data;
      }
      if (Array.isArray(response.data)) {
        return response.data;
      }
      return [];
    } catch (error: any) {
      console.error('Error fetching comments:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch comments');
    }
  }

  async createComment(postId: string, content: string, parentId?: string): Promise<Comment> {
    try {
      const payload: any = {
        postId: String(postId),
        content: String(content).trim(),
      };
      
      if (parentId) {
        payload.parentId = String(parentId);
      }
      
      console.log('🌐 API: Creating comment', { payload, url: '/comments' });
      const response = await api.post('/comments', payload);
      console.log('🌐 API: Comment created response', { status: response.status, data: response.data });
      
      // Handle different response structures
      if (response.data?.data) {
        return response.data.data;
      }
      if (response.data?.success && response.data?.data) {
        return response.data.data;
      }
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message 
        || error.response?.data?.error 
        || error.message 
        || 'Failed to create comment';
      
      throw new Error(errorMessage);
    }
  }

  async updateComment(id: string, content: string): Promise<Comment> {
    try {
      const response = await api.put(`/comments/${id}`, { content });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to update comment');
    }
  }

  async deleteComment(id: string): Promise<void> {
    try {
      await api.delete(`/comments/${id}`);
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to delete comment');
    }
  }

  // Voting
  async votePost(postId: string, value: 1 | -1): Promise<Vote> {
    try {
      const type = value === 1 ? 'upvote' : 'downvote';
      const response = await api.post(`/posts/${postId}/vote`, { type });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to vote on post');
    }
  }

  async voteComment(commentId: string, value: 1 | -1): Promise<Vote> {
    try {
      const type = value === 1 ? 'upvote' : 'downvote';
      const response = await api.post(`/comments/${commentId}/vote`, { type });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to vote on comment');
    }
  }

  // Communities
  async getCommunities(): Promise<Community[]> {
    try {
      const response = await api.get('/communities');
      return response.data.data || response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch communities');
    }
  }

  async getCommunity(id: string): Promise<Community> {
    try {
      const response = await api.get(`/communities/${id}`);
      return response.data.data || response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch community');
    }
  }

  async updateCommunity(id: string, data: { profileImage?: string; bannerImage?: string; description?: string }): Promise<Community> {
    try {
      const response = await api.put(`/communities/${id}`, data);
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to update community');
    }
  }

  async uploadCommunityBanner(file: File): Promise<{ imageUrl: string }> {
    try {
      const formData = new FormData();
      formData.append('banner', file);
      
      const response = await api.post('/upload/community-banner', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to upload banner');
    }
  }

  async uploadPostImages(files: File[]): Promise<Array<{ path: string; filename: string; originalName: string; size: number; mimetype: string; cloudinaryUrl?: string; cloudinaryPublicId?: string }>> {
    try {
      const formData = new FormData();
      files.forEach(file => formData.append('images', file));
      
      const response = await api.post('/upload/post-images-cloudinary', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data.data.map((item: any) => ({
        path: item.url || item.cloudinaryUrl || item.path,
        filename: item.filename,
        originalName: item.originalName,
        size: item.size,
        mimetype: item.mimetype,
        cloudinaryUrl: item.url || item.cloudinaryUrl,
        cloudinaryPublicId: item.cloudinaryPublicId
      }));
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to upload images');
    }
  }

  async uploadPostVideos(files: File[]): Promise<Array<{ path: string; filename: string; originalName: string; size: number; mimetype: string; cloudinaryUrl?: string; cloudinaryPublicId?: string; duration?: number }>> {
    try {
      const formData = new FormData();
      files.forEach(file => formData.append('videos', file));
      
      const response = await api.post('/upload/post-videos-cloudinary', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data.data.map((item: any) => ({
        path: item.url || item.cloudinaryUrl || item.path,
        filename: item.filename,
        originalName: item.originalName,
        size: item.size,
        mimetype: item.mimetype,
        cloudinaryUrl: item.url || item.cloudinaryUrl,
        cloudinaryPublicId: item.cloudinaryPublicId,
        duration: item.duration
      }));
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to upload videos');
    }
  }

  async uploadAvatar(file: File): Promise<{ path: string; filename: string; originalName: string; size: number; mimetype: string; width: number; height: number }> {
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      
      const response = await api.post('/upload/avatar-cloudinary', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      const item = response.data.data;
      return {
        path: item.url || item.path,
        filename: item.filename,
        originalName: item.originalName,
        size: item.size,
        mimetype: item.mimetype,
        width: item.width,
        height: item.height
      };
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to upload avatar');
    }
  }

  // User Profile
  async getUserProfile(): Promise<UserProfile> {
    try {
      const response = await api.get('/auth/profile');
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch user profile');
    }
  }

  async getUserCommunities(): Promise<Community[]> {
    try {
      const response = await api.get('/auth/communities');
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch user communities');
    }
  }

  async followCommunity(communityId: string): Promise<{ following: boolean; message: string }> {
    try {
      const response = await api.post(`/auth/communities/${communityId}/follow`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to follow/unfollow community');
    }
  }

  // Medical Tools
  async getMedicalTools(page = 1, limit = 20, search?: string): Promise<{ tools: MedicalTool[]; total: number }> {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      
      if (search) {
        params.append('search', search);
      }
      
      const response = await api.get(`/tools?${params}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch medical tools');
    }
  }

  async getMedicalTool(id: string): Promise<MedicalTool> {
    try {
      const response = await api.get(`/tools/${id}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch medical tool');
    }
  }

  // File Upload
  async uploadFile(file: File, postId?: string): Promise<Attachment> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      if (postId) {
        formData.append('postId', postId);
      }
      
      const response = await api.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to upload file');
    }
  }

  // Moderation
  async getModerationQueue(type: 'post' | 'comment' = 'post', page = 1, limit = 20): Promise<any> {
    try {
      const response = await api.get(`/moderation/queue?type=${type}&page=${page}&limit=${limit}`);
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch moderation queue');
    }
  }

  async getModerationUsers(page = 1, limit = 20, search?: string): Promise<any> {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (search) params.append('search', search);
      
      const response = await api.get(`/moderation/users?${params}`);
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch users');
    }
  }

  async banUser(userId: string, banned: boolean, reason?: string): Promise<void> {
    try {
      await api.post(`/moderation/users/${userId}/ban`, { banned, reason });
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to ban/unban user');
    }
  }

  async promoteUser(userId: string, isAdmin: boolean): Promise<void> {
    try {
      await api.post(`/moderation/users/${userId}/promote`, { isAdmin });
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to promote/demote user');
    }
  }

  async addCommunityModerator(communityId: string, userId: string): Promise<void> {
    try {
      await api.post(`/moderation/communities/${communityId}/moderators`, {
        userId,
        action: 'add',
      });
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to add moderator');
    }
  }

  async removeCommunityModerator(communityId: string, userId: string): Promise<void> {
    try {
      await api.post(`/moderation/communities/${communityId}/moderators`, {
        userId,
        action: 'remove',
      });
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to remove moderator');
    }
  }

  async getModerationPermissions(): Promise<any> {
    try {
      const response = await api.get('/moderation/permissions');
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch moderation permissions');
    }
  }

  async getCommunityModerators(communityId: string): Promise<any> {
    try {
      const response = await api.get(`/moderation/communities/${communityId}/moderators`);
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch community moderators');
    }
  }

  async searchUsers(query: string, communityId?: string): Promise<any> {
    try {
      const params = new URLSearchParams({ q: query });
      if (communityId) params.append('communityId', communityId);
      const response = await api.get(`/moderation/users/search?${params.toString()}`);
      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to search users');
    }
  }

  async lockPost(postId: string, locked: boolean): Promise<void> {
    try {
      await api.post(`/posts/${postId}/lock`, { locked });
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to lock/unlock post');
    }
  }

  async pinPost(postId: string, pinned: boolean): Promise<void> {
    try {
      await api.post(`/posts/${postId}/pin`, { pinned });
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to pin/unpin post');
    }
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;
