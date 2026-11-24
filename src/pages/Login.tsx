import React, { useState } from 'react';
import { Lock, Mail, ShieldCheck, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  sendResetPassword,
  signInWithEmail,
  signInWithGoogle,
} from '../firebase/auth';
import { useAuth } from '../context/AuthContext';

export function Login() {
  const { authError, authErrorType, user, logout, retryAuth } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter both email and password.');
      return;
    }
    setSubmitting(true);
    try {
      await signInWithEmail(email, password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed.';
      if (msg.includes('operation-not-allowed')) {
        setError(
          'Email/Password sign-in is not yet enabled in Firebase Console. Sign in with Google below or enable Email/Password under Firebase Console > Authentication > Sign-in method.'
        );
      } else if (msg.includes('invalid-credential') || msg.includes('wrong-password')) {
        setError('Invalid email or password.');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetSent(false);
    if (!email.trim()) {
      setError('Enter your admin email address to receive a password reset link.');
      return;
    }
    setSubmitting(true);
    try {
      await sendResetPassword(email);
      setResetSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset email.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left Brand Panel */}
      <div className="lg:w-5/12 bg-[#0F172A] text-white p-8 lg:p-14 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-sm">
              SD
            </div>
            <span className="text-lg font-semibold tracking-tight">Seller Dashboard</span>
          </div>

          <div className="mt-12 lg:mt-20 max-w-md">
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight leading-snug text-white">
              Amazon India & Flipkart business analytics in one clear workspace.
            </h1>
            <p className="mt-4 text-sm text-slate-300 leading-relaxed">
              Track orders, customer returns, RTO shipments, multi-location inventory, expenses,
              automatic profit calculations, and monthly reports with real-time Firestore sync.
            </p>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-slate-800 space-y-2 text-xs text-slate-400">
          <div className="flex items-center gap-2 text-slate-300 font-medium">
            <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
            Single-Admin Protected Workspace
          </div>
          <p>
            Public signups are disabled. Access is restricted strictly to authorized admin accounts
            enforced by Firebase Security Rules.
          </p>
        </div>
      </div>

      {/* Right Auth Panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
          {user && authError ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-semibold">
                    {authErrorType === 'workspace'
                      ? 'Workspace Initialization Error'
                      : 'Unauthorized Account'}
                  </p>
                  <p className="mt-1 break-words text-xs leading-relaxed">{authError}</p>
                  <p className="mt-2 text-xs text-red-600">
                    Signed in as: {user.email}. Expected authorized admin ({BOOTSTRAPPED_ADMIN_EMAIL} or registered UID in <code className="font-mono">/admins</code>).
                  </p>
                </div>
              </div>
              {authErrorType === 'workspace' && (
                <button
                  type="button"
                  onClick={() => void retryAuth()}
                  className="w-full py-2.5 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Retry Workspace Access
                </button>
              )}
              <button
                type="button"
                onClick={() => void logout()}
                className="w-full py-2.5 px-4 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
              >
                Sign out and switch account
              </button>
            </div>
          ) : resetMode ? (
            <div>
              <button
                type="button"
                onClick={() => {
                  setResetMode(false);
                  setError(null);
                  setResetSent(false);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 mb-6"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Sign In
              </button>

              <h2 className="text-xl font-semibold text-slate-900">Reset Admin Password</h2>
              <p className="text-sm text-slate-500 mt-1">
                Enter your registered admin email to receive a Firebase password reset link.
              </p>

              {error && (
                <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {resetSent && (
                <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Password reset link sent to {email}. Check your inbox.</span>
                </div>
              )}

              <form onSubmit={handlePasswordReset} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Admin Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@yourstore.in"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {submitting ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Admin Sign In</h2>
              <p className="text-sm text-slate-500 mt-1">
                Sign in to access your Amazon India & Flipkart dashboard.
              </p>

              {(error || authError) && (
                <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error || authError}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={submitting}
                className="mt-6 w-full py-2.5 px-4 text-sm font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2.5"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                  />
                  <path
                    fill="#34A853"
                    d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                  />
                </svg>
                Continue with Google (Admin)
              </button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-3 bg-white text-slate-400">or sign in with email</span>
                </div>
              </div>

              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@yourstore.in"
                      className="w-full pl-9 pr-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-700">Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        setResetMode(true);
                        setError(null);
                      }}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-9 pr-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {submitting ? 'Signing in...' : 'Sign In'}
                </button>
              </form>

              <p className="mt-6 text-xs text-slate-500 leading-relaxed">
                Admin accounts are provisioned directly in Firebase Authentication. Email/Password
                login requires enabling the Email/Password provider in Firebase Console.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
