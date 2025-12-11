import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/apiService';
import { authService } from '../services/authService';
import { toast } from 'react-hot-toast';
import { resizeAvatar } from '../utils/imageResize';

const ProfileSettings: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'profile' | 'password' | 'admin'>('profile');

  // Fetch current profile data
  const { data: userProfileData, isLoading } = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: () => apiService.getUserProfile(),
    enabled: !!user,
  });

  // Profile update mutation
  const profileMutation = useMutation({
    mutationFn: (data: any) => authService.updateProfile(data),
    onSuccess: async () => {
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ['user-profile', user?.id] });
      toast.success('Profile updated successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update profile');
    },
  });

  // Password change mutation
  const passwordMutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      authService.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast.success('Password changed successfully!');
      // Reset password form
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to change password');
    },
  });

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    bio: '',
    specialty: '',
    subSpecialty: '',
    institution: '',
    yearsExperience: '',
    location: '',
    website: '',
  });
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Initialize form data when profile loads
  useEffect(() => {
    if (userProfileData?.user) {
      const user = userProfileData.user;
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        bio: user.bio || '',
        specialty: user.specialty || '',
        subSpecialty: user.subSpecialty || '',
        institution: user.institution || '',
        yearsExperience: user.yearsExperience?.toString() || '',
        location: user.location || '',
        website: user.website || '',
      });
      setProfileImage(user.profileImage || null);
    }
  }, [userProfileData]);

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Please sign in to edit your profile</h1>
          <button
            onClick={() => navigate('/login')}
            className="text-blue-600 hover:text-blue-800"
          >
            Sign in here
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading profile settings...</p>
        </div>
      </div>
    );
  }

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.match(/^image\/(jpeg|jpg|png|gif|webp)$/)) {
      toast.error('Please upload a JPG, PNG, GIF, or WebP image');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      // Automatically resize and compress the image
      toast.loading('Resizing image...', { id: 'resize-toast' });
      const resizedFile = await resizeAvatar(file);
      
      toast.loading('Uploading profile picture...', { id: 'resize-toast' });
      const result = await apiService.uploadAvatar(resizedFile);
      setProfileImage(result.path);
      
      // Update profile with new image URL
      await profileMutation.mutateAsync({ profileImage: result.path });
      toast.success('Profile picture updated!', { id: 'resize-toast' });
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload profile picture', { id: 'resize-toast' });
    } finally {
      setIsUploadingAvatar(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      await profileMutation.mutateAsync({ profileImage: '' });
      setProfileImage(null);
      toast.success('Profile picture removed');
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove profile picture');
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const updateData: any = {};
    if (formData.firstName) updateData.firstName = formData.firstName;
    if (formData.lastName) updateData.lastName = formData.lastName;
    if (formData.bio !== undefined) updateData.bio = formData.bio;
    if (formData.specialty) updateData.specialty = formData.specialty;
    if (formData.subSpecialty) updateData.subSpecialty = formData.subSpecialty;
    if (formData.institution) updateData.institution = formData.institution;
    if (formData.yearsExperience) updateData.yearsExperience = parseInt(formData.yearsExperience);
    if (formData.location) updateData.location = formData.location;
    if (formData.website) updateData.website = formData.website;
    if (profileImage !== null) updateData.profileImage = profileImage;

    profileMutation.mutate(updateData);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }

    passwordMutation.mutate({
      currentPassword: passwordData.currentPassword,
      newPassword: passwordData.newPassword,
    });
  };

  const medicalSpecialties = [
    'Orthopedic Surgery',
    'Spine Surgery',
    'Sports Medicine',
    'Orthopedic Trauma',
    'Pediatric Orthopedics',
    'Orthopedic Oncology',
    'Foot & Ankle Surgery',
    'Shoulder & Elbow Surgery',
    'Hip & Knee Arthroplasty',
    'Hand Surgery',
  ];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-md p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Profile Settings</h1>
            <p className="text-gray-600 mt-1">Manage your profile information and preferences</p>
          </div>
          <button
            onClick={() => navigate('/profile')}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Back to Profile
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-6 py-3 text-sm font-medium ${
              activeTab === 'profile'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Profile Information
          </button>
          <button
            onClick={() => setActiveTab('password')}
            className={`px-6 py-3 text-sm font-medium ${
              activeTab === 'password'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Change Password
          </button>
          {user?.isAdmin && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === 'admin'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Admin Settings
            </button>
          )}
        </div>
      </div>

      {/* Profile Information Tab */}
      {activeTab === 'profile' && (
        <div className="bg-white border border-gray-200 rounded-md p-6">
          <form onSubmit={handleProfileSubmit} className="space-y-6">
            {/* Profile Picture */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Picture</h2>
              <div className="flex items-center space-x-6">
                {/* Current Profile Picture */}
                <div className="flex-shrink-0">
                  {profileImage ? (
                    <img
                      src={profileImage}
                      alt="Profile"
                      className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center border-2 border-gray-200">
                      <span className="text-white font-bold text-2xl">
                        {userProfileData?.user?.firstName?.[0] || ''}{userProfileData?.user?.lastName?.[0] || ''}
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Upload Controls */}
                <div className="flex-1">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Upload Profile Picture
                      </label>
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png"
                        onChange={handleAvatarUpload}
                        disabled={isUploadingAvatar || profileMutation.isPending}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Any image format. Automatically resized to 256x256px and optimized.
                      </p>
                    </div>
                    
                    {profileImage && (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        disabled={isUploadingAvatar || profileMutation.isPending}
                        className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        Remove picture
                      </button>
                    )}
                    
                    {isUploadingAvatar && (
                      <p className="text-sm text-gray-500">Uploading...</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Basic Information */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleProfileChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleProfileChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Bio */}
            <div>
              <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">
                Bio
              </label>
              <textarea
                id="bio"
                name="bio"
                    value={formData.bio}
                onChange={handleProfileChange}
                rows={4}
                maxLength={500}
                placeholder="Tell us about yourself..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
                  <p className="mt-1 text-sm text-gray-500">{formData.bio.length}/500 characters</p>
            </div>

            {/* Medical Information */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Medical Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="specialty" className="block text-sm font-medium text-gray-700 mb-1">
                    Specialty
                  </label>
                  <select
                    id="specialty"
                    name="specialty"
                    value={formData.specialty}
                    onChange={handleProfileChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a specialty</option>
                    {medicalSpecialties.map((spec) => (
                      <option key={spec} value={spec}>
                        {spec}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="subSpecialty" className="block text-sm font-medium text-gray-700 mb-1">
                    Sub-Specialty
                  </label>
                  <input
                    type="text"
                    id="subSpecialty"
                    name="subSpecialty"
                    value={formData.subSpecialty}
                    onChange={handleProfileChange}
                    placeholder="e.g., Minimally Invasive Spine"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="institution" className="block text-sm font-medium text-gray-700 mb-1">
                    Institution
                  </label>
                  <input
                    type="text"
                    id="institution"
                    name="institution"
                    value={formData.institution}
                    onChange={handleProfileChange}
                    placeholder="e.g., Mayo Clinic"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="yearsExperience" className="block text-sm font-medium text-gray-700 mb-1">
                    Years of Experience
                  </label>
                  <input
                    type="number"
                    id="yearsExperience"
                    name="yearsExperience"
                    value={formData.yearsExperience}
                    onChange={handleProfileChange}
                    min="0"
                    max="50"
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    id="location"
                    name="location"
                    value={formData.location}
                    onChange={handleProfileChange}
                    placeholder="e.g., New York, NY"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="website" className="block text-sm font-medium text-gray-700 mb-1">
                    Website
                  </label>
                  <input
                    type="url"
                    id="website"
                    name="website"
                    value={formData.website}
                    onChange={handleProfileChange}
                    placeholder="https://example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={profileMutation.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {profileMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Change Password Tab */}
      {activeTab === 'password' && (
        <div className="bg-white border border-gray-200 rounded-md p-6">
          <form onSubmit={handlePasswordSubmit} className="space-y-6 max-w-md">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h2>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Current Password *
                  </label>
                  <input
                    type="password"
                    id="currentPassword"
                    name="currentPassword"
                    value={passwordData.currentPassword}
                    onChange={handlePasswordChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    New Password *
                  </label>
                  <input
                    type="password"
                    id="newPassword"
                    name="newPassword"
                    value={passwordData.newPassword}
                    onChange={handlePasswordChange}
                    required
                    minLength={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-sm text-gray-500">Must be at least 8 characters</p>
                </div>
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm New Password *
                  </label>
                  <input
                    type="password"
                    id="confirmPassword"
                    name="confirmPassword"
                    value={passwordData.confirmPassword}
                    onChange={handlePasswordChange}
                    required
                    minLength={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={passwordMutation.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {passwordMutation.isPending ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Admin Settings Tab - Only visible to admins */}
      {activeTab === 'admin' && user?.isAdmin && (
        <div className="bg-white border border-gray-200 rounded-md p-6">
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Admin Settings</h2>
              <p className="text-sm text-gray-600 mb-6">
                These settings are only visible to administrators. Use these tools to manage the platform.
              </p>
            </div>

            {/* Quick Actions */}
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-md font-semibold text-gray-900 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link
                  to="/admin"
                  className="p-4 border border-gray-200 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <div>
                      <p className="font-medium text-gray-900">Admin Dashboard</p>
                      <p className="text-sm text-gray-500">Manage users, communities, and content</p>
                    </div>
                  </div>
                </Link>
                <div className="p-4 border border-gray-200 rounded-md">
                  <div className="flex items-center space-x-3">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <div>
                      <p className="font-medium text-gray-900">Platform Statistics</p>
                      <p className="text-sm text-gray-500">View analytics and metrics</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Admin Information */}
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-md font-semibold text-gray-900 mb-4">Admin Information</h3>
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-700">Admin Status:</span>
                    <span className="text-sm text-blue-600 font-semibold">Active Administrator</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-700">User ID:</span>
                    <span className="text-sm text-gray-600 font-mono">{user.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-700">Username:</span>
                    <span className="text-sm text-gray-600">@{user.username}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-700">Email:</span>
                    <span className="text-sm text-gray-600">{user.email}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Security Notice */}
            <div className="border-t border-gray-200 pt-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <div className="flex items-start space-x-3">
                  <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-yellow-800">Security Notice</p>
                    <p className="text-sm text-yellow-700 mt-1">
                      As an administrator, you have full access to manage the platform. Please use these privileges responsibly and in accordance with platform policies.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileSettings;

