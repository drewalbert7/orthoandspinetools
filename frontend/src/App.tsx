import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'react-hot-toast';

// Components
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import LoginForm from './components/LoginForm';
import RegisterForm from './components/RegisterForm';

// Pages
import Home from './pages/Home';
import Popular from './pages/Popular';
import Startups from './pages/Startups';
import Cases from './pages/Cases';
import MaudeTrends from './pages/MaudeTrends';
import PostDetail from './pages/PostDetail';
import EditPost from './pages/EditPost';
import CreatePost from './pages/CreatePost';
import Profile from './pages/Profile';
import UserProfile from './pages/UserProfile';
import ProfileSettings from './pages/ProfileSettings';
import Community from './pages/Community';
import CommunitySettings from './pages/CommunitySettings';
import CreateCommunity from './pages/CreateCommunity';
import AdminDashboard from './pages/AdminDashboard';
import Search from './pages/Search';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import GoogleAnalytics from './components/GoogleAnalytics';
import SitePolicyBanner from './components/SitePolicyBanner';
import SiteFooter from './components/SiteFooter';

// Context
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';

// Styles
import './index.css';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

function ThemedToaster() {
  const { resolved } = useTheme();
  const dark = resolved === 'dark';
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        style: dark
          ? {
              background: '#1c2538',
              color: '#e8eef7',
              border: '1px solid #2a3548',
            }
          : {
              background: '#ffffff',
              color: '#111827',
              border: '1px solid #e5e7eb',
            },
        success: {
          iconTheme: {
            primary: dark ? '#34d399' : '#059669',
            secondary: dark ? '#1c2538' : '#ffffff',
          },
        },
        error: {
          iconTheme: {
            primary: dark ? '#f87171' : '#dc2626',
            secondary: dark ? '#1c2538' : '#ffffff',
          },
        },
      }}
    />
  );
}

function App() {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const toggleMobileSidebar = () => {
    setIsMobileSidebarOpen(!isMobileSidebarOpen);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Router>
            <GoogleAnalytics />
            <div className="min-h-screen bg-gray-50 text-gray-900">
              <Header
                isMobileSidebarOpen={isMobileSidebarOpen}
                onMobileSidebarToggle={toggleMobileSidebar}
              />
              <SitePolicyBanner />
              <div className="flex min-w-0">
                <Sidebar
                  isMobileOpen={isMobileSidebarOpen}
                  onMobileClose={() => setIsMobileSidebarOpen(false)}
                />
                <main className="min-w-0 w-full flex-1 p-3 sm:p-4 md:p-6">
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/popular" element={<Popular />} />
                    <Route path="/startups" element={<Startups />} />
                    <Route path="/cases" element={<Cases />} />
                    <Route path="/maude" element={<MaudeTrends />} />
                    <Route path="/search" element={<Search />} />
                    <Route path="/login" element={<LoginForm />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/verify-email" element={<VerifyEmail />} />
                    <Route path="/register" element={<RegisterForm />} />
                    <Route path="/privacy" element={<PrivacyPolicy />} />
                    <Route path="/terms" element={<TermsOfService />} />
                    <Route path="/post/:id/edit" element={<EditPost />} />
                    <Route path="/post/:id" element={<PostDetail />} />
                    {/* ⚠️ CRITICAL ROUTE: CreatePost page - DO NOT REMOVE without backup */}
                    <Route path="/create-post" element={<CreatePost />} />
                    <Route path="/create-community" element={<CreateCommunity />} />
                    <Route path="/user/:username" element={<UserProfile />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/profile/settings" element={<ProfileSettings />} />
                    <Route path="/admin" element={<AdminDashboard />} />
                    <Route path="/community/:slug" element={<Community />} />
                    <Route path="/community/:slug/settings" element={<CommunitySettings />} />
                  </Routes>
                </main>
              </div>
              <SiteFooter />
            </div>
          </Router>
        </AuthProvider>
        <ThemedToaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
