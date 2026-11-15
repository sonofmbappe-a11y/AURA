import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getRedirectResult, onAuthStateChanged, type User } from 'firebase/auth';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Flame,
  Quote,
  RefreshCw,
  Sliders,
  Users,
  Video,
  X
} from 'lucide-react';
import { auth, normalizeJoinCode } from './firebase';
import {
  computeCloudVaultSignature,
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

  // Ensure crisp editorial light mode class on <html>
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('light');
    html.classList.remove('dark');
  }, []);

  // Handle Google OAuth redirect fallback on iOS Safari & Firebase Auth lifecycle
  useEffect(() => {
    getRedirectResult(auth).catch(() => {
      // Ignore if no pending redirect
    });

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        cloudHydratedUidRef.current = null;
        setCloudStatus('SYNCING');
        const current = loadLocalVault();
        const switchedAccount =
          Boolean(current.lastAutoRestoredUid) && current.lastAutoRestoredUid !== u.uid;
        const baseVault: AuraLocalVault = switchedAccount
          ? {
              ...current,
              groupProjects: [],
              groupMessages: [],
              deletedGroupIds: [],
              lastBackupUpdatedAtMs: 0
            }
          : current;
        if (switchedAccount) {
          setVault(baseVault);
          saveLocalVault(baseVault);
        }

        try {
          const res = await fetchAndMergeCloudBackupToWeb(u.uid, baseVault, u.email || '');
          if (res) {
            const shouldApplyCloud =
              switchedAccount ||
              !baseVault.lastAutoRestoredUid ||
              isDefaultStarterVault(baseVault) ||
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
            // No backup exists yet on server for this user
            const seeded: AuraLocalVault = {
              ...baseVault,
              profile: {
                ...baseVault.profile,
                email: u.email || baseVault.profile.email,
                name:
                  baseVault.profile.name === 'Scholar' && u.displayName
                    ? u.displayName
                    : baseVault.profile.name
              },
              lastAutoRestoredUid: u.uid
            };
            if (!isDefaultStarterVault(seeded)) {
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
              ((err as Error)?.message || 'Please check your connection or tap Import Android Backup.')
          );
        }
      } else {
        cloudHydratedUidRef.current = null;
        lastSyncedSigRef.current = '';
        setCloudStatus('IDLE');
        const current = loadLocalVault();
        if (current.lastAutoRestoredUid) {
          const cleared: AuraLocalVault = {
            ...current,
            lastAutoRestoredUid: '',
            lastBackupUpdatedAtMs: 0,
            groupProjects: [],
            groupMessages: [],
            deletedGroupIds: []
          };
          setVault(cleared);
          saveLocalVault(cleared);
        }
      }
    });
    return () => unsub();
  }, [notify]);

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
    }, 2000);

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
          <div className="bg-[#FFFFFF] rounded-lg px-3.5 py-2.5 border border-[#1E3A8A] flex items-center justify-between gap-3">
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
      <header className="sticky top-[max(0.5rem,env(safe-area-inset-top))] z-30 bg-[#FFFFFF] border border-[#E5E7EB] rounded-lg px-4 py-2.5 mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-md bg-[#1E3A8A] text-[#FFFFFF] flex items-center justify-center font-mono font-bold text-xs shrink-0">
            AU
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
                    ? 'text-[#1E3A8A]'
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
                <span className="w-5 h-5 rounded bg-[#EFF6FF] text-[#1E3A8A] border border-[#BFDBFE] font-mono text-[10px] font-bold flex items-center justify-center">
                  {userInitial}
                </span>
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
