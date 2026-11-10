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
  Search,
  Send,
  Settings,
  Share2,
  Smile,
  Sparkles,
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
import { db } from '../firebase';
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

const EMOJI_OPTIONS = ['👥', '🚀', '💡', '🔬', '💻', '🎯', '📚', '🏆', '🧪', '🎨'];
const COLOR_OPTIONS = ['#10B981', '#38BDF8', '#8B5CF6', '#F59E0B', '#F43F5E', '#06B6D4'];

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
  const [activeTab, setActiveTab] = useState<'CHAT' | 'DELIVERABLES' | 'RESOURCES' | 'MEMBERS'>('CHAT');

  // Track deleted or left project IDs in memory to avoid stale snapshot revival
  const deletedProjectIdsRef = useRef<Set<string>>(new Set());

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

  // Shared Team Resource Vault State (Feature 2)
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

  // Group Synced Pomodoro Sprint State
  const [pomodoroSeconds, setPomodoroSeconds] = useState(25 * 60);
  const [pomodoroRunning, setPomodoroRunning] = useState(false);

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

  // Pomodoro timer tick
  useEffect(() => {
    if (!pomodoroRunning) return;
    const interval = window.setInterval(() => {
      setPomodoroSeconds((prev) => {
        if (prev <= 1) {
          setPomodoroRunning(false);
          onNotify('🎉 Group 25-minute Pomodoro Sprint Complete! Time for a team break.');
          return 25 * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [pomodoroRunning, onNotify]);

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

    try {
      const q = query(
        collection(db, 'group_invitations'),
        where('inviteeEmail', '==', currentEmail)
      );
      const unsub = onSnapshot(
        q,
        (snap) => {
          const list: WebGroupInvitation[] = [];
          snap.forEach((d) => {
            const data = d.data();
            if (data.status === 'PENDING') {
              list.push({
                id: d.id,
                projectId: data.projectId || '',
                teamName: data.teamName || 'Group Team',
                projectTitle: data.projectTitle || 'Assignment',
                courseCode: data.courseCode || 'GENERAL',
                groupTarget: data.groupTarget || 'Grade A',
                avatarEmoji: data.avatarEmoji || '👥',
                avatarColorHex: data.avatarColorHex || '#10B981',
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
          setPendingInvitations(list);
        },
        () => {
          // Offline fallback
        }
      );
      return () => unsub();
    } catch {
      // Offline fallback
    }
  }, [user, currentEmail]);

  // 2. REAL-TIME FIRESTORE LISTENER FOR GROUP PROJECTS WHERE USER IS A MEMBER
  useEffect(() => {
    if (!user || !currentEmail) return;

    try {
      const qMember = query(
        collection(db, 'group_projects'),
        where('memberEmails', 'array-contains', currentEmail)
      );

      const unsubMember = onSnapshot(
        qMember,
        (snap) => {
          const cloudProjects: WebGroupProject[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              courseCode: data.courseCode || 'GENERAL',
              projectTitle: data.projectTitle || 'Group Project',
              teamName: data.teamName || 'Team 1',
              objective: data.objective || data.groupTarget || '',
              groupTarget: data.groupTarget || 'Grade A',
              avatarEmoji: data.avatarEmoji || 'CS',
              avatarColorHex: data.avatarColorHex || '#10B981',
              creatorUid: data.creatorUid || '',
              creatorEmail: data.creatorEmail || '',
              adminEmails: data.adminEmails || [data.creatorEmail || ''],
              memberEmails: data.memberEmails || [currentEmail],
              joinCode: data.joinCode || '',
              dueEpochMillis: data.dueEpochMillis || Date.now() + 14 * 86_400_000,
              tasks: data.tasks || [],
              resources: data.resources || []
            };
          }).filter((p) => !deletedProjectIdsRef.current.has(p.id));

          onUpdateVault((prev) => {
            const cloudIds = new Set(cloudProjects.map((p) => p.id));
            // Keep existing non-cloud local projects that were not deleted
            const localOnly = prev.groupProjects.filter(
              (p) => !cloudIds.has(p.id) && !deletedProjectIdsRef.current.has(p.id)
            );
            const merged = [...cloudProjects, ...localOnly];
            return { ...prev, groupProjects: merged };
          });
        },
        () => {
          // Offline fallback
        }
      );

      return () => unsubMember();
    } catch {
      // Offline fallback
    }
  }, [user, currentEmail, onUpdateVault]);

  // 3. HANDLE DIRECT JOIN VIA URL PARAMETER (`?join_group=PROJECT_ID`)
  useEffect(() => {
    if (!initialGroupId || !user) return;

    const performDirectJoin = async () => {
      try {
        const snap = await getDoc(doc(db, 'group_projects', initialGroupId));
        if (snap.exists()) {
          const data = snap.data();
          const members: string[] = data.memberEmails || [];
          if (!members.map((e) => e.toLowerCase()).includes(currentEmail)) {
            members.push(currentEmail);
            await updateDoc(doc(db, 'group_projects', initialGroupId), {
              memberEmails: arrayUnion(currentEmail),
              updatedAt: serverTimestamp()
            });
          }

          const joinedProj: WebGroupProject = {
            id: snap.id,
            courseCode: data.courseCode || 'GENERAL',
            projectTitle: data.projectTitle || 'Group Project',
            teamName: data.teamName || 'Team 1',
            objective: data.objective || data.groupTarget || '',
            groupTarget: data.groupTarget || 'Grade A',
            avatarEmoji: data.avatarEmoji || '👥',
            avatarColorHex: data.avatarColorHex || '#10B981',
            creatorUid: data.creatorUid || '',
            creatorEmail: data.creatorEmail || '',
            adminEmails: data.adminEmails || [],
            memberEmails: members,
            joinCode: data.joinCode || '',
            dueEpochMillis: data.dueEpochMillis || Date.now() + 14 * 86_400_000,
            tasks: data.tasks || []
          };

          onUpdateVault((prev) => {
            const other = prev.groupProjects.filter((p) => p.id !== joinedProj.id);
            return { ...prev, groupProjects: [joinedProj, ...other] };
          });
          setSelectedProjectId(joinedProj.id);
          onNotify(`Joined '${joinedProj.teamName}' via invite link!`);
        }
      } catch {
        // Fallback
      }
    };

    performDirectJoin();
  }, [initialGroupId, user, currentEmail, onUpdateVault, onNotify]);

  // 4. REAL-TIME CHAT MESSAGES SYNC FOR ACTIVE PROJECT
  useEffect(() => {
    if (!activeProject?.id || !user) return;
    try {
      const q = query(
        collection(db, 'group_projects', activeProject.id, 'messages'),
        orderBy('createdAt', 'asc')
      );
      const unsub = onSnapshot(
        q,
        (snap) => {
          const cloudMsgs: WebGroupChatMessage[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              projectId: activeProject.id,
              senderEmail: data.senderEmail || '',
              senderName: data.senderName || 'Teammate',
              messageText: data.messageText || '',
              timestamp: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now(),
              isPinned: Boolean(data.isPinned),
              messageType: data.messageType || 'TEXT',
              taggedDeliverableTitle: data.taggedDeliverableTitle,
              reactions: data.reactions || {},
              pollData: data.pollData,
              docData: data.docData,
              audioUrl: data.audioUrl,
              audioDurationSec: data.audioDurationSec,
              imageUrl: data.imageUrl
            };
          });

          if (cloudMsgs.length > 0) {
            onUpdateVault((prev) => {
              const other = prev.groupMessages.filter((m) => m.projectId !== activeProject.id);
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
      return () => unsub();
    } catch {
      // Offline fallback
    }
  }, [activeProject?.id, user, onUpdateVault]);

  // ACCEPT PENDING INVITATION
  const handleAcceptInvitation = async (inv: WebGroupInvitation) => {
    try {
      if (user) {
        await updateDoc(doc(db, 'group_invitations', inv.id), {
          status: 'ACCEPTED',
          updatedAt: serverTimestamp()
        }).catch(() => {});

        await updateDoc(doc(db, 'group_projects', inv.projectId), {
          memberEmails: arrayUnion(currentEmail),
          updatedAt: serverTimestamp()
        }).catch(() => {});

        const noticeMsgId = uidGen('gm_notice');
        await setDoc(doc(db, 'group_projects', inv.projectId, 'messages', noticeMsgId), {
          projectId: inv.projectId,
          senderUid: user.uid,
          senderEmail: currentEmail,
          senderName: user.displayName || vault.profile.name || 'New Teammate',
          messageText: `🎉 ${user.displayName || currentEmail} accepted the invitation and joined the group!`,
          isPinned: false,
          messageType: 'NOTICE',
          createdAt: serverTimestamp()
        }).catch(() => {});
      }

      const snap = await getDoc(doc(db, 'group_projects', inv.projectId));
      if (snap.exists()) {
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
          tasks: pData.tasks || []
        };

        onUpdateVault((prev) => ({
          ...prev,
          groupProjects: [joined, ...prev.groupProjects.filter((p) => p.id !== joined.id)]
        }));
        setSelectedProjectId(joined.id);
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
        await updateDoc(doc(db, 'group_invitations', inv.id), {
          status: 'DECLINED',
          updatedAt: serverTimestamp()
        }).catch(() => {});
      }
      setPendingInvitations((prev) => prev.filter((i) => i.id !== inv.id));
      onNotify(`Declined invitation to ${inv.teamName}.`);
    } catch {
      setPendingInvitations((prev) => prev.filter((i) => i.id !== inv.id));
    }
  };

  // JOIN TEAM BY CODE
  const handleJoinByCode = async () => {
    const raw = joinCodeInput.trim().toUpperCase();
    if (!raw) return;

    try {
      let targetDoc: WebGroupProject | null = null;

      const directSnap = await getDoc(doc(db, 'group_projects', raw.toLowerCase()));
      if (directSnap.exists()) {
        const d = directSnap.data();
        targetDoc = {
          id: directSnap.id,
          courseCode: d.courseCode || 'GENERAL',
          projectTitle: d.projectTitle || 'Group Project',
          teamName: d.teamName || 'Team 1',
          objective: d.objective || '',
          groupTarget: d.groupTarget || 'Grade A',
          avatarEmoji: d.avatarEmoji || '👥',
          avatarColorHex: d.avatarColorHex || '#10B981',
          creatorUid: d.creatorUid || '',
          creatorEmail: d.creatorEmail || '',
          adminEmails: d.adminEmails || [],
          memberEmails: d.memberEmails || [],
          joinCode: d.joinCode || '',
          dueEpochMillis: d.dueEpochMillis || Date.now() + 14 * 86_400_000,
          tasks: d.tasks || []
        };
      } else {
        const qCode = query(
          collection(db, 'group_projects'),
          where('joinCode', '==', raw)
        );
        const codeSnap = await getDocs(qCode);
        if (!codeSnap.empty) {
          const docItem = codeSnap.docs[0];
          const d = docItem.data();
          targetDoc = {
            id: docItem.id,
            courseCode: d.courseCode || 'GENERAL',
            projectTitle: d.projectTitle || 'Group Project',
            teamName: d.teamName || 'Team 1',
            objective: d.objective || '',
            groupTarget: d.groupTarget || 'Grade A',
            avatarEmoji: d.avatarEmoji || '👥',
            avatarColorHex: d.avatarColorHex || '#10B981',
            creatorUid: d.creatorUid || '',
            creatorEmail: d.creatorEmail || '',
            adminEmails: d.adminEmails || [],
            memberEmails: d.memberEmails || [],
            joinCode: d.joinCode || raw,
            dueEpochMillis: d.dueEpochMillis || Date.now() + 14 * 86_400_000,
            tasks: d.tasks || []
          };
        }
      }

      if (!targetDoc) {
        onNotify(`No team found with Code '${raw}'. Check the code and try again.`);
        return;
      }

      if (!targetDoc.memberEmails.includes(currentEmail)) {
        targetDoc.memberEmails.push(currentEmail);
      }

      if (user) {
        await updateDoc(doc(db, 'group_projects', targetDoc.id), {
          memberEmails: arrayUnion(currentEmail),
          updatedAt: serverTimestamp()
        }).catch(() => {});
      }

      onUpdateVault((prev) => ({
        ...prev,
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
      try {
        await setDoc(doc(db, 'group_projects', activeProject.id, 'messages', newMsg.id), {
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
        });
      } catch {
        // Keep local
      }
    }
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
          try {
            await setDoc(doc(db, 'group_projects', activeProject.id, 'messages', newMsg.id), {
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
            });
          } catch {
            // Keep local
          }
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
        try {
          await setDoc(doc(db, 'group_projects', activeProject.id, 'messages', newMsg.id), {
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
          });
        } catch {
          // Keep local
        }
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
      try {
        await setDoc(doc(db, 'group_projects', activeProject.id, 'messages', newMsg.id), {
          projectId: activeProject.id,
          senderUid: user.uid,
          senderEmail: currentEmail,
          senderName: newMsg.senderName,
          messageText: newMsg.messageText,
          isPinned: false,
          messageType: 'POLL',
          pollData: newMsg.pollData,
          createdAt: serverTimestamp()
        });
      } catch {
        // Offline
      }
    }

    setShowPollModal(false);
    setPollQuestionInput('');
    onNotify('Team poll posted to chat!');
  };

  // VOTE ON POLL
  const handleVotePoll = (msg: WebGroupChatMessage, optionText: string) => {
    if (!msg.pollData) return;
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

    onUpdateVault((prev) => ({
      ...prev,
      groupMessages: prev.groupMessages.map((m) =>
        m.id === msg.id
          ? {
              ...m,
              pollData: {
                ...m.pollData!,
                options: updatedOptions
              }
            }
          : m
      )
    }));
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
      try {
        await setDoc(doc(db, 'group_projects', activeProject.id, 'messages', newMsg.id), {
          projectId: activeProject.id,
          senderUid: user.uid,
          senderEmail: currentEmail,
          senderName: newMsg.senderName,
          messageText: newMsg.messageText,
          isPinned: false,
          messageType: 'DOC_SHARE',
          docData: newMsg.docData,
          createdAt: serverTimestamp()
        });
      } catch {
        // Offline
      }
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
      try {
        await setDoc(
          doc(db, 'group_projects', activeProject.id),
          {
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
          },
          { merge: true }
        );

        const inviteDocId = `inv_${activeProject.id}_${clean.replace(/[^a-z0-9]/g, '_')}`;
        await setDoc(doc(db, 'group_invitations', inviteDocId), {
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
        });

        await setDoc(
          doc(db, 'group_projects', activeProject.id, 'messages', uidGen('notice')),
          {
            projectId: activeProject.id,
            senderUid: user.uid,
            senderEmail: 'system@aura',
            senderName: 'AURA Team Bot',
            messageText: `🎉 ${clean} was invited to the group!`,
            isPinned: false,
            messageType: 'NOTICE',
            createdAt: serverTimestamp()
          }
        );
      } catch {
        // Offline
      }
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
      try {
        await updateDoc(doc(db, 'group_projects', activeProject.id), {
          adminEmails: updatedAdmins,
          updatedAt: serverTimestamp()
        });
      } catch {
        // Offline
      }
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
      try {
        await updateDoc(doc(db, 'group_projects', activeProject.id), {
          adminEmails: updatedAdmins,
          updatedAt: serverTimestamp()
        });
      } catch {
        // Offline
      }
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
      try {
        await updateDoc(doc(db, 'group_projects', activeProject.id), {
          memberEmails: updatedMembers,
          adminEmails: updatedAdmins,
          updatedAt: serverTimestamp()
        });
      } catch {
        // Offline
      }
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
      try {
        await updateDoc(doc(db, 'group_projects', activeProject.id), {
          tasks: updatedTasks,
          updatedAt: serverTimestamp()
        });
      } catch {
        // Offline
      }
    }
  };

  // DELETE PROJECT (Creator / Admin)
  const handleDeleteProject = async (projId: string) => {
    const proj = vault.groupProjects.find((p) => p.id === projId);
    const name = proj?.teamName || 'this team';

    if (!window.confirm(`Permanently delete '${name}'? All messages, tasks, and resources will be removed.`))
      return;

    deletedProjectIdsRef.current.add(projId);

    onUpdateVault((prev) => {
      const remaining = prev.groupProjects.filter((p) => p.id !== projId);
      return {
        ...prev,
        groupProjects: remaining,
        groupMessages: prev.groupMessages.filter((m) => m.projectId !== projId)
      };
    });

    setSelectedProjectId((prevId) => {
      if (prevId === projId) {
        const remaining = vault.groupProjects.filter((p) => p.id !== projId);
        return remaining[0]?.id || '';
      }
      return prevId;
    });

    if (user) {
      try {
        await deleteDoc(doc(db, 'group_projects', projId));
      } catch (err) {
        console.error('Delete project error:', err);
      }
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

    onUpdateVault((prev) => {
      const remaining = prev.groupProjects.filter((p) => p.id !== projId);
      return {
        ...prev,
        groupProjects: remaining,
        groupMessages: prev.groupMessages.filter((m) => m.projectId !== projId)
      };
    });

    setSelectedProjectId((prevId) => {
      if (prevId === projId) {
        const remaining = vault.groupProjects.filter((p) => p.id !== projId);
        return remaining[0]?.id || '';
      }
      return prevId;
    });

    if (user) {
      try {
        const updatedMembers = proj.memberEmails.filter(
          (e) => e.toLowerCase() !== currentEmail
        );
        const updatedAdmins = proj.adminEmails.filter(
          (e) => e.toLowerCase() !== currentEmail
        );
        await updateDoc(doc(db, 'group_projects', projId), {
          memberEmails: updatedMembers,
          adminEmails: updatedAdmins,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.error('Leave group error:', err);
      }
    }

    onNotify(`You left '${proj.teamName}'.`);
  };

  // ADD SHARED RESOURCE TO TEAM VAULT (Feature 2)
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
      try {
        await updateDoc(doc(db, 'group_projects', activeProject.id), {
          resources: updatedResources,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.error('Add resource error:', err);
      }
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
      try {
        await updateDoc(doc(db, 'group_projects', activeProject.id), {
          resources: updatedResources,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.error('Delete resource error:', err);
      }
    }

    onNotify('Resource removed from Vault.');
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
        <div className="rounded-3xl p-4 bg-slate-900 border border-amber-500/40 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h3 className="font-extrabold text-sm sm:text-base text-white">
                Team Invitations Waiting For You ({pendingInvitations.length})
              </h3>
            </div>
            <span className="text-[11px] font-bold text-amber-300 px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/30 uppercase">
              Action Required
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingInvitations.map((inv) => (
              <div
                key={inv.id}
                className="p-3.5 rounded-2xl bg-black/40 border border-slate-800 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border border-slate-700 bg-slate-800 text-white"
                  >
                    {inv.teamName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-extrabold text-white text-sm">{inv.teamName}</span>
                      <span className="px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold">
                        {inv.courseCode}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 line-clamp-1">{inv.projectTitle}</p>
                    <p className="text-[11px] text-amber-300 font-semibold mt-0.5">
                      Target: {inv.groupTarget}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Invited by: <span className="text-emerald-400 font-bold">{inv.senderName}</span> ({inv.senderEmail})
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleAcceptInvitation(inv)}
                    className="flex-1 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition flex items-center justify-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    Accept &amp; Join
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeclineInvitation(inv)}
                    className="px-3 py-1.5 rounded-xl aura-subtle-surface text-slate-400 hover:text-rose-400 text-xs font-bold transition"
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
      <div className="aura-hero-card rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  Academic Team Hub
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                  Live Cloud
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Voice notes, shared slide vault, live sprints &amp; task tracking.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowJoinByCodeModal(true)}
              className="px-3 py-2 rounded-xl aura-subtle-surface text-slate-200 hover:border-slate-500 text-xs font-semibold transition flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Join with Code</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-sm transition flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              New Team
            </button>
          </div>
        </div>

        {/* Prominent Teams Workspace Grid (Supports unlimited teams) */}
        {vault.groupProjects.length > 0 && (
          <div className="pt-4 border-t border-white/10 mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider text-[11px]">
                Your Teams ({vault.groupProjects.length})
              </span>
              <span className="text-[10px] text-slate-500">Tap to switch active team workspace</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {vault.groupProjects.map((p) => {
                const isActive = p.id === activeProject?.id;
                const isOwner = p.creatorEmail?.toLowerCase() === currentEmail;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedProjectId(p.id)}
                    className={`cursor-pointer p-3 rounded-xl border transition-all flex items-center justify-between gap-2.5 ${
                      isActive
                        ? 'bg-slate-800 border-emerald-500/70 shadow-md'
                        : 'aura-subtle-surface hover:border-slate-600'
                    }`}
                  >
                    <div className="min-w-0 flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 border"
                        style={{
                          backgroundColor: `${p.avatarColorHex || '#10b981'}15`,
                          borderColor: `${p.avatarColorHex || '#10b981'}40`,
                          color: p.avatarColorHex || '#10b981'
                        }}
                      >
                        {p.courseCode.slice(0, 3)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-white truncate">{p.teamName}</span>
                          {isActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
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
                          className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/5 flex items-center justify-center transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleLeaveGroup(p.id)}
                          title="Leave Team"
                          className="w-7 h-7 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-white/5 flex items-center justify-center transition"
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
            <div className="aura-glass rounded-3xl p-4 sm:p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl border shrink-0"
                    style={{
                      backgroundColor: `${activeProject.avatarColorHex}25`,
                      borderColor: activeProject.avatarColorHex
                    }}
                  >
                    {activeProject.avatarEmoji || '👥'}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-white text-base leading-tight">
                      {activeProject.teamName}
                    </h3>
                    <p className="text-xs text-sky-400 font-bold">{activeProject.courseCode}</p>
                    <p className="text-[11px] text-slate-400 line-clamp-1">
                      {activeProject.projectTitle}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopyInviteLink(activeProject)}
                    title="Copy 1-Click Invite Link"
                    className="w-8 h-8 rounded-xl aura-subtle-surface flex items-center justify-center text-sky-400 hover:border-sky-400/50 transition"
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
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                      voiceHuddleActive
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30'
                        : 'aura-subtle-surface text-sky-400 hover:border-sky-400/60'
                    }`}
                  >
                    {voiceHuddleActive ? (
                      <>
                        <PhoneCall className="w-3.5 h-3.5 animate-pulse" />
                        <span>Huddle Live</span>
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
                      className="w-8 h-8 rounded-xl aura-subtle-surface flex items-center justify-center text-amber-300 hover:border-amber-400/50 transition"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  )}
                  {(isCurrentUserAdmin || activeProject.creatorEmail?.toLowerCase() === currentEmail) ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteProject(activeProject.id)}
                      title="Permanently Delete Team"
                      className="w-8 h-8 rounded-xl aura-subtle-surface flex items-center justify-center text-rose-400 hover:border-rose-400/50 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleLeaveGroup(activeProject.id)}
                      title="Leave Team"
                      className="px-2.5 py-1.5 rounded-xl aura-subtle-surface flex items-center gap-1 text-amber-400 hover:border-amber-400/50 text-xs font-semibold transition"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Leave</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Live Voice Huddle Indicator */}
              {voiceHuddleActive && (
                <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                    <span className="text-xs font-extrabold text-emerald-300 truncate">
                      Team Voice Active ({isWebMicMuted ? 'Muted' : 'Speaking'})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsWebMicMuted(!isWebMicMuted)}
                    className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold transition ${
                      isWebMicMuted ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-400 text-slate-950'
                    }`}
                  >
                    {isWebMicMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}

              {/* Target & Submission Countdown */}
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-400/30 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                    Target &amp; Milestone
                  </span>
                  <span className="text-[10px] font-bold text-sky-300 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {daysLeft > 0 ? `${daysLeft} days left` : 'Due Soon'}
                  </span>
                </div>
                <div className="text-xs font-extrabold text-amber-200">
                  🎯 {activeProject.groupTarget || 'Complete final prototype & presentation'}
                </div>
                {activeProject.joinCode && (
                  <div className="text-[10px] text-slate-400 font-mono pt-1 border-t border-white/5 flex items-center justify-between">
                    <span>Team Code:</span>
                    <span className="text-emerald-300 font-bold">{activeProject.joinCode}</span>
                  </div>
                )}
              </div>

              {/* Group Pomodoro Live Sprint Widget (New Feature) */}
              <div className="p-3 rounded-2xl aura-subtle-surface space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">Group Focus Sprint</span>
                  </div>
                  <span className="text-[11px] font-mono font-extrabold text-emerald-400">
                    {Math.floor(pomodoroSeconds / 60)
                      .toString()
                      .padStart(2, '0')}
                    :{(pomodoroSeconds % 60).toString().padStart(2, '0')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPomodoroRunning(!pomodoroRunning);
                      if (!pomodoroRunning) {
                        onNotify('Started synchronized 25-minute study sprint!');
                      }
                    }}
                    className={`flex-1 py-1 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 ${
                      pomodoroRunning
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-400/40'
                        : 'bg-emerald-400 text-slate-950 shadow-md'
                    }`}
                  >
                    {pomodoroRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    <span>{pomodoroRunning ? 'Pause Sprint' : 'Start 25m Sprint'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPomodoroRunning(false);
                      setPomodoroSeconds(25 * 60);
                    }}
                    className="px-2.5 py-1 rounded-xl aura-subtle-surface text-slate-400 hover:text-white text-xs font-bold"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-semibold">Deliverables Complete</span>
                  <span className="font-bold text-emerald-400">
                    {doneTasks}/{tasks.length} ({taskProgressPct}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${taskProgressPct}%` }}
                  />
                </div>
              </div>

              {/* Navigation Sub-Tabs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('CHAT')}
                  className={`py-1.5 px-2 rounded-lg font-bold transition flex items-center justify-center gap-1.5 ${
                    activeTab === 'CHAT'
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Chat</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('DELIVERABLES')}
                  className={`py-1.5 px-2 rounded-lg font-bold transition flex items-center justify-center gap-1.5 ${
                    activeTab === 'DELIVERABLES'
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <FolderKanban className="w-3.5 h-3.5" />
                  <span>Tasks ({tasks.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('RESOURCES')}
                  className={`py-1.5 px-2 rounded-lg font-bold transition flex items-center justify-center gap-1.5 ${
                    activeTab === 'RESOURCES'
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Vault ({activeProject.resources?.length || 0})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('MEMBERS')}
                  className={`py-1.5 px-2 rounded-lg font-bold transition flex items-center justify-center gap-1.5 ${
                    activeTab === 'MEMBERS'
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Team ({activeProject.memberEmails.length})</span>
                </button>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={handleExportChat}
                  className="flex-1 py-1.5 rounded-xl aura-subtle-surface text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5 hover:border-sky-400/50 transition"
                >
                  <Copy className="w-3.5 h-3.5 text-sky-400" />
                  Export Chat
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddMemberModal(true)}
                  className="flex-1 py-1.5 rounded-xl aura-subtle-surface text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5 hover:border-emerald-400/50 transition"
                >
                  <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                  Add Member
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Tab Content Stage */}
          <div className="lg:col-span-2">
            {activeTab === 'CHAT' && (
              <div className="aura-glass rounded-3xl p-4 sm:p-5 flex flex-col h-[calc(100dvh-270px)] min-h-[520px] max-h-[720px] border border-white/15 shadow-2xl">
                {/* Pinned Messages Bar */}
                {pinnedMessages.length > 0 && (
                  <div className="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-400/30 flex items-center gap-2 mb-3 shrink-0">
                    <Pin className="w-4 h-4 text-amber-300 shrink-0" />
                    <div className="text-xs text-amber-200 font-bold truncate flex-1">
                      {pinnedMessages[pinnedMessages.length - 1].messageText}
                    </div>
                  </div>
                )}

                {/* Messages Stream */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1.5 no-scrollbar">
                  {projectMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                      <MessageSquare className="w-10 h-10 text-slate-600 mb-2" />
                      <p className="font-extrabold text-sm text-white">No messages yet</p>
                      <p className="text-xs mt-1">
                        Send text messages, record voice notes, share slides &amp; photos in real time!
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
                            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-semibold text-slate-300">
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
                            className={`max-w-[85%] rounded-2xl p-3 space-y-2 relative group ${
                              isMe
                                ? 'bg-emerald-600 text-white shadow-md'
                                : 'bg-slate-800/85 border border-white/10 text-slate-100'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3 text-[11px] opacity-85">
                              <span className="font-extrabold flex items-center gap-1">
                                {isMe ? 'You' : msg.senderName}
                                {isAdmin && (
                                  <span title="Admin">
                                    <Crown className="w-3 h-3 text-amber-300 inline" />
                                  </span>
                                )}
                              </span>
                              <span>
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

                            {/* Voice Note Player (New Feature) */}
                            {msg.messageType === 'VOICE_NOTE' && msg.audioUrl && (
                              <VoiceNotePlayer
                                audioUrl={msg.audioUrl}
                                durationSec={msg.audioDurationSec || 0}
                                isMe={isMe}
                              />
                            )}

                            {/* Image Attachment (New Feature) */}
                            {msg.messageType === 'IMAGE_SHARE' && msg.imageUrl && (
                              <div className="rounded-xl overflow-hidden border border-white/20 mt-1 cursor-pointer">
                                <img
                                  src={msg.imageUrl}
                                  alt="Attached Diagram or Photo"
                                  className="w-full max-h-60 object-cover hover:scale-105 transition duration-200"
                                  onClick={() => setPreviewImageUrl(msg.imageUrl!)}
                                />
                              </div>
                            )}

                            {/* Poll Card */}
                            {msg.pollData && (
                              <div className="p-3 rounded-xl bg-black/35 border border-sky-400/40 text-xs space-y-2 mt-2">
                                <div className="font-extrabold text-sky-300 flex items-center gap-1.5">
                                  <span>📊</span>
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
                                        className={`w-full text-left p-2 rounded-lg border transition ${
                                          hasVoted
                                            ? 'bg-sky-500/25 border-sky-400/80 text-white font-bold'
                                            : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-200'
                                        }`}
                                      >
                                        <div className="flex justify-between text-[11px] mb-1">
                                          <span>{hasVoted ? '✓ ' : ''}{opt.text}</span>
                                          <span className="opacity-80">
                                            {voteCount} ({pct}%)
                                          </span>
                                        </div>
                                        <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                                          <div
                                            className="h-full bg-sky-400 transition-all duration-300"
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
                              <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-400/40 text-xs flex items-center justify-between gap-2 mt-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-base">📎</span>
                                  <div className="min-w-0">
                                    <div className="font-bold text-emerald-300 truncate">
                                      {msg.docData.title}
                                    </div>
                                    {msg.docData.linkOrFileName && (
                                      <div className="text-[10px] text-slate-400 truncate">
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
                                    className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-[10px] shrink-0"
                                  >
                                    Open ↗
                                  </a>
                                )}
                              </div>
                            )}

                            {/* Tagged Deliverable Box */}
                            {msg.taggedDeliverableTitle && (
                              <div className="p-2 rounded-xl bg-black/25 border border-white/15 text-xs flex items-center justify-between gap-2 mt-2">
                                <span className="font-bold truncate text-white">
                                  🎯 {msg.taggedDeliverableTitle}
                                </span>
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
                <div className="pt-3 border-t border-white/10 space-y-2 shrink-0">
                  {selectedDeliverableTag && (
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                        <span>🎯 Tagged: {selectedDeliverableTag}</span>
                        <X
                          className="w-3 h-3 cursor-pointer hover:text-white"
                          onClick={() => setSelectedDeliverableTag('')}
                        />
                      </span>
                    </div>
                  )}

                  {/* Dynamic Recording Dock vs Standard Text Dock */}
                  {isRecordingVoice ? (
                    <div className="p-2.5 rounded-2xl bg-rose-950/40 border border-rose-500/50 flex items-center justify-between gap-3 animate-pulse">
                      <div className="flex items-center gap-3">
                        <span className="w-3.5 h-3.5 rounded-full bg-rose-500 animate-ping" />
                        <span className="text-xs font-bold text-rose-300">
                          Recording Voice Note... (
                          {Math.floor(recordingSeconds / 60)
                            .toString()
                            .padStart(2, '0')}
                          :{(recordingSeconds % 60).toString().padStart(2, '0')})
                        </span>
                        <div className="flex items-center gap-0.5">
                          <span className="w-1 h-3 bg-rose-400 rounded-full aura-sound-bar" />
                          <span className="w-1 h-4 bg-rose-400 rounded-full aura-sound-bar" />
                          <span className="w-1 h-2 bg-rose-400 rounded-full aura-sound-bar" />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCancelVoiceRecording}
                          className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 text-xs font-bold transition flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSendVoiceRecording}
                          className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-md flex items-center gap-1.5 transition"
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
                          className="w-9 h-9 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-300 flex items-center justify-center shrink-0 transition"
                        >
                          <Mic className="w-4 h-4" />
                        </button>

                        {/* Image / Attachment Button */}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          title="Share Photo / Diagram"
                          className="w-9 h-9 rounded-2xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/40 text-purple-300 flex items-center justify-center shrink-0 transition"
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
                          className="w-9 h-9 rounded-2xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-300 flex items-center justify-center shrink-0 transition text-xs font-bold"
                        >
                          Poll
                        </button>

                        {/* Doc Button */}
                        <button
                          type="button"
                          onClick={() => setShowDocModal(true)}
                          title="Share Resource Link"
                          className="w-9 h-9 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 flex items-center justify-center shrink-0 transition text-xs font-bold"
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
                        className="aura-input flex-1 px-4 py-2.5 rounded-2xl text-xs sm:text-sm min-w-[140px]"
                      />

                      {tasks.length > 0 && (
                        <select
                          aria-label="Tag deliverable to message"
                          value={selectedDeliverableTag}
                          onChange={(e) => setSelectedDeliverableTag(e.target.value)}
                          className="aura-input px-3 py-2.5 rounded-2xl text-xs bg-slate-900 border-white/15 max-w-[120px] truncate"
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
                        className="w-10 h-10 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center font-bold shadow-md active:scale-95 transition shrink-0"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'DELIVERABLES' && (
              <div className="aura-glass rounded-3xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h4 className="font-extrabold text-white text-sm sm:text-base">
                      Group Deliverables &amp; Section Splits
                    </h4>
                    <p className="text-xs text-slate-400">
                      Split milestones, assign tasks to members &amp; track progress.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddTaskModal(true)}
                    className="aura-pill-btn px-3 py-1.5 bg-emerald-400/20 border border-emerald-400/40 text-emerald-300 text-xs hover:bg-emerald-400/30"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Assign Deliverable
                  </button>
                </div>

                {/* Filter and Search Bar (New Feature) */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setTaskFilter('ALL')}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        taskFilter === 'ALL' ? 'bg-emerald-400 text-slate-950' : 'text-slate-300'
                      }`}
                    >
                      All ({tasks.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaskFilter('PENDING')}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        taskFilter === 'PENDING' ? 'bg-emerald-400 text-slate-950' : 'text-slate-300'
                      }`}
                    >
                      Pending ({tasks.length - doneTasks})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaskFilter('DONE')}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        taskFilter === 'DONE' ? 'bg-emerald-400 text-slate-950' : 'text-slate-300'
                      }`}
                    >
                      Done ({doneTasks})
                    </button>
                  </div>

                  <div className="relative flex-1 min-w-[140px]">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={taskSearch}
                      onChange={(e) => setTaskSearch(e.target.value)}
                      placeholder="Search deliverables..."
                      className="aura-input w-full pl-8 pr-3 py-1.5 rounded-xl text-xs"
                    />
                  </div>
                </div>

                {filteredTasks.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-xs">
                    No deliverables found matching your filter.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredTasks.map((task) => (
                      <div
                        key={task.id}
                        className="p-3 rounded-2xl aura-subtle-surface flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            onClick={() => handleToggleTask(task)}
                            className={`w-6 h-6 rounded-lg flex items-center justify-center border transition ${
                              task.isCompleted
                                ? 'bg-emerald-400 border-emerald-400 text-slate-950'
                                : 'border-white/30 hover:border-white'
                            }`}
                          >
                            {task.isCompleted && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </button>
                          <div className="min-w-0">
                            <p
                              className={`text-xs sm:text-sm font-bold truncate ${
                                task.isCompleted ? 'line-through text-slate-400' : 'text-white'
                              }`}
                            >
                              {task.taskTitle}
                            </p>
                            <p className="text-[11px] text-sky-400 font-semibold truncate">
                              Assigned to: {task.memberName} {task.memberContact && `(${task.memberContact})`}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setChatInput(`📌 Working on deliverable: '${task.taskTitle}'!`);
                            setSelectedDeliverableTag(task.taskTitle);
                            setActiveTab('CHAT');
                          }}
                          className="px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold text-slate-300 hover:text-white hover:border-white/30 transition shrink-0"
                        >
                          Share in Chat
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'MEMBERS' && (
              <div className="aura-glass rounded-3xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-extrabold text-white text-sm sm:text-base">
                      Teammates &amp; Member Status
                    </h4>
                    <p className="text-xs text-slate-400">
                      Teammates added by email can access this team and chat live.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddMemberModal(true)}
                    className="aura-pill-btn px-3 py-1.5 bg-emerald-400/20 border border-emerald-400/40 text-emerald-300 text-xs hover:bg-emerald-400/30"
                  >
                    <UserPlus className="w-3.5 h-3.5 mr-1" />
                    Add Member
                  </button>
                </div>

                <div className="space-y-2">
                  {activeProject.memberEmails.map((email) => {
                    const isAdmin = (activeProject.adminEmails || [])
                      .map((e) => e.toLowerCase())
                      .includes(email.toLowerCase());
                    const isCreator =
                      activeProject.creatorEmail &&
                      activeProject.creatorEmail.toLowerCase() === email.toLowerCase();
                    const isMe = email.toLowerCase() === currentEmail;

                    return (
                      <div
                        key={email}
                        className="p-3 rounded-2xl aura-subtle-surface flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-emerald-400/20 text-emerald-300 flex items-center justify-center font-extrabold text-xs shrink-0">
                            {email.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs sm:text-sm font-bold text-white truncate">
                                {email}
                              </span>
                              {isMe && (
                                <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-extrabold">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[11px]">
                              {isCreator && (
                                <span className="text-emerald-400 font-extrabold">Creator</span>
                              )}
                              {isAdmin && (
                                <span className="text-amber-400 font-bold flex items-center gap-0.5">
                                  <Crown className="w-3 h-3 inline" /> Admin
                                </span>
                              )}
                              {!isAdmin && !isCreator && (
                                <span className="text-slate-400">Member</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {isCurrentUserAdmin && !isMe && (
                          <div className="flex items-center gap-1 shrink-0">
                            {isAdmin ? (
                              <button
                                type="button"
                                onClick={() => handleDemoteAdmin(email)}
                                title="Demote to Member"
                                className="px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold text-amber-300 hover:bg-white/10"
                              >
                                Demote
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handlePromoteToAdmin(email)}
                                title="Promote to Admin"
                                className="px-2.5 py-1 rounded-xl bg-amber-400/20 border border-amber-400/40 text-[11px] font-bold text-amber-300 hover:bg-amber-400/30"
                              >
                                Make Admin
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(email)}
                              title="Remove member"
                              className="w-7 h-7 rounded-lg aura-subtle-surface flex items-center justify-center text-rose-400 hover:border-rose-400/50"
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

            {/* Sub-Tab 4: Shared Team Resource Vault (Feature 2) */}
            {activeTab === 'RESOURCES' && (
              <div className="aura-glass rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-emerald-400" />
                    <div>
                      <h4 className="font-bold text-white text-sm sm:text-base">
                        Shared Team Vault &amp; Resources
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Lecture slides, past papers, shared Google Docs &amp; research links for {activeProject.teamName}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowDocModal(true)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
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
                      className={`px-3 py-1 rounded-lg font-semibold transition shrink-0 ${
                        resourceFilter === cat
                          ? 'bg-slate-700 text-white border border-slate-600'
                          : 'aura-subtle-surface text-slate-400 hover:text-white'
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
                      <div className="p-8 rounded-2xl bg-white/5 border border-white/5 text-center space-y-2">
                        <FileText className="w-8 h-8 text-slate-500 mx-auto" />
                        <div className="text-xs font-bold text-slate-300">No resources found in this category</div>
                        <p className="text-[11px] text-slate-500">
                          Upload or link slides, PDFs, GitHub repositories, or Google Drive notes for your teammates.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowDocModal(true)}
                          className="mt-2 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold inline-flex items-center gap-1"
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
                            className="p-3.5 rounded-xl aura-subtle-surface border hover:border-slate-600 transition space-y-2.5 flex flex-col justify-between"
                          >
                            <div className="space-y-1">
                              <div className="flex items-start justify-between gap-2">
                                <span className="px-2 py-0.5 rounded-md bg-white/10 text-[10px] font-bold text-slate-300 uppercase">
                                  {r.category.replace('_', ' ')}
                                </span>
                                {canDelete && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteResource(r.id)}
                                    title="Delete resource"
                                    className="text-slate-500 hover:text-rose-400 transition"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              <h5 className="font-bold text-xs text-white line-clamp-1">{r.title}</h5>
                              <p className="text-[10px] text-slate-400 line-clamp-1 break-all font-mono">
                                {r.linkOrFileName}
                              </p>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px] text-slate-400">
                              <span>Added by {r.addedByEmail.split('@')[0]}</span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(r.linkOrFileName);
                                    onNotify('Copied resource link!');
                                  }}
                                  className="text-slate-400 hover:text-white transition flex items-center gap-1"
                                >
                                  <Copy className="w-3 h-3" /> Copy
                                </button>
                                <a
                                  href={r.linkOrFileName.startsWith('http') ? r.linkOrFileName : `https://${r.linkOrFileName}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
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
        <div className="aura-glass rounded-3xl p-10 text-center space-y-3">
          <Users className="w-12 h-12 text-slate-500 mx-auto" />
          <h3 className="text-base font-extrabold text-white">No Group Projects Yet</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Create your first group project team above or join an existing team with a 4-digit code to start collaborating!
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowJoinByCodeModal(true)}
              className="aura-pill-btn px-4 py-2 aura-subtle-surface text-sky-300 text-xs font-bold"
            >
              Join with Code
            </button>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="aura-pill-btn px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition"
            >
              Create Team Project
            </button>
          </div>
        </div>
      )}

      {/* Image Fullscreen Preview Modal */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh]">
            <img
              src={previewImageUrl}
              alt="Enlarged preview"
              className="rounded-2xl max-h-[85vh] object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black"
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
                await setDoc(doc(db, 'group_projects', newProj.id), {
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
                });

                for (const memberEmail of newProj.memberEmails) {
                  if (memberEmail.toLowerCase() !== currentEmail) {
                    const invId = `inv_${newProj.id}_${memberEmail.replace(/[^a-z0-9]/g, '_')}`;
                    await setDoc(doc(db, 'group_invitations', invId), {
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
                    });
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl aura-glass p-5 space-y-4 border border-sky-400/40">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-sky-400" />
                <h4 className="font-extrabold text-white text-base">Join Team with Code</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowJoinByCodeModal(false)}
                className="w-7 h-7 rounded-full aura-subtle-surface flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Enter the 4-digit Team Code (e.g. <span className="font-mono text-sky-300">GRP-7K9M</span>) or paste the Project ID shared by your team leader:
            </p>

            <input
              type="text"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
              placeholder="e.g. GRP-7K9M or gp_179350000"
              className="aura-input w-full px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-mono uppercase tracking-wider"
            />

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowJoinByCodeModal(false)}
                className="px-3 py-1.5 rounded-xl aura-subtle-surface text-xs font-bold text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleJoinByCode}
                className="aura-pill-btn px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition"
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
              try {
                await updateDoc(doc(db, 'group_projects', updated.id), {
                  teamName: updated.teamName,
                  projectTitle: updated.projectTitle,
                  groupTarget: updated.groupTarget,
                  avatarEmoji: updated.avatarEmoji,
                  avatarColorHex: updated.avatarColorHex,
                  updatedAt: serverTimestamp()
                });
              } catch {
                // Offline
              }
            }
            setShowSettingsModal(false);
            onNotify('Saved group settings and target!');
          }}
        />
      )}

      {/* MODAL: Add Member by Email */}
      {showAddMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl aura-glass p-5 space-y-4 border border-emerald-400/40">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h4 className="font-extrabold text-white text-base">Invite Teammate by Email</h4>
              <button
                type="button"
                onClick={() => setShowAddMemberModal(false)}
                className="w-7 h-7 rounded-full aura-subtle-surface flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Enter your classmate&apos;s email (e.g. <span className="text-emerald-300 font-mono">cbawa83@gmail.com</span>). An invitation record will be written to the Cloud, and you can immediately trigger an email invitation:
            </p>
            <input
              type="email"
              id="new_teammate_email_input"
              placeholder="cbawa83@gmail.com"
              className="aura-input w-full px-4 py-2.5 rounded-2xl text-xs sm:text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddMemberByEmail((e.target as HTMLInputElement).value);
                }
              }}
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddMemberModal(false)}
                className="px-3 py-1.5 rounded-xl aura-subtle-surface text-xs font-bold text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const input = document.getElementById('new_teammate_email_input') as HTMLInputElement | null;
                  if (input) handleAddMemberByEmail(input.value);
                }}
                className="aura-pill-btn px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-md transition"
              >
                Invite Teammate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: INVITATION SENT CONFIRMATION & EMAIL DISPATCH */}
      {inviteSuccessData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl aura-glass p-5 sm:p-6 space-y-4 border border-emerald-400/50 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                <h4 className="font-extrabold text-white text-base sm:text-lg">
                  Invitation Created &amp; Synced!
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setInviteSuccessData(null)}
                className="w-7 h-7 rounded-full aura-subtle-surface flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 text-xs text-slate-200 space-y-1.5">
              <div className="font-extrabold text-emerald-300 flex items-center gap-1.5">
                <span>Saved to Firestore Cloud</span>
              </div>
              <p className="leading-relaxed">
                <strong className="text-white">{inviteSuccessData.inviteeEmail}</strong> has been added to{' '}
                <strong className="text-white">{inviteSuccessData.teamName}</strong>. As soon as they log into AURA with their email, a prominent invitation banner will greet them to join the group!
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <p className="font-bold text-slate-300">
                To guarantee they receive the invitation right now in their inbox or messages, choose an action:
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
                    className="w-full py-2.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition"
                  >
                    <Mail className="w-4 h-4" />
                    <span>Send Email to {inviteSuccessData.inviteeEmail} (Open Mail App)</span>
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
                  className="py-2 px-3 rounded-xl aura-subtle-surface text-slate-200 hover:border-sky-400 text-xs font-bold flex items-center justify-center gap-1.5 transition"
                >
                  <Copy className="w-3.5 h-3.5 text-sky-400" />
                  Copy 1-Click Link
                </button>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteSuccessData.joinCode);
                    onNotify(`Copied Team Code ${inviteSuccessData.joinCode}!`);
                  }}
                  className="py-2 px-3 rounded-xl aura-subtle-surface text-slate-200 hover:border-emerald-400 text-xs font-bold flex items-center justify-center gap-1.5 transition"
                >
                  <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                  Copy Team Code ({inviteSuccessData.joinCode})
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setInviteSuccessData(null)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition"
              >
                Close &amp; Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Assign Task / Deliverable */}
      {showAddTaskModal && activeProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl aura-glass p-5 space-y-4 border border-emerald-400/30">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h4 className="font-extrabold text-white text-base">Assign Team Deliverable</h4>
              <button
                type="button"
                onClick={() => setShowAddTaskModal(false)}
                className="w-7 h-7 rounded-full aura-subtle-surface flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase">Deliverable Name</label>
                <input
                  type="text"
                  id="task_name_input"
                  placeholder="e.g. System Architecture Diagram &amp; Benchmarks"
                  className="aura-input w-full px-4 py-2 rounded-xl text-xs mt-1"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase">Assignee Member</label>
                <select
                  id="task_assignee_input"
                  className="aura-input w-full px-4 py-2 rounded-xl text-xs mt-1 bg-slate-900 border-white/15"
                >
                  {activeProject.memberEmails.map((email) => (
                    <option key={email} value={email}>
                      {email}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddTaskModal(false)}
                className="px-3 py-1.5 rounded-xl aura-subtle-surface text-xs font-bold text-slate-300"
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
                      await updateDoc(doc(db, 'group_projects', activeProject.id), {
                        tasks: updatedTasks,
                        updatedAt: serverTimestamp()
                      }).catch(() => {});
                    }

                    setShowAddTaskModal(false);
                    onNotify(`Added deliverable '${newTask.taskTitle}'!`);
                  }
                }}
                className="aura-pill-btn px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition"
              >
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Team Poll */}
      {showPollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl aura-glass p-5 space-y-4 border border-sky-400/40">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-sky-400" />
                <h4 className="font-extrabold text-white text-base">Create Team Meeting Poll</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowPollModal(false)}
                className="w-7 h-7 rounded-full aura-subtle-surface flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-300 uppercase">Poll Question</label>
                <input
                  type="text"
                  value={pollQuestionInput}
                  onChange={(e) => setPollQuestionInput(e.target.value)}
                  placeholder="e.g. When should we hold our rehearsal sprint?"
                  className="aura-input w-full px-4 py-2 rounded-xl mt-1"
                />
              </div>

              <div>
                <label className="font-bold text-slate-300 uppercase">Option 1</label>
                <input
                  type="text"
                  value={pollOpt1}
                  onChange={(e) => setPollOpt1(e.target.value)}
                  className="aura-input w-full px-4 py-2 rounded-xl mt-1"
                />
              </div>

              <div>
                <label className="font-bold text-slate-300 uppercase">Option 2</label>
                <input
                  type="text"
                  value={pollOpt2}
                  onChange={(e) => setPollOpt2(e.target.value)}
                  className="aura-input w-full px-4 py-2 rounded-xl mt-1"
                />
              </div>

              <div>
                <label className="font-bold text-slate-300 uppercase">Option 3 (Optional)</label>
                <input
                  type="text"
                  value={pollOpt3}
                  onChange={(e) => setPollOpt3(e.target.value)}
                  className="aura-input w-full px-4 py-2 rounded-xl mt-1"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowPollModal(false)}
                className="px-3 py-1.5 rounded-xl aura-subtle-surface text-xs font-bold text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendPoll}
                className="aura-pill-btn px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition"
              >
                Post Poll to Chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Share Resource / Slide Link */}
      {/* Modal: Add Resource to Team Vault (Feature 2) */}
      {showDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl aura-glass p-5 space-y-4 border border-slate-700">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-400" />
                <h4 className="font-bold text-white text-sm">Add to Team Resource Vault</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowDocModal(false)}
                className="w-7 h-7 rounded-lg aura-subtle-surface flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
                  Resource Title
                </label>
                <input
                  type="text"
                  value={newResourceTitle}
                  onChange={(e) => setNewResourceTitle(e.target.value)}
                  placeholder="e.g. Lecture 4 Slides - Dynamic Programming"
                  className="aura-input w-full px-3.5 py-2 rounded-xl mt-1 text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
                  Resource Category
                </label>
                <select
                  value={newResourceCategory}
                  onChange={(e) =>
                    setNewResourceCategory(
                      e.target.value as 'SLIDES' | 'DOCUMENT' | 'RESEARCH_LINK' | 'PAST_PAPER'
                    )
                  }
                  className="aura-input w-full px-3.5 py-2 rounded-xl mt-1 text-xs font-semibold bg-slate-900"
                >
                  <option value="SLIDES">Lecture Slides</option>
                  <option value="DOCUMENT">Document / Notes / Summary</option>
                  <option value="RESEARCH_LINK">Research Paper / GitHub Link</option>
                  <option value="PAST_PAPER">Past Exam Paper / Question Bank</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
                  Link (Google Drive, GitHub, PDF, Notion)
                </label>
                <input
                  type="text"
                  value={newResourceUrl}
                  onChange={(e) => setNewResourceUrl(e.target.value)}
                  placeholder="https://drive.google.com/... or https://github.com/..."
                  className="aura-input w-full px-3.5 py-2 rounded-xl mt-1 text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowDocModal(false)}
                className="px-3 py-1.5 rounded-xl aura-subtle-surface text-xs font-semibold text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddResource}
                disabled={!newResourceTitle.trim() || !newResourceUrl.trim()}
                className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-bold transition"
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

  const progress = durationSec > 0 ? Math.min(100, (currentTime / durationSec) * 100) : 0;

  return (
    <div
      className={`p-2.5 rounded-2xl flex items-center gap-3 mt-1 min-w-[200px] sm:min-w-[240px] ${
        isMe ? 'bg-black/25 border border-white/20' : 'bg-black/30 border border-white/10'
      }`}
    >
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      <button
        type="button"
        onClick={togglePlay}
        className="w-8 h-8 rounded-full bg-emerald-400 text-slate-950 flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition shadow-md"
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>

      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-1 h-4">
          {[4, 10, 16, 8, 14, 6, 12, 16, 8, 14, 10, 4].map((h, i) => (
            <span
              key={i}
              className={`w-1 rounded-full transition-all duration-200 ${
                isPlaying ? 'bg-emerald-300 aura-sound-bar' : 'bg-white/40'
              }`}
              style={{
                height: `${h}px`,
                animationDelay: `${(i % 4) * 0.15}s`
              }}
            />
          ))}
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-300 font-mono">
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
  const [emoji, setEmoji] = useState('🚀');
  const [colorHex, setColorHex] = useState('#10B981');
  const [memberEmailsInput, setMemberEmailsInput] = useState('');
  const [daysDue, setDaysDue] = useState('14');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl aura-glass p-5 space-y-4 border border-emerald-400/30 max-h-[90vh] overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <h4 className="font-extrabold text-white text-base">Create Group Project Team</h4>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full aura-subtle-surface flex items-center justify-center text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="font-bold text-slate-300 uppercase">Course Code</label>
            <input
              type="text"
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              placeholder="e.g. CS301"
              className="aura-input w-full px-4 py-2 rounded-xl mt-1"
            />
          </div>

          <div>
            <label className="font-bold text-slate-300 uppercase">Team / Group Name</label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. Team AURA Distributed"
              className="aura-input w-full px-4 py-2 rounded-xl mt-1"
            />
          </div>

          <div>
            <label className="font-bold text-slate-300 uppercase">Assignment / Project Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Distributed Consensus Engine"
              className="aura-input w-full px-4 py-2 rounded-xl mt-1"
            />
          </div>

          <div>
            <label className="font-bold text-slate-300 uppercase">Group Target Goal</label>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="e.g. Achieve 95%+ / Grade A / Finalist"
              className="aura-input w-full px-4 py-2 rounded-xl mt-1"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
              Team Monogram Badge
            </label>
            <div className="flex items-center gap-2 mt-1.5">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm border"
                style={{
                  backgroundColor: `${colorHex}15`,
                  borderColor: `${colorHex}40`,
                  color: colorHex
                }}
              >
                {courseCode.slice(0, 3).toUpperCase() || 'GRP'}
              </div>
              <span className="text-xs text-slate-400">
                Monogram auto-generated from Course Code
              </span>
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
              Theme Accent Color
            </label>
            <div className="flex items-center gap-2 mt-1.5">
              {COLOR_OPTIONS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColorHex(hex)}
                  className={`w-7 h-7 rounded-full border transition ${
                    colorHex === hex ? 'scale-125 border-white shadow-sm' : 'border-white/20'
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
              Invite Members by Email (comma-separated)
            </label>
            <input
              type="text"
              value={memberEmailsInput}
              onChange={(e) => setMemberEmailsInput(e.target.value)}
              placeholder="cbawa83@gmail.com, alex@university.edu"
              className="aura-input w-full px-3.5 py-2 rounded-xl mt-1 text-xs"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
              Days Until Submission
            </label>
            <input
              type="number"
              min="1"
              value={daysDue}
              onChange={(e) => setDaysDue(e.target.value)}
              className="aura-input w-full px-3.5 py-2 rounded-xl mt-1 text-xs"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl aura-subtle-surface text-xs font-semibold text-slate-300"
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
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition shadow-sm"
          >
            Create Team Workspace
          </button>
        </div>
      </div>
    </div>
  );
};

// Modal for Admin Group Settings
const GroupSettingsModal: React.FC<{
  project: WebGroupProject;
  onClose: () => void;
  onSave: (proj: WebGroupProject) => void;
}> = ({ project, onClose, onSave }) => {
  const [teamName, setTeamName] = useState(project.teamName);
  const [title, setTitle] = useState(project.projectTitle);
  const [target, setTarget] = useState(project.groupTarget);
  const [colorHex, setColorHex] = useState(project.avatarColorHex);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl aura-glass p-5 space-y-4 border border-slate-700">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <h4 className="font-bold text-white text-base">Group Admin Settings</h4>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg aura-subtle-surface flex items-center justify-center text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
              Team Name
            </label>
            <input
              type="text"
              value={teamName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTeamName(e.target.value)}
              className="aura-input w-full px-3.5 py-2 rounded-xl mt-1 text-xs"
            />
          </div>
          <div>
            <label className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
              Project Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
              className="aura-input w-full px-3.5 py-2 rounded-xl mt-1 text-xs"
            />
          </div>
          <div>
            <label className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
              Target Goal
            </label>
            <input
              type="text"
              value={target}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTarget(e.target.value)}
              className="aura-input w-full px-3.5 py-2 rounded-xl mt-1 text-xs"
            />
          </div>
          <div>
            <label className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
              Theme Accent Color
            </label>
            <div className="flex items-center gap-2 mt-1.5">
              {COLOR_OPTIONS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColorHex(hex)}
                  className={`w-7 h-7 rounded-full border transition ${
                    colorHex === hex ? 'scale-125 border-white shadow-sm' : 'border-white/20'
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl aura-subtle-surface text-xs font-semibold text-slate-300"
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
                avatarColorHex: colorHex
              });
            }}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition shadow-sm"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
