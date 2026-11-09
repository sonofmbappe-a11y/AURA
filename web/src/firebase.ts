import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
  type User
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/**
 * Shared Firebase project & named Firestore database with the AURA Android App.
 * ZERO Gemini API keys or paid AI services are included or referenced in this web client.
 * Note: Firebase client apiKey below is a public project identifier restricted by Firestore Security Rules
 * and Firebase Auth Authorized Domains (not a billable Gemini key).
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCXcozxGGW8VCLNGyW63lWEmSiu-KrsZJE',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'gen-lang-client-0879201853.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0879201853',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'gen-lang-client-0879201853.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '974762479762',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:974762479762:android:74abd948afb7b26ef1564b'
};

export const FIRESTORE_DATABASE_ID =
  import.meta.env.VITE_FIRESTORE_DATABASE_ID ||
  'ai-studio-android-aura-63829403-a9de-4f28-9da2-e7be3968b280';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// CRITICAL: Connect to the exact named Firestore database provisioned for the Android app!
export const db = getFirestore(app, FIRESTORE_DATABASE_ID);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function signInWithGoogleBrowser(): Promise<User | null> {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    return cred.user;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/cancelled-popup-request' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw err;
  }
}

export async function signUpWithEmailBrowser(
  email: string,
  pass: string,
  name: string
): Promise<User> {
  const cleanEmail = email.trim();
  const cred = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
  if (name.trim()) {
    await updateProfile(cred.user, { displayName: name.trim() });
  }
  return cred.user;
}

export async function signInWithEmailBrowser(
  email: string,
  pass: string
): Promise<User> {
  const cleanEmail = email.trim();
  const cred = await signInWithEmailAndPassword(auth, cleanEmail, pass);
  return cred.user;
}

export async function signOutBrowser(): Promise<void> {
  await firebaseSignOut(auth);
}

export function detectBrowserPlatform(): 'IPHONE_WEB' | 'WEB_BROWSER' {
  if (typeof navigator === 'undefined') return 'WEB_BROWSER';
  const ua = navigator.userAgent || '';
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return isIOS ? 'IPHONE_WEB' : 'WEB_BROWSER';
}

export function buildJitsiVoiceUrl(joinCode: string, roomId = ''): string {
  const clean = joinCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8) || 'SCHOLARS';
  const salt = roomId
    ? `-${roomId.replace(/^room_/, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()}`
    : '';
  return `https://meet.element.io/AuraStudy-${clean}${salt}#config.prejoinConfig.enabled=false&config.disableDeepLinking=true&config.defaultLanguage='en'&config.startWithAudioMuted=false&config.startWithVideoMuted=false&config.startSilent=false&config.disableInitialGUM=false&config.enableNoAudioDetection=false&config.enableNoisyMicDetection=false&config.channelLastN=-1&config.disableSimulcast=false&config.resolution=720&config.hideConferenceTimer=true&config.hideConferenceSubject=true&config.toolbarButtons=%5B'microphone'%2C'camera'%2C'desktop'%2C'tileview'%2C'hangup'%5D&interfaceConfig.TOOLBAR_BUTTONS=%5B'microphone'%2C'camera'%2C'desktop'%2C'tileview'%2C'hangup'%5D`;
}

export function extractJitsiRoomName(voiceUrl: string, joinCode: string, roomId = ''): string {
  if (voiceUrl) {
    const withoutHash = voiceUrl.split('#')[0].split('?')[0];
    const match = withoutHash.match(/meet\.element\.io\/([^/]+)/i);
    if (match && match[1]) return decodeURIComponent(match[1]);
  }
  const clean = joinCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8) || 'SCHOLARS';
  const salt = roomId
    ? `-${roomId.replace(/^room_/, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()}`
    : '';
  return `AuraStudy-${clean}${salt}`;
}

export function normalizeJoinCode(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const urlParamMatch = /[?&]room=([A-Za-z0-9_-]{4,16})/i.exec(trimmed);
  if (urlParamMatch && urlParamMatch[1]) {
    return urlParamMatch[1]
      .toUpperCase()
      .replace(/^ROOM_/, '')
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 12);
  }
  const withoutLabel = trimmed.replace(/^CODE\s*:\s*/i, '');
  return withoutLabel
    .toUpperCase()
    .replace(/^ROOM_/, '')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}

