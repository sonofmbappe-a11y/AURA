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
        // Always isolate accounts: wipe previous user's or starter data immediately before fetching
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
            // Verified on server: no backup exists yet for this account -> clean empty workspace
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
        // Always wipe courses, timetable & vault on logout or when stale starter/signed-in data exists
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

  const navItems: { id: MainTab; label: string; icon: React.ReactNode }[] = [
    { id: 'TIMETABLE', label: 'Timetable', icon: <Calendar className="w-4 h-4" /> },
    { id: 'FOCUS', label: 'Focus', icon: <Flame className="w-4 h-4" /> },
    { id: 'STUDY', label: 'Study Hub', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'GROUPS', label: 'Teams', icon: <Users className="w-4 h-4" /> },
    { id: 'CITATIONS', label: 'Citations', icon: <Quote className="w-4 h-4" /> },
    { id: 'LIVE_STAGE', label: 'Live Meet', icon: <Video className="w-4 h-4" /> },
    { id: 'TOOLS', label: 'Tools', icon: <Sliders className="w-4 h-4" /> }
  ];

  const userInitial = (user?.displayName || vault.profile.name || 'A')
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <div className="min-h-dvh bg-[#FAFAFA] text-[#111827] flex flex-col max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 pb-28 sm:pb-32 pt-3">
      {/* Floating Z-[100] Editorial Toast */}
      {toast && (
        <div className="fixed top-3 left-3 right-3 max-w-lg mx-auto z-[100] pointer-events-auto">
          <div className="bg-[#FFFFFF] rounded-lg px-3.5 py-2.5 border border-[#1E3A8A] flex items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-[#1E3A8A] shrink-0" />
              <span className="text-xs font-medium text-[#111827] leading-snug">{toast}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast('')}
              aria-label="Dismiss notification"
              className="w-6 h-6 rounded border border-[#E5E7EB] hover:border-[#9CA3AF] text-[#6B7280] hover:text-[#111827] flex items-center justify-center shrink-0 transition-colors duration-150"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Sticky Editorial Top Bar */}
      <header className="sticky top-[max(0.5rem,env(safe-area-inset-top))] z-30 bg-[#FFFFFF] border border-[#E5E7EB] rounded-lg px-4 py-2.5 mb-4 flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-md overflow-hidden border border-[#E5E7EB] shrink-0 bg-[#1E3A8A] flex items-center justify-center shadow-xs">
            <img
              src="/app_logo.jpg"
              alt="AURA Logo"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <span className="font-mono font-bold text-xs text-[#FFFFFF] select-none">AU</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-[#111827] truncate">
                AURA
              </span>
              <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-[#F3F4F6] border border-[#E5E7EB] font-mono text-[10px] font-semibold text-[#4B5563] uppercase tracking-wider">
                {vault.profile.semester}
              </span>
            </div>
            <div className="text-[11px] text-[#6B7280] truncate">
              {vault.profile.name} · {vault.profile.institution}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {user && (
            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#E5E7EB] bg-[#FAFAFA] font-mono text-[11px] text-[#4B5563]">
              <RefreshCw
                className={`w-3 h-3 ${
                  cloudStatus === 'SYNCING'
                    ? 'text-[#1E3A8A] animate-spin'
                    : cloudStatus === 'ERROR'
                    ? 'text-[#DC2626]'
                    : 'text-[#059669]'
                }`}
              />
              {cloudStatus === 'SYNCING'
                ? 'Syncing...'
                : cloudStatus === 'ERROR'
                ? 'Sync Error'
                : 'Cloud Synced'}
            </span>
          )}

          <button
            type="button"
            onClick={toggleDarkMode}
            aria-label={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="w-8 h-8 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] hover:border-[#9CA3AF] hover:bg-[#F3F4F6] text-[#4B5563] hover:text-[#111827] flex items-center justify-center transition-colors duration-150 shrink-0"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => {
              if (user) {
                setActiveTab('TOOLS');
              } else {
                setShowAuthModal(true);
              }
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 border transition-colors duration-150 ${
              user
                ? 'bg-[#FFFFFF] border-[#E5E7EB] hover:border-[#9CA3AF] text-[#111827]'
                : 'bg-[#1E3A8A] border-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF]'
            }`}
          >
            {user ? (
              <>
                {vault.profile.photoUrl ? (
                  <img
                    src={vault.profile.photoUrl}
                    alt={vault.profile.name}
                    className="w-5 h-5 rounded-full object-cover border border-[#1E3A8A]"
                  />
                ) : (
                  <span className="w-5 h-5 rounded bg-[#EFF6FF] text-[#1E3A8A] border border-[#BFDBFE] font-mono text-[10px] font-bold flex items-center justify-center">
                    {userInitial}
                  </span>
                )}
                <span className="hidden xs:inline truncate max-w-[120px]">
                  {user.displayName || user.email?.split('@')[0] || 'Account'}
                </span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    cloudStatus === 'ERROR' ? 'bg-[#DC2626]' : 'bg-[#059669]'
                  }`}
                />
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </div>
      </header>

      {/* Auth Modal */}
      <WebAuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onNotify={notify}
      />

      {/* Main Content */}
      <main className="flex-1 w-full">
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

      {/* Bottom Navigation Dock */}
      <nav className="fixed bottom-3 left-2.5 right-2.5 max-w-3xl mx-auto z-40 aura-dock rounded-lg p-1 flex items-center justify-around sm:justify-center sm:gap-1 overflow-x-auto no-scrollbar">
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex-1 sm:flex-initial py-2 px-2 sm:px-3 rounded-md flex flex-col items-center justify-center gap-1 transition-colors duration-150 shrink-0 min-w-[48px] sm:min-w-[82px] ${
                active
                  ? 'bg-[#1E3A8A] text-[#FFFFFF] font-semibold'
                  : 'text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6]'
              }`}
            >
              {item.icon}
              <span className="text-[10px] sm:text-[11px] leading-tight tracking-tight truncate max-w-full font-medium">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
