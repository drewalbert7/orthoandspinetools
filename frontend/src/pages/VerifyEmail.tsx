import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import BrandLogo from '../components/BrandLogo';
import authService from '../services/authService';

const VerifyEmail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const token = searchParams.get('token') || '';

  useEffect(() => {
    let mounted = true;
    const verify = async () => {
      if (!token) {
        setStatus('error');
        return;
      }
      try {
        await authService.verifyEmail(token);
        if (mounted) {
          setStatus('success');
          toast.success('Email verified successfully.');
        }
      } catch (err: unknown) {
        if (mounted) {
          setStatus('error');
          const message = err instanceof Error ? err.message : 'Verification failed';
          toast.error(message);
        }
      }
    };
    void verify();
    return () => {
      mounted = false;
    };
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="flex justify-center">
          <BrandLogo heightClass="h-14" maxWidthClass="max-w-[min(100%,16rem)]" />
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
          {status === 'loading' && (
            <>
              <h2 className="text-xl font-semibold text-gray-900">Verifying your email...</h2>
              <p className="mt-2 text-sm text-gray-600">Please wait while we confirm your account.</p>
            </>
          )}

          {status === 'success' && (
            <>
              <h2 className="text-xl font-semibold text-gray-900">Email verified</h2>
              <p className="mt-2 text-sm text-gray-600">Your account is now verified.</p>
            </>
          )}

          {status === 'error' && (
            <>
              <h2 className="text-xl font-semibold text-gray-900">Verification link is invalid</h2>
              <p className="mt-2 text-sm text-gray-600">
                The link may be expired or malformed. Please request a new verification email.
              </p>
            </>
          )}

          <div className="mt-6">
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
