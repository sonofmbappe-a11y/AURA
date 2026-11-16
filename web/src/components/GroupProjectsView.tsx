import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import {
  BarChart3,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Crown,
  Download,
  ExternalLink,
  FileText,
  Flame,
  FolderKanban,
  Globe,
  Image as ImageIcon,
  KeyRound,
  LogOut,
  Mail,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneCall,
  Pin,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Share2,
  Smile,
  Square,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  Video,
  Volume2,
  X
} from 'lucide-react';
import { db, defaultDb } from '../firebase';
import { uidGen } from '../storage';
import type {
  AuraLocalVault,
  WebGroupChatMessage,
  WebGroupInvitation,
  WebGroupProject,
  WebGroupResourceDoc,
  WebGroupTask
} from '../types';

interface Props {
  user: User | null;
  vault: AuraLocalVault;
  initialGroupId?: string;
  onUpdateVault: (updater: (prev: AuraLocalVault) => AuraLocalVault) => void;
  onNotify: (msg: string) => void;
}

const COLOR_OPTIONS = ['#1E3A8A', '#0F766E', '#B45309', '#374151', '#1D4ED8', '#047857'];

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let res = 'GRP-';
  for (let i = 0; i < 4; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

export const GroupProjectsView: React.FC<Props> = ({
  user,
  vault,
  initialGroupId = '',
  onUpdateVault,
  onNotify
}) => {
  const currentEmail = (user?.email || vault.profile.email || 'scholar@university.edu')
    .trim()
    .toLowerCase();

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    initialGroupId || vault.groupProjects[0]?.id || ''
  );
  const [activeTab, setActiveTab] = useState<'CHAT' | 'DELIVERABLES' | 'SPRINT' | 'RESOURCES' | 'MEMBERS'>('CHAT');
  const [isSyncing, setIsSyncing] = useState(false);

  // Track deleted or left project IDs in memory + persisted vault tombstones
  const deletedProjectIdsRef = useRef<Set<string>>(new Set(vault.deletedGroupIds || []));
  const groupProjectsRef = useRef<WebGroupProject[]>(vault.groupProjects);
  groupProjectsRef.current = vault.groupProjects;
  const targetDbs = useMemo(() => [db], []);

  useEffect(() => {
    const next = new Set(vault.deletedGroupIds || []);
    deletedProjectIdsRef.current.forEach((id) => next.add(id));
    deletedProjectIdsRef.current = next;
  }, [vault.deletedGroupIds]);

  // Pending Invitations received by the current user
  const [pendingInvitations, setPendingInvitations] = useState<WebGroupInvitation[]>([]);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [showJoinByCodeModal, setShowJoinByCodeModal] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Shared Team Resource Vault State (Feature 1)
  const [newResourceTitle, setNewResourceTitle] = useState('');
  const [newResourceUrl, setNewResourceUrl] = useState('');
  const [newResourceCategory, setNewResourceCategory] = useState<'SLIDES' | 'DOCUMENT' | 'RESEARCH_LINK' | 'PAST_PAPER'>('SLIDES');
  const [resourceFilter, setResourceFilter] = useState<string>('ALL');

  // Invitation Sent Confirmation Modal State
  const [inviteSuccessData, setInviteSuccessData] = useState<{
    inviteeEmail: string;
    teamName: string;
    courseCode: string;
    projectId: string;
    joinCode: string;
  } | null>(null);

  // Group Poll State
  const [pollQuestionInput, setPollQuestionInput] = useState('');
  const [pollOpt1, setPollOpt1] = useState('Thursday 4:00 PM');
  const [pollOpt2, setPollOpt2] = useState('Friday 2:00 PM');
  const [pollOpt3, setPollOpt3] = useState('Saturday 11:00 AM');

  // Group Live Voice Huddle State
  const [voiceHuddleActive, setVoiceHuddleActive] = useState(false);
  const [isWebMicMuted, setIsWebMicMuted] = useState(false);

  // Group Synced Pomodoro Sprint State (derived from activeProject.syncedPomodoroState)
  const [pomodoroSeconds, setPomodoroSeconds] = useState(25 * 60);

  // Deliverables filter & search
  const [taskFilter, setTaskFilter] = useState<'ALL' | 'PENDING' | 'DONE'>('ALL');
  const [taskSearch, setTaskSearch] = useState('');

  // Message composer
  const [chatInput, setChatInput] = useState('');
  const [pinChecked, setPinChecked] = useState(false);
  const [selectedDeliverableTag, setSelectedDeliverableTag] = useState<string>('');

  // Voice Note Recording State
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-scroll anchor
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Active Project
  const activeProject = useMemo(() => {
    return vault.groupProjects.find((p) => p.id === selectedProjectId) || vault.groupProjects[0];
  }, [vault.groupProjects, selectedProjectId]);

  const isCurrentUserAdmin = useMemo(() => {
    if (!activeProject) return true;
    const admins = (activeProject.adminEmails || []).map((e) => e.toLowerCase());
    return (
      admins.length === 0 ||
      admins.includes(currentEmail) ||
      !activeProject.creatorEmail ||
      activeProject.creatorEmail.toLowerCase() === currentEmail
    );
  }, [activeProject, currentEmail]);

  // Messages for active project
  const projectMessages = useMemo(() => {
    if (!activeProject) return [];
    return vault.groupMessages
      .filter((m) => m.projectId === activeProject.id)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [vault.groupMessages, activeProject]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (activeTab === 'CHAT') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [projectMessages.length, activeTab]);

  // Synced Pomodoro timer tick derived from activeProject.syncedPomodoroState
  const syncedPomo = activeProject?.syncedPomodoroState;
  const pomodoroRunning = Boolean(syncedPomo?.isRunning);
  const pomodoroDurationMin = syncedPomo?.durationMinutes || 25;
  const pomodoroMode = syncedPomo?.mode || 'FOCUS';

  useEffect(() => {
    const computeRemaining = () => {
      if (!syncedPomo) return 25 * 60;
      if (syncedPomo.isRunning && syncedPomo.endEpochMillis) {
        return Math.max(0, Math.floor((syncedPomo.endEpochMillis - Date.now()) / 1000));
      }
      return Math.max(0, syncedPomo.remainingSeconds ?? (syncedPomo.durationMinutes || 25) * 60);
    };
    setPomodoroSeconds(computeRemaining());
    if (!syncedPomo?.isRunning) return;
    const interval = window.setInterval(() => {
      const left = computeRemaining();
      setPomodoroSeconds(left);
      if (left <= 0) {
        window.clearInterval(interval);
        onNotify('Group Pomodoro Sprint Complete! Time for a team break.');
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [
    syncedPomo?.isRunning,
    syncedPomo?.endEpochMillis,
    syncedPomo?.remainingSeconds,
    syncedPomo?.durationMinutes,
    syncedPomo?.lastUpdated,
    onNotify
  ]);

  // Clean up voice recording on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // 1. REAL-TIME FIRESTORE LISTENER FOR PENDING GROUP INVITATIONS
  useEffect(() => {
    if (!user || !currentEmail) {
      setPendingInvitations([]);
      return;
    }

    const invByDb = new Map<number, WebGroupInvitation[]>();
    const unsubs: (() => void)[] = [];

    targetDbs.forEach((targetDb, dbIdx) => {
      try {
        const q = query(
          collection(targetDb, 'group_invitations'),
          where('inviteeEmail', '==', currentEmail)
        );
        const unsub = onSnapshot(
          q,
          (snap) => {
            const list: WebGroupInvitation[] = [];
            snap.forEach((d) => {
              const data = (d.data() || {}) as Record<string, any>;
              if (data.status === 'PENDING') {
                list.push({
                  id: d.id,
                  projectId: data.projectId || '',
                  teamName: data.teamName || 'Group Team',
                  projectTitle: data.projectTitle || 'Assignment',
                  courseCode: data.courseCode || 'GENERAL',
                  groupTarget: data.groupTarget || 'Grade A',
                  avatarEmoji: data.avatarEmoji || data.courseCode?.slice(0, 3) || 'GRP',
                  avatarColorHex: data.avatarColorHex || '#06B6D4',
                  senderUid: data.senderUid || '',
                  senderEmail: data.senderEmail || '',
                  senderName: data.senderName || 'Teammate',
                  inviteeEmail: data.inviteeEmail || currentEmail,
                  status: 'PENDING',
                  joinCode: data.joinCode || '',
                  createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now()
                });
              }
            });
            invByDb.set(dbIdx, list);
            const merged = new Map<string, WebGroupInvitation>();
            invByDb.forEach((items) => {
              items.forEach((item) => merged.set(item.id, item));
            });
            setPendingInvitations(Array.from(merged.values()));
          },
          () => {
            // Offline fallback
          }
        );
        unsubs.push(unsub);
      } catch {
        // Offline fallback
      }
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [user, currentEmail, targetDbs]);

  // 2. REAL-TIME FIRESTORE LISTENER FOR GROUP PROJECTS WHERE USER IS A MEMBER, ADMIN, OR CREATOR
  useEffect(() => {
    if (!user || !currentEmail) return;

    const unsubs: (() => void)[] = [];
    const resultsByKey = new Map<
      string,
      Map<string, { project: WebGroupProject; updatedAtMs: number }>
    >();

    const mapDoc = (d: { id: string; data: () => unknown }) => {
      const data = (d.data() || {}) as Record<string, any>;
      const updatedAtMs =
        data.updatedAt?.toMillis?.() ?? data.createdAt?.toMillis?.() ?? 0;
      const project: WebGroupProject = {
        id: d.id,
        courseCode: data.courseCode || 'GENERAL',
        projectTitle: data.projectTitle || 'Group Project',
        teamName: data.teamName || 'Team 1',
        objective: data.objective || data.groupTarget || '',
        groupTarget: data.groupTarget || 'Grade A',
        avatarEmoji: data.avatarEmoji || data.courseCode?.slice(0, 3) || '👥',
        avatarEmojiOrUrl: data.avatarEmojiOrUrl || data.avatarEmoji || '',
        avatarColorHex: data.avatarColorHex || '#06B6D4',
        creatorUid: data.creatorUid || '',
        creatorEmail: data.creatorEmail || '',
        adminEmails: Array.isArray(data.adminEmails) ? data.adminEmails : [data.creatorEmail || ''].filter(Boolean),
        memberEmails: Array.isArray(data.memberEmails) ? data.memberEmails : [currentEmail],
        joinCode: data.joinCode || '',
        dueEpochMillis: data.dueEpochMillis || Date.now() + 14 * 86_400_000,
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        resources: Array.isArray(data.resources) ? data.resources : [],
        syncedPomodoroState: data.syncedPomodoroState || undefined,
        memberStatuses: data.memberStatuses || undefined
      };
      return { project, updatedAtMs };
    };

    const flushMerged = () => {
      const merged = new Map<string, { project: WebGroupProject; updatedAtMs: number }>();
      resultsByKey.forEach((bucket) => {
        bucket.forEach((entry, id) => {
          if (deletedProjectIdsRef.current.has(id)) return;
          const prev = merged.get(id);
          if (!prev || entry.updatedAtMs >= prev.updatedAtMs) {
            merged.set(id, entry);
          }
        });
      });
      const syncedList = Array.from(merged.values()).map((v) => v.project);
      onUpdateVault((prev) => ({
        ...prev,
        groupProjects: syncedList
      }));
    };

    targetDbs.forEach((targetDb, dbIdx) => {
      const registerQuery = (key: string, qRef: ReturnType<typeof query>) => {
        try {
          const unsub = onSnapshot(
            qRef,
            (snap) => {
              const bucket = new Map<string, { project: WebGroupProject; updatedAtMs: number }>();
              snap.docs.forEach((d) => {
                if (!deletedProjectIdsRef.current.has(d.id)) {
                  bucket.set(d.id, mapDoc(d));
                }
              });
              resultsByKey.set(key, bucket);
              flushMerged();
            },
            () => {}
          );
          unsubs.push(unsub);
        } catch {
          // Offline fallback
        }
      };

      registerQuery(
        `member_${dbIdx}`,
        query(
          collection(targetDb, 'group_projects'),
          where('memberEmails', 'array-contains', currentEmail)
        )
      );
      registerQuery(
        `admin_${dbIdx}`,
        query(
          collection(targetDb, 'group_projects'),
          where('adminEmails', 'array-contains', currentEmail)
        )
      );
      registerQuery(
        `creator_email_${dbIdx}`,
        query(
          collection(targetDb, 'group_projects'),
          where('creatorEmail', '==', currentEmail)
        )
      );
      if (user.uid) {
        registerQuery(
          `creator_${dbIdx}`,
          query(
            collection(targetDb, 'group_projects'),
            where('creatorUid', '==', user.uid)
          )
        );
      }

      // Real-time tombstone listener for zero-delay deletion synchronization with Android app
      try {
        const unsubDel = onSnapshot(
          collection(targetDb, 'deleted_group_projects'),
          (snap) => {
            let hasNewDeletions = false;
            snap.docs.forEach((d) => {
              if (!deletedProjectIdsRef.current.has(d.id)) {
                deletedProjectIdsRef.current.add(d.id);
                hasNewDeletions = true;
              }
            });
            if (hasNewDeletions) {
              const allDeleted = Array.from(deletedProjectIdsRef.current);
              onUpdateVault((prev) => ({
                ...prev,
                deletedGroupIds: allDeleted,
                groupProjects: prev.groupProjects.filter((p) => !deletedProjectIdsRef.current.has(p.id)),
                groupMessages: prev.groupMessages.filter((m) => !deletedProjectIdsRef.current.has(m.projectId))
              }));
              setSelectedProjectId((prevId) => {
                if (deletedProjectIdsRef.current.has(prevId)) {
                  const remaining = groupProjectsRef.current.filter((p) => !deletedProjectIdsRef.current.has(p.id));
                  return remaining[0]?.id || '';
                }
                return prevId;
              });
            }
          },
          () => {}
        );
        unsubs.push(unsubDel);
      } catch {}
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [user, currentEmail, targetDbs, onUpdateVault]);

  // 3. HANDLE DIRECT JOIN VIA URL PARAMETER (`?join_group=PROJECT_ID`)
  useEffect(() => {
    if (!initialGroupId || !user) return;

    const performDirectJoin = async () => {
      try {
        for (const targetDb of targetDbs) {
          const snap = await getDoc(doc(targetDb, 'group_projects', initialGroupId)).catch(() => null);
          if (snap && snap.exists()) {
            const data = snap.data();
            const members: string[] = Array.isArray(data.memberEmails) ? [...data.memberEmails] : [];
            if (!members.map((e) => e.toLowerCase()).includes(currentEmail)) {
              members.push(currentEmail);
              await Promise.allSettled(
                targetDbs.map((tDb) =>
                  updateDoc(doc(tDb, 'group_projects', initialGroupId), {
                    memberEmails: arrayUnion(currentEmail),
                    updatedAt: serverTimestamp()
                  })
                )
              );
            }

            const joinedProj: WebGroupProject = {
              id: snap.id,
              courseCode: data.courseCode || 'GENERAL',
              projectTitle: data.projectTitle || 'Group Project',
              teamName: data.teamName || 'Team 1',
              objective: data.objective || data.groupTarget || '',
              groupTarget: data.groupTarget || 'Grade A',
              avatarEmoji: data.avatarEmoji || '👥',
              avatarEmojiOrUrl: data.avatarEmojiOrUrl || data.avatarEmoji || '',
              avatarColorHex: data.avatarColorHex || '#10B981',
              creatorUid: data.creatorUid || '',
              creatorEmail: data.creatorEmail || '',
              adminEmails: data.adminEmails || [],
              memberEmails: members,
              joinCode: data.joinCode || '',
              dueEpochMillis: data.dueEpochMillis || Date.now() + 14 * 86_400_000,
              tasks: data.tasks || [],
              resources: data.resources || [],
              syncedPomodoroState: data.syncedPomodoroState,
              memberStatuses: data.memberStatuses || {}
            };

            deletedProjectIdsRef.current.delete(joinedProj.id);
            onUpdateVault((prev) => {
              const other = prev.groupProjects.filter((p) => p.id !== joinedProj.id);
              return {
                ...prev,
                deletedGroupIds: (prev.deletedGroupIds || []).filter((id) => id !== joinedProj.id),
                groupProjects: [joinedProj, ...other]
              };
            });
            setSelectedProjectId(joinedProj.id);
            onNotify(`Joined '${joinedProj.teamName}' via invite link!`);
            break;
          }
        }
      } catch {
        // Fallback
      }
    };

    performDirectJoin();
  }, [initialGroupId, user, currentEmail, targetDbs, onUpdateVault, onNotify]);

  // 4. REAL-TIME CHAT MESSAGES SYNC FOR ACTIVE PROJECT (handles polls, docs & message deletion)
  useEffect(() => {
    if (!activeProject?.id || !user) return;
    const unsubs: (() => void)[] = [];
    targetDbs.forEach((targetDb) => {
      try {
        const q = query(
          collection(targetDb, 'group_projects', activeProject.id, 'messages'),
          orderBy('createdAt', 'asc')
        );
        const unsub = onSnapshot(
          q,
          (snap) => {
            const cloudMsgs: WebGroupChatMessage[] = snap.docs.map((d) => {
              const data = d.data() as Record<string, any>;
              // Parse Poll from either Web pollData or Android pollQuestion + pollOptionsCsv + pollVotesJson
              let parsedPoll = data.pollData;
              if (!parsedPoll && data.pollQuestion) {
                const opts = String(data.pollOptionsCsv || '')
                  .split('|')
                  .map((s) => s.trim())
                  .filter(Boolean);
                let votesObj: Record<string, string[]> = {};
                if (data.pollVotesJson) {
                  try {
                    votesObj = JSON.parse(data.pollVotesJson);
                  } catch {}
                }
                parsedPoll = {
                  question: data.pollQuestion,
                  options: opts.map((optText) => ({
                    text: optText,
                    votes: Array.isArray(votesObj[optText]) ? votesObj[optText] : []
                  }))
                };
              } else if (parsedPoll && data.pollVotesJson) {
                try {
                  const votesObj = JSON.parse(data.pollVotesJson) as Record<string, string[]>;
                  parsedPoll = {
                    ...parsedPoll,
                    options: (parsedPoll.options || []).map((opt: any) => ({
                      ...opt,
                      votes: Array.isArray(votesObj[opt.text]) ? votesObj[opt.text] : opt.votes || []
                    }))
                  };
                } catch {}
              }

              // Parse Doc from either Web docData or Android sharedDocTitle/sharedDocUrl
              const parsedDoc =
                data.docData ||
                (data.sharedDocTitle
                  ? {
                      id: d.id,
                      title: data.sharedDocTitle,
                      linkOrFileName: data.sharedDocUrl || '',
                      category: 'DOCUMENT' as const,
                      addedByEmail: data.senderEmail || '',
                      addedAt: Date.now()
                    }
                  : undefined);

              return {
                id: d.id,
                projectId: activeProject.id,
                senderUid: data.senderUid || '',
                senderEmail: data.senderEmail || '',
                senderName: data.senderName || 'Teammate',
                messageText: data.messageText || '',
                timestamp: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now(),
                isPinned: Boolean(data.isPinned),
                messageType: data.messageType || 'TEXT',
                taggedDeliverableTitle: data.taggedDeliverableTitle || undefined,
                reactions: data.reactions || {},
                pollData: parsedPoll,
                docData: parsedDoc,
                audioUrl: data.audioUrl,
                audioDurationSec: data.audioDurationSec,
                imageUrl: data.imageUrl
              };
            });

            const fromServer = !snap.metadata.fromCache;
            if (fromServer || cloudMsgs.length > 0) {
              onUpdateVault((prev) => {
                const other = prev.groupMessages.filter((m) => m.projectId !== activeProject.id);
                if (fromServer) {
                  return {
                    ...prev,
                    groupMessages: [...other, ...cloudMsgs]
                  };
                }
                const mergedMap = new Map<string, WebGroupChatMessage>();
                prev.groupMessages
                  .filter((m) => m.projectId === activeProject.id)
                  .forEach((m) => mergedMap.set(m.id, m));
                cloudMsgs.forEach((m) => mergedMap.set(m.id, m));
                return {
                  ...prev,
                  groupMessages: [...other, ...Array.from(mergedMap.values())]
                };
              });
            }
          },
          () => {
            // Silent offline fallback
          }
        );
        unsubs.push(unsub);
      } catch {
        // Offline fallback
      }
    });
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [activeProject?.id, user, targetDbs, onUpdateVault]);

  // ACCEPT PENDING INVITATION
  const handleAcceptInvitation = async (inv: WebGroupInvitation) => {
    try {
      if (user) {
        const noticeMsgId = uidGen('gm_notice');
        const noticePayload = {
          projectId: inv.projectId,
          senderUid: user.uid,
          senderEmail: currentEmail,
          senderName: user.displayName || vault.profile.name || 'New Teammate',
          messageText: `🎉 ${user.displayName || currentEmail} accepted the invitation and joined the group!`,
          isPinned: false,
          messageType: 'NOTICE',
          createdAt: serverTimestamp()
        };
        await Promise.allSettled(
          targetDbs.flatMap((targetDb) => [
            updateDoc(doc(targetDb, 'group_invitations', inv.id), {
              status: 'ACCEPTED',
              updatedAt: serverTimestamp()
            }),
            updateDoc(doc(targetDb, 'group_projects', inv.projectId), {
              memberEmails: arrayUnion(currentEmail),
              updatedAt: serverTimestamp()
            }),
            setDoc(doc(targetDb, 'group_projects', inv.projectId, 'messages', noticeMsgId), noticePayload)
          ])
        );
      }

      for (const targetDb of targetDbs) {
        const snap = await getDoc(doc(targetDb, 'group_projects', inv.projectId)).catch(() => null);
        if (snap && snap.exists()) {
          const pData = snap.data();
          const joined: WebGroupProject = {
            id: snap.id,
            courseCode: pData.courseCode || inv.courseCode,
            projectTitle: pData.projectTitle || inv.projectTitle,
            teamName: pData.teamName || inv.teamName,
            objective: pData.objective || inv.groupTarget,
            groupTarget: pData.groupTarget || inv.groupTarget,
            avatarEmoji: pData.avatarEmoji || inv.avatarEmoji || '👥',
            avatarColorHex: pData.avatarColorHex || inv.avatarColorHex || '#10B981',
            creatorUid: pData.creatorUid || '',
            creatorEmail: pData.creatorEmail || inv.senderEmail,
            adminEmails: pData.adminEmails || [inv.senderEmail],
            memberEmails: pData.memberEmails || [inv.senderEmail, currentEmail],
            joinCode: pData.joinCode || inv.joinCode || '',
            dueEpochMillis: pData.dueEpochMillis || Date.now() + 14 * 86_400_000,
            tasks: pData.tasks || [],
            resources: pData.resources || [],
            syncedPomodoroState: pData.syncedPomodoroState,
            memberStatuses: pData.memberStatuses || {}
          };

          deletedProjectIdsRef.current.delete(joined.id);
          onUpdateVault((prev) => ({
            ...prev,
            deletedGroupIds: (prev.deletedGroupIds || []).filter((id) => id !== joined.id),
            groupProjects: [joined, ...prev.groupProjects.filter((p) => p.id !== joined.id)]
          }));
          setSelectedProjectId(joined.id);
          break;
        }
      }

      setPendingInvitations((prev) => prev.filter((i) => i.id !== inv.id));
      onNotify(`🎉 Successfully joined ${inv.teamName}!`);
    } catch {
      onNotify(`Joined ${inv.teamName}!`);
    }
  };

  // DECLINE PENDING INVITATION
  const handleDeclineInvitation = async (inv: WebGroupInvitation) => {
    try {
      if (user) {
        await Promise.allSettled(
          targetDbs.map((targetDb) =>
            updateDoc(doc(targetDb, 'group_invitations', inv.id), {
              status: 'DECLINED',
              updatedAt: serverTimestamp()
            })
          )
        );
      }
      setPendingInvitations((prev) => prev.filter((i) => i.id !== inv.id));
      onNotify(`Declined invitation to ${inv.teamName}.`);
    } catch {
      setPendingInvitations((prev) => prev.filter((i) => i.id !== inv.id));
    }
  };

  // JOIN TEAM BY CODE OR LINK
  const handleJoinByCode = async () => {
    const rawTrimmed = joinCodeInput.trim();
    if (!rawTrimmed) return;

    let cleanIdOrCode = rawTrimmed;
    if (cleanIdOrCode.includes('join_group=')) {
      cleanIdOrCode = cleanIdOrCode.split('join_group=')[1].split('&')[0].trim();
    } else if (cleanIdOrCode.includes('group=')) {
      cleanIdOrCode = cleanIdOrCode.split('group=')[1].split('&')[0].trim();
    }
    const noHash = cleanIdOrCode.startsWith('#') ? cleanIdOrCode.slice(1).trim() : cleanIdOrCode;
    const rawUpper = noHash.toUpperCase();
    const strippedPrefix = rawUpper.startsWith('GRP-') ? rawUpper.slice(4).trim() : rawUpper;
    const prefixedCode = `GRP-${strippedPrefix}`;
    const candidateDocIds = Array.from(new Set([noHash, noHash.toLowerCase(), strippedPrefix.toLowerCase()].filter(Boolean)));
    const candidateJoinCodes = Array.from(new Set([rawUpper, prefixedCode, strippedPrefix].filter(Boolean)));

    try {
      let targetDoc: WebGroupProject | null = null;
      let targetId = '';

      for (const targetDb of targetDbs) {
        if (targetDoc) break;
        try {
          for (const docIdCandidate of candidateDocIds) {
            const directSnap = await getDoc(doc(targetDb, 'group_projects', docIdCandidate)).catch(() => null);
            if (directSnap && directSnap.exists()) {
              const d = directSnap.data();
              targetId = directSnap.id;
              targetDoc = {
                id: directSnap.id,
                courseCode: d.courseCode || 'GENERAL',
                projectTitle: d.projectTitle || 'Group Project',
                teamName: d.teamName || 'Team 1',
                objective: d.objective || '',
                groupTarget: d.groupTarget || 'Grade A',
                avatarEmoji: d.avatarEmoji || '👥',
                avatarEmojiOrUrl: d.avatarEmojiOrUrl || d.avatarEmoji || '',
                avatarColorHex: d.avatarColorHex || '#10B981',
                creatorUid: d.creatorUid || '',
                creatorEmail: d.creatorEmail || '',
                adminEmails: d.adminEmails || [],
                memberEmails: d.memberEmails || [],
                joinCode: d.joinCode || '',
                dueEpochMillis: d.dueEpochMillis || Date.now() + 14 * 86_400_000,
                tasks: d.tasks || [],
                resources: d.resources || [],
                syncedPomodoroState: d.syncedPomodoroState,
                memberStatuses: d.memberStatuses || {}
              };
              break;
            }
          }
          if (targetDoc) break;

          for (const codeCandidate of candidateJoinCodes) {
            const qCode = query(
              collection(targetDb, 'group_projects'),
              where('joinCode', '==', codeCandidate)
            );
            const codeSnap = await getDocs(qCode);
            if (!codeSnap.empty) {
              const docItem = codeSnap.docs[0];
              const d = docItem.data();
              targetId = docItem.id;
              targetDoc = {
                id: docItem.id,
                courseCode: d.courseCode || 'GENERAL',
                projectTitle: d.projectTitle || 'Group Project',
                teamName: d.teamName || 'Team 1',
                objective: d.objective || '',
                groupTarget: d.groupTarget || 'Grade A',
                avatarEmoji: d.avatarEmoji || '👥',
                avatarEmojiOrUrl: d.avatarEmojiOrUrl || d.avatarEmoji || '',
                avatarColorHex: d.avatarColorHex || '#10B981',
                creatorUid: d.creatorUid || '',
                creatorEmail: d.creatorEmail || '',
                adminEmails: d.adminEmails || [],
                memberEmails: d.memberEmails || [],
                joinCode: d.joinCode || codeCandidate,
                dueEpochMillis: d.dueEpochMillis || Date.now() + 14 * 86_400_000,
                tasks: d.tasks || [],
                resources: d.resources || [],
                syncedPomodoroState: d.syncedPomodoroState,
                memberStatuses: d.memberStatuses || {}
              };
              break;
            }
          }
        } catch {
          // Continue to next db
        }
      }

      if (!targetDoc || !targetId) {
        onNotify(`No team found with Code '${rawUpper}'. Check the code and try again.`);
        return;
      }

      if (!targetDoc.memberEmails.includes(currentEmail)) {
        targetDoc.memberEmails.push(currentEmail);
      }

      if (user) {
        const updatePayload = {
          memberEmails: arrayUnion(currentEmail),
          updatedAt: serverTimestamp()
        };
        await Promise.allSettled(
          targetDbs.map((targetDb) =>
            updateDoc(doc(targetDb, 'group_projects', targetId), updatePayload)
          )
        );
      }

      deletedProjectIdsRef.current.delete(targetDoc.id);
      onUpdateVault((prev) => ({
        ...prev,
        deletedGroupIds: (prev.deletedGroupIds || []).filter((id) => id !== targetDoc!.id),
        groupProjects: [targetDoc!, ...prev.groupProjects.filter((p) => p.id !== targetDoc!.id)]
      }));
      setSelectedProjectId(targetDoc.id);
      setShowJoinByCodeModal(false);
      setJoinCodeInput('');
      onNotify(`🎉 Successfully joined ${targetDoc.teamName}!`);
    } catch {
      onNotify('Unable to join team right now. Check connection.');
    }
  };

  // SEND TEXT OR DELIVERABLE MESSAGE
  const handleSendMessage = async () => {
    if (!activeProject) return;
    const text = chatInput.trim();
    if (!text && !selectedDeliverableTag) return;

    const newMsg: WebGroupChatMessage = {
      id: uidGen('gm'),
      projectId: activeProject.id,
      senderEmail: currentEmail,
      senderName: user?.displayName || vault.profile.name || 'Scholar',
      messageText: text,
      timestamp: Date.now(),
      isPinned: pinChecked,
      messageType: selectedDeliverableTag ? 'DELIVERABLE' : 'TEXT',
      taggedDeliverableTitle: selectedDeliverableTag || undefined,
      reactions: {}
    };

    onUpdateVault((prev) => ({
      ...prev,
      groupMessages: [...prev.groupMessages, newMsg]
    }));

    setChatInput('');
    setPinChecked(false);
    setSelectedDeliverableTag('');

    if (user) {
      const msgPayload = {
        projectId: activeProject.id,
        senderUid: user.uid,
        senderEmail: currentEmail,
        senderName: newMsg.senderName,
        messageText: newMsg.messageText,
        isPinned: newMsg.isPinned,
        messageType: newMsg.messageType,
        taggedDeliverableTitle: newMsg.taggedDeliverableTitle || null,
        reactions: {},
        createdAt: serverTimestamp()
      };
      await Promise.allSettled(
        targetDbs.map((targetDb) =>
          setDoc(doc(targetDb, 'group_projects', activeProject.id, 'messages', newMsg.id), msgPayload)
        )
      );
    }
  };

  // UN-SEND / DELETE MESSAGE (Author or Group Admin)
  const handleDeleteMessage = async (msg: WebGroupChatMessage) => {
    if (!activeProject) return;
    const isMe =
      Boolean(currentEmail && msg.senderEmail && msg.senderEmail.toLowerCase() === currentEmail) ||
      Boolean(user?.uid && msg.senderUid && msg.senderUid === user.uid) ||
      Boolean(msg.senderName && (msg.senderName === user?.displayName || msg.senderName === 'You')) ||
      (!msg.senderEmail && !msg.senderUid);
    const canDelete = isMe || isCurrentUserAdmin || !activeProject.creatorUid || activeProject.creatorUid === user?.uid || !activeProject.adminEmails?.length;
    if (!canDelete) return;

    if (!window.confirm(isMe ? 'Unsend this message for everyone?' : 'Delete this message as Admin?')) return;

    onUpdateVault((prev) => ({
      ...prev,
      groupMessages: prev.groupMessages.filter((m) => m.id !== msg.id)
    }));

    if (user) {
      await Promise.allSettled(
        targetDbs.map((targetDb) =>
          deleteDoc(doc(targetDb, 'group_projects', activeProject.id, 'messages', msg.id))
        )
      );
    }

    onNotify(isMe ? 'Message unsent.' : 'Message deleted by admin.');
  };

  // START VOICE NOTE RECORDING
  const handleStartVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(200);
      setIsRecordingVoice(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      onNotify('Microphone access is required to record voice notes. Please grant permission in browser.');
    }
  };

  // CANCEL VOICE NOTE RECORDING
  const handleCancelVoiceRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
    }
    audioChunksRef.current = [];
    setIsRecordingVoice(false);
    setRecordingSeconds(0);
  };

  // FINALIZE & SEND VOICE NOTE
  const handleSendVoiceRecording = () => {
    if (!mediaRecorderRef.current || !activeProject) return;
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

    const dur = Math.max(1, recordingSeconds);
    const recorder = mediaRecorderRef.current;

    recorder.onstop = () => {
      recorder.stream.getTracks().forEach((t) => t.stop());
      const audioBlob = new Blob(audioChunksRef.current, {
        type: recorder.mimeType || 'audio/webm'
      });
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result as string;
        const newMsg: WebGroupChatMessage = {
          id: uidGen('vnote'),
          projectId: activeProject.id,
          senderEmail: currentEmail,
          senderName: user?.displayName || vault.profile.name || 'Scholar',
          messageText: `🎙️ Voice Note (${dur}s)`,
          timestamp: Date.now(),
          isPinned: false,
          messageType: 'VOICE_NOTE',
          audioUrl: base64Data,
          audioDurationSec: dur,
          reactions: {}
        };

        onUpdateVault((prev) => ({
          ...prev,
          groupMessages: [...prev.groupMessages, newMsg]
        }));

        if (user) {
          const payload = {
            projectId: activeProject.id,
            senderUid: user.uid,
            senderEmail: currentEmail,
            senderName: newMsg.senderName,
            messageText: newMsg.messageText,
            isPinned: false,
            messageType: 'VOICE_NOTE',
            audioUrl: newMsg.audioUrl,
            audioDurationSec: newMsg.audioDurationSec,
            reactions: {},
            createdAt: serverTimestamp()
          };
          await Promise.allSettled(
            targetDbs.map((targetDb) =>
              setDoc(doc(targetDb, 'group_projects', activeProject.id, 'messages', newMsg.id), payload)
            )
          );
        }
        onNotify('Voice note sent to team!');
      };
      reader.readAsDataURL(audioBlob);
    };

    recorder.stop();
    setIsRecordingVoice(false);
    setRecordingSeconds(0);
  };

  // SEND IMAGE / DIAGRAM
  const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeProject) return;

    if (file.size > 2.5 * 1024 * 1024) {
      onNotify('Please select an image smaller than 2.5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      const newMsg: WebGroupChatMessage = {
        id: uidGen('img'),
        projectId: activeProject.id,
        senderEmail: currentEmail,
        senderName: user?.displayName || vault.profile.name || 'Scholar',
        messageText: `📸 Photo: ${file.name}`,
        timestamp: Date.now(),
        isPinned: false,
        messageType: 'IMAGE_SHARE',
        imageUrl: base64,
        reactions: {}
      };

      onUpdateVault((prev) => ({
        ...prev,
        groupMessages: [...prev.groupMessages, newMsg]
      }));

      if (user) {
        const payload = {
          projectId: activeProject.id,
          senderUid: user.uid,
          senderEmail: currentEmail,
          senderName: newMsg.senderName,
          messageText: newMsg.messageText,
          isPinned: false,
          messageType: 'IMAGE_SHARE',
          imageUrl: newMsg.imageUrl,
          reactions: {},
          createdAt: serverTimestamp()
        };
        await Promise.allSettled(
          targetDbs.map((targetDb) =>
            setDoc(doc(targetDb, 'group_projects', activeProject.id, 'messages', newMsg.id), payload)
          )
        );
      }
      onNotify('Photo shared with group!');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // SEND POLL
  const handleSendPoll = async () => {
    if (!activeProject) return;
    const q = pollQuestionInput.trim();
    const opts = [pollOpt1.trim(), pollOpt2.trim(), pollOpt3.trim()].filter(Boolean);
    if (!q || opts.length < 2) return;

    const newMsg: WebGroupChatMessage = {
      id: uidGen('poll'),
      projectId: activeProject.id,
      senderEmail: currentEmail,
      senderName: user?.displayName || vault.profile.name || 'Scholar',
      messageText: `📊 Team Vote: ${q}`,
      timestamp: Date.now(),
      isPinned: false,
      messageType: 'POLL',
      pollData: {
        question: q,
        options: opts.map((text) => ({ text, votes: [] }))
      }
    };

    onUpdateVault((prev) => ({
      ...prev,
      groupMessages: [...prev.groupMessages, newMsg]
    }));

    if (user) {
      const payload = {
        projectId: activeProject.id,
        senderUid: user.uid,
        senderEmail: currentEmail,
        senderName: newMsg.senderName,
        messageText: newMsg.messageText,
        isPinned: false,
        messageType: 'POLL',
        pollData: newMsg.pollData,
        pollQuestion: q,
        pollOptionsCsv: opts.join('|'),
        createdAt: serverTimestamp()
      };
      await Promise.allSettled(
        targetDbs.map((targetDb) =>
          setDoc(doc(targetDb, 'group_projects', activeProject.id, 'messages', newMsg.id), payload)
        )
      );
    }

    setShowPollModal(false);
    setPollQuestionInput('');
    onNotify('Team poll posted to chat!');
  };

  // VOTE ON POLL (Synced to Firestore for Android & Web)
  const handleVotePoll = async (msg: WebGroupChatMessage, optionText: string) => {
    if (!msg.pollData || !activeProject) return;
    const updatedOptions = msg.pollData.options.map((opt) => {
      const filtered = opt.votes.filter((e) => e.toLowerCase() !== currentEmail);
      if (opt.text === optionText) {
        const hadVoted = opt.votes.some((e) => e.toLowerCase() === currentEmail);
        return {
          ...opt,
          votes: hadVoted ? filtered : [...filtered, currentEmail]
        };
      }
      return { ...opt, votes: filtered };
    });

    const nextPollData = {
      ...msg.pollData,
      options: updatedOptions
    };
    const votesRecord: Record<string, string[]> = {};
    updatedOptions.forEach((o) => {
      votesRecord[o.text] = o.votes;
    });
    const pollVotesJson = JSON.stringify(votesRecord);

    onUpdateVault((prev) => ({
      ...prev,
      groupMessages: prev.groupMessages.map((m) =>
        m.id === msg.id ? { ...m, pollData: nextPollData } : m
      )
    }));

    if (user) {
      await Promise.allSettled(
        targetDbs.map((targetDb) =>
          setDoc(
            doc(targetDb, 'group_projects', activeProject.id, 'messages', msg.id),
            {
              pollData: nextPollData,
              pollVotesJson,
              pollQuestion: nextPollData.question,
              pollOptionsCsv: updatedOptions.map((o) => o.text).join('|')
            },
            { merge: true }
          )
        )
      );
    }
  };

  // SEND DOC / RESOURCE
  const handleSendDoc = async () => {
    if (!activeProject) return;
    const title = newResourceTitle.trim();
    const link = newResourceUrl.trim();
    if (!title) return;

    const newMsg: WebGroupChatMessage = {
      id: uidGen('doc'),
      projectId: activeProject.id,
      senderEmail: currentEmail,
      senderName: user?.displayName || vault.profile.name || 'Scholar',
      messageText: `📎 Shared Document: ${title}`,
      timestamp: Date.now(),
      isPinned: false,
      messageType: 'DOC_SHARE',
      docData: {
        id: uidGen('res'),
        title,
        linkOrFileName: link,
        category: 'DOCUMENT',
        addedByEmail: currentEmail,
        addedAt: Date.now()
      }
    };

    onUpdateVault((prev) => ({
      ...prev,
      groupMessages: [...prev.groupMessages, newMsg]
    }));

    if (user) {
      const payload = {
        projectId: activeProject.id,
        senderUid: user.uid,
        senderEmail: currentEmail,
        senderName: newMsg.senderName,
        messageText: newMsg.messageText,
        isPinned: false,
        messageType: 'DOC_SHARE',
        docData: newMsg.docData,
        sharedDocTitle: title,
        sharedDocUrl: link,
        createdAt: serverTimestamp()
      };
      await Promise.allSettled(
        targetDbs.map((targetDb) =>
          setDoc(doc(targetDb, 'group_projects', activeProject.id, 'messages', newMsg.id), payload)
        )
      );
    }

    setShowDocModal(false);
    setNewResourceTitle('');
    setNewResourceUrl('');
    onNotify('Resource shared to group!');
  };

  // ADD MEMBER BY EMAIL & SEND INVITATION
  const handleAddMemberByEmail = async (email: string) => {
    if (!activeProject) return;
    const clean = email.trim().toLowerCase();
    if (!clean || !clean.includes('@') || !clean.includes('.')) {
      onNotify('Please enter a valid classmate email address.');
      return;
    }
    if (activeProject.memberEmails.map((e) => e.toLowerCase()).includes(clean)) {
      onNotify(`${clean} is already a member of ${activeProject.teamName}.`);
      return;
    }

    const updatedMembers = [...activeProject.memberEmails, clean];
    const projectJoinCode = activeProject.joinCode || generateJoinCode();

    onUpdateVault((prev) => ({
      ...prev,
      groupProjects: prev.groupProjects.map((p) =>
        p.id === activeProject.id
          ? { ...p, memberEmails: updatedMembers, joinCode: projectJoinCode }
          : p
      ),
      groupMessages: [
        ...prev.groupMessages,
        {
          id: uidGen('gm_notice'),
          projectId: activeProject.id,
          senderEmail: 'system@aura',
          senderName: 'AURA Team Bot',
          messageText: `🎉 ${clean} was invited to join ${activeProject.teamName}!`,
          timestamp: Date.now(),
          isPinned: false,
          messageType: 'NOTICE'
        }
      ]
    }));

    if (user) {
      const projectPayload = {
        id: activeProject.id,
        courseCode: activeProject.courseCode,
        projectTitle: activeProject.projectTitle,
        teamName: activeProject.teamName,
        objective: activeProject.objective,
        groupTarget: activeProject.groupTarget,
        avatarEmoji: activeProject.avatarEmoji || '👥',
        avatarColorHex: activeProject.avatarColorHex || '#10B981',
        creatorUid: activeProject.creatorUid || user.uid,
        creatorEmail: activeProject.creatorEmail || currentEmail,
        adminEmails: activeProject.adminEmails,
        memberEmails: updatedMembers,
        joinCode: projectJoinCode,
        dueEpochMillis: activeProject.dueEpochMillis,
        tasks: activeProject.tasks || [],
        updatedAt: serverTimestamp()
      };
      const inviteDocId = `inv_${activeProject.id}_${clean.replace(/[^a-z0-9]/g, '_')}`;
      const invitePayload = {
        id: inviteDocId,
        projectId: activeProject.id,
        teamName: activeProject.teamName,
        projectTitle: activeProject.projectTitle,
        courseCode: activeProject.courseCode,
        groupTarget: activeProject.groupTarget,
        avatarEmoji: activeProject.avatarEmoji || '👥',
        avatarColorHex: activeProject.avatarColorHex || '#10B981',
        senderUid: user.uid,
        senderEmail: currentEmail,
        senderName: user.displayName || vault.profile.name || 'Team Leader',
        inviteeEmail: clean,
        status: 'PENDING',
        joinCode: projectJoinCode,
        createdAt: serverTimestamp()
      };
      const noticeId = uidGen('notice');
      const noticePayload = {
        projectId: activeProject.id,
        senderUid: user.uid,
        senderEmail: 'system@aura',
        senderName: 'AURA Team Bot',
        messageText: `🎉 ${clean} was invited to the group!`,
        isPinned: false,
        messageType: 'NOTICE',
        createdAt: serverTimestamp()
      };

      await Promise.allSettled(
        targetDbs.flatMap((targetDb) => [
          setDoc(doc(targetDb, 'group_projects', activeProject.id), projectPayload, { merge: true }),
          setDoc(doc(targetDb, 'group_invitations', inviteDocId), invitePayload),
          setDoc(doc(targetDb, 'group_projects', activeProject.id, 'messages', noticeId), noticePayload)
        ])
      );
    }

    setShowAddMemberModal(false);

    setInviteSuccessData({
      inviteeEmail: clean,
      teamName: activeProject.teamName,
      courseCode: activeProject.courseCode,
      projectId: activeProject.id,
      joinCode: projectJoinCode
    });

    onNotify(`Invited ${clean} to ${activeProject.teamName}!`);
  };

  // PROMOTE TO ADMIN
  const handlePromoteToAdmin = async (email: string) => {
    if (!activeProject || !isCurrentUserAdmin) return;
    const clean = email.trim().toLowerCase();
    if (activeProject.adminEmails.map((e) => e.toLowerCase()).includes(clean)) return;

    const updatedAdmins = [...activeProject.adminEmails, clean];
    onUpdateVault((prev) => ({
      ...prev,
      groupProjects: prev.groupProjects.map((p) =>
        p.id === activeProject.id ? { ...p, adminEmails: updatedAdmins } : p
      ),
      groupMessages: [
        ...prev.groupMessages,
        {
          id: uidGen('gm_notice'),
          projectId: activeProject.id,
          senderEmail: 'system@aura',
          senderName: 'AURA Team Bot',
          messageText: `⭐ ${clean} was promoted to Group Admin`,
          timestamp: Date.now(),
          isPinned: false,
          messageType: 'NOTICE'
        }
      ]
    }));

    if (user) {
      await Promise.allSettled(
        targetDbs.map((targetDb) =>
          updateDoc(doc(targetDb, 'group_projects', activeProject.id), {
            adminEmails: updatedAdmins,
            updatedAt: serverTimestamp()
          })
        )
      );
    }

    onNotify(`Promoted ${clean} to Group Admin.`);
  };

  // DEMOTE ADMIN
  const handleDemoteAdmin = async (email: string) => {
    if (!activeProject || !isCurrentUserAdmin) return;
    const clean = email.trim().toLowerCase();
    const updatedAdmins = activeProject.adminEmails.filter((e) => e.toLowerCase() !== clean);
    onUpdateVault((prev) => ({
      ...prev,
      groupProjects: prev.groupProjects.map((p) =>
        p.id === activeProject.id ? { ...p, adminEmails: updatedAdmins } : p
      )
    }));

    if (user) {
      await Promise.allSettled(
        targetDbs.map((targetDb) =>
          updateDoc(doc(targetDb, 'group_projects', activeProject.id), {
            adminEmails: updatedAdmins,
            updatedAt: serverTimestamp()
          })
        )
      );
    }

    onNotify(`Demoted ${clean} to Member.`);
  };

  // REMOVE MEMBER
  const handleRemoveMember = async (email: string) => {
    if (!activeProject || !isCurrentUserAdmin) return;
    const clean = email.trim().toLowerCase();
    const updatedMembers = activeProject.memberEmails.filter((e) => e.toLowerCase() !== clean);
    const updatedAdmins = activeProject.adminEmails.filter((e) => e.toLowerCase() !== clean);

    onUpdateVault((prev) => ({
      ...prev,
      groupProjects: prev.groupProjects.map((p) =>
        p.id === activeProject.id
          ? {
              ...p,
              memberEmails: updatedMembers,
              adminEmails: updatedAdmins
            }
          : p
      )
    }));

    if (user) {
      await Promise.allSettled(
        targetDbs.map((targetDb) =>
          updateDoc(doc(targetDb, 'group_projects', activeProject.id), {
            memberEmails: updatedMembers,
            adminEmails: updatedAdmins,
            updatedAt: serverTimestamp()
          })
        )
      );
    }

    onNotify(`Removed ${clean} from ${activeProject.teamName}.`);
  };

  // TOGGLE TASK
  const handleToggleTask = async (task: WebGroupTask) => {
    if (!activeProject) return;
    const updatedTasks = activeProject.tasks.map((t) =>
      t.id === task.id ? { ...t, isCompleted: !t.isCompleted } : t
    );

    onUpdateVault((prev) => ({
      ...prev,
      groupProjects: prev.groupProjects.map((p) =>
        p.id === activeProject.id ? { ...p, tasks: updatedTasks } : p
      )
    }));

    if (user) {
      await Promise.allSettled(
        targetDbs.map((targetDb) =>
          updateDoc(doc(targetDb, 'group_projects', activeProject.id), {
            tasks: updatedTasks,
            updatedAt: serverTimestamp()
          })
        )
      );
    }
  };

  // DELETE PROJECT (Creator / Admin)
  const handleDeleteProject = async (projId: string) => {
    const proj = vault.groupProjects.find((p) => p.id === projId);
    const name = proj?.teamName || 'this team';

    if (!window.confirm(`Permanently delete '${name}'? All messages, tasks, and resources will be removed.`))
      return;

    deletedProjectIdsRef.current.add(projId);
    const persistedDeleted = Array.from(deletedProjectIdsRef.current);

    onUpdateVault((prev) => {
      const remaining = prev.groupProjects.filter((p) => p.id !== projId);
      return {
        ...prev,
        deletedGroupIds: persistedDeleted,
        groupProjects: remaining,
        groupMessages: prev.groupMessages.filter((m) => m.projectId !== projId)
      };
    });

    setSelectedProjectId((prevId) => {
      if (prevId === projId) {
        const remaining = groupProjectsRef.current.filter((p) => p.id !== projId);
        return remaining[0]?.id || '';
      }
      return prevId;
    });

    if (user) {
      await Promise.allSettled(
        targetDbs.flatMap((targetDb) => [
          deleteDoc(doc(targetDb, 'group_projects', projId)),
          setDoc(doc(targetDb, 'deleted_group_projects', projId), {
            deletedAt: serverTimestamp(),
            deletedBy: currentEmail || user.email || 'web-user'
          })
        ])
      );
    }

    onNotify(`Deleted '${name}'.`);
  };

  // LEAVE GROUP (For any member)
  const handleLeaveGroup = async (projId: string) => {
    const proj = vault.groupProjects.find((p) => p.id === projId);
    if (!proj) return;

    if (!window.confirm(`Leave '${proj.teamName}'? You will be removed from team collaboration.`))
      return;

    deletedProjectIdsRef.current.add(projId);
    const persistedDeleted = Array.from(deletedProjectIdsRef.current);

    onUpdateVault((prev) => {
      const remaining = prev.groupProjects.filter((p) => p.id !== projId);
      return {
        ...prev,
        deletedGroupIds: persistedDeleted,
        groupProjects: remaining,
        groupMessages: prev.groupMessages.filter((m) => m.projectId !== projId)
      };
    });

    setSelectedProjectId((prevId) => {
      if (prevId === projId) {
        const remaining = groupProjectsRef.current.filter((p) => p.id !== projId);
        return remaining[0]?.id || '';
      }
      return prevId;
    });

    if (user) {
      const updatedMembers = proj.memberEmails.filter(
        (e) => e.toLowerCase() !== currentEmail
      );
      const updatedAdmins = proj.adminEmails.filter(
        (e) => e.toLowerCase() !== currentEmail
      );
      await Promise.allSettled(
        targetDbs.map((targetDb) =>
          updateDoc(doc(targetDb, 'group_projects', projId), {
            memberEmails: updatedMembers,
            adminEmails: updatedAdmins,
            updatedAt: serverTimestamp()
          })
        )
      );
    }

    onNotify(`You left '${proj.teamName}'.`);
  };

  // ADD SHARED RESOURCE TO TEAM VAULT (Feature 1)
  const handleAddResource = async () => {
    if (!activeProject || !newResourceTitle.trim() || !newResourceUrl.trim()) return;
    const resource: WebGroupResourceDoc = {
      id: uidGen('res'),
      title: newResourceTitle.trim(),
      linkOrFileName: newResourceUrl.trim(),
      category: newResourceCategory,
      addedByEmail: currentEmail,
      addedAt: Date.now()
    };

    const updatedResources = [...(activeProject.resources || []), resource];

    onUpdateVault((prev) => ({
      ...prev,
      groupProjects: prev.groupProjects.map((p) =>
        p.id === activeProject.id ? { ...p, resources: updatedResources } : p
      )
    }));

    if (user) {
      await Promise.allSettled(
        targetDbs.map((targetDb) =>
          updateDoc(doc(targetDb, 'group_projects', activeProject.id), {
            resources: updatedResources,
            updatedAt: serverTimestamp()
          })
        )
      );
    }

    setNewResourceTitle('');
    setNewResourceUrl('');
    setShowDocModal(false);
    onNotify(`Added '${resource.title}' to Team Resource Vault!`);
  };

  // DELETE RESOURCE FROM TEAM VAULT
  const handleDeleteResource = async (resId: string) => {
    if (!activeProject) return;
    const updatedResources = (activeProject.resources || []).filter((r) => r.id !== resId);

    onUpdateVault((prev) => ({
      ...prev,
      groupProjects: prev.groupProjects.map((p) =>
        p.id === activeProject.id ? { ...p, resources: updatedResources } : p
      )
    }));

    if (user) {
      await Promise.allSettled(
        targetDbs.map((targetDb) =>
          updateDoc(doc(targetDb, 'group_projects', activeProject.id), {
            resources: updatedResources,
            updatedAt: serverTimestamp()
          })
        )
      );
    }

    onNotify('Resource removed from Vault.');
  };

  // FEATURE 2: SYNCED GROUP POMODORO SPRINT TIMER ACTIONS (Web <-> Android)
  const handlePomodoroAction = async (
    action: 'START' | 'PAUSE' | 'RESET' | 'MODE',
    durationMins = pomodoroDurationMin,
    modeLabel: 'FOCUS' | 'BREAK' = pomodoroMode
  ) => {
    if (!activeProject) return;
    const now = Date.now();
    const initiatorName = user?.displayName || vault.profile.name || 'Scholar';
    let nextRunning = false;
    let nextRemaining = durationMins * 60;
    let nextEndEpoch = 0;

    if (action === 'START') {
      const secs = pomodoroSeconds > 0 && pomodoroSeconds <= 7200 ? pomodoroSeconds : durationMins * 60;
      nextRunning = true;
      nextRemaining = secs;
      nextEndEpoch = now + secs * 1000;
    } else if (action === 'PAUSE') {
      nextRunning = false;
      nextRemaining = Math.max(0, pomodoroSeconds);
      nextEndEpoch = 0;
    } else {
      nextRunning = false;
      nextRemaining = durationMins * 60;
      nextEndEpoch = 0;
    }

    const nextState = {
      isRunning: nextRunning,
      remainingSeconds: nextRemaining,
      durationMinutes: durationMins,
      mode: modeLabel,
      endEpochMillis: nextEndEpoch,
      lastUpdated: now,
      initiatorName,
      initiatorEmail: currentEmail
    };

    onUpdateVault((prev) => ({
      ...prev,
      groupProjects: prev.groupProjects.map((p) =>
        p.id === activeProject.id ? { ...p, syncedPomodoroState: nextState } : p
      )
    }));

    if (user) {
      await Promise.allSettled(
        targetDbs.map((tDb) =>
          setDoc(
            doc(tDb, 'group_projects', activeProject.id),
            {
              syncedPomodoroState: nextState,
              updatedAt: serverTimestamp()
            },
            { merge: true }
          )
        )
      );
    }

    if (action === 'START') {
      onNotify(`Started synced ${durationMins}m ${modeLabel.toLowerCase()} sprint!`);
    }
  };

  // FEATURE 3: LIVE MEMBER STUDY STATUS & 1-TAP STANDUP PULSE (Web <-> Android)
  const handleUpdateMyStatus = async (statusCode: string, note = '') => {
    if (!activeProject || !currentEmail) return;
    const nextStatuses = {
      ...(activeProject.memberStatuses || {}),
      [currentEmail]: {
        status: statusCode,
        note,
        updatedAt: Date.now()
      }
    };

    onUpdateVault((prev) => ({
      ...prev,
      groupProjects: prev.groupProjects.map((p) =>
        p.id === activeProject.id ? { ...p, memberStatuses: nextStatuses } : p
      )
    }));

    if (user) {
      await Promise.allSettled(
        targetDbs.map((tDb) =>
          setDoc(
            doc(tDb, 'group_projects', activeProject.id),
            {
              memberStatuses: nextStatuses,
              updatedAt: serverTimestamp()
            },
            { merge: true }
          )
        )
      );
    }
    onNotify('Live study status synced!');
  };

  const handleSendStandupPulse = async () => {
    if (!activeProject) return;
    const myStatus = activeProject.memberStatuses?.[currentEmail]?.status || 'FOCUSING';
    const statusLabel =
      myStatus === 'FOCUSING'
        ? '🔥 Focusing'
        : myStatus === 'IN_LIBRARY'
        ? '📚 In Library'
        : myStatus === 'ON_BREAK'
        ? '☕ On Break'
        : '✅ Ready to Review';
    const senderName = user?.displayName || vault.profile.name || 'Scholar';
    const text = `⚡ Standup Pulse (${statusLabel}) • ${senderName} checked in — Team Readiness ${taskProgressPct}% (${doneTasks}/${tasks.length} deliverables done)`;
    const noticeId = uidGen('pulse');
    const newMsg: WebGroupChatMessage = {
      id: noticeId,
      projectId: activeProject.id,
      senderEmail: currentEmail,
      senderName,
      messageText: text,
      timestamp: Date.now(),
      isPinned: false,
      messageType: 'NOTICE'
    };

    await handleUpdateMyStatus(myStatus, `${doneTasks}/${tasks.length} tasks done`);
    onUpdateVault((prev) => ({
      ...prev,
      groupMessages: [...prev.groupMessages, newMsg]
    }));

    if (user) {
      await Promise.allSettled(
        targetDbs.map((tDb) =>
          setDoc(doc(tDb, 'group_projects', activeProject.id, 'messages', noticeId), {
            projectId: activeProject.id,
            senderUid: user.uid,
            senderEmail: currentEmail,
            senderName,
            messageText: text,
            isPinned: false,
            messageType: 'NOTICE',
            createdAt: serverTimestamp()
          })
        )
      );
    }
    onNotify('Standup pulse posted & synced!');
  };

  // 1-TAP FORCE CLOUD SYNC (Strict Server Reconciliation)
  const handleForceSync = async () => {
    setIsSyncing(true);
    try {
      for (const tDb of targetDbs) {
        const delSnap = await getDocsFromServer(collection(tDb, 'deleted_group_projects'))
          .catch(() => getDocs(collection(tDb, 'deleted_group_projects')))
          .catch(() => null);
        if (delSnap) {
          delSnap.docs.forEach((d) => deletedProjectIdsRef.current.add(d.id));
        }
      }

      const fetchedMap = new Map<string, WebGroupProject>();
      let anyServerSucceeded = false;

      for (const tDb of targetDbs) {
        const queries = [
          query(collection(tDb, 'group_projects'), where('memberEmails', 'array-contains', currentEmail)),
          query(collection(tDb, 'group_projects'), where('adminEmails', 'array-contains', currentEmail)),
          query(collection(tDb, 'group_projects'), where('creatorEmail', '==', currentEmail))
        ];
        if (user?.uid) {
          queries.push(query(collection(tDb, 'group_projects'), where('creatorUid', '==', user.uid)));
        }

        for (const qRef of queries) {
          const snap = await getDocsFromServer(qRef).catch(() => null);
          const effectiveSnap = snap || (await getDocs(qRef).catch(() => null));
          if (snap) anyServerSucceeded = true;

          effectiveSnap?.docs.forEach((d) => {
            if (deletedProjectIdsRef.current.has(d.id)) return;
            const data = (d.data() || {}) as Record<string, any>;
            fetchedMap.set(d.id, {
              id: d.id,
              teamName: data.teamName || 'Study Team',
              projectTitle: data.projectTitle || data.teamName || 'Group Project',
              courseCode: data.courseCode || 'GEN-101',
              objective: data.objective || data.groupTarget || '',
              groupTarget: data.groupTarget || data.objective || '',
              creatorEmail: data.creatorEmail || '',
              creatorUid: data.creatorUid || '',
              avatarColorHex: data.avatarColorHex || '#06B6D4',
              avatarEmoji: data.avatarEmoji || data.courseCode?.slice(0, 3) || '👥',
              avatarEmojiOrUrl: data.avatarEmojiOrUrl || data.avatarEmoji || '',
              memberEmails: Array.isArray(data.memberEmails) ? data.memberEmails : [],
              adminEmails: Array.isArray(data.adminEmails) ? data.adminEmails : [],
              joinCode: data.joinCode || d.id.slice(0, 6).toUpperCase(),
              dueEpochMillis: data.dueEpochMillis || Date.now() + 14 * 86_400_000,
              tasks: Array.isArray(data.tasks) ? data.tasks : [],
              resources: Array.isArray(data.resources) ? data.resources : [],
              syncedPomodoroState: data.syncedPomodoroState || undefined,
              memberStatuses: data.memberStatuses || undefined
            });
          });
        }
      }

      const persistedDeleted = Array.from(deletedProjectIdsRef.current);
      const fetchedList = Array.from(fetchedMap.values());

      onUpdateVault((prev) => {
        const nextProjects = anyServerSucceeded
          ? fetchedList
          : (() => {
              const map = new Map<string, WebGroupProject>();
              prev.groupProjects.forEach((p) => {
                if (!deletedProjectIdsRef.current.has(p.id)) map.set(p.id, p);
              });
              fetchedList.forEach((p) => {
                if (!deletedProjectIdsRef.current.has(p.id)) map.set(p.id, p);
              });
              return Array.from(map.values());
            })();
        return {
          ...prev,
          deletedGroupIds: persistedDeleted,
          groupProjects: nextProjects,
          groupMessages: prev.groupMessages.filter((m) => !deletedProjectIdsRef.current.has(m.projectId))
        };
      });

      setSelectedProjectId((prevId) => {
        if (deletedProjectIdsRef.current.has(prevId) || (anyServerSucceeded && prevId && !fetchedMap.has(prevId))) {
          return fetchedList[0]?.id || '';
        }
        return prevId;
      });

      onNotify(anyServerSucceeded ? '⚡ Server sync complete! Cloud teams & tasks updated.' : 'Synced with local cache.');
    } catch {
      onNotify('Synced with local cache.');
    } finally {
      setIsSyncing(false);
    }
  };

  // EXPORT CHAT TRANSCRIPT
  const handleExportChat = () => {
    if (!activeProject) return;
    const lines = [
      `# ${activeProject.teamName} • ${activeProject.projectTitle} (${activeProject.courseCode})`,
      `Target: ${activeProject.groupTarget}`,
      `Join Code: ${activeProject.joinCode || 'N/A'}`,
      `Exported: ${new Date().toLocaleString()}`,
      `Members: ${activeProject.memberEmails.join(', ')}`,
      '',
      '--- CHAT TRANSCRIPT ---',
      ...projectMessages.map((m) => {
        const time = new Date(m.timestamp).toLocaleTimeString();
        return `[${time}] ${m.senderName} (${m.senderEmail}): ${m.messageText}`;
      })
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    onNotify('Copied full chat transcript to clipboard!');
  };

  // COPY 1-CLICK INVITE LINK
  const handleCopyInviteLink = (proj: WebGroupProject) => {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://aura-study-companion.vercel.app';
    const link = `${origin}/?join_group=${proj.id}`;
    navigator.clipboard.writeText(link);
    onNotify(`Copied 1-Click Invite Link for ${proj.teamName}!`);
  };

  // Filtered deliverables
  const tasks = activeProject?.tasks || [];
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchesSearch =
        t.taskTitle.toLowerCase().includes(taskSearch.toLowerCase()) ||
        t.memberName.toLowerCase().includes(taskSearch.toLowerCase());
      if (!matchesSearch) return false;
      if (taskFilter === 'PENDING') return !t.isCompleted;
      if (taskFilter === 'DONE') return t.isCompleted;
      return true;
    });
  }, [tasks, taskFilter, taskSearch]);

  const doneTasks = tasks.filter((t) => t.isCompleted).length;
  const taskProgressPct = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0;
  const pinnedMessages = projectMessages.filter((m) => m.isPinned);

  // Time remaining to deadline
  const daysLeft = activeProject?.dueEpochMillis
    ? Math.max(0, Math.ceil((activeProject.dueEpochMillis - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="space-y-4">
      {/* 1. PENDING INVITATIONS BANNER */}
      {pendingInvitations.length > 0 && (
        <div className="rounded-xl p-4 bg-[#FFFBEB] border border-[#F59E0B] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#B45309]" />
              <h3 className="font-bold text-sm sm:text-base text-[#111827]">
                Team Invitations ({pendingInvitations.length})
              </h3>
            </div>
            <span className="font-mono text-[10px] font-bold text-[#92400E] px-2 py-0.5 rounded bg-[#FFFFFF] border border-[#FDE68A] uppercase tracking-wider">
              Pending
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingInvitations.map((inv) => (
              <div
                key={inv.id}
                className="p-3.5 rounded-lg bg-[#FFFFFF] border border-[#FDE68A] flex flex-col justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-xs shrink-0 border border-[#E5E7EB] bg-[#F3F4F6] text-[#111827]">
                    {inv.teamName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-[#111827] text-sm">{inv.teamName}</span>
                      <span className="px-1.5 py-0.5 rounded font-mono bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E3A8A] text-[10px] font-bold">
                        {inv.courseCode}
                      </span>
                    </div>
                    <p className="text-xs text-[#4B5563] line-clamp-1">{inv.projectTitle}</p>
                    <p className="text-[11px] text-[#B45309] font-medium mt-0.5">
                      Target: {inv.groupTarget}
                    </p>
                    <p className="text-[10px] text-[#6B7280] mt-1">
                      Invited by: <span className="text-[#111827] font-semibold">{inv.senderName}</span> ({inv.senderEmail})
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-[#E5E7EB]">
                  <button
                    type="button"
                    onClick={() => handleAcceptInvitation(inv)}
                    className="flex-1 py-1.5 rounded-lg bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] font-semibold text-xs transition-colors duration-150 flex items-center justify-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Accept &amp; Join
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeclineInvitation(inv)}
                    className="px-3 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#DC2626] text-[#4B5563] hover:text-[#DC2626] text-xs font-semibold transition-colors duration-150"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Header Card */}
      <div className="rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E3A8A] flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-[#111827] tracking-tight">
                  Academic Team Hub
                </h2>
                <span className="px-2 py-0.5 rounded font-mono bg-[#ECFDF5] border border-[#A7F3D0] text-[10px] font-bold text-[#065F46] uppercase tracking-wider">
                  Live Cloud
                </span>
              </div>
              <p className="text-xs text-[#6B7280]">
                Voice notes, shared slide vault, focus sprints &amp; deliverable tracking.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleForceSync}
              className="px-3 py-2 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#1E3A8A] text-[#111827] text-xs font-semibold transition-colors duration-150 flex items-center gap-1.5"
              title="Force Instant Cloud Sync across Web and Mobile"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#1E3A8A] ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Force Re-Sync</span>
            </button>

            <button
              type="button"
              onClick={() => setShowJoinByCodeModal(true)}
              className="px-3 py-2 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#1E3A8A] text-[#111827] text-xs font-semibold transition-colors duration-150 flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#1E3A8A]" />
              <span>Join with Code</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-2 rounded-lg bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold transition-colors duration-150 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              New Team
            </button>
          </div>
        </div>

        {/* Prominent Teams Workspace Grid */}
        {vault.groupProjects.length > 0 && (
          <div className="pt-4 border-t border-[#E5E7EB] mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-[#6B7280]">
              <span className="font-mono font-semibold uppercase tracking-wider text-[11px] text-[#4B5563]">
                Your Teams ({vault.groupProjects.length})
              </span>
              <span className="text-[11px]">Tap to switch active team workspace</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {vault.groupProjects.map((p) => {
                const isActive = p.id === activeProject?.id;
                const isOwner = p.creatorEmail?.toLowerCase() === currentEmail;
                const accent = p.avatarColorHex || '#1E3A8A';
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedProjectId(p.id)}
                    className={`cursor-pointer p-3 rounded-lg border transition-colors duration-150 flex items-center justify-between gap-2.5 ${
                      isActive
                        ? 'bg-[#EFF6FF] border-[#1E3A8A]'
                        : 'bg-[#FFFFFF] border-[#E5E7EB] hover:border-[#9CA3AF]'
                    }`}
                  >
                    <div className="min-w-0 flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-md flex items-center justify-center font-mono font-bold text-xs shrink-0 border overflow-hidden"
                        style={{
                          backgroundColor: `${accent}12`,
                          borderColor: `${accent}45`,
                          color: accent
                        }}
                      >
                        {p.avatarEmojiOrUrl && (p.avatarEmojiOrUrl.startsWith('data:') || p.avatarEmojiOrUrl.startsWith('http') || p.avatarEmojiOrUrl.startsWith('/')) ? (
                          <img src={p.avatarEmojiOrUrl} alt={p.teamName} className="w-full h-full object-cover" />
                        ) : p.avatarEmoji && p.avatarEmoji.length <= 4 ? (
                          <span>{p.avatarEmoji}</span>
                        ) : (
                          p.courseCode.slice(0, 3)
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-[#111827] truncate">{p.teamName}</span>
                          {isActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#1E3A8A] shrink-0" />
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-[#6B7280] truncate">
                          {p.courseCode} • {p.memberEmails?.length || 1} {p.memberEmails?.length === 1 ? 'member' : 'members'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {isOwner ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteProject(p.id)}
                          title="Delete Team Workspace"
                          className="w-7 h-7 rounded-md text-[#6B7280] hover:text-[#DC2626] hover:bg-[#FEF2F2] flex items-center justify-center transition-colors duration-150"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleLeaveGroup(p.id)}
                          title="Leave Team"
                          className="w-7 h-7 rounded-md text-[#6B7280] hover:text-[#B45309] hover:bg-[#FFFBEB] flex items-center justify-center transition-colors duration-150"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Main Active Group Stage */}
      {activeProject ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column: Team Overview, Countdown & Live Sprint */}
          <div className="space-y-4">
            <div className="rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] p-4 sm:p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-11 h-11 rounded-lg flex items-center justify-center text-xs font-mono font-bold border shrink-0 overflow-hidden"
                    style={{
                      backgroundColor: `${activeProject.avatarColorHex || '#1E3A8A'}12`,
                      borderColor: activeProject.avatarColorHex || '#1E3A8A',
                      color: activeProject.avatarColorHex || '#1E3A8A'
                    }}
                  >
                    {activeProject.avatarEmojiOrUrl && (activeProject.avatarEmojiOrUrl.startsWith('data:') || activeProject.avatarEmojiOrUrl.startsWith('http') || activeProject.avatarEmojiOrUrl.startsWith('/')) ? (
                      <img src={activeProject.avatarEmojiOrUrl} alt={activeProject.teamName} className="w-full h-full object-cover" />
                    ) : activeProject.avatarEmoji && activeProject.avatarEmoji.length <= 4 ? (
                      <span className="text-base">{activeProject.avatarEmoji}</span>
                    ) : (
                      activeProject.courseCode.slice(0, 3)
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-[#111827] text-base leading-tight truncate">
                      {activeProject.teamName}
                    </h3>
                    <p className="text-xs font-mono text-[#1E3A8A] font-semibold">{activeProject.courseCode}</p>
                    <p className="text-[11px] text-[#6B7280] line-clamp-1">
                      {activeProject.projectTitle}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopyInviteLink(activeProject)}
                    title="Copy 1-Click Invite Link"
                    className="w-8 h-8 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#1E3A8A] flex items-center justify-center text-[#1E3A8A] transition-colors duration-150"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setVoiceHuddleActive(!voiceHuddleActive);
                      if (!voiceHuddleActive) {
                        onNotify('Live Voice Huddle Started! Audio channel connected.');
                      } else {
                        onNotify('Left Voice Huddle.');
                      }
                    }}
                    title={voiceHuddleActive ? 'Leave Voice Huddle' : 'Start Voice Huddle'}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors duration-150 ${
                      voiceHuddleActive
                        ? 'bg-[#1E3A8A] border-[#1E3A8A] text-[#FFFFFF]'
                        : 'bg-[#FFFFFF] border-[#E5E7EB] text-[#111827] hover:border-[#1E3A8A]'
                    }`}
                  >
                    {voiceHuddleActive ? (
                      <>
                        <PhoneCall className="w-3.5 h-3.5" />
                        <span>Live</span>
                      </>
                    ) : (
                      <>
                        <Phone className="w-3.5 h-3.5" />
                        <span>Voice</span>
                      </>
                    )}
                  </button>

                  {isCurrentUserAdmin && (
                    <button
                      type="button"
                      onClick={() => setShowSettingsModal(true)}
                      title="Group Admin Settings"
                      className="w-8 h-8 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#1E3A8A] flex items-center justify-center text-[#4B5563] hover:text-[#111827] transition-colors duration-150"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  )}
                  {(isCurrentUserAdmin || activeProject.creatorEmail?.toLowerCase() === currentEmail) ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteProject(activeProject.id)}
                      title="Permanently Delete Team"
                      className="w-8 h-8 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#DC2626] flex items-center justify-center text-[#DC2626] transition-colors duration-150"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleLeaveGroup(activeProject.id)}
                      title="Leave Team"
                      className="px-2.5 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#B45309] flex items-center gap-1 text-[#B45309] text-xs font-semibold transition-colors duration-150"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Leave</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Live Voice Huddle Indicator */}
              {voiceHuddleActive && (
                <div className="p-3 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-[#1E3A8A] shrink-0" />
                    <span className="text-xs font-semibold text-[#1E3A8A] truncate">
                      Team Voice Active ({isWebMicMuted ? 'Muted' : 'Speaking'})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsWebMicMuted(!isWebMicMuted)}
                    className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold border transition-colors duration-150 ${
                      isWebMicMuted
                        ? 'bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]'
                        : 'bg-[#1E3A8A] border-[#1E3A8A] text-[#FFFFFF]'
                    }`}
                  >
                    {isWebMicMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}

              {/* Target & Submission Countdown */}
              <div className="p-3 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-[#1E3A8A] uppercase tracking-wider">
                    Target Milestone
                  </span>
                  <span className="text-[10px] font-mono font-semibold text-[#4B5563] flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#6B7280]" />
                    {daysLeft > 0 ? `${daysLeft} days left` : 'Due Soon'}
                  </span>
                </div>
                <div className="text-xs font-semibold text-[#111827]">
                  {activeProject.groupTarget || 'Complete deliverables and report'}
                </div>
                {activeProject.joinCode && (
                  <div className="text-[10px] text-[#6B7280] font-mono pt-1.5 border-t border-[#E5E7EB] flex items-center justify-between">
                    <span>Team Code:</span>
                    <span className="text-[#1E3A8A] font-bold">{activeProject.joinCode}</span>
                  </div>
                )}
              </div>

              {/* Synced Group Pomodoro Live Sprint Widget */}
              <div className="p-3 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-[#1E3A8A]" />
                    <span className="text-xs font-bold text-[#111827]">
                      Synced Team Sprint ({pomodoroMode})
                    </span>
                  </div>
                  <span className="text-sm font-mono font-bold text-[#1E3A8A] tabular-nums">
                    {Math.floor(pomodoroSeconds / 60)
                      .toString()
                      .padStart(2, '0')}
                    :{(pomodoroSeconds % 60).toString().padStart(2, '0')}
                  </span>
                </div>
                {syncedPomo?.initiatorName && (
                  <div className="text-[10px] font-mono text-[#065F46] font-medium">
                    {pomodoroRunning ? `Running • Started by ${syncedPomo.initiatorName}` : `Paused • Last updated by ${syncedPomo.initiatorName}`}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-1 text-[10px] font-semibold">
                  {[
                    { dur: 25, mode: 'FOCUS' as const, label: '25m Focus' },
                    { dur: 50, mode: 'FOCUS' as const, label: '50m Deep' },
                    { dur: 5, mode: 'BREAK' as const, label: '5m Break' }
                  ].map((preset) => {
                    const selected = pomodoroDurationMin === preset.dur && pomodoroMode === preset.mode;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => handlePomodoroAction('MODE', preset.dur, preset.mode)}
                        className={`py-1 rounded border transition-colors duration-150 ${
                          selected
                            ? 'bg-[#1E3A8A] border-[#1E3A8A] text-[#FFFFFF]'
                            : 'bg-[#FFFFFF] border-[#E5E7EB] text-[#4B5563] hover:border-[#9CA3AF]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handlePomodoroAction(pomodoroRunning ? 'PAUSE' : 'START', pomodoroDurationMin, pomodoroMode)
                    }
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors duration-150 flex items-center justify-center gap-1 border ${
                      pomodoroRunning
                        ? 'bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]'
                        : 'bg-[#1E3A8A] hover:bg-[#1E40AF] border-[#1E3A8A] text-[#FFFFFF]'
                    }`}
                  >
                    {pomodoroRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    <span>{pomodoroRunning ? 'Pause Synced' : `Start ${pomodoroDurationMin}m Sprint`}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePomodoroAction('RESET', pomodoroDurationMin, pomodoroMode)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#9CA3AF] text-[#4B5563] text-xs font-semibold transition-colors duration-150"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#4B5563] font-medium">Deliverables Complete</span>
                  <span className="font-mono font-bold text-[#1E3A8A] tabular-nums">
                    {doneTasks}/{tasks.length} ({taskProgressPct}%)
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#E5E7EB] overflow-hidden">
                  <div
                    className="h-full bg-[#1E3A8A] transition-all duration-150"
                    style={{ width: `${taskProgressPct}%` }}
                  />
                </div>
              </div>

              {/* Navigation Sub-Tabs */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 p-1 rounded-lg bg-[#F3F4F6] border border-[#E5E7EB] text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('CHAT')}
                  className={`py-1.5 px-2 rounded-md font-semibold transition-colors duration-150 flex items-center justify-center gap-1.5 ${
                    activeTab === 'CHAT'
                      ? 'bg-[#FFFFFF] border border-[#E5E7EB] text-[#1E3A8A]'
                      : 'text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Chat</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('DELIVERABLES')}
                  className={`py-1.5 px-2 rounded-md font-semibold transition-colors duration-150 flex items-center justify-center gap-1.5 ${
                    activeTab === 'DELIVERABLES'
                      ? 'bg-[#FFFFFF] border border-[#E5E7EB] text-[#1E3A8A]'
                      : 'text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  <FolderKanban className="w-3.5 h-3.5" />
                  <span>Tasks ({tasks.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('SPRINT')}
                  className={`py-1.5 px-2 rounded-md font-semibold transition-colors duration-150 flex items-center justify-center gap-1.5 ${
                    activeTab === 'SPRINT'
                      ? 'bg-[#FFFFFF] border border-[#E5E7EB] text-[#1E3A8A]'
                      : 'text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Sprint</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('RESOURCES')}
                  className={`py-1.5 px-2 rounded-md font-semibold transition-colors duration-150 flex items-center justify-center gap-1.5 ${
                    activeTab === 'RESOURCES'
                      ? 'bg-[#FFFFFF] border border-[#E5E7EB] text-[#1E3A8A]'
                      : 'text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Vault ({activeProject.resources?.length || 0})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('MEMBERS')}
                  className={`py-1.5 px-2 rounded-md font-semibold transition-colors duration-150 flex items-center justify-center gap-1.5 ${
                    activeTab === 'MEMBERS'
                      ? 'bg-[#FFFFFF] border border-[#E5E7EB] text-[#1E3A8A]'
                      : 'text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Team ({activeProject.memberEmails.length})</span>
                </button>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={handleExportChat}
                  className="flex-1 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#1E3A8A] text-xs font-semibold text-[#111827] flex items-center justify-center gap-1.5 transition-colors duration-150"
                >
                  <Copy className="w-3.5 h-3.5 text-[#1E3A8A]" />
                  Export Chat
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddMemberModal(true)}
                  className="flex-1 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#1E3A8A] text-xs font-semibold text-[#111827] flex items-center justify-center gap-1.5 transition-colors duration-150"
                >
                  <UserPlus className="w-3.5 h-3.5 text-[#1E3A8A]" />
                  Add Member
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Tab Content Stage */}
          <div className="lg:col-span-2">
            {activeTab === 'CHAT' && (
              <div className="rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] p-4 sm:p-5 flex flex-col h-[calc(100dvh-270px)] min-h-[520px] max-h-[720px]">
                {/* Pinned Messages Bar */}
                {pinnedMessages.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] flex items-center gap-2 mb-3 shrink-0">
                    <Pin className="w-4 h-4 text-[#B45309] shrink-0" />
                    <div className="text-xs text-[#92400E] font-semibold truncate flex-1">
                      {pinnedMessages[pinnedMessages.length - 1].messageText}
                    </div>
                  </div>
                )}

                {/* Messages Stream */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1.5 no-scrollbar">
                  {projectMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#6B7280]">
                      <MessageSquare className="w-9 h-9 text-[#9CA3AF] mb-2" />
                      <p className="font-bold text-sm text-[#111827]">No messages yet</p>
                      <p className="text-xs mt-1 max-w-xs">
                        Send messages, record voice notes, and coordinate deliverables in real time.
                      </p>
                    </div>
                  ) : (
                    projectMessages.map((msg) => {
                      const isMe = msg.senderEmail.toLowerCase() === currentEmail;
                      const isAdmin = (activeProject.adminEmails || [])
                        .map((e) => e.toLowerCase())
                        .includes(msg.senderEmail.toLowerCase());
                      const isNotice = msg.messageType === 'NOTICE' || msg.messageType === 'TARGET_UPDATE';

                      if (isNotice) {
                        return (
                          <div key={msg.id} className="flex justify-center my-1.5">
                            <span className="px-3 py-1 rounded-lg bg-[#F3F4F6] border border-[#E5E7EB] font-mono text-[11px] font-medium text-[#4B5563]">
                              {msg.messageText}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-xl p-3 space-y-2 relative group ${
                              isMe
                                ? 'bg-[#1E3A8A] text-[#FFFFFF]'
                                : 'bg-[#F9FAFB] border border-[#E5E7EB] text-[#111827]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3 text-[11px] opacity-85">
                              <span className="font-bold flex items-center gap-1">
                                {isMe ? 'You' : msg.senderName}
                                {isAdmin && (
                                  <span title="Admin">
                                    <Crown className={`w-3 h-3 inline ${isMe ? 'text-[#FDE68A]' : 'text-[#B45309]'}`} />
                                  </span>
                                )}
                              </span>
                              <span className="font-mono text-[10px]">
                                {new Date(msg.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>

                            {/* Text Body */}
                            {msg.messageText && msg.messageType !== 'VOICE_NOTE' && (
                              <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">
                                {msg.messageText}
                              </p>
                            )}

                            {/* Voice Note Player */}
                            {msg.messageType === 'VOICE_NOTE' && msg.audioUrl && (
                              <VoiceNotePlayer
                                audioUrl={msg.audioUrl}
                                durationSec={msg.audioDurationSec || 0}
                                isMe={isMe}
                              />
                            )}

                            {/* Image Attachment */}
                            {msg.messageType === 'IMAGE_SHARE' && msg.imageUrl && (
                              <div className="rounded-lg overflow-hidden border border-[#E5E7EB] mt-1 cursor-pointer bg-[#FFFFFF]">
                                <img
                                  src={msg.imageUrl}
                                  alt="Attached Diagram or Photo"
                                  className="w-full max-h-60 object-cover"
                                  onClick={() => setPreviewImageUrl(msg.imageUrl!)}
                                />
                              </div>
                            )}

                            {/* Poll Card */}
                            {msg.pollData && (
                              <div className="p-3 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] text-[#111827] text-xs space-y-2 mt-2">
                                <div className="font-bold text-[#111827] flex items-center gap-1.5">
                                  <span>{msg.pollData.question}</span>
                                </div>
                                <div className="space-y-1.5">
                                  {msg.pollData.options.map((opt) => {
                                    const totalVotes = msg.pollData!.options.reduce(
                                      (acc, o) => acc + o.votes.length,
                                      0
                                    );
                                    const voteCount = opt.votes.length;
                                    const hasVoted = opt.votes.some(
                                      (e) => e.toLowerCase() === currentEmail
                                    );
                                    const pct =
                                      totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                                    return (
                                      <button
                                        key={opt.text}
                                        type="button"
                                        onClick={() => handleVotePoll(msg, opt.text)}
                                        className={`w-full text-left p-2 rounded-md border transition-colors duration-150 ${
                                          hasVoted
                                            ? 'bg-[#EFF6FF] border-[#1E3A8A] text-[#1E3A8A] font-semibold'
                                            : 'bg-[#F9FAFB] border-[#E5E7EB] hover:border-[#9CA3AF] text-[#111827]'
                                        }`}
                                      >
                                        <div className="flex justify-between text-[11px] mb-1">
                                          <span>{hasVoted ? '✓ ' : ''}{opt.text}</span>
                                          <span className="font-mono text-[#4B5563]">
                                            {voteCount} ({pct}%)
                                          </span>
                                        </div>
                                        <div className="w-full h-1.5 rounded-full bg-[#E5E7EB] overflow-hidden">
                                          <div
                                            className="h-full bg-[#1E3A8A] transition-all duration-150"
                                            style={{ width: `${pct}%` }}
                                          />
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Shared Doc Card */}
                            {msg.docData && (
                              <div className="p-2.5 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] text-[#111827] text-xs flex items-center justify-between gap-2 mt-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <FileText className="w-4 h-4 text-[#1E3A8A] shrink-0" />
                                  <div className="min-w-0">
                                    <div className="font-bold text-[#111827] truncate">
                                      {msg.docData.title}
                                    </div>
                                    {msg.docData.linkOrFileName && (
                                      <div className="text-[10px] text-[#6B7280] truncate font-mono">
                                        {msg.docData.linkOrFileName}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {msg.docData.linkOrFileName && (
                                  <a
                                    href={
                                      msg.docData.linkOrFileName.startsWith('http')
                                        ? msg.docData.linkOrFileName
                                        : `https://${msg.docData.linkOrFileName}`
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-2 py-1 rounded bg-[#EFF6FF] border border-[#BFDBFE] hover:border-[#1E3A8A] text-[#1E3A8A] font-semibold text-[10px] shrink-0 transition-colors duration-150"
                                  >
                                    Open
                                  </a>
                                )}
                              </div>
                            )}

                            {/* Tagged Deliverable Box */}
                            {msg.taggedDeliverableTitle && (
                              <div className="p-2 rounded-md bg-[#FFFFFF] border border-[#E5E7EB] text-[#111827] text-xs flex items-center justify-between gap-2 mt-2">
                                <span className="font-semibold truncate">
                                  Task: {msg.taggedDeliverableTitle}
                                </span>
                              </div>
                            )}

                            {/* Unsend / Delete Message Action */}
                            {(isMe || isCurrentUserAdmin || !activeProject.creatorUid || activeProject.creatorUid === user?.uid || !activeProject.adminEmails?.length) && (
                              <div className={`flex items-center justify-end gap-1.5 pt-1.5 mt-1 border-t ${isMe ? 'border-white/20' : 'border-[#E5E7EB]'}`}>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMessage(msg)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors duration-150 ${
                                    isMe
                                      ? 'bg-white/15 hover:bg-white/25 text-[#FFFFFF]'
                                      : 'bg-[#FEF2F2] hover:border-[#DC2626] border border-[#FECACA] text-[#DC2626]'
                                  }`}
                                  title={isMe ? 'Unsend this message for everyone' : 'Delete message as Group Admin'}
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>{isMe ? 'Unsend' : 'Delete'}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Composer Dock */}
                <div className="pt-3 border-t border-[#E5E7EB] space-y-2 shrink-0">
                  {selectedDeliverableTag && (
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-md bg-[#EFF6FF] border border-[#BFDBFE] text-xs font-semibold text-[#1E3A8A] flex items-center gap-1.5">
                        <span>Task: {selectedDeliverableTag}</span>
                        <X
                          className="w-3 h-3 cursor-pointer"
                          onClick={() => setSelectedDeliverableTag('')}
                        />
                      </span>
                    </div>
                  )}

                  {/* Dynamic Recording Dock vs Standard Text Dock */}
                  {isRecordingVoice ? (
                    <div className="p-2.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626]" />
                        <span className="text-xs font-mono font-bold text-[#DC2626]">
                          Recording Voice Note ({Math.floor(recordingSeconds / 60)
                            .toString()
                            .padStart(2, '0')}
                          :{(recordingSeconds % 60).toString().padStart(2, '0')})
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCancelVoiceRecording}
                          className="px-3 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] text-[#4B5563] text-xs font-semibold transition-colors duration-150 flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSendVoiceRecording}
                          className="px-4 py-1.5 rounded-lg bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold flex items-center gap-1.5 transition-colors duration-150"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Send
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                      <div className="flex items-center gap-1">
                        {/* Voice Note Button */}
                        <button
                          type="button"
                          onClick={handleStartVoiceRecording}
                          title="Record Voice Note"
                          className="w-9 h-9 rounded-lg bg-[#FFFFFF] hover:border-[#DC2626] border border-[#E5E7EB] text-[#DC2626] flex items-center justify-center shrink-0 transition-colors duration-150"
                        >
                          <Mic className="w-4 h-4" />
                        </button>

                        {/* Image / Attachment Button */}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          title="Share Photo / Diagram"
                          className="w-9 h-9 rounded-lg bg-[#FFFFFF] hover:border-[#1E3A8A] border border-[#E5E7EB] text-[#1E3A8A] flex items-center justify-center shrink-0 transition-colors duration-150"
                        >
                          <ImageIcon className="w-4 h-4" />
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleImageSelected}
                          className="hidden"
                        />

                        {/* Poll Button */}
                        <button
                          type="button"
                          onClick={() => setShowPollModal(true)}
                          title="Create Team Poll"
                          className="w-9 h-9 rounded-lg bg-[#FFFFFF] hover:border-[#1E3A8A] border border-[#E5E7EB] text-[#111827] flex items-center justify-center shrink-0 transition-colors duration-150 text-xs font-semibold"
                        >
                          Poll
                        </button>

                        {/* Doc Button */}
                        <button
                          type="button"
                          onClick={() => setShowDocModal(true)}
                          title="Share Resource Link"
                          className="w-9 h-9 rounded-lg bg-[#FFFFFF] hover:border-[#1E3A8A] border border-[#E5E7EB] text-[#111827] flex items-center justify-center shrink-0 transition-colors duration-150 text-xs font-semibold"
                        >
                          Link
                        </button>
                      </div>

                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                        placeholder="Message your team..."
                        className="aura-input flex-1 px-4 py-2 rounded-lg text-xs sm:text-sm min-w-[140px]"
                      />

                      {tasks.length > 0 && (
                        <select
                          aria-label="Tag deliverable to message"
                          value={selectedDeliverableTag}
                          onChange={(e) => setSelectedDeliverableTag(e.target.value)}
                          className="aura-input px-3 py-2 rounded-lg text-xs max-w-[120px] truncate"
                        >
                          <option value="">Tag Task</option>
                          {tasks.map((t) => (
                            <option key={t.id} value={t.taskTitle}>
                              {t.taskTitle}
                            </option>
                          ))}
                        </select>
                      )}

                      <button
                        type="button"
                        onClick={handleSendMessage}
                        aria-label="Send message"
                        className="w-10 h-10 rounded-lg bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] flex items-center justify-center font-semibold transition-colors duration-150 shrink-0"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'DELIVERABLES' && (
              <div className="rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h4 className="font-bold text-[#111827] text-sm sm:text-base">
                      Group Deliverables &amp; Section Splits
                    </h4>
                    <p className="text-xs text-[#6B7280]">
                      Split milestones, assign tasks to members &amp; track progress.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddTaskModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold inline-flex items-center gap-1 transition-colors duration-150"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Assign Deliverable
                  </button>
                </div>

                {/* Filter and Search Bar */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <div className="flex gap-1 p-1 rounded-lg bg-[#F3F4F6] border border-[#E5E7EB] text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setTaskFilter('ALL')}
                      className={`px-2.5 py-1 rounded-md transition-colors duration-150 ${
                        taskFilter === 'ALL'
                          ? 'bg-[#FFFFFF] border border-[#E5E7EB] text-[#1E3A8A]'
                          : 'text-[#6B7280] hover:text-[#111827]'
                      }`}
                    >
                      All ({tasks.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaskFilter('PENDING')}
                      className={`px-2.5 py-1 rounded-md transition-colors duration-150 ${
                        taskFilter === 'PENDING'
                          ? 'bg-[#FFFFFF] border border-[#E5E7EB] text-[#1E3A8A]'
                          : 'text-[#6B7280] hover:text-[#111827]'
                      }`}
                    >
                      Pending ({tasks.length - doneTasks})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaskFilter('DONE')}
                      className={`px-2.5 py-1 rounded-md transition-colors duration-150 ${
                        taskFilter === 'DONE'
                          ? 'bg-[#FFFFFF] border border-[#E5E7EB] text-[#1E3A8A]'
                          : 'text-[#6B7280] hover:text-[#111827]'
                      }`}
                    >
                      Done ({doneTasks})
                    </button>
                  </div>

                  <div className="relative flex-1 min-w-[140px]">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#6B7280]" />
                    <input
                      type="text"
                      value={taskSearch}
                      onChange={(e) => setTaskSearch(e.target.value)}
                      placeholder="Search deliverables..."
                      className="aura-input w-full pl-8 pr-3 py-1.5 rounded-lg text-xs"
                    />
                  </div>
                </div>

                {filteredTasks.length === 0 ? (
                  <div className="text-center py-10 text-[#6B7280] text-xs">
                    No deliverables found matching your filter.
                  </div>
                ) : (
                  <div className="divide-y divide-[#E5E7EB] border border-[#E5E7EB] rounded-xl overflow-hidden">
                    {filteredTasks.map((task) => (
                      <div
                        key={task.id}
                        className="p-3 bg-[#FFFFFF] flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            onClick={() => handleToggleTask(task)}
                            className={`w-5 h-5 rounded flex items-center justify-center border transition-colors duration-150 ${
                              task.isCompleted
                                ? 'bg-[#1E3A8A] border-[#1E3A8A] text-[#FFFFFF]'
                                : 'border-[#D1D5DB] hover:border-[#1E3A8A] bg-[#FFFFFF]'
                            }`}
                          >
                            {task.isCompleted && <Check className="w-3 h-3 stroke-[3]" />}
                          </button>
                          <div className="min-w-0">
                            <p
                              className={`text-xs sm:text-sm font-semibold truncate ${
                                task.isCompleted ? 'line-through text-[#9CA3AF]' : 'text-[#111827]'
                              }`}
                            >
                              {task.taskTitle}
                            </p>
                            <p className="text-[11px] font-mono text-[#6B7280] truncate">
                              Assigned to: {task.memberName} {task.memberContact && `(${task.memberContact})`}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setChatInput(`Working on deliverable: '${task.taskTitle}'`);
                            setSelectedDeliverableTag(task.taskTitle);
                            setActiveTab('CHAT');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#1E3A8A] text-[11px] font-semibold text-[#111827] transition-colors duration-150 shrink-0"
                        >
                          Share in Chat
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SPRINT KANBAN ROADMAP TAB */}
            {activeTab === 'SPRINT' && (
              <div className="rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] p-4 sm:p-5 space-y-4">
                {/* Sprint Header & Velocity Card */}
                <div className="p-4 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-[#1E3A8A]" />
                      <h4 className="font-bold text-[#111827] text-base">
                        Live Team Sprint Milestone &amp; Kanban
                      </h4>
                    </div>
                    <p className="text-xs text-[#6B7280] mt-1">
                      Target Goal: {activeProject.groupTarget || 'Complete all deliverables on schedule'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-[11px] font-mono uppercase text-[#6B7280]">Sprint Velocity</div>
                      <div className="text-sm font-mono font-bold text-[#1E3A8A]">
                        {doneTasks} / {tasks.length} cleared ({taskProgressPct}%)
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddTaskModal(true)}
                      className="px-3.5 py-1.5 rounded-lg bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold transition-colors duration-150 flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New Task</span>
                    </button>
                  </div>
                </div>

                {/* Team Readiness & Workload Leaderboard + 1-Tap Standup Pulse */}
                <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <h5 className="text-xs sm:text-sm font-bold text-[#111827]">
                        Team Readiness &amp; Workload Leaderboard
                      </h5>
                      <p className="text-[11px] text-[#6B7280]">
                        Per-member deliverable completion &amp; instant standup check-in synced with Android
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] font-mono text-xs font-bold">
                        {taskProgressPct}% Ready
                      </span>
                      <button
                        type="button"
                        onClick={handleSendStandupPulse}
                        className="px-3 py-1.5 rounded-lg bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold transition-colors duration-150"
                      >
                        Send Standup Pulse
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {activeProject.memberEmails.map((mEmail) => {
                      const prefix = mEmail.split('@')[0].toLowerCase();
                      const mTasks = tasks.filter(
                        (t) =>
                          t.memberContact?.toLowerCase() === mEmail.toLowerCase() ||
                          t.memberName?.toLowerCase() === mEmail.toLowerCase() ||
                          (prefix && t.memberName?.toLowerCase().includes(prefix))
                      );
                      const mDone = mTasks.filter((t) => t.isCompleted).length;
                      const mPct = mTasks.length > 0 ? Math.round((mDone / mTasks.length) * 100) : 0;
                      return (
                        <div key={mEmail} className="flex items-center gap-3 text-xs">
                          <span className="w-28 truncate text-[#111827] font-semibold">{prefix || mEmail}</span>
                          <div className="flex-1 h-2 rounded-full bg-[#E5E7EB] overflow-hidden">
                            <div
                              className="h-full bg-[#1E3A8A] transition-all duration-150"
                              style={{ width: `${mPct}%` }}
                            />
                          </div>
                          <span className="w-14 text-right font-mono text-[#1E3A8A] font-bold">
                            {mDone}/{mTasks.length}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3-Column Kanban Board */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Column 1: Backlog / To-Do */}
                  <div className="p-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] space-y-2.5">
                    <div className="flex items-center justify-between px-1 text-xs font-bold text-[#111827]">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#6B7280]" />
                        Backlog &amp; To-Do
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-[#FFFFFF] border border-[#E5E7EB] text-[10px] text-[#4B5563] font-mono">
                        {tasks.filter((t) => !t.isCompleted).length}
                      </span>
                    </div>

                    <div className="space-y-2 min-h-[160px]">
                      {tasks.filter((t) => !t.isCompleted).map((task) => (
                        <div
                          key={task.id}
                          className="p-2.5 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#1E3A8A] transition-colors duration-150 space-y-1.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-semibold text-[#111827] leading-snug">
                              {task.taskTitle}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleToggleTask(task)}
                              title="Mark as Done"
                              className="w-5 h-5 rounded border border-[#D1D5DB] hover:border-[#1E3A8A] flex items-center justify-center shrink-0 transition-colors duration-150"
                            >
                              <Check className="w-3 h-3 text-[#6B7280] hover:text-[#1E3A8A]" />
                            </button>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-[#6B7280] pt-1 border-t border-[#E5E7EB]">
                            <span>{task.memberName}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setChatInput(`Working on sprint task: '${task.taskTitle}'`);
                                setSelectedDeliverableTag(task.taskTitle);
                                setActiveTab('CHAT');
                              }}
                              className="text-[#1E3A8A] font-semibold hover:underline"
                            >
                              Share
                            </button>
                          </div>
                        </div>
                      ))}
                      {tasks.filter((t) => !t.isCompleted).length === 0 && (
                        <div className="text-center py-8 text-xs text-[#6B7280]">
                          All tasks cleared!
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Column 2: In Active Sprint */}
                  <div className="p-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] space-y-2.5">
                    <div className="flex items-center justify-between px-1 text-xs font-bold text-[#92400E]">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#B45309]" />
                        Active Sprint
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-[#FFFBEB] border border-[#FDE68A] text-[10px] text-[#B45309] font-mono">
                        {tasks.filter((t) => !t.isCompleted).length}
                      </span>
                    </div>

                    <div className="space-y-2 min-h-[160px]">
                      {tasks.filter((t) => !t.isCompleted).map((task) => (
                        <div
                          key={task.id}
                          className="p-2.5 rounded-lg bg-[#FFFFFF] border border-[#FDE68A] hover:border-[#B45309] transition-colors duration-150 space-y-1.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-semibold text-[#111827] leading-snug">
                              {task.taskTitle}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleToggleTask(task)}
                              title="Mark as Completed"
                              className="px-2 py-0.5 rounded bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E3A8A] text-[10px] font-semibold hover:border-[#1E3A8A] transition-colors duration-150 shrink-0"
                            >
                              Complete
                            </button>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-[#6B7280] pt-1 border-t border-[#E5E7EB]">
                            <span>Assignee: {task.memberName}</span>
                            <span className="font-mono text-[#B45309]">In Progress</span>
                          </div>
                        </div>
                      ))}
                      {tasks.filter((t) => !t.isCompleted).length === 0 && (
                        <div className="text-center py-8 text-xs text-[#6B7280]">
                          No active sprint items
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Column 3: Completed & Verified */}
                  <div className="p-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] space-y-2.5">
                    <div className="flex items-center justify-between px-1 text-xs font-bold text-[#065F46]">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                        Completed &amp; Verified
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-[#ECFDF5] border border-[#A7F3D0] text-[10px] text-[#065F46] font-mono">
                        {doneTasks}
                      </span>
                    </div>

                    <div className="space-y-2 min-h-[160px]">
                      {tasks.filter((t) => t.isCompleted).map((task) => (
                        <div
                          key={task.id}
                          className="p-2.5 rounded-lg bg-[#FFFFFF] border border-[#A7F3D0] space-y-1.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-semibold text-[#6B7280] line-through leading-snug">
                              {task.taskTitle}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleToggleTask(task)}
                              title="Re-open Task"
                              className="w-5 h-5 rounded bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] flex items-center justify-center shrink-0"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-[#6B7280] pt-1 border-t border-[#E5E7EB]">
                            <span>Completed by {task.memberName}</span>
                            <span className="font-mono text-[#065F46] font-semibold">Done ✓</span>
                          </div>
                        </div>
                      ))}
                      {doneTasks === 0 && (
                        <div className="text-center py-8 text-xs text-[#6B7280]">
                          No completed tasks yet
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'MEMBERS' && (
              <div className="rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-[#111827] text-sm sm:text-base">
                      Teammates &amp; Live Study Status
                    </h4>
                    <p className="text-xs text-[#6B7280]">
                      Set your live check-in status &amp; manage teammates across Web and Android.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddMemberModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold inline-flex items-center gap-1 transition-colors duration-150"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Add Member
                  </button>
                </div>

                {/* Live Study Check-In Bar */}
                <div className="p-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] space-y-2">
                  <div className="text-[11px] font-mono font-bold text-[#4B5563] uppercase tracking-wider">
                    My Live Study Check-In Status
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { code: 'FOCUSING', label: 'Focusing' },
                      { code: 'IN_LIBRARY', label: 'In Library' },
                      { code: 'ON_BREAK', label: 'On Break' },
                      { code: 'READY', label: 'Ready to Review' }
                    ].map((st) => {
                      const active = (activeProject.memberStatuses?.[currentEmail]?.status || 'FOCUSING') === st.code;
                      return (
                        <button
                          key={st.code}
                          type="button"
                          onClick={() => handleUpdateMyStatus(st.code)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors duration-150 ${
                            active
                              ? 'bg-[#1E3A8A] border-[#1E3A8A] text-[#FFFFFF]'
                              : 'bg-[#FFFFFF] border-[#E5E7EB] text-[#4B5563] hover:border-[#9CA3AF]'
                          }`}
                        >
                          {st.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="divide-y divide-[#E5E7EB] border border-[#E5E7EB] rounded-xl overflow-hidden">
                  {activeProject.memberEmails.map((email) => {
                    const isAdmin = (activeProject.adminEmails || [])
                      .map((e) => e.toLowerCase())
                      .includes(email.toLowerCase());
                    const isCreator =
                      activeProject.creatorEmail &&
                      activeProject.creatorEmail.toLowerCase() === email.toLowerCase();
                    const isMe = email.toLowerCase() === currentEmail;
                    const rawStatus = activeProject.memberStatuses?.[email.toLowerCase()]?.status;
                    const statusBadge =
                      rawStatus === 'FOCUSING'
                        ? 'Focusing'
                        : rawStatus === 'IN_LIBRARY'
                        ? 'In Library'
                        : rawStatus === 'ON_BREAK'
                        ? 'Break'
                        : rawStatus === 'READY'
                        ? 'Ready'
                        : null;

                    return (
                      <div
                        key={email}
                        className="p-3 bg-[#FFFFFF] flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E3A8A] flex items-center justify-center font-bold text-xs shrink-0">
                            {email.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs sm:text-sm font-semibold text-[#111827] truncate">
                                {email}
                              </span>
                              {isMe && (
                                <span className="px-1.5 py-0.5 rounded font-mono bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E3A8A] text-[10px] font-bold">
                                  You
                                </span>
                              )}
                              {statusBadge && (
                                <span className="px-1.5 py-0.5 rounded font-mono bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] text-[10px] font-semibold">
                                  {statusBadge}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] font-mono">
                              {isCreator && (
                                <span className="text-[#1E3A8A] font-bold">Creator</span>
                              )}
                              {isAdmin && (
                                <span className="text-[#B45309] font-semibold flex items-center gap-0.5">
                                  <Crown className="w-3 h-3 inline" /> Admin
                                </span>
                              )}
                              {!isAdmin && !isCreator && (
                                <span className="text-[#6B7280]">Member</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {isCurrentUserAdmin && !isMe && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isAdmin ? (
                              <button
                                type="button"
                                onClick={() => handleDemoteAdmin(email)}
                                title="Demote to Member"
                                className="px-2.5 py-1 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] text-[11px] font-semibold text-[#4B5563] hover:border-[#9CA3AF] transition-colors duration-150"
                              >
                                Demote
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handlePromoteToAdmin(email)}
                                title="Promote to Admin"
                                className="px-2.5 py-1 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] text-[11px] font-semibold text-[#B45309] hover:border-[#B45309] transition-colors duration-150"
                              >
                                Make Admin
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(email)}
                              title="Remove member"
                              className="w-7 h-7 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] flex items-center justify-center text-[#DC2626] hover:border-[#DC2626] transition-colors duration-150"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sub-Tab 4: Shared Team Resource Vault */}
            {activeTab === 'RESOURCES' && (
              <div className="rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-[#1E3A8A]" />
                    <div>
                      <h4 className="font-bold text-[#111827] text-sm sm:text-base">
                        Shared Team Vault &amp; Resources
                      </h4>
                      <p className="text-[11px] text-[#6B7280]">
                        Lecture slides, past papers, shared Google Docs &amp; research links for {activeProject.teamName}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowDocModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] font-semibold text-xs flex items-center gap-1.5 transition-colors duration-150"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Resource
                  </button>
                </div>

                {/* Category Filters */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
                  {['ALL', 'SLIDES', 'DOCUMENT', 'RESEARCH_LINK', 'PAST_PAPER'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setResourceFilter(cat)}
                      className={`px-3 py-1 rounded-lg font-semibold border transition-colors duration-150 shrink-0 ${
                        resourceFilter === cat
                          ? 'bg-[#EFF6FF] border-[#1E3A8A] text-[#1E3A8A]'
                          : 'bg-[#FFFFFF] border-[#E5E7EB] text-[#6B7280] hover:border-[#9CA3AF]'
                      }`}
                    >
                      {cat === 'ALL' ? 'All Resources' : cat.replace('_', ' ')}
                    </button>
                  ))}
                </div>

                {/* Resource List */}
                {(() => {
                  const allRes = activeProject.resources || [];
                  const filtered = allRes.filter(
                    (r) => resourceFilter === 'ALL' || r.category === resourceFilter
                  );

                  if (filtered.length === 0) {
                    return (
                      <div className="p-8 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] text-center space-y-2">
                        <FileText className="w-8 h-8 text-[#9CA3AF] mx-auto" />
                        <div className="text-xs font-bold text-[#111827]">No resources found in this category</div>
                        <p className="text-[11px] text-[#6B7280]">
                          Upload or link slides, PDFs, GitHub repositories, or Google Drive notes for your teammates.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowDocModal(true)}
                          className="mt-2 px-3 py-1.5 rounded-lg bg-[#EFF6FF] text-[#1E3A8A] border border-[#BFDBFE] text-xs font-semibold inline-flex items-center gap-1 hover:border-[#1E3A8A] transition-colors duration-150"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add First Resource
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {filtered.map((r) => {
                        const isAddedByMe = r.addedByEmail?.toLowerCase() === currentEmail;
                        const canDelete = isAddedByMe || isCurrentUserAdmin;
                        return (
                          <div
                            key={r.id}
                            className="p-3.5 rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#1E3A8A] transition-colors duration-150 space-y-2.5 flex flex-col justify-between"
                          >
                            <div className="space-y-1">
                              <div className="flex items-start justify-between gap-2">
                                <span className="px-2 py-0.5 rounded font-mono bg-[#F3F4F6] border border-[#E5E7EB] text-[10px] font-semibold text-[#4B5563] uppercase">
                                  {r.category.replace('_', ' ')}
                                </span>
                                {canDelete && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteResource(r.id)}
                                    title="Delete resource"
                                    className="text-[#6B7280] hover:text-[#DC2626] transition-colors duration-150"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              <h5 className="font-bold text-xs text-[#111827] line-clamp-1">{r.title}</h5>
                              <p className="text-[10px] text-[#6B7280] line-clamp-1 break-all font-mono">
                                {r.linkOrFileName}
                              </p>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-[#E5E7EB] text-[10px] text-[#6B7280]">
                              <span>Added by {r.addedByEmail.split('@')[0]}</span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(r.linkOrFileName);
                                    onNotify('Copied resource link!');
                                  }}
                                  className="text-[#4B5563] hover:text-[#111827] transition-colors duration-150 flex items-center gap-1"
                                >
                                  <Copy className="w-3 h-3" /> Copy
                                </button>
                                <a
                                  href={r.linkOrFileName.startsWith('http') ? r.linkOrFileName : `https://${r.linkOrFileName}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#1E3A8A] hover:underline flex items-center gap-1 font-semibold"
                                >
                                  <ExternalLink className="w-3 h-3" /> Open
                                </a>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] p-10 text-center space-y-3">
          <Users className="w-10 h-10 text-[#9CA3AF] mx-auto" />
          <h3 className="text-base font-bold text-[#111827]">No Group Projects Yet</h3>
          <p className="text-xs text-[#6B7280] max-w-sm mx-auto">
            Create your first group project team above or join an existing team with a 4-digit code to start collaborating.
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowJoinByCodeModal(true)}
              className="px-4 py-2 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#1E3A8A] text-[#111827] text-xs font-semibold transition-colors duration-150"
            >
              Join with Code
            </button>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 rounded-lg bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold transition-colors duration-150"
            >
              Create Team Project
            </button>
          </div>
        </div>
      )}

      {/* Image Fullscreen Preview Modal */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111827]/75"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh]">
            <img
              src={previewImageUrl}
              alt="Enlarged preview"
              className="rounded-xl max-h-[85vh] object-contain border border-[#E5E7EB] bg-[#FFFFFF]"
            />
            <button
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] text-[#111827] flex items-center justify-center hover:border-[#1E3A8A]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Create New Team */}
      {showCreateModal && (
        <CreateTeamModal
          courses={vault.courses}
          creatorEmail={currentEmail}
          onClose={() => setShowCreateModal(false)}
          onCreate={async (newProj) => {
            onUpdateVault((prev) => ({
              ...prev,
              groupProjects: [...prev.groupProjects, newProj]
            }));
            setSelectedProjectId(newProj.id);
            setShowCreateModal(false);

            if (user) {
              try {
                const payload = {
                  id: newProj.id,
                  courseCode: newProj.courseCode,
                  projectTitle: newProj.projectTitle,
                  teamName: newProj.teamName,
                  objective: newProj.objective,
                  groupTarget: newProj.groupTarget,
                  avatarEmoji: newProj.avatarEmoji,
                  avatarColorHex: newProj.avatarColorHex,
                  creatorUid: user.uid,
                  creatorEmail: currentEmail,
                  adminEmails: newProj.adminEmails,
                  memberEmails: newProj.memberEmails,
                  joinCode: newProj.joinCode,
                  dueEpochMillis: newProj.dueEpochMillis,
                  tasks: newProj.tasks,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp()
                };
                await Promise.allSettled(
                  targetDbs.map((targetDb) =>
                    setDoc(doc(targetDb, 'group_projects', newProj.id), payload)
                  )
                );

                for (const memberEmail of newProj.memberEmails) {
                  if (memberEmail.toLowerCase() !== currentEmail) {
                    const invId = `inv_${newProj.id}_${memberEmail.replace(/[^a-z0-9]/g, '_')}`;
                    const invPayload = {
                      id: invId,
                      projectId: newProj.id,
                      teamName: newProj.teamName,
                      projectTitle: newProj.projectTitle,
                      courseCode: newProj.courseCode,
                      groupTarget: newProj.groupTarget,
                      avatarEmoji: newProj.avatarEmoji,
                      avatarColorHex: newProj.avatarColorHex,
                      senderUid: user.uid,
                      senderEmail: currentEmail,
                      senderName: user.displayName || vault.profile.name || 'Team Leader',
                      inviteeEmail: memberEmail,
                      status: 'PENDING',
                      joinCode: newProj.joinCode,
                      createdAt: serverTimestamp()
                    };
                    await Promise.allSettled(
                      targetDbs.map((targetDb) =>
                        setDoc(doc(targetDb, 'group_invitations', invId), invPayload)
                      )
                    );
                  }
                }
              } catch {
                // Offline fallback
              }
            }

            onNotify(`Created '${newProj.teamName}' team workspace!`);
          }}
        />
      )}

      {/* MODAL: Join Team with Code */}
      {showJoinByCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111827]/45">
          <div className="w-full max-w-md rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-[#1E3A8A]" />
                <h4 className="font-bold text-[#111827] text-base">Join Team with Code</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowJoinByCodeModal(false)}
                className="w-7 h-7 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center text-[#6B7280] hover:text-[#111827]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#6B7280]">
              Enter the 4-digit Team Code (e.g. <span className="font-mono text-[#1E3A8A] font-semibold">GRP-7K9M</span>) or paste the Project ID shared by your team leader:
            </p>

            <input
              type="text"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
              placeholder="e.g. GRP-7K9M or gp_179350000"
              className="aura-input w-full px-4 py-2.5 rounded-lg text-xs sm:text-sm font-mono uppercase tracking-wider"
            />

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
              <button
                type="button"
                onClick={() => setShowJoinByCodeModal(false)}
                className="px-3 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] text-xs font-semibold text-[#4B5563]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleJoinByCode}
                className="px-4 py-1.5 rounded-lg bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold transition-colors duration-150"
              >
                Join Team
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Group Settings & Admin Controls */}
      {showSettingsModal && activeProject && (
        <GroupSettingsModal
          project={activeProject}
          onClose={() => setShowSettingsModal(false)}
          onSave={async (updated) => {
            onUpdateVault((prev) => ({
              ...prev,
              groupProjects: prev.groupProjects.map((p) => (p.id === updated.id ? updated : p))
            }));
            if (user) {
              await Promise.allSettled(
                targetDbs.map((targetDb) =>
                  updateDoc(doc(targetDb, 'group_projects', updated.id), {
                    teamName: updated.teamName,
                    projectTitle: updated.projectTitle,
                    groupTarget: updated.groupTarget,
                    avatarEmoji: updated.avatarEmoji,
                    avatarEmojiOrUrl: updated.avatarEmojiOrUrl || updated.avatarEmoji || '',
                    avatarColorHex: updated.avatarColorHex,
                    updatedAt: serverTimestamp()
                  })
                )
              );
            }
            setShowSettingsModal(false);
            onNotify('Saved group settings and target!');
          }}
        />
      )}

      {/* MODAL: Add Member by Email */}
      {showAddMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111827]/45">
          <div className="w-full max-w-md rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB]">
              <h4 className="font-bold text-[#111827] text-base">Invite Teammate by Email</h4>
              <button
                type="button"
                onClick={() => setShowAddMemberModal(false)}
                className="w-7 h-7 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center text-[#6B7280] hover:text-[#111827]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#6B7280]">
              Enter your classmate&apos;s email (e.g. <span className="text-[#1E3A8A] font-mono">cbawa83@gmail.com</span>). An invitation record will be written to the Cloud, and you can trigger an email invitation immediately.
            </p>
            <input
              type="email"
              id="new_teammate_email_input"
              placeholder="cbawa83@gmail.com"
              className="aura-input w-full px-4 py-2.5 rounded-lg text-xs sm:text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddMemberByEmail((e.target as HTMLInputElement).value);
                }
              }}
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
              <button
                type="button"
                onClick={() => setShowAddMemberModal(false)}
                className="px-3 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] text-xs font-semibold text-[#4B5563]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const input = document.getElementById('new_teammate_email_input') as HTMLInputElement | null;
                  if (input) handleAddMemberByEmail(input.value);
                }}
                className="px-4 py-1.5 rounded-lg bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold transition-colors duration-150"
              >
                Invite Teammate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: INVITATION SENT CONFIRMATION & EMAIL DISPATCH */}
      {inviteSuccessData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111827]/45">
          <div className="w-full max-w-lg rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#065F46]" />
                <h4 className="font-bold text-[#111827] text-base sm:text-lg">
                  Invitation Created &amp; Synced
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setInviteSuccessData(null)}
                className="w-7 h-7 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center text-[#6B7280] hover:text-[#111827]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-xs text-[#065F46] space-y-1">
              <div className="font-bold">Saved to Firestore Cloud</div>
              <p className="leading-relaxed">
                <strong>{inviteSuccessData.inviteeEmail}</strong> has been added to{' '}
                <strong>{inviteSuccessData.teamName}</strong>. As soon as they log into AURA with their email, an invitation banner will greet them to join the group.
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <p className="font-semibold text-[#374151]">
                Share the invitation directly via email or link:
              </p>

              {(() => {
                const origin =
                  typeof window !== 'undefined'
                    ? window.location.origin
                    : 'https://aura-study-companion.vercel.app';
                const joinUrl = `${origin}/?join_group=${inviteSuccessData.projectId}`;
                const subject = encodeURIComponent(
                  `Invitation to join ${inviteSuccessData.teamName} on AURA (${inviteSuccessData.courseCode})`
                );
                const body = encodeURIComponent(
                  `Hi,\n\nI have invited you to join our group project team '${inviteSuccessData.teamName}' for ${inviteSuccessData.courseCode} on AURA.\n\nProject Target: ${activeProject?.groupTarget || 'High Achievement'}\n\nJoin our team directly on the AURA Web or Android app using our 1-click link:\n${joinUrl}\n\nOr enter our Team Code: ${inviteSuccessData.joinCode}\n\nLooking forward to collaborating with you!`
                );
                const mailtoHref = `mailto:${inviteSuccessData.inviteeEmail}?subject=${subject}&body=${body}`;

                return (
                  <a
                    href={mailtoHref}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2.5 px-4 rounded-lg bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors duration-150"
                  >
                    <Mail className="w-4 h-4" />
                    <span>Send Email to {inviteSuccessData.inviteeEmail}</span>
                  </a>
                );
              })()}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const origin =
                      typeof window !== 'undefined'
                        ? window.location.origin
                        : 'https://aura-study-companion.vercel.app';
                    const link = `${origin}/?join_group=${inviteSuccessData.projectId}`;
                    navigator.clipboard.writeText(link);
                    onNotify('Copied 1-Click Join Link to clipboard!');
                  }}
                  className="py-2 px-3 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#1E3A8A] text-[#111827] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors duration-150"
                >
                  <Copy className="w-3.5 h-3.5 text-[#1E3A8A]" />
                  Copy 1-Click Link
                </button>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteSuccessData.joinCode);
                    onNotify(`Copied Team Code ${inviteSuccessData.joinCode}!`);
                  }}
                  className="py-2 px-3 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#1E3A8A] text-[#111827] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors duration-150"
                >
                  <KeyRound className="w-3.5 h-3.5 text-[#1E3A8A]" />
                  Copy Code ({inviteSuccessData.joinCode})
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-[#E5E7EB]">
              <button
                type="button"
                onClick={() => setInviteSuccessData(null)}
                className="px-4 py-2 rounded-lg bg-[#F3F4F6] hover:bg-[#E5E7EB] text-[#111827] text-xs font-semibold transition-colors duration-150"
              >
                Close &amp; Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Assign Task / Deliverable */}
      {showAddTaskModal && activeProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111827]/45">
          <div className="w-full max-w-md rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB]">
              <h4 className="font-bold text-[#111827] text-base">Assign Team Deliverable</h4>
              <button
                type="button"
                onClick={() => setShowAddTaskModal(false)}
                className="w-7 h-7 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center text-[#6B7280] hover:text-[#111827]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-[#374151] uppercase">Deliverable Name</label>
                <input
                  type="text"
                  id="task_name_input"
                  placeholder="e.g. System Architecture Diagram &amp; Benchmarks"
                  className="aura-input w-full px-3.5 py-2 rounded-lg text-xs mt-1"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#374151] uppercase">Assignee Member</label>
                <select
                  id="task_assignee_input"
                  className="aura-input w-full px-3.5 py-2 rounded-lg text-xs mt-1"
                >
                  {activeProject.memberEmails.map((email) => (
                    <option key={email} value={email}>
                      {email}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
              <button
                type="button"
                onClick={() => setShowAddTaskModal(false)}
                className="px-3 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] text-xs font-semibold text-[#4B5563]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const titleInput = document.getElementById('task_name_input') as HTMLInputElement | null;
                  const assignInput = document.getElementById('task_assignee_input') as HTMLSelectElement | null;
                  if (titleInput?.value.trim()) {
                    const newTask: WebGroupTask = {
                      id: uidGen('gt'),
                      projectId: activeProject.id,
                      taskTitle: titleInput.value.trim(),
                      memberName: assignInput?.value || 'Teammate',
                      memberContact: assignInput?.value || '',
                      isCompleted: false
                    };
                    const updatedTasks = [...activeProject.tasks, newTask];

                    onUpdateVault((prev) => ({
                      ...prev,
                      groupProjects: prev.groupProjects.map((p) =>
                        p.id === activeProject.id ? { ...p, tasks: updatedTasks } : p
                      )
                    }));

                    if (user) {
                      await Promise.allSettled(
                        targetDbs.map((targetDb) =>
                          updateDoc(doc(targetDb, 'group_projects', activeProject.id), {
                            tasks: updatedTasks,
                            updatedAt: serverTimestamp()
                          })
                        )
                      );
                    }

                    setShowAddTaskModal(false);
                    onNotify(`Added deliverable '${newTask.taskTitle}'!`);
                  }
                }}
                className="px-4 py-1.5 rounded-lg bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold transition-colors duration-150"
              >
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Team Poll */}
      {showPollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111827]/45">
          <div className="w-full max-w-md rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#1E3A8A]" />
                <h4 className="font-bold text-[#111827] text-base">Create Team Meeting Poll</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowPollModal(false)}
                className="w-7 h-7 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center text-[#6B7280] hover:text-[#111827]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[#374151] uppercase text-[11px]">Poll Question</label>
                <input
                  type="text"
                  value={pollQuestionInput}
                  onChange={(e) => setPollQuestionInput(e.target.value)}
                  placeholder="e.g. When should we hold our rehearsal sprint?"
                  className="aura-input w-full px-3.5 py-2 rounded-lg mt-1"
                />
              </div>

              <div>
                <label className="font-semibold text-[#374151] uppercase text-[11px]">Option 1</label>
                <input
                  type="text"
                  value={pollOpt1}
                  onChange={(e) => setPollOpt1(e.target.value)}
                  className="aura-input w-full px-3.5 py-2 rounded-lg mt-1"
                />
              </div>

              <div>
                <label className="font-semibold text-[#374151] uppercase text-[11px]">Option 2</label>
                <input
                  type="text"
                  value={pollOpt2}
                  onChange={(e) => setPollOpt2(e.target.value)}
                  className="aura-input w-full px-3.5 py-2 rounded-lg mt-1"
                />
              </div>

              <div>
                <label className="font-semibold text-[#374151] uppercase text-[11px]">Option 3 (Optional)</label>
                <input
                  type="text"
                  value={pollOpt3}
                  onChange={(e) => setPollOpt3(e.target.value)}
                  className="aura-input w-full px-3.5 py-2 rounded-lg mt-1"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
              <button
                type="button"
                onClick={() => setShowPollModal(false)}
                className="px-3 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] text-xs font-semibold text-[#4B5563]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendPoll}
                className="px-4 py-1.5 rounded-lg bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold transition-colors duration-150"
              >
                Post Poll to Chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Resource to Team Vault */}
      {showDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111827]/45">
          <div className="w-full max-w-md rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#1E3A8A]" />
                <h4 className="font-bold text-[#111827] text-sm">Add to Team Resource Vault</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowDocModal(false)}
                className="w-7 h-7 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center text-[#6B7280] hover:text-[#111827]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[#374151] uppercase tracking-wider text-[11px]">
                  Resource Title
                </label>
                <input
                  type="text"
                  value={newResourceTitle}
                  onChange={(e) => setNewResourceTitle(e.target.value)}
                  placeholder="e.g. Lecture 4 Slides - Dynamic Programming"
                  className="aura-input w-full px-3.5 py-2 rounded-lg mt-1 text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-[#374151] uppercase tracking-wider text-[11px]">
                  Resource Category
                </label>
                <select
                  value={newResourceCategory}
                  onChange={(e) =>
                    setNewResourceCategory(
                      e.target.value as 'SLIDES' | 'DOCUMENT' | 'RESEARCH_LINK' | 'PAST_PAPER'
                    )
                  }
                  className="aura-input w-full px-3.5 py-2 rounded-lg mt-1 text-xs font-semibold"
                >
                  <option value="SLIDES">Lecture Slides</option>
                  <option value="DOCUMENT">Document / Notes / Summary</option>
                  <option value="RESEARCH_LINK">Research Paper / GitHub Link</option>
                  <option value="PAST_PAPER">Past Exam Paper / Question Bank</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-[#374151] uppercase tracking-wider text-[11px]">
                  Link (Google Drive, GitHub, PDF, Notion)
                </label>
                <input
                  type="text"
                  value={newResourceUrl}
                  onChange={(e) => setNewResourceUrl(e.target.value)}
                  placeholder="https://drive.google.com/... or https://github.com/..."
                  className="aura-input w-full px-3.5 py-2 rounded-lg mt-1 text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
              <button
                type="button"
                onClick={() => setShowDocModal(false)}
                className="px-3 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] text-xs font-semibold text-[#4B5563]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddResource}
                disabled={!newResourceTitle.trim() || !newResourceUrl.trim()}
                className="px-4 py-1.5 rounded-lg bg-[#1E3A8A] hover:bg-[#1E40AF] disabled:opacity-50 text-[#FFFFFF] text-xs font-semibold transition-colors duration-150"
              >
                Save to Vault
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Interactive Voice Note Audio Player
const VoiceNotePlayer: React.FC<{
  audioUrl: string;
  durationSec: number;
  isMe: boolean;
}> = ({ audioUrl, durationSec, isMe }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  return (
    <div
      className={`p-2.5 rounded-lg flex items-center gap-3 mt-1 min-w-[200px] sm:min-w-[240px] border ${
        isMe ? 'bg-white/10 border-white/20' : 'bg-[#FFFFFF] border-[#E5E7EB]'
      }`}
    >
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      <button
        type="button"
        onClick={togglePlay}
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors duration-150 ${
          isMe
            ? 'bg-[#FFFFFF] text-[#1E3A8A]'
            : 'bg-[#1E3A8A] text-[#FFFFFF]'
        }`}
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>

      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-1 h-4">
          {[4, 10, 16, 8, 14, 6, 12, 16, 8, 14, 10, 4].map((h, i) => (
            <span
              key={i}
              className={`w-1 rounded-full transition-colors duration-150 ${
                isMe
                  ? isPlaying
                    ? 'bg-[#FFFFFF]'
                    : 'bg-white/50'
                  : isPlaying
                  ? 'bg-[#1E3A8A]'
                  : 'bg-[#D1D5DB]'
              }`}
              style={{ height: `${h}px` }}
            />
          ))}
        </div>

        <div className={`flex items-center justify-between text-[10px] font-mono ${isMe ? 'text-white/80' : 'text-[#6B7280]'}`}>
          <span>
            {Math.floor(currentTime / 60)}:
            {Math.floor(currentTime % 60)
              .toString()
              .padStart(2, '0')}
          </span>
          <span>
            {Math.floor(durationSec / 60)}:
            {Math.floor(durationSec % 60)
              .toString()
              .padStart(2, '0')}
          </span>
        </div>
      </div>
    </div>
  );
};

// Modal for Creating New Team
const CreateTeamModal: React.FC<{
  courses: Array<{ code: string; name: string }>;
  creatorEmail: string;
  onClose: () => void;
  onCreate: (proj: WebGroupProject) => void;
}> = ({ courses, creatorEmail, onClose, onCreate }) => {
  const [courseCode, setCourseCode] = useState(courses[0]?.code || 'CS301');
  const [teamName, setTeamName] = useState('Team Alpha');
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('Grade A / 95% on Demo & Report');
  const [colorHex, setColorHex] = useState('#1E3A8A');
  const [memberEmailsInput, setMemberEmailsInput] = useState('');
  const [daysDue, setDaysDue] = useState('14');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111827]/45">
      <div className="w-full max-w-lg rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] p-5 space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB]">
          <h4 className="font-bold text-[#111827] text-base">Create Group Project Team</h4>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center text-[#6B7280] hover:text-[#111827]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="font-semibold text-[#374151] uppercase text-[11px]">Course Code</label>
            <input
              type="text"
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              placeholder="e.g. CS301"
              className="aura-input w-full px-3.5 py-2 rounded-lg mt-1 font-mono"
            />
          </div>

          <div>
            <label className="font-semibold text-[#374151] uppercase text-[11px]">Team / Group Name</label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. Team AURA Distributed"
              className="aura-input w-full px-3.5 py-2 rounded-lg mt-1"
            />
          </div>

          <div>
            <label className="font-semibold text-[#374151] uppercase text-[11px]">Assignment / Project Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Distributed Consensus Engine"
              className="aura-input w-full px-3.5 py-2 rounded-lg mt-1"
            />
          </div>

          <div>
            <label className="font-semibold text-[#374151] uppercase text-[11px]">Group Target Goal</label>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="e.g. Achieve 95%+ / Grade A / Finalist"
              className="aura-input w-full px-3.5 py-2 rounded-lg mt-1"
            />
          </div>

          <div>
            <label className="font-semibold text-[#374151] uppercase tracking-wider text-[11px]">
              Team Monogram Badge
            </label>
            <div className="flex items-center gap-2 mt-1.5">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-sm border"
                style={{
                  backgroundColor: `${colorHex}12`,
                  borderColor: `${colorHex}45`,
                  color: colorHex
                }}
              >
                {courseCode.slice(0, 3).toUpperCase() || 'GRP'}
              </div>
              <span className="text-xs text-[#6B7280]">
                Monogram auto-generated from Course Code
              </span>
            </div>
          </div>

          <div>
            <label className="font-semibold text-[#374151] uppercase tracking-wider text-[11px]">
              Theme Accent Color
            </label>
            <div className="flex items-center gap-2 mt-1.5">
              {COLOR_OPTIONS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColorHex(hex)}
                  className={`w-7 h-7 rounded-full border-2 transition-colors duration-150 ${
                    colorHex === hex ? 'border-[#111827]' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="font-semibold text-[#374151] uppercase tracking-wider text-[11px]">
              Invite Members by Email (comma-separated)
            </label>
            <input
              type="text"
              value={memberEmailsInput}
              onChange={(e) => setMemberEmailsInput(e.target.value)}
              placeholder="cbawa83@gmail.com, alex@university.edu"
              className="aura-input w-full px-3.5 py-2 rounded-lg mt-1 text-xs"
            />
          </div>

          <div>
            <label className="font-semibold text-[#374151] uppercase tracking-wider text-[11px]">
              Days Until Submission
            </label>
            <input
              type="number"
              min="1"
              value={daysDue}
              onChange={(e) => setDaysDue(e.target.value)}
              className="aura-input w-full px-3.5 py-2 rounded-lg mt-1 text-xs font-mono"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E7EB]">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] text-xs font-semibold text-[#4B5563]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!title.trim()) return;
              const extraMembers = memberEmailsInput
                .split(',')
                .map((e: string) => e.trim().toLowerCase())
                .filter((e: string) => e.includes('@'));
              const allMembers = Array.from(new Set([creatorEmail, ...extraMembers]));
              const newProj: WebGroupProject = {
                id: uidGen('gp'),
                courseCode: courseCode.trim().toUpperCase() || 'GENERAL',
                teamName: teamName.trim() || 'Team 1',
                projectTitle: title.trim(),
                objective: target.trim(),
                groupTarget: target.trim(),
                avatarEmoji: courseCode.slice(0, 3).toUpperCase() || 'GRP',
                avatarColorHex: colorHex,
                creatorEmail,
                adminEmails: [creatorEmail],
                memberEmails: allMembers,
                joinCode: generateJoinCode(),
                dueEpochMillis: Date.now() + (parseInt(daysDue) || 14) * 86_400_000,
                tasks: [],
                resources: []
              };
              onCreate(newProj);
            }}
            className="px-4 py-2 rounded-lg bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold transition-colors duration-150"
          >
            Create Team Workspace
          </button>
        </div>
      </div>
    </div>
  );
};

function compressGroupPhoto(file: File, maxDim = 200, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > maxDim) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          }
        } else {
          if (h > maxDim) {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Modal for Admin Group Settings
const GroupSettingsModal: React.FC<{
  project: WebGroupProject;
  onClose: () => void;
  onSave: (proj: WebGroupProject) => void;
}> = ({ project, onClose, onSave }) => {
  const [teamName, setTeamName] = useState(project.teamName);
  const [title, setTitle] = useState(project.projectTitle);
  const [target, setTarget] = useState(project.groupTarget);
  const [colorHex, setColorHex] = useState(project.avatarColorHex || '#1E3A8A');
  const [avatarEmojiOrUrl, setAvatarEmojiOrUrl] = useState(
    project.avatarEmojiOrUrl || project.avatarEmoji || ''
  );
  const [isUploading, setIsUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const dataUrl = await compressGroupPhoto(file, 200, 0.8);
      setAvatarEmojiOrUrl(dataUrl);
    } catch {
      // ignore
    } finally {
      setIsUploading(false);
    }
  };

  const isImageAvatar =
    avatarEmojiOrUrl.startsWith('data:') ||
    avatarEmojiOrUrl.startsWith('http') ||
    avatarEmojiOrUrl.startsWith('/');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111827]/45">
      <div className="w-full max-w-md rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB]">
          <h4 className="font-bold text-[#111827] text-base">Group Admin Settings</h4>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center text-[#6B7280] hover:text-[#111827]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3.5 text-xs">
          {/* Group Picture / Emblem Upload */}
          <div>
            <label className="font-semibold text-[#374151] uppercase tracking-wider text-[11px] block mb-1.5">
              Team Profile Picture & Emblem
            </label>
            <input
              type="file"
              ref={photoInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="flex items-center gap-3 p-3 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB]">
              <div
                className="w-14 h-14 rounded-lg border-2 border-[#E5E7EB] overflow-hidden flex items-center justify-center bg-[#FFFFFF] shrink-0 font-mono font-bold text-base"
                style={{ color: colorHex }}
              >
                {isImageAvatar ? (
                  <img
                    src={avatarEmojiOrUrl}
                    alt={teamName}
                    className="w-full h-full object-cover"
                  />
                ) : avatarEmojiOrUrl && avatarEmojiOrUrl.length <= 4 ? (
                  <span>{avatarEmojiOrUrl}</span>
                ) : (
                  <span>{project.courseCode.slice(0, 3)}</span>
                )}
              </div>
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={isUploading}
                    className="px-2.5 py-1 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-[11px] font-semibold flex items-center gap-1.5 transition-colors duration-150"
                  >
                    <Camera className="w-3 h-3" />
                    {isUploading ? 'Compressing...' : 'Upload Picture'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAvatarEmojiOrUrl('/app_logo.jpg')}
                    className="px-2.5 py-1 rounded-md bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#9CA3AF] text-[#111827] text-[11px] font-semibold transition-colors duration-150"
                  >
                    Use App Emblem
                  </button>
                  {avatarEmojiOrUrl && (
                    <button
                      type="button"
                      onClick={() => setAvatarEmojiOrUrl('')}
                      className="px-2 py-1 rounded-md text-[11px] text-[#DC2626] hover:bg-[#FEF2F2] font-semibold transition-colors duration-150"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-[#6B7280]">
                  JPG or PNG, optimized locally and synced in real time with Android team members.
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="font-semibold text-[#374151] uppercase tracking-wider text-[11px]">
              Team Name
            </label>
            <input
              type="text"
              value={teamName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTeamName(e.target.value)}
              className="aura-input w-full px-3.5 py-2 rounded-lg mt-1 text-xs"
            />
          </div>
          <div>
            <label className="font-semibold text-[#374151] uppercase tracking-wider text-[11px]">
              Project Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
              className="aura-input w-full px-3.5 py-2 rounded-lg mt-1 text-xs"
            />
          </div>
          <div>
            <label className="font-semibold text-[#374151] uppercase tracking-wider text-[11px]">
              Target Goal
            </label>
            <input
              type="text"
              value={target}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTarget(e.target.value)}
              className="aura-input w-full px-3.5 py-2 rounded-lg mt-1 text-xs"
            />
          </div>
          <div>
            <label className="font-semibold text-[#374151] uppercase tracking-wider text-[11px]">
              Theme Accent Color
            </label>
            <div className="flex items-center gap-2 mt-1.5">
              {COLOR_OPTIONS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColorHex(hex)}
                  className={`w-7 h-7 rounded-full border-2 transition-colors duration-150 ${
                    colorHex === hex ? 'border-[#111827]' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E7EB]">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] text-xs font-semibold text-[#4B5563]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSave({
                ...project,
                teamName: teamName.trim() || project.teamName,
                projectTitle: title.trim() || project.projectTitle,
                groupTarget: target.trim() || project.groupTarget,
                avatarColorHex: colorHex,
                avatarEmojiOrUrl: avatarEmojiOrUrl.trim() || project.avatarEmoji || ''
              });
            }}
            className="px-4 py-2 rounded-lg bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold transition-colors duration-150"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
