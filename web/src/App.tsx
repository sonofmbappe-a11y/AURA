import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getRedirectResult, onAuthStateChanged, type User } from 'firebase/auth';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Flame,
  Moon,
  Quote,
  RefreshCw,
  Sliders,
  Sun,
  Users,
  Video,
  X
} from 'lucide-react';
import { auth, normalizeJoinCode, signOutBrowser } from './firebase';
import {
  computeCloudVaultSignature,
  createSignedOutVault,
  fetchAndMergeCloudBackupToWeb,
  isDefaultStarterVault,
  loadLocalVault,
  saveCloudBackupFromWeb,
  saveLocalVault
} from './storage';
import type { AuraLocalVault } from './types';
import { AuraLogo } from './components/AuraLogo';
import { TimetableView } from './components/TimetableView';
import { FocusView } from './components/FocusView';
import { StudyHubView } from './components/StudyHubView';
import { LiveStudyStage } from './components/LiveStudyStage';
import { ToolsAndProfileView } from './components/ToolsAndProfileView';
import { GroupProjectsView } from './components/GroupProjectsView';
import { CitationGeneratorView } from './components/CitationGeneratorView';
import { WebAuthModal } from './components/WebAuthModal';

type MainTab = 'TIMETABLE' | 'FOCUS' | 'STUDY' | 'GROUPS' | 'CITATIONS' | 'LIVE_STAGE' | 'TOOLS';

const SESSION_MARKER_KEY = 'aura_web_had_session_v1';

