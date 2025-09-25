export interface User {
  id: string;
  email: string;
  username: string;
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
  _count?: {
    posts: number;
    comments: number;
    toolReviews: number;
  };
}

export interface Community {
  id: string;
  name: string;
  slug: string;
  description: string;
  rules?: string;
  isPrivate: boolean;
  isActive: boolean;
  allowPosts: boolean;
  allowComments: boolean;
  requireApproval: boolean;
  createdAt: string;
  updatedAt: string;
  owner: User;
  members: User[];
  _count?: {
    members: number;
    posts: number;
  };
}

export interface Post {
  id: string;
  title: string;
  content: string;
  type: 'discussion' | 'case_study' | 'tool_review' | 'question';
  isPinned: boolean;
  isLocked: boolean;
  isDeleted: boolean;
  specialty?: string;
  caseType?: string;
  patientAge?: number;
  procedureType?: string;
  createdAt: string;
  updatedAt: string;
  author: User;
  community: Community;
  attachments: PostAttachment[];
  votes: PostVote[];
  voteScore: number;
  upvotes: number;
  downvotes: number;
  userVote?: 'upvote' | 'downvote' | null;
  _count: {
    comments: number;
    votes: number;
  };
}

export interface PostAttachment {
  id: string;
  postId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  createdAt: string;
}

export interface PostVote {
  id: string;
  postId: string;
  userId: string;
  type: 'upvote' | 'downvote';
  createdAt: string;
  user: {
    id: string;
    username: string;
  };
}

export interface Comment {
  id: string;
  content: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  author: User;
  post: {
    id: string;
    title: string;
  };
  parent?: Comment;
  replies: Comment[];
  votes: CommentVote[];
  voteScore: number;
  upvotes: number;
  downvotes: number;
  userVote?: 'upvote' | 'downvote' | null;
  _count: {
    replies: number;
    votes: number;
  };
}

export interface CommentVote {
  id: string;
  commentId: string;
  userId: string;
  type: 'upvote' | 'downvote';
  createdAt: string;
  user: {
    id: string;
    username: string;
  };
}

export interface MedicalTool {
  id: string;
  name: string;
  description: string;
  category: string;
  subCategory?: string;
  manufacturer: string;
  model?: string;
  specifications?: any;
  indications?: string;
  contraindications?: string;
  complications?: string;
  costRange?: string;
  availability?: string;
  createdAt: string;
  updatedAt: string;
  reviews: ToolReview[];
}

export interface ToolReview {
  id: string;
  rating: number;
  title: string;
  content: string;
  pros?: string;
  cons?: string;
  wouldRecommend: boolean;
  procedureType?: string;
  patientOutcome?: string;
  easeOfUse?: number;
  durability?: number;
  createdAt: string;
  updatedAt: string;
  author: User;
  tool: MedicalTool;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: PaginationInfo;
}
