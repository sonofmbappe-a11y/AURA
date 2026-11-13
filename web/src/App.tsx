import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getRedirectResult, onAuthStateChanged, type User } from 'firebase/auth';
import {
  BookOpen,
  Calendar,
  Flame,
  Moon,
  Quote,
  Sliders,
  Sparkles,
  Sun,
  Users,
  Video,
  X
} from 'lucide-react';
import { auth, normalizeJoinCode } from './firebase';
import {
  fetchAndMergeCloudBackupToWeb,
  loadLocalVault,
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

  // Sync theme class on <html>
  useEffect(() => {
    const html = document.documentElement;
    if (vault.profile.isDarkTheme) {
      html.classList.add('dark');
      html.classList.remove('light');
    } else {
      html.classList.add('light');
      html.classList.remove('dark');
    }
  }, [vault.profile.isDarkTheme]);

  // Handle Google OAuth redirect fallback on iOS Safari & listen to Firebase Auth
  useEffect(() => {
    getRedirectResult(auth).catch(() => {
      // Ignore if no pending redirect
    });

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const current = loadLocalVault();
        const switchedAccount =
          Boolean(current.lastAutoRestoredUid) && current.lastAutoRestoredUid !== u.uid;
        const baseVault = switchedAccount
          ? { ...current, groupProjects: [], groupMessages: [] }
          : current;
        if (switchedAccount) {
          setVault(baseVault);
          saveLocalVault(baseVault);
        }
        if (current.lastAutoRestoredUid !== u.uid) {
          try {
            const res = await fetchAndMergeCloudBackupToWeb(u.uid, baseVault);
            if (res) {
              setVault(res.updatedVault);
              saveLocalVault(res.updatedVault);
              notify(`Welcome back! Auto-synced your Cloud Vault (${res.summary})`);
            }
          } catch {
            // Silent if offline or no backup yet
          }
        }
      } else {
        const current = loadLocalVault();
        if (current.lastAutoRestoredUid) {
          const cleared: AuraLocalVault = {
            ...current,
            lastAutoRestoredUid: '',
            groupProjects: [],
            groupMessages: []
          };
          setVault(cleared);
          saveLocalVault(cleared);
        }
      }
    });
    return () => unsub();
  }, [notify]);

  const navItems: { id: MainTab; label: string; icon: React.ReactNode }[] = [
    { id: 'TIMETABLE', label: 'Timetable', icon: <Calendar className="w-4 h-4" /> },
    { id: 'FOCUS', label: 'Focus', icon: <Flame className="w-4 h-4" /> },
    { id: 'STUDY', label: 'Study Hub', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'GROUPS', label: 'Team Groups', icon: <Users className="w-4 h-4" /> },
    { id: 'CITATIONS', label: 'Citations', icon: <Quote className="w-4 h-4" /> },
    { id: 'LIVE_STAGE', label: 'Live Meet', icon: <Video className="w-4 h-4" /> },
    { id: 'TOOLS', label: 'Tools', icon: <Sliders className="w-4 h-4" /> }
  ];

  const userInitial = (user?.displayName || vault.profile.name || 'A')
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <div className="min-h-dvh flex flex-col max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 pb-32 lg:pb-36 pt-3">
      {/* Floating Z-[100] Toast Notification */}
      {toast && (
        <div className="fixed top-3 left-3 right-3 max-w-lg mx-auto z-[100] pointer-events-auto">
          <div className="aura-glass rounded-xl px-4 py-3 border border-cyan-500/50 shadow-lg flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="text-xs font-semibold leading-snug">{toast}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast('')}
              aria-label="Dismiss notification"
              className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center shrink-0 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Sticky Top App Bar */}
      <header className="sticky top-2 z-30 aura-glass rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[#0B1220] border border-cyan-500/40 flex items-center justify-center font-bold text-cyan-400 text-sm shrink-0">
            A
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base tracking-tight truncate">
                AURA
              </span>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/25 text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">
                Academic Suite
              </span>
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {vault.profile.name} • {vault.profile.institution}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              updateVault((prev) => ({
                ...prev,
                profile: { ...prev.profile, isDarkTheme: !prev.profile.isDarkTheme }
              }))
            }
            aria-label="Toggle theme"
            className="w-9 h-9 rounded-lg aura-subtle-surface flex items-center justify-center hover:border-slate-500 transition"
          >
            {vault.profile.isDarkTheme ? (
              <Sun className="w-4 h-4 text-slate-300" />
            ) : (
              <Moon className="w-4 h-4 text-slate-700" />
            )}
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
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
              user
                ? 'aura-subtle-surface hover:border-slate-500'
                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold'
            }`}
          >
            {user ? (
              <>
                <span className="w-5 h-5 rounded-md bg-cyan-500/15 text-cyan-400 text-[10px] font-bold flex items-center justify-center border border-cyan-500/30">
                  {userInitial}
                </span>
                <span className="hidden xs:inline">Cloud Active</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </div>
      </header>

      {/* Auth Modal for 1-Tap Google / Email & Password */}
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
          />
        )}
      </main>

      {/* Bottom Navigation Dock */}
      <nav className="fixed bottom-3 left-2.5 right-2.5 max-w-3xl mx-auto z-40 aura-dock rounded-xl p-1 sm:p-1.5 flex items-center justify-around sm:justify-center sm:gap-1.5 overflow-x-auto no-scrollbar">
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex-1 sm:flex-initial py-2 px-1.5 sm:px-3 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors shrink-0 min-w-[48px] sm:min-w-[78px] ${
                active
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
              }`}
            >
              {item.icon}
              <span className="text-[10px] sm:text-[11px] leading-tight tracking-tight truncate max-w-full font-semibold">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