export const App: React.FC = () => {
  const initialRoomFromUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room') || '';
    return normalizeJoinCode(code);
  }, []);

  const initialGroupFromUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    return params.get('join_group') || params.get('group') || '';
  }, []);

  const [activeTab, setActiveTab] = useState<MainTab>(
    initialGroupFromUrl ? 'GROUPS' : initialRoomFromUrl ? 'LIVE_STAGE' : 'TIMETABLE'
  );
  const [vault, setVault] = useState<AuraLocalVault>(() => loadLocalVault());
  const [user, setUser] = useState<User | null>(null);
  const [toast, setToast] = useState<string>('');
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [cloudStatus, setCloudStatus] = useState<'IDLE' | 'SYNCING' | 'SYNCED' | 'ERROR'>('IDLE');

  const cloudHydratedUidRef = useRef<string | null>(null);
  const hadSignedInRef = useRef<boolean>(false);
  const lastSyncedSigRef = useRef<string>('');
  const vaultRef = useRef<AuraLocalVault>(vault);
  vaultRef.current = vault;

  const notify = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 5200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const updateVault = useCallback((updater: (prev: AuraLocalVault) => AuraLocalVault) => {
    setVault((prev) => {
      const next = updater(prev);
      saveLocalVault(next);
      return next;
    });
  }, []);

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('aura_web_theme_v1');
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
    } catch {
      // Ignore storage access failures
    }
    return Boolean(loadLocalVault().profile.isDarkTheme);
  });

  // Sync editorial Light / Obsidian Dark theme class on <html>
  useEffect(() => {
    const html = document.documentElement;
    if (isDarkMode) {
      html.classList.add('dark');
      html.classList.remove('light');
    } else {
      html.classList.add('light');
      html.classList.remove('dark');
    }
    try {
      localStorage.setItem('aura_web_theme_v1', isDarkMode ? 'dark' : 'light');
    } catch {
      // Ignore storage write failures
    }
  }, [isDarkMode]);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => {
      const next = !prev;
      setVault((v) => {
        const updated = { ...v, profile: { ...v.profile, isDarkTheme: next } };
        saveLocalVault(updated);
        return updated;
      });
      return next;
    });
  }, []);

  // Handle Google OAuth redirect fallback on iOS Safari & Firebase Auth lifecycle
  useEffect(() => {
    getRedirectResult(auth).catch(() => {
      // Ignore if no pending redirect
    });

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        hadSignedInRef.current = true;
        try {
          localStorage.setItem(SESSION_MARKER_KEY, '1');
        } catch {
          // Ignore storage error
        }
        cloudHydratedUidRef.current = null;
        setCloudStatus('SYNCING');
        const current = loadLocalVault();
        const switchedAccount =
          Boolean(current.lastAutoRestoredUid) && current.lastAutoRestoredUid !== u.uid;
        const starterSample = isDefaultStarterVault(current);
        const shouldPreWipe = switchedAccount || starterSample;
        const baseVault: AuraLocalVault = shouldPreWipe
          ? createSignedOutVault(current.profile.isDarkTheme)
          : current;
        if (shouldPreWipe) {
          setVault(baseVault);
          saveLocalVault(baseVault);
        }

        try {
          const res = await fetchAndMergeCloudBackupToWeb(
            u.uid,
            baseVault,
            u.email || '',
            true
          );
          if (res) {
            const shouldApplyCloud =
              shouldPreWipe ||
              !baseVault.lastAutoRestoredUid ||
              res.serverUpdatedAtMs >= (baseVault.lastBackupUpdatedAtMs || 0);

            const nextVault = shouldApplyCloud
              ? res.updatedVault
              : {
                  ...baseVault,
                  lastAutoRestoredUid: u.uid,
                  lastBackupUpdatedAtMs: res.serverUpdatedAtMs
                };

            setVault(nextVault);
            saveLocalVault(nextVault);
            lastSyncedSigRef.current = computeCloudVaultSignature(nextVault);
            cloudHydratedUidRef.current = u.uid;
            setCloudStatus('SYNCED');
            if (shouldApplyCloud) {
              notify(`Cloud Vault synced (${res.summary})`);
            }
          } else {
            const freshEmpty =
              shouldPreWipe || Boolean(current.lastAutoRestoredUid);
            const targetBase = freshEmpty
              ? createSignedOutVault(current.profile.isDarkTheme)
              : baseVault;
            const seeded: AuraLocalVault = {
              ...targetBase,
              profile: {
                ...targetBase.profile,
                email: u.email || targetBase.profile.email,
                name:
                  targetBase.profile.name === 'Scholar' && u.displayName
                    ? u.displayName
                    : targetBase.profile.name
              },
              lastAutoRestoredUid: u.uid
            };
            if (!freshEmpty && seeded.courses.length > 0) {
              const savedAt = await saveCloudBackupFromWeb(u.uid, u.email || '', seeded);
              seeded.lastBackupUpdatedAtMs = savedAt;
            }
            setVault(seeded);
            saveLocalVault(seeded);
            lastSyncedSigRef.current = computeCloudVaultSignature(seeded);
            cloudHydratedUidRef.current = u.uid;
            setCloudStatus('SYNCED');
          }
        } catch (err) {
          setCloudStatus('ERROR');
          notify(
            'Could not check Cloud Vault: ' +
              ((err as Error)?.message || 'Client appears offline. Check your connection.')
          );
        }
      } else {
        cloudHydratedUidRef.current = null;
        lastSyncedSigRef.current = '';
        setCloudStatus('IDLE');
        const current = loadLocalVault();
        let hadSessionMarker = false;
        try {
          hadSessionMarker = localStorage.getItem(SESSION_MARKER_KEY) === '1';
          localStorage.removeItem(SESSION_MARKER_KEY);
        } catch {
          // Ignore storage error
        }
        if (
          hadSignedInRef.current ||
          hadSessionMarker ||
          Boolean(current.lastAutoRestoredUid) ||
          isDefaultStarterVault(current)
        ) {
          hadSignedInRef.current = false;
          const cleared = createSignedOutVault(current.profile.isDarkTheme);
          setVault(cleared);
          saveLocalVault(cleared);
        }
      }
    });
    return () => unsub();
  }, [notify]);

  const handleSignOut = useCallback(async () => {
    cloudHydratedUidRef.current = null;
    hadSignedInRef.current = false;
    lastSyncedSigRef.current = '';
    setCloudStatus('IDLE');
    try {
      localStorage.removeItem(SESSION_MARKER_KEY);
    } catch {
      // Ignore storage error
    }
    const cleared = createSignedOutVault(isDarkMode);
    setVault(cleared);
    saveLocalVault(cleared);
    try {
      await signOutBrowser();
      notify('Signed out. Local workspace cleared.');
    } catch (err) {
      notify((err as Error)?.message || 'Signed out locally.');
    }
  }, [isDarkMode, notify]);

  // Debounced automatic Cloud Backup whenever authenticated user edits their vault
  const currentSig = useMemo(() => computeCloudVaultSignature(vault), [vault]);

  useEffect(() => {
    if (!user || cloudHydratedUidRef.current !== user.uid) return;
    if (!lastSyncedSigRef.current || currentSig === lastSyncedSigRef.current) return;

    const timer = window.setTimeout(async () => {
      if (!user || cloudHydratedUidRef.current !== user.uid) return;
      const snapshotVault = vaultRef.current;
      const sigNow = computeCloudVaultSignature(snapshotVault);
      if (sigNow === lastSyncedSigRef.current) return;

      setCloudStatus('SYNCING');
      try {
        const savedAtMs = await saveCloudBackupFromWeb(user.uid, user.email || '', snapshotVault);
        lastSyncedSigRef.current = sigNow;
        setCloudStatus('SYNCED');
        setVault((prev) => {
          const next = { ...prev, lastBackupUpdatedAtMs: savedAtMs };
          saveLocalVault(next);
          return next;
        });
      } catch {
        setCloudStatus('ERROR');
      }
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [user, currentSig]);

  const navItems: {
    id: MainTab;
    label: string;
    shortLabel: string;
    badge?: string | number;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'TIMETABLE',
      label: 'Timetable',
      shortLabel: 'Schedule',
      badge: vault.lectures.length > 0 ? vault.lectures.length : undefined,
      icon: <Calendar className="w-4 h-4" />
    },
    {
      id: 'FOCUS',
      label: 'Focus Studio',
      shortLabel: 'Focus',
      icon: <Flame className="w-4 h-4" />
    },
    {
      id: 'STUDY',
      label: 'Study Hub',
      shortLabel: 'Notes',
      badge: vault.flashcards.length > 0 ? vault.flashcards.length : undefined,
      icon: <BookOpen className="w-4 h-4" />
    },
    {
      id: 'GROUPS',
      label: 'Team Hub',
      shortLabel: 'Teams',
      badge: vault.groupProjects.length > 0 ? vault.groupProjects.length : undefined,
      icon: <Users className="w-4 h-4" />
    },
    {
      id: 'CITATIONS',
      label: 'Citations',
      shortLabel: 'Cite',
      badge: (vault.citations?.length || 0) > 0 ? vault.citations.length : undefined,
      icon: <Quote className="w-4 h-4" />
    },
    {
      id: 'LIVE_STAGE',
      label: 'Live Rooms',
      shortLabel: 'Rooms',
      icon: <Video className="w-4 h-4" />
    },
    {
      id: 'TOOLS',
      label: 'Tools & Profile',
      shortLabel: 'Profile',
      icon: <Sliders className="w-4 h-4" />
    }
  ];

  const userInitial = (user?.displayName || vault.profile.name || 'S')
    .trim()
    .charAt(0)
    .toUpperCase();

  const nextTodayClass = useMemo(() => {
    const now = new Date();
    const jsDay = now.getDay();
    const isoDay = jsDay === 0 ? 7 : jsDay;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const toMin = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const todays = vault.lectures
      .filter((l) => l.dayOfWeek === isoDay)
      .sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
    const live = todays.find((l) => nowMin >= toMin(l.startTime) && nowMin < toMin(l.endTime));
    if (live) return { status: 'In Session', lecture: live };
    const next = todays.find((l) => toMin(l.startTime) > nowMin);
    if (next) return { status: 'Up Next', lecture: next };
    return null;
  }, [vault.lectures]);

  const activeNavMeta = navItems.find((n) => n.id === activeTab) || navItems[0];

  const todayFormatted = useMemo(() => {
    try {
      return new Date().toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return '';
    }
  }, []);

  return (
    <div className="min-h-dvh bg-[#F6F4EF] text-[#141923]">
      {/* Floating Z-[100] Editorial Toast */}
      {toast && (
        <div className="fixed top-3 left-3 right-3 max-w-lg mx-auto z-[100] pointer-events-auto">
          <div className="bg-[#FFFFFF] rounded-xl px-4 py-3 border border-[#1D3B8B] flex items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-2.5 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-[#1D3B8B] shrink-0" />
              <span className="text-xs font-medium text-[#141923] leading-snug">{toast}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast('')}
              aria-label="Dismiss notification"
              className="w-7 h-7 rounded-md border border-[#E4E0D8] hover:border-[#9CA3AF] text-[#646B78] hover:text-[#141923] flex items-center justify-center shrink-0 transition-colors duration-150"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      <WebAuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onNotify={notify}
      />

      <div className="w-full min-h-dvh flex flex-col md:flex-row gap-4 lg:gap-5 px-3 sm:px-4 md:px-5 lg:px-6 xl:px-8 pt-3 md:pt-4 pb-24 md:pb-6">
        {/* Mobile & Tablet Compact Header (Hidden on Desktop where Sidebar owns branding) */}
        <header className="md:hidden sticky top-[max(0.5rem,env(safe-area-inset-top))] z-30 aura-glass rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <AuraLogo size={36} />
            <div className="min-w-0">
              <div className="font-serif text-lg leading-none tracking-tight text-[#141923] truncate">
                AURA
              </div>
              <div className="text-[11px] text-[#646B78] truncate mt-0.5">
                {vault.profile.semester}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="w-9 h-9 rounded-lg border border-[#E4E0D8] bg-[#FFFFFF] text-[#4B5563] flex items-center justify-center transition-colors duration-150"
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => (user ? setActiveTab('TOOLS') : setShowAuthModal(true))}
              className={`h-9 px-3 rounded-lg text-xs font-semibold flex items-center gap-2 border transition-colors duration-150 ${
                user
                  ? 'bg-[#FFFFFF] border-[#E4E0D8] text-[#141923]'
                  : 'bg-[#1D3B8B] border-[#1D3B8B] text-[#FFFFFF]'
              }`}
            >
              {user ? (
                <>
                  {vault.profile.photoUrl ? (
                    <img
                      src={vault.profile.photoUrl}
                      alt=""
                      className="w-5 h-5 rounded-full object-cover border border-[#1D3B8B]"
                    />
                  ) : (
                    <span className="w-5 h-5 rounded-md bg-[#EEF2FA] text-[#1D3B8B] font-mono text-[10px] font-bold flex items-center justify-center">
                      {userInitial}
                    </span>
                  )}
                  <span
                    className={`w-2 h-2 rounded-full ${
                      cloudStatus === 'ERROR' ? 'bg-[#DC2626]' : 'bg-[#047857]'
                    }`}
                  />
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </div>
        </header>

        {/* Desktop Persistent Left Studio Sidebar */}
        <aside className="hidden md:flex md:flex-col w-60 lg:w-64 xl:w-72 shrink-0 sticky top-4 lg:top-5 h-[calc(100dvh-2rem)] lg:h-[calc(100dvh-2.5rem)] aura-glass rounded-2xl p-4 justify-between gap-4">
          <div className="space-y-5 min-h-0 flex flex-col">
            {/* Brand Header */}
            <div className="flex items-center gap-3 px-1">
              <AuraLogo size={40} />
              <div className="min-w-0">
                <div className="font-serif text-xl leading-none tracking-tight text-[#141923] truncate">
                  AURA
                </div>
                <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#646B78] truncate mt-1">
                  {vault.profile.semester}
                </div>
              </div>
            </div>

            {/* Workspace Navigation Links */}
            <nav aria-label="Desktop Studio Navigation" className="space-y-1 overflow-y-auto no-scrollbar pr-0.5">
              {navItems.map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 transition-colors duration-150 ${
                      active
                        ? 'bg-[#1D3B8B] text-[#FFFFFF] shadow-xs'
                        : 'text-[#4B5563] hover:text-[#141923] hover:bg-[#EFECE6]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      {item.icon}
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.badge !== undefined && (
                      <span
                        className={`font-mono text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                          active
                            ? 'bg-[#FFFFFF]/20 text-[#FFFFFF]'
                            : 'bg-[#EFECE6] border border-[#E4E0D8] text-[#4B5563]'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Glanceable Next Class Card in Sidebar */}
            <button
              type="button"
              onClick={() => setActiveTab('TIMETABLE')}
              className="w-full text-left p-3 rounded-xl aura-subtle-surface space-y-1 mt-auto"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#1D3B8B]">
                  {nextTodayClass ? nextTodayClass.status : 'Schedule'}
                </span>
                <span className="font-mono text-[10px] text-[#646B78]">
                  {vault.courses.length} Courses
                </span>
              </div>
              {nextTodayClass ? (
                <>
                  <div className="text-xs font-bold text-[#141923] truncate">
                    {nextTodayClass.lecture.courseCode} · {nextTodayClass.lecture.courseName}
                  </div>
                  <div className="font-mono text-[10px] text-[#646B78] truncate">
                    {nextTodayClass.lecture.startTime}–{nextTodayClass.lecture.endTime}
                    {nextTodayClass.lecture.venue ? ` · ${nextTodayClass.lecture.venue}` : ''}
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-[#646B78] leading-snug">
                  No more classes left today · {vault.lectures.length} weekly slots
                </div>
              )}
            </button>
          </div>

          {/* Sidebar Footer: Account & Theme */}
          <div className="pt-3 border-t border-[#E4E0D8] space-y-2 shrink-0">
            <button
              type="button"
              onClick={() => (user ? setActiveTab('TOOLS') : setShowAuthModal(true))}
              className="w-full p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E4E0D8] hover:border-[#9CA3AF] flex items-center justify-between gap-2 text-left transition-colors duration-150"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {user && vault.profile.photoUrl ? (
                  <img
                    src={vault.profile.photoUrl}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover border border-[#1D3B8B] shrink-0"
                  />
                ) : (
                  <span className="w-8 h-8 rounded-lg bg-[#EEF2FA] text-[#1D3B8B] border border-[#C7D4F0] font-mono text-xs font-bold flex items-center justify-center shrink-0">
                    {userInitial}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#141923] truncate">
                    {user ? user.displayName || user.email?.split('@')[0] || 'Scholar' : 'Sign In'}
                  </div>
                  <div className="font-mono text-[10px] text-[#646B78] truncate">
                    {user
                      ? cloudStatus === 'SYNCING'
                        ? 'Syncing...'
                        : cloudStatus === 'ERROR'
                        ? 'Sync Error'
                        : 'Cloud Synced'
                      : 'Sync Web & Android'}
                  </div>
                </div>
              </div>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  !user
                    ? 'bg-[#9CA3AF]'
                    : cloudStatus === 'ERROR'
                    ? 'bg-[#DC2626]'
                    : 'bg-[#047857]'
                }`}
              />
            </button>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={toggleDarkMode}
                className="flex-1 py-2 px-2.5 rounded-lg border border-[#E4E0D8] bg-[#FFFFFF] hover:border-[#9CA3AF] hover:bg-[#EFECE6] text-xs font-medium text-[#4B5563] hover:text-[#141923] flex items-center justify-center gap-1.5 transition-colors duration-150"
              >
                {isDarkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                <span>{isDarkMode ? 'Light Paper' : 'Dark Slate'}</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Studio Workspace Pane */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* Desktop Context Header */}
          <div className="hidden md:flex items-center justify-between gap-4 aura-glass rounded-2xl px-5 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="font-serif text-xl lg:text-2xl text-[#141923] leading-none truncate">
                {activeNavMeta.label}
              </h1>
              <span className="font-mono text-[11px] text-[#646B78] px-2.5 py-0.5 rounded-md bg-[#EFECE6] border border-[#E4E0D8]">
                {todayFormatted}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {user && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E4E0D8] bg-[#FAF8F5] font-mono text-[11px] text-[#4B5563]">
                  <RefreshCw
                    className={`w-3 h-3 ${
                      cloudStatus === 'SYNCING'
                        ? 'text-[#1D3B8B] animate-spin'
                        : cloudStatus === 'ERROR'
                        ? 'text-[#DC2626]'
                        : 'text-[#047857]'
                    }`}
                  />
                  {cloudStatus === 'SYNCING'
                    ? 'Syncing...'
                    : cloudStatus === 'ERROR'
                    ? 'Sync Error'
                    : 'Synced'}
                </span>
              )}
              <button
                type="button"
                onClick={() => setActiveTab('FOCUS')}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors duration-150 ${
                  activeTab === 'FOCUS'
                    ? 'bg-[#EEF2FA] border-[#1D3B8B] text-[#1D3B8B]'
                    : 'bg-[#FFFFFF] border-[#E4E0D8] hover:border-[#9CA3AF] text-[#141923]'
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-[#1D3B8B]" /> Quick Focus
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('GROUPS')}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors duration-150 ${
                  activeTab === 'GROUPS'
                    ? 'bg-[#EEF2FA] border-[#1D3B8B] text-[#1D3B8B]'
                    : 'bg-[#FFFFFF] border-[#E4E0D8] hover:border-[#9CA3AF] text-[#141923]'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-[#1D3B8B]" /> Team Chat
              </button>
            </div>
          </div>

          {/* Main Content */}
          <main className="flex-1 w-full min-w-0">
            {activeTab === 'TIMETABLE' && (
              <TimetableView vault={vault} onUpdateVault={updateVault} />
            )}
            {activeTab === 'FOCUS' && (
              <FocusView vault={vault} onUpdateVault={updateVault} />
            )}
            {activeTab === 'STUDY' && (
              <StudyHubView vault={vault} onUpdateVault={updateVault} />
            )}
            {activeTab === 'GROUPS' && (
              <GroupProjectsView
                user={user}
                vault={vault}
                initialGroupId={initialGroupFromUrl}
                onUpdateVault={updateVault}
                onNotify={notify}
                onRequireAuth={() => setShowAuthModal(true)}
              />
            )}
            {activeTab === 'CITATIONS' && (
              <CitationGeneratorView
                vault={vault}
                onUpdateVault={updateVault}
                onNotify={notify}
              />
            )}
            {activeTab === 'LIVE_STAGE' && (
              <LiveStudyStage
                user={user}
                vault={vault}
                initialRoomCode={initialRoomFromUrl}
                onUpdateVault={updateVault}
                onNotify={notify}
              />
            )}
            {activeTab === 'TOOLS' && (
              <ToolsAndProfileView
                user={user}
                vault={vault}
                onUpdateVault={updateVault}
                onNotify={notify}
                onSignOut={handleSignOut}
              />
            )}
          </main>
        </div>
      </div>

      {/* Mobile Floating Bottom Navigation Dock */}
      <nav
        aria-label="Mobile Navigation Dock"
        className="md:hidden fixed bottom-2.5 left-2.5 right-2.5 max-w-xl mx-auto z-40 aura-dock rounded-xl p-1 flex items-center gap-0.5 overflow-x-auto no-scrollbar"
      >
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex-1 py-2 px-1.5 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors duration-150 shrink-0 min-w-[48px] ${
                active
                  ? 'bg-[#1D3B8B] text-[#FFFFFF] font-semibold'
                  : 'text-[#646B78] hover:text-[#141923] hover:bg-[#EFECE6]'
              }`}
            >
              {item.icon}
              <span className="text-[10px] leading-tight tracking-tight truncate max-w-full font-medium">
                {item.shortLabel}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
