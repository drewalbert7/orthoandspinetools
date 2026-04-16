import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { authService, LoginCredentials, RegisterData, User } from '../services/authService';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  logout: () => void;
  updateProfile: (userData: Partial<User>) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          // First, try to get user data from localStorage for immediate display
          const cachedUserData = authService.getCurrentUser();
          if (cachedUserData) {
            setUser(cachedUserData);
          }
          
          // Always refresh from server to get latest data (including profileImage)
          try {
            const refreshedUser = await authService.refreshUser();
            console.log('Refreshed user data:', refreshedUser);
            setUser((prev) => (prev ? { ...prev, ...refreshedUser } : refreshedUser));
          } catch (refreshError) {
            // If refresh fails, keep using cached data but log the error
            console.warn('Failed to refresh user data, using cached data:', refreshError);
            if (!cachedUserData) {
              // If no cached data and refresh failed, clear token
              localStorage.removeItem('token');
              localStorage.removeItem('user');
            }
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    try {
      console.log('AuthContext: Starting login process...');
      const response = await authService.login(credentials);
      console.log('AuthContext: Login successful, setting user:', response.user);
      setUser(response.user);
      console.log('AuthContext: User state updated');
    } catch (error) {
      console.error('AuthContext: Login error:', error);
      throw error;
    }
  }, []);

  const register = useCallback(async (userData: RegisterData) => {
    try {
      const response = await authService.register(userData);
      if (response.token) {
        setUser(response.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    authService.logout();
  }, []);

  const updateProfile = useCallback(async (userData: Partial<User>) => {
    const updatedUser = await authService.updateProfile(userData);
    setUser((prev) => (prev ? { ...prev, ...updatedUser } : updatedUser));
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const refreshedUser = await authService.refreshUser();
      setUser((prev) => (prev ? { ...prev, ...refreshedUser } : refreshedUser));
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  }, []);

  const value: AuthContextType = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      updateProfile,
      refreshUser,
    }),
    [user, loading, login, register, logout, updateProfile, refreshUser]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
