import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// No default Content-Type — JSON default breaks multipart (same as apiService).
const api = axios.create({
  baseURL: API_BASE_URL,
});

/** Backend errorHandler uses `error`; some routes use `message`. */
function apiErrorMessage(error: unknown, fallback: string): string {
  const err = error as {
    response?: { data?: { message?: string; error?: string } };
    message?: string;
  };
  const d = err?.response?.data;
  return String(d?.message || d?.error || err?.message || fallback);
}

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const data = config.data;
    if (data instanceof FormData) {
      delete (config.headers as Record<string, unknown>)['Content-Type'];
    } else if (
      data !== undefined &&
      data !== null &&
      typeof data === 'object' &&
      !(data instanceof URLSearchParams) &&
      !(typeof Blob !== 'undefined' && data instanceof Blob)
    ) {
      (config.headers as Record<string, string>)['Content-Type'] = 'application/json';
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

export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin?: boolean;
  specialty?: string;
  medicalLicense?: string;
  institution?: string;
  yearsExperience?: number;
  profileImage?: string;
  bio?: string;
  location?: string;
  website?: string;
  isEmailVerified: boolean;
  isVerifiedPhysician?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  specialty?: string;
  medicalLicense?: string;
  institution?: string;
  yearsExperience?: number;
}

export interface RegisterFormData extends RegisterData {
  confirmPassword: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

class AuthService {
  // Login user
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await api.post('/auth/login', credentials);
      const { token, user } = response.data.data;
      
      // Store token and user data
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      
      return { token, user };
    } catch (error: any) {
      throw new Error(error.response?.data?.error || error.response?.data?.message || 'Login failed');
    }
  }

  // Register new user
  async register(userData: RegisterData): Promise<AuthResponse> {
    try {
      console.log('authService.register called with:', userData);
      const response = await api.post('/auth/register', userData);
      console.log('API response:', response.data);
      const { token, user } = response.data.data;
      
      // Store token and user data
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      
      return { token, user };
    } catch (error: any) {
      console.error('authService.register error:', error);
      console.error('error.response:', error.response);
      throw new Error(error.response?.data?.error || error.response?.data?.message || 'Registration failed');
    }
  }

  // Logout user
  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }

  // Get current user from localStorage
  getCurrentUser(): User | null {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch (error) {
        console.error('Error parsing user data:', error);
        return null;
      }
    }
    return null;
  }

  // Get token from localStorage
  getToken(): string | null {
    return localStorage.getItem('token');
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    const token = this.getToken();
    const user = this.getCurrentUser();
    return !!(token && user);
  }

  // Refresh user data from server
  async refreshUser(): Promise<User> {
    try {
      const response = await api.get('/auth/me');
      const user = response.data.data || response.data;
      
      // Update stored user data
      localStorage.setItem('user', JSON.stringify(user));
      
      return user;
    } catch (error: unknown) {
      throw new Error(apiErrorMessage(error, 'Failed to refresh user data'));
    }
  }

  // Update user profile
  async updateProfile(userData: Partial<User>): Promise<User> {
    try {
      const response = await api.put('/auth/me', userData);
      const user = response.data.data;
      
      // Update stored user data
      localStorage.setItem('user', JSON.stringify(user));
      
      return user;
    } catch (error: unknown) {
      throw new Error(apiErrorMessage(error, 'Failed to update profile'));
    }
  }

  // Change password
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      await api.put('/auth/change-password', {
        currentPassword,
        newPassword,
      });
    } catch (error: unknown) {
      throw new Error(apiErrorMessage(error, 'Failed to change password'));
    }
  }

  // Forgot password
  async forgotPassword(email: string): Promise<void> {
    try {
      await api.post('/auth/forgot-password', { email });
    } catch (error: unknown) {
      throw new Error(apiErrorMessage(error, 'Failed to send reset email'));
    }
  }

  // Reset password
  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      await api.post('/auth/reset-password', { token, newPassword });
    } catch (error: unknown) {
      throw new Error(apiErrorMessage(error, 'Failed to reset password'));
    }
  }
}

// Export singleton instance
export const authService = new AuthService();
export default authService;
