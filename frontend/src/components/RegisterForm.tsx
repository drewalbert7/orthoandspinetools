import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { RegisterFormData } from '../services/authService';
import authService from '../services/authService';
import BrandLogo from './BrandLogo';
import { DocumentMeta } from './DocumentMeta';
import { requiresPhysicianVerification, type PracticeCountry } from '../lib/physicianSpecialties';

type RegisterFormState = Omit<RegisterFormData, 'practiceCountry' | 'npiNumber'> & {
  practiceCountry: PracticeCountry | '';
  npiNumber: string;
};

const RegisterForm: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<RegisterFormState>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    specialty: '',
    medicalLicense: '',
    practiceCountry: '',
    npiNumber: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreedToPolicies, setAgreedToPolicies] = useState(false);
  const [npiStatus, setNpiStatus] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle');
  const [npiMessage, setNpiMessage] = useState('');

  const specialties = [
    'Orthopedic Surgery',
    'Spine Surgery',
    'Sports Medicine',
    'Trauma Surgery',
    'Pediatric Orthopedics',
    'Hand Surgery',
    'Foot & Ankle Surgery',
    'Joint Replacement',
    'Spine Deformity',
    'Orthopedic Oncology',
    'Physical Therapy',
    'Medical Student',
    'Resident',
    'Other',
  ];

  const isPhysician = useMemo(
    () => requiresPhysicianVerification(formData.specialty || ''),
    [formData.specialty]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'specialty' && !requiresPhysicianVerification(value)
        ? { practiceCountry: '', npiNumber: '' }
        : {}),
    }));
    if (name === 'npiNumber' || name === 'firstName' || name === 'lastName') {
      setNpiStatus('idle');
      setNpiMessage('');
    }
  };

  const handleNpiBlur = async () => {
    if (formData.practiceCountry !== 'US' || !formData.npiNumber?.trim()) return;
    if (!formData.firstName.trim() || !formData.lastName.trim()) return;

    setNpiStatus('checking');
    setNpiMessage('');
    try {
      const result = await authService.checkNpi(
        formData.npiNumber.replace(/\D/g, ''),
        formData.firstName.trim(),
        formData.lastName.trim()
      );
      if (result.verified) {
        setNpiStatus('ok');
        const cred = result.provider?.credential ? `, ${result.provider.credential}` : '';
        setNpiMessage(
          `NPI verified: ${result.provider?.firstName} ${result.provider?.lastName}${cred}`
        );
      } else {
        setNpiStatus('fail');
        setNpiMessage(result.error || 'NPI could not be verified');
      }
    } catch (err: unknown) {
      setNpiStatus('fail');
      setNpiMessage(err instanceof Error ? err.message : 'NPI lookup failed');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      setIsLoading(false);
      return;
    }

    if (!agreedToPolicies) {
      setError('You must agree to the Terms of Service and Privacy Policy');
      setIsLoading(false);
      return;
    }

    if (isPhysician && !formData.practiceCountry) {
      setError('Please select where you primarily practice');
      setIsLoading(false);
      return;
    }

    if (isPhysician && formData.practiceCountry === 'US') {
      const npi = formData.npiNumber?.replace(/\D/g, '') || '';
      if (npi.length !== 10) {
        setError('A valid 10-digit NPI is required for U.S. physicians');
        setIsLoading(false);
        return;
      }
    }

    try {
      const { confirmPassword, practiceCountry, npiNumber, ...rest } = formData;
      const registerData = {
        ...rest,
        ...(isPhysician && practiceCountry
          ? {
              practiceCountry: practiceCountry as PracticeCountry,
              ...(practiceCountry === 'US' ? { npiNumber: npiNumber?.replace(/\D/g, '') } : {}),
            }
          : {}),
      };
      const result = await register(registerData);
      const msg = result.message ? encodeURIComponent(result.message) : '';
      const emailQ = `email=${encodeURIComponent(registerData.email)}`;
      navigate(`/login?verifyEmailSent=1&${emailQ}${msg ? `&registerMsg=${msg}` : ''}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-reddit-dark py-12 px-4 sm:px-6 lg:px-8">
      <DocumentMeta title="Create account" noIndex />
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center">
            <div className="rounded-xl bg-white px-5 py-3 shadow-sm border border-gray-200/80">
              <BrandLogo heightClass="h-14" maxWidthClass="max-w-[min(100%,16rem)]" />
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-reddit">Create your account</h2>
          <p className="mt-2 text-center text-sm text-reddit-text-muted max-w-md mx-auto px-1">
            Ortho and Spine Tools - Hunt for the Best
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-reddit-card border border-reddit text-reddit px-4 py-3 rounded-md">{error}</div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-reddit">
                  First Name
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  required
                  value={formData.firstName}
                  onChange={handleChange}
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-reddit placeholder-reddit-text-muted bg-reddit-card text-reddit rounded-md focus:outline-none focus:ring-reddit-blue focus:border-reddit-blue sm:text-sm"
                  placeholder="First name"
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-reddit">
                  Last Name
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={handleChange}
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-reddit placeholder-reddit-text-muted bg-reddit-card text-reddit rounded-md focus:outline-none focus:ring-reddit-blue focus:border-reddit-blue sm:text-sm"
                  placeholder="Last name"
                />
              </div>
            </div>

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-reddit">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={formData.username}
                onChange={handleChange}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-reddit placeholder-reddit-text-muted bg-reddit-card text-reddit rounded-md focus:outline-none focus:ring-reddit-blue focus:border-reddit-blue sm:text-sm"
                placeholder="Choose a username"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-reddit">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={handleChange}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-reddit placeholder-reddit-text-muted bg-reddit-card text-reddit rounded-md focus:outline-none focus:ring-reddit-blue focus:border-reddit-blue sm:text-sm"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label htmlFor="specialty" className="block text-sm font-medium text-reddit">
                Medical Specialty
              </label>
              <select
                id="specialty"
                name="specialty"
                required
                value={formData.specialty}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-reddit bg-reddit-card text-reddit rounded-md shadow-sm focus:outline-none focus:ring-reddit-blue focus:border-reddit-blue sm:text-sm"
              >
                <option value="">Select your specialty</option>
                {specialties.map((specialty) => (
                  <option key={specialty} value={specialty}>
                    {specialty}
                  </option>
                ))}
              </select>
            </div>

            {isPhysician && (
              <>
                <div>
                  <label htmlFor="practiceCountry" className="block text-sm font-medium text-reddit">
                    Where do you primarily practice?
                  </label>
                  <select
                    id="practiceCountry"
                    name="practiceCountry"
                    required
                    value={formData.practiceCountry}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-reddit bg-reddit-card text-reddit rounded-md shadow-sm focus:outline-none focus:ring-reddit-blue focus:border-reddit-blue sm:text-sm"
                  >
                    <option value="">Select country</option>
                    <option value="US">United States (NPI verification)</option>
                    <option value="INTL">Outside the United States (manual review)</option>
                  </select>
                </div>

                {formData.practiceCountry === 'US' && (
                  <div>
                    <label htmlFor="npiNumber" className="block text-sm font-medium text-reddit">
                      NPI Number
                    </label>
                    <input
                      id="npiNumber"
                      name="npiNumber"
                      type="text"
                      inputMode="numeric"
                      required
                      maxLength={10}
                      value={formData.npiNumber}
                      onChange={handleChange}
                      onBlur={handleNpiBlur}
                      className="mt-1 appearance-none relative block w-full px-3 py-2 border border-reddit placeholder-reddit-text-muted bg-reddit-card text-reddit rounded-md focus:outline-none focus:ring-reddit-blue focus:border-reddit-blue sm:text-sm"
                      placeholder="10-digit National Provider Identifier"
                    />
                    <p className="mt-1 text-xs text-reddit-text-muted">
                      We verify U.S. physicians against the CMS National Provider Identifier Registry. Your name
                      must match the NPI record.
                    </p>
                    {npiStatus === 'checking' && (
                      <p className="mt-1 text-xs text-gray-500">Checking NPI…</p>
                    )}
                    {npiStatus === 'ok' && (
                      <p className="mt-1 text-xs text-green-700">{npiMessage}</p>
                    )}
                    {npiStatus === 'fail' && (
                      <p className="mt-1 text-xs text-red-600">{npiMessage}</p>
                    )}
                  </div>
                )}

                {formData.practiceCountry === 'INTL' && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 leading-relaxed">
                    International physicians are reviewed manually by our team after email verification. You may use
                    the platform while pending; the verified physician badge is granted after approval.
                  </div>
                )}

                {formData.practiceCountry === 'INTL' && (
                  <div>
                    <label htmlFor="medicalLicense" className="block text-sm font-medium text-reddit">
                      Medical license / registration ID (optional)
                    </label>
                    <input
                      id="medicalLicense"
                      name="medicalLicense"
                      type="text"
                      value={formData.medicalLicense}
                      onChange={handleChange}
                      className="mt-1 appearance-none relative block w-full px-3 py-2 border border-reddit placeholder-reddit-text-muted bg-reddit-card text-reddit rounded-md focus:outline-none focus:ring-reddit-blue focus:border-reddit-blue sm:text-sm"
                      placeholder="Local license or registration number"
                    />
                  </div>
                )}
              </>
            )}

            {!isPhysician && (
              <div>
                <label htmlFor="medicalLicense" className="block text-sm font-medium text-reddit">
                  License / student ID (optional)
                </label>
                <input
                  id="medicalLicense"
                  name="medicalLicense"
                  type="text"
                  value={formData.medicalLicense}
                  onChange={handleChange}
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-reddit placeholder-reddit-text-muted bg-reddit-card text-reddit rounded-md focus:outline-none focus:ring-reddit-blue focus:border-reddit-blue sm:text-sm"
                  placeholder="Optional"
                />
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-reddit">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={formData.password}
                onChange={handleChange}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-reddit placeholder-reddit-text-muted bg-reddit-card text-reddit rounded-md focus:outline-none focus:ring-reddit-blue focus:border-reddit-blue sm:text-sm"
                placeholder="Create a password"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-reddit">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={formData.confirmPassword}
                onChange={handleChange}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-reddit placeholder-reddit-text-muted bg-reddit-card text-reddit rounded-md focus:outline-none focus:ring-reddit-blue focus:border-reddit-blue sm:text-sm"
                placeholder="Confirm your password"
              />
            </div>
          </div>

          <div className="flex items-start gap-3">
            <input
              id="agreedToPolicies"
              name="agreedToPolicies"
              type="checkbox"
              required
              checked={agreedToPolicies}
              onChange={(e) => setAgreedToPolicies(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-reddit-blue focus:ring-reddit-blue"
            />
            <label htmlFor="agreedToPolicies" className="text-sm text-reddit-text-muted leading-snug">
              I agree to the{' '}
              <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-reddit-blue hover:text-blue-400">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-reddit-blue hover:text-blue-400">
                Privacy Policy
              </Link>
              .
            </label>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-reddit-orange hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-reddit-blue disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating account…' : 'Create Account'}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-reddit-text-muted">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-reddit-blue hover:text-blue-400">
                Sign in here
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RegisterForm;
