import React, { useState } from 'react';
import {
  LogIn,
  UserPlus,
  Mail,
  Lock,
  User as UserIcon,
  X,
  AlertCircle,
  ShieldCheck,
  Copy,
  Check
} from 'lucide-react';
import {
  signInWithGoogleBrowser,
  signInWithEmailBrowser,
  signUpWithEmailBrowser
} from '../firebase';

interface WebAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const WebAuthModal: React.FC<WebAuthModalProps> = ({
  isOpen,
  onClose,
  onNotify
}) => {
  const [mode, setMode] = useState<'SIGN_IN' | 'REGISTER'>('SIGN_IN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [copiedHost, setCopiedHost] = useState(false);

  if (!isOpen) return null;

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const user = await signInWithGoogleBrowser();
      if (user) {
        onNotify(`Signed in as ${user.displayName || user.email}.`);
        onClose();
      }
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Google Sign-In failed.';
      setErrorMessage(msg);
      onNotify(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please provide both your email address and password.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      if (mode === 'REGISTER') {
        const user = await signUpWithEmailBrowser(
          email.trim(),
          password,
          fullName.trim() || 'Scholar'
        );
        onNotify(`Scholar account created for ${user.email}.`);
        onClose();
      } else {
        const user = await signInWithEmailBrowser(email.trim(), password);
        onNotify(`Welcome back, ${user.displayName || user.email}.`);
        onClose();
      }
    } catch (err: unknown) {
      const rawCode = (err as { code?: string })?.code || '';
      let friendly = (err as Error)?.message || 'Authentication error.';

      if (rawCode === 'auth/invalid-credential' || rawCode === 'auth/wrong-password' || rawCode === 'auth/user-not-found') {
        friendly = 'Incorrect email or password. If you have not created an account yet, click "Create Account" below.';
      } else if (rawCode === 'auth/email-already-in-use') {
        friendly = 'An account with this email already exists. Please switch to Sign In.';
      } else if (rawCode === 'auth/weak-password') {
        friendly = 'Password is too weak. Please use at least 6 characters.';
      } else if (rawCode === 'auth/invalid-api-key') {
        friendly = 'Firebase API Key error. Please verify Google Cloud restrictions or use Email sign-in.';
      }

      setErrorMessage(friendly);
      onNotify(friendly);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyHostname = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(currentHost);
      setCopiedHost(true);
      setTimeout(() => setCopiedHost(false), 2000);
      onNotify(`Copied "${currentHost}" to clipboard.`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111827]/45">
      <div className="relative w-full max-w-md bg-[#FFFFFF] rounded-lg p-6 border border-[#E5E7EB] space-y-5">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] hover:border-[#9CA3AF] flex items-center justify-center text-[#6B7280] hover:text-[#111827] transition-colors duration-150"
          aria-label="Close modal"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="space-y-1.5 pr-8">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#EFF6FF] border border-[#BFDBFE] font-mono text-[10px] font-semibold uppercase tracking-wider text-[#1E3A8A]">
            <ShieldCheck className="w-3.5 h-3.5" /> Cloud Sync Auth
          </div>
          <h2 className="text-lg font-bold tracking-tight text-[#111827]">
            {mode === 'SIGN_IN' ? 'Sign In to AURA' : 'Create Scholar Account'}
          </h2>
          <p className="text-xs text-[#6B7280]">
            Restore and sync your timetable, notes, flashcards, and team workspaces across Android and Web.
          </p>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold block">{errorMessage}</span>
              {errorMessage.includes('not authorized yet') && (
                <div className="text-[11px] text-[#7F1D1D] pt-1">
                  <span>Domain to authorize in Firebase Console: </span>
                  <button
                    type="button"
                    onClick={copyHostname}
                    className="inline-flex items-center gap-1 font-mono bg-[#FFFFFF] px-1.5 py-0.5 rounded border border-[#FECACA] hover:border-[#DC2626] transition-colors duration-150"
                  >
                    <span>{currentHost}</span>
                    {copiedHost ? <Check className="w-3 h-3 text-[#059669]" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Primary Action 1: Google Sign In */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting}
          className="w-full py-2.5 px-4 rounded-md bg-[#FFFFFF] hover:bg-[#F9FAFB] border border-[#D1D5DB] hover:border-[#9CA3AF] text-[#111827] font-semibold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-colors duration-150 disabled:opacity-50"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-[#E5E7EB]" />
          <span className="font-mono text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">
            or email &amp; password
          </span>
          <div className="flex-1 h-px bg-[#E5E7EB]" />
        </div>

        {/* Email & Password Form */}
        <form onSubmit={handleEmailAuth} className="space-y-3">
          {mode === 'REGISTER' && (
            <div className="relative">
              <UserIcon className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-3" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full Name (e.g. Maya Lin)"
                className="w-full pl-9 pr-3 py-2 rounded-md aura-input text-xs"
              />
            </div>
          )}

          <div className="relative">
            <Mail className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-3" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="scholar@university.edu"
              className="w-full pl-9 pr-3 py-2 rounded-md aura-input text-xs"
            />
          </div>

          <div className="relative">
            <Lock className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-3" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="•••••••• (min 6 characters)"
              className="w-full pl-9 pr-3 py-2 rounded-md aura-input text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors duration-150 disabled:opacity-50"
          >
            {mode === 'SIGN_IN' ? (
              <>
                <LogIn className="w-4 h-4" />
                <span>{isSubmitting ? 'Signing In...' : 'Sign In with Email'}</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>{isSubmitting ? 'Creating Account...' : 'Create Account'}</span>
              </>
            )}
          </button>
        </form>

        {/* Toggle Mode Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-[#E5E7EB] text-xs text-[#6B7280]">
          <span>{mode === 'SIGN_IN' ? "Don't have an account yet?" : 'Already have an account?'}</span>
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'SIGN_IN' ? 'REGISTER' : 'SIGN_IN');
              setErrorMessage('');
            }}
            className="font-semibold text-[#1E3A8A] hover:underline"
          >
            {mode === 'SIGN_IN' ? 'Create Account' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
};
