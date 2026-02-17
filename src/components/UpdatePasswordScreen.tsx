
import { useState, useEffect } from 'react';
import { Eye, EyeOff, Lock, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { supabase } from '../utils/supabase/client';
import { Capacitor } from '@capacitor/core';

interface UpdatePasswordScreenProps {
  onNavigate?: (screen: string) => void;
}

export default function UpdatePasswordScreen({ onNavigate }: UpdatePasswordScreenProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [isWebMobile, setIsWebMobile] = useState(false);
  const [isResetFlow, setIsResetFlow] = useState(false);

  const glassCardStyle: React.CSSProperties = {
    backdropFilter: 'blur(10px)',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    borderRadius: '25px',
    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
  };

  useEffect(() => {
    // Check if user is coming from a reset link (presence of access_token/type=recovery in hash or URL)
    const hash = window.location.hash;
    const searchParams = new URLSearchParams(window.location.search);
    const isRecovery = hash.includes('type=recovery') || searchParams.get('type') === 'recovery' || hash.includes('access_token=');
    setIsResetFlow(isRecovery);

    // Check if running on mobile web (not native app)
    if (!Capacitor.isNativePlatform() && typeof window !== 'undefined') {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        setIsWebMobile(true);
        // Attempt auto-redirect to app
        const deepLink = `eacoder://update-password${window.location.hash || window.location.search}`;
        // Use a timeout to allow the page to render first (better UX/browser handling)
        setTimeout(() => {
           window.location.href = deepLink;
        }, 100);
      }
    }

    // Check if user is authenticated (Supabase handles the token in URL automatically)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      // Optional: If no session, you might want to redirect to login or show an error
      if (!session) {
        // However, the hash processing might take a moment, so we wait or listen to state change
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      // If not in reset flow, verify current password first
      if (!isResetFlow && session?.user?.email) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: session.user.email,
          password: currentPassword,
        });

        if (signInError) {
          throw new Error("Current password is incorrect");
        }
      }

      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) throw error;

      setSuccess(true);
      setCurrentPassword('');
      setPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-12 sm:px-6 lg:px-8 relative">
      {onNavigate && (
        <button
          onClick={() => onNavigate('profile')}
          className="absolute top-6 left-6 flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
      )}
      <div className="max-w-md w-full space-y-8 p-8" style={glassCardStyle}>
        <div className="text-center">
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Set New Password
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Please enter your new password below.
          </p>
        </div>

        {isWebMobile && (
          <div className="mb-4">
            <button
              onClick={() => {
                const deepLink = `eacoder://update-password${window.location.hash || window.location.search}`;
                window.location.href = deepLink;
              }}
              className="w-full h-11 flex items-center justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              Open in EACoder AI App
            </button>
            <div className="mt-2 text-center text-xs text-gray-500">
              If the app doesn't open automatically, click above.
            </div>
            <div className="relative my-4">
               <div className="absolute inset-0 flex items-center">
                 <div className="w-full border-t border-gray-300" />
               </div>
               <div className="relative flex justify-center text-sm">
                 <span className="px-2 bg-white text-gray-500">Or continue in browser</span>
               </div>
            </div>
          </div>
        )}

        {success ? (
          <div className="rounded-md bg-green-50 p-4 border border-green-200">
            <div className="flex">
              <div className="flex-shrink-0">
                <CheckCircle2 className="h-5 w-5 text-green-400" aria-hidden="true" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">Password updated successfully</h3>
                <div className="mt-2 text-sm text-green-700">
                  <p>Your password has been changed. You can now log in with your new password.</p>
                </div>
                {onNavigate && (
                  <button
                    onClick={() => onNavigate('profile')}
                    className="mt-6 w-full h-12 flex items-center justify-center text-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                  >
                    Go back to Profile
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <form className="mt-8" onSubmit={handleUpdatePassword}>
            <div className="space-y-5 mb-6">
              {error && (
                <div className="rounded-md bg-red-50 p-4 border border-red-200">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">{error}</h3>
                    </div>
                  </div>
                </div>
              )}

              {!isResetFlow && (
                <div>
                  <label htmlFor="currentPassword" dangerouslySetInnerHTML={{ __html: 'Current Password' }} className="block text-sm font-medium text-gray-700 mb-1.5" />
                  <div className="relative group">
                    <input
                      id="currentPassword"
                      name="currentPassword"
                      type={showCurrentPassword ? 'text' : 'password'}
                      required
                      className="block w-full h-12 pl-4 pr-11 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all outline-none text-gray-900 dark:text-gray-100"
                      placeholder="••••••••"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-0 top-0 bottom-0 pr-3.5 flex items-center justify-center text-gray-400 hover:text-gray-600 focus:outline-none z-10"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                    >
                      {showCurrentPassword ? (
                        <Eye className="h-5 w-5 transition-colors" aria-hidden="true" />
                      ) : (
                        <EyeOff className="h-5 w-5 transition-colors" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="password" dangerouslySetInnerHTML={{ __html: 'New Password' }} className="block text-sm font-medium text-gray-700 mb-1.5" />
                <div className="relative group">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    className="block w-full h-12 pl-4 pr-11 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all outline-none text-gray-900 dark:text-gray-100"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-0 top-0 bottom-0 pr-3.5 flex items-center justify-center text-gray-400 hover:text-gray-600 focus:outline-none z-10"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <Eye className="h-5 w-5 transition-colors" aria-hidden="true" />
                    ) : (
                      <EyeOff className="h-5 w-5 transition-colors" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" dangerouslySetInnerHTML={{ __html: 'Confirm Password' }} className="block text-sm font-medium text-gray-700 mb-1.5" />
                <div className="relative group">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    className="block w-full h-12 pl-4 pr-11 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all outline-none text-gray-900 dark:text-gray-100"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-0 top-0 bottom-0 pr-3.5 flex items-center justify-center text-gray-400 hover:text-gray-600 focus:outline-none z-10"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? (
                      <Eye className="h-5 w-5 transition-colors" aria-hidden="true" />
                    ) : (
                      <EyeOff className="h-5 w-5 transition-colors" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-12">
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full h-12 flex items-center justify-center py-2.5 px-4 border border-transparent text-sm font-semibold rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md active:transform active:scale-[0.98]"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Updating...</span>
                  </div>
                ) : (
                  <span className="w-full text-center">Update Password</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
