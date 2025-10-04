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
  post?: { id: string; title: string };
}

export interface Community {
  id: string;
  name: string;
  slug: string;
  description: string;
  specialty?: string;
  memberCount?: number;
  postCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
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
    postsCount: number;
    commentsCount: number;
    communitiesCount: number;
  };
  posts: Post[];
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
  url: string;
  postId: string;
  createdAt: string;
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

  async getPost(id: string): Promise<Post> {
    try {
      const response = await api.get(`/posts/${id}`);
      return response.data;
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
      return response.data.data?.comments || response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch comments');
    }
  }

  async createComment(postId: string, content: string, parentId?: string): Promise<Comment> {
    try {
      const response = await api.post(`/posts/${postId}/comments`, {
        content,
        parentId,
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to create comment');
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
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;
