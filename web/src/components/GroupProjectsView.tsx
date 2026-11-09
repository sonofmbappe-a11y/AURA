import React, { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  deleteDoc,
  updateDoc
} from 'firebase/firestore';
import {
  Check,
  CheckCircle2,
  Copy,
  Crown,
  Download,
  FolderKanban,
  MessageSquare,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  Pin,
  Plus,
  Send,
  Settings,
  Share2,
  Smile,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  Volume2,
  X
} from 'lucide-react';
import { db } from '../firebase';
import { uidGen } from '../storage';
import type {
  AuraLocalVault,
  WebGroupChatMessage,
  WebGroupProject,
  WebGroupTask
} from '../types';

interface Props {
  user: User | null;
  vault: AuraLocalVault;
  onUpdateVault: (updater: (prev: AuraLocalVault) => AuraLocalVault) => void;
  onNotify: (msg: string) => void;
}

const EMOJI_OPTIONS = ['🚀', '💡', '🔬', '💻', '🎯', '📚', '🏆', '👥', '🧪', '🎨'];
const COLOR_OPTIONS = ['#10B981', '#38BDF8', '#8B5CF6', '#F59E0B', '#F43F5E', '#06B6D4'];

export const GroupProjectsView: React.FC<Props> = ({
  user,
  vault,
  onUpdateVault,
  onNotify
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    vault.groupProjects[0]?.id || ''
  );
  const [activeTab, setActiveTab] = useState<'CHAT' | 'DELIVERABLES' | 'MEMBERS'>('CHAT');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);

  // Group Poll State
  const [pollQuestionInput, setPollQuestionInput] = useState('');
  const [pollOpt1, setPollOpt1] = useState('Thursday 4:00 PM');
  const [pollOpt2, setPollOpt2] = useState('Friday 2:00 PM');
  const [pollOpt3, setPollOpt3] = useState('Saturday 11:00 AM');

  // Group Doc State
  const [docTitleInput, setDocTitleInput] = useState('');
  const [docUrlInput, setDocUrlInput] = useState('');

  // Group Synced Pomodoro Sprint State
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const [pomodoroSeconds, setPomodoroSeconds] = useState(25 * 60);

  // Group Live Voice Huddle State
  const [voiceHuddleActive, setVoiceHuddleActive] = useState(false);
  const [isWebMicMuted, setIsWebMicMuted] = useState(false);

  // Message composer
  const [chatInput, setChatInput] = useState('');
  const [pinChecked, setPinChecked] = useState(false);
  const [selectedDeliverableTag, setSelectedDeliverableTag] = useState<string>('');

  // Active Project & Messages
  const activeProject = useMemo(() => {
    return vault.groupProjects.find((p) => p.id === selectedProjectId) || vault.groupProjects[0];
  }, [vault.groupProjects, selectedProjectId]);

  const currentEmail = (user?.email || vault.profile.email || 'scholar@university.edu')
    .trim()
    .toLowerCase();

  const isCurrentUserAdmin = useMemo(() => {
    if (!activeProject) return true;
    const admins = activeProject.adminEmails.map((e) => e.toLowerCase());
    return (
      admins.length === 0 ||
      admins.includes(currentEmail) ||
      !activeProject.creatorEmail ||
      activeProject.creatorEmail.toLowerCase() === currentEmail
    );
  }, [activeProject, currentEmail]);

  // Messages for active project (merged from vault local cache and cloud)
  const projectMessages = useMemo(() => {
    if (!activeProject) return [];
    return vault.groupMessages
      .filter((m) => m.projectId === activeProject.id)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [vault.groupMessages, activeProject]);

  // Real-time Firestore sync when authenticated
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
              reactions: data.reactions || {}
            };
          });

          if (cloudMsgs.length > 0) {
            onUpdateVault((prev) => {
              const other = prev.groupMessages.filter((m) => m.projectId !== activeProject.id);
              const mergedMap = new Map<string, WebGroupChatMessage>();
              // Keep local optimistic messages
              prev.groupMessages
                .filter((m) => m.projectId === activeProject.id)
                .forEach((m) => mergedMap.set(m.id, m));
              // Merge cloud
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

  // Send message
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

    // Save locally first (instant UI update)
    onUpdateVault((prev) => ({
      ...prev,
      groupMessages: [...prev.groupMessages, newMsg]
    }));

    setChatInput('');
    setPinChecked(false);
    setSelectedDeliverableTag('');

    // Sync to Firestore if signed in
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
        // Keep local message
      }
    }
  };

  // Send Poll
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

    setShowPollModal(false);
    setPollQuestionInput('');
    onNotify('Team poll posted to chat!');
  };

  // Vote on Poll
  const handleVotePoll = (msg: WebGroupChatMessage, optionText: string) => {
    if (!msg.pollData) return;
    const updatedOptions = msg.pollData.options.map((opt) => {
      // Remove current email if already in this option
      const filtered = opt.votes.filter((e) => e.toLowerCase() !== currentEmail);
      if (opt.text === optionText) {
        // Toggle vote on this option
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

  // Send Shared Document / Link
  const handleSendDoc = async () => {
    if (!activeProject) return;
    const title = docTitleInput.trim();
    const link = docUrlInput.trim();
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

    setShowDocModal(false);
    setDocTitleInput('');
    setDocUrlInput('');
    onNotify('Resource shared to group!');
  };

  // Toggle Pin message
  const handleTogglePin = async (msg: WebGroupChatMessage) => {
    if (!activeProject || !isCurrentUserAdmin) return;
    onUpdateVault((prev) => ({
      ...prev,
      groupMessages: prev.groupMessages.map((m) =>
        m.id === msg.id ? { ...m, isPinned: !m.isPinned } : m
      )
    }));

    if (user) {
      try {
        await updateDoc(doc(db, 'group_projects', activeProject.id, 'messages', msg.id), {
          isPinned: !msg.isPinned
        });
      } catch {
        // ignore
      }
    }
  };

  // Delete message
  const handleDeleteMessage = async (msg: WebGroupChatMessage) => {
    if (!activeProject) return;
    const isMe = msg.senderEmail.toLowerCase() === currentEmail;
    if (!isMe && !isCurrentUserAdmin) return;

    onUpdateVault((prev) => ({
      ...prev,
      groupMessages: prev.groupMessages.filter((m) => m.id !== msg.id)
    }));

    if (user) {
      try {
        await deleteDoc(doc(db, 'group_projects', activeProject.id, 'messages', msg.id));
      } catch {
        // ignore
      }
    }
  };

  // Quick Emoji reaction
  const handleAddReaction = (msg: WebGroupChatMessage, emoji: string) => {
    onUpdateVault((prev) => ({
      ...prev,
      groupMessages: prev.groupMessages.map((m) => {
        if (m.id !== msg.id) return m;
        const currentReactions = { ...(m.reactions || {}) };
        currentReactions[emoji] = (currentReactions[emoji] || 0) + 1;
        return { ...m, reactions: currentReactions };
      })
    }));
  };

  // Add Member by Email
  const handleAddMemberByEmail = (email: string) => {
    if (!activeProject) return;
    const clean = email.trim().toLowerCase();
    if (!clean || !clean.includes('@') || !clean.includes('.')) {
      onNotify('Please enter a valid classmate email.');
      return;
    }
    if (activeProject.memberEmails.map((e) => e.toLowerCase()).includes(clean)) {
      onNotify(`${clean} is already a member of ${activeProject.teamName}.`);
      return;
    }

    const updatedMembers = [...activeProject.memberEmails, clean];
    onUpdateVault((prev) => ({
      ...prev,
      groupProjects: prev.groupProjects.map((p) =>
        p.id === activeProject.id ? { ...p, memberEmails: updatedMembers } : p
      ),
      groupMessages: [
        ...prev.groupMessages,
        {
          id: uidGen('gm_notice'),
          projectId: activeProject.id,
          senderEmail: 'system@aura',
          senderName: 'AURA Team Bot',
          messageText: `🎉 ${clean} was invited to the group!`,
          timestamp: Date.now(),
          isPinned: false,
          messageType: 'NOTICE'
        }
      ]
    }));
    setShowAddMemberModal(false);
    onNotify(`Added ${clean} to ${activeProject.teamName}!`);
  };

  // Promote Member to Admin
  const handlePromoteToAdmin = (email: string) => {
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
    onNotify(`Promoted ${clean} to Group Admin.`);
  };

  // Demote Admin to Member
  const handleDemoteAdmin = (email: string) => {
    if (!activeProject || !isCurrentUserAdmin) return;
    const clean = email.trim().toLowerCase();
    const updatedAdmins = activeProject.adminEmails.filter((e) => e.toLowerCase() !== clean);
    onUpdateVault((prev) => ({
      ...prev,
      groupProjects: prev.groupProjects.map((p) =>
        p.id === activeProject.id ? { ...p, adminEmails: updatedAdmins } : p
      )
    }));
    onNotify(`Demoted ${clean} to Member.`);
  };

  // Remove Member
  const handleRemoveMember = (email: string) => {
    if (!activeProject || !isCurrentUserAdmin) return;
    const clean = email.trim().toLowerCase();
    onUpdateVault((prev) => ({
      ...prev,
      groupProjects: prev.groupProjects.map((p) =>
        p.id === activeProject.id
          ? {
              ...p,
              memberEmails: p.memberEmails.filter((e) => e.toLowerCase() !== clean),
              adminEmails: p.adminEmails.filter((e) => e.toLowerCase() !== clean)
            }
          : p
      )
    }));
    onNotify(`Removed ${clean} from ${activeProject.teamName}.`);
  };

  // Toggle Deliverable Completion
  const handleToggleTask = (task: WebGroupTask) => {
    if (!activeProject) return;
    onUpdateVault((prev) => ({
      ...prev,
      groupProjects: prev.groupProjects.map((p) => {
        if (p.id !== activeProject.id) return p;
        return {
          ...p,
          tasks: p.tasks.map((t) => (t.id === task.id ? { ...t, isCompleted: !t.isCompleted } : t))
        };
      })
    }));
  };

  // Delete Project
  const handleDeleteProject = (projId: string) => {
    if (!window.confirm('Are you sure you want to delete this group team and all its chat history?'))
      return;
    onUpdateVault((prev) => ({
      ...prev,
      groupProjects: prev.groupProjects.filter((p) => p.id !== projId),
      groupMessages: prev.groupMessages.filter((m) => m.projectId !== projId)
    }));
    onNotify('Group project deleted.');
  };

  // Export Transcript
  const handleExportChat = () => {
    if (!activeProject) return;
    const lines = [
      `# ${activeProject.teamName} • ${activeProject.projectTitle} (${activeProject.courseCode})`,
      `Target: ${activeProject.groupTarget}`,
      `Exported: ${new Date().toLocaleString()}`,
      `Members: ${activeProject.memberEmails.join(', ')}`,
      '',
      '--- CHAT TRANSCRIPT ---',
      ...projectMessages.map((m) => {
        const time = new Date(m.timestamp).toLocaleTimeString();
        return `[${time}] ${m.senderName} (${m.senderEmail}): ${m.messageText}`;
      })
    ];
    const text = lines.join('\n');
    navigator.clipboard.writeText(text);
    onNotify('Copied full chat transcript to clipboard!');
  };

  const tasks = activeProject?.tasks || [];
  const doneTasks = tasks.filter((t) => t.isCompleted).length;
  const taskProgressPct = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0;
  const pinnedMessages = projectMessages.filter((m) => m.isPinned);

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="aura-hero-card rounded-3xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center border border-emerald-400/30 shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-extrabold text-white">
                  Group Projects & Live Team Chat
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-[10px] font-extrabold text-emerald-300 uppercase tracking-wider">
                  Sync & Collaboration
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Create teams, set targets, invite coursemates by email, tag deliverables & chat in real time.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="aura-pill-btn px-4 py-2 bg-gradient-to-r from-emerald-400 to-sky-400 text-slate-950 text-xs shadow-md shadow-emerald-500/20"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Team
          </button>
        </div>

        {/* Group Selector Pills */}
        {vault.groupProjects.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pt-3 border-t border-white/10 mt-3 no-scrollbar">
            {vault.groupProjects.map((p) => {
              const isActive = p.id === activeProject?.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProjectId(p.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                    isActive
                      ? 'bg-emerald-400/20 border border-emerald-400 text-emerald-300'
                      : 'aura-subtle-surface text-slate-300 hover:border-white/30'
                  }`}
                >
                  <span>{p.avatarEmoji || '👥'}</span>
                  <span>{p.teamName}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Active Group Stage */}
      {activeProject ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column: Team Overview & Navigation */}
          <div className="space-y-4">
            <div className="aura-glass rounded-3xl p-4 sm:p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl border"
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
                    onClick={() => {
                      setVoiceHuddleActive(!voiceHuddleActive);
                      if (!voiceHuddleActive) {
                        onNotify('Live Voice Huddle Started! Audio channel connected.');
                      } else {
                        onNotify('Left Voice Huddle.');
                      }
                    }}
                    title={voiceHuddleActive ? 'Leave Voice Huddle' : 'Start / Join Voice Huddle'}
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
                        <span>Voice Call</span>
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
                  <button
                    type="button"
                    onClick={() => handleDeleteProject(activeProject.id)}
                    title="Delete Group"
                    className="w-8 h-8 rounded-xl aura-subtle-surface flex items-center justify-center text-rose-400 hover:border-rose-400/50 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Voice Huddle Active Floating Card */}
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

              {/* Target Banner */}
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-400/30">
                <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                  Target &amp; Milestone
                </div>
                <div className="text-xs font-extrabold text-amber-200 mt-0.5">
                  🎯 {activeProject.groupTarget || 'Complete final prototype & presentation'}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-semibold">Deliverables Complete</span>
                  <span className="font-extrabold text-emerald-400">
                    {doneTasks}/{tasks.length} ({taskProgressPct}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-all duration-300"
                    style={{ width: `${taskProgressPct}%` }}
                  />
                </div>
              </div>

              {/* Navigation Sub-Tabs */}
              <div className="flex gap-1.5 p-1 rounded-2xl bg-white/5 border border-white/10">
                <button
                  type="button"
                  onClick={() => setActiveTab('CHAT')}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    activeTab === 'CHAT'
                      ? 'bg-emerald-400 text-slate-950 shadow-md'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Chat
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('DELIVERABLES')}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    activeTab === 'DELIVERABLES'
                      ? 'bg-emerald-400 text-slate-950 shadow-md'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <FolderKanban className="w-3.5 h-3.5" />
                  Tasks ({tasks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('MEMBERS')}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    activeTab === 'MEMBERS'
                      ? 'bg-emerald-400 text-slate-950 shadow-md'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  Team ({activeProject.memberEmails.length})
                </button>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={handleExportChat}
                  className="flex-1 py-1.5 rounded-xl aura-subtle-surface text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5 hover:border-sky-400/50"
                >
                  <Copy className="w-3.5 h-3.5 text-sky-400" />
                  Export Chat
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddMemberModal(true)}
                  className="flex-1 py-1.5 rounded-xl aura-subtle-surface text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5 hover:border-emerald-400/50"
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
              <div className="aura-glass rounded-3xl p-4 sm:p-5 flex flex-col h-[600px] border border-white/15 shadow-2xl">
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
                        Start the team conversation! All messages are stored locally &amp; synced securely.
                      </p>
                    </div>
                  ) : (
                    projectMessages.map((msg) => {
                      const isMe = msg.senderEmail.toLowerCase() === currentEmail;
                      const isAdmin = activeProject.adminEmails
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
                            className={`max-w-[85%] rounded-2xl p-3 space-y-1.5 relative group ${
                              isMe
                                ? 'bg-gradient-to-r from-emerald-500/90 to-sky-500/90 text-white shadow-lg'
                                : 'bg-slate-800/80 border border-white/10 text-slate-100'
                            }`}
                          >
                            {/* Author & Timestamp Header */}
                            <div className="flex items-center justify-between gap-3 text-[11px] opacity-85">
                              <span className="font-extrabold flex items-center gap-1">
                                {isMe ? 'You' : msg.senderName}
                                {isAdmin && (
                                  <Crown className="w-3 h-3 text-amber-300 inline" title="Admin" />
                                )}
                              </span>
                              <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>

                            {/* Message Body */}
                            <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">
                              {msg.messageText}
                            </p>

                            {/* Interactive Poll Card */}
                            {msg.pollData && (
                              <div className="p-3 rounded-xl bg-black/35 border border-sky-400/40 text-xs space-y-2 mt-2">
                                <div className="font-extrabold text-sky-300 flex items-center gap-1.5">
                                  <span>📊</span>
                                  <span>{msg.pollData.question}</span>
                                </div>
                                <div className="space-y-1.5">
                                  {msg.pollData.options.map((opt) => {
                                    const totalVotes = msg.pollData!.options.reduce((acc, o) => acc + o.votes.length, 0);
                                    const voteCount = opt.votes.length;
                                    const hasVoted = opt.votes.some((e) => e.toLowerCase() === currentEmail);
                                    const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
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
                                          <span className="opacity-80">{voteCount} ({pct}%)</span>
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

                            {/* Shared Document Card */}
                            {msg.docData && (
                              <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-400/40 text-xs flex items-center justify-between gap-2 mt-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-base">📎</span>
                                  <div className="min-w-0">
                                    <div className="font-bold text-emerald-300 truncate">{msg.docData.title}</div>
                                    {msg.docData.linkOrFileName && (
                                      <div className="text-[10px] text-slate-400 truncate">{msg.docData.linkOrFileName}</div>
                                    )}
                                  </div>
                                </div>
                                {msg.docData.linkOrFileName && (
                                  <a
                                    href={msg.docData.linkOrFileName.startsWith('http') ? msg.docData.linkOrFileName : `https://${msg.docData.linkOrFileName}`}
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

                            {/* Reactions & Hover Actions */}
                            <div className="flex items-center justify-between gap-2 pt-1 mt-1 border-t border-white/10 text-[10px]">
                              <div className="flex items-center gap-1">
                                {['👍', '🎯', '🔥', '🚀'].map((em) => (
                                  <button
                                    key={em}
                                    type="button"
                                    onClick={() => handleAddReaction(msg, em)}
                                    className="px-1.5 py-0.5 rounded-md hover:bg-white/20 transition"
                                  >
                                    {em} {msg.reactions?.[em] ? `(${msg.reactions[em]})` : ''}
                                  </button>
                                ))}
                              </div>

                              <div className="flex items-center gap-1.5">
                                {isCurrentUserAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => handleTogglePin(msg)}
                                    title={msg.isPinned ? 'Unpin' : 'Pin'}
                                    className={`hover:text-amber-300 ${msg.isPinned ? 'text-amber-300' : 'opacity-60'}`}
                                  >
                                    <Pin className="w-3 h-3" />
                                  </button>
                                )}
                                {(isMe || isCurrentUserAdmin) && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMessage(msg)}
                                    title="Delete message"
                                    className="opacity-60 hover:text-rose-400"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Composer Dock */}
                <div className="pt-3 border-t border-white/10 space-y-2 shrink-0">
                  {/* Selected Tag Pill */}
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

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPollModal(true)}
                      title="Create Team Poll"
                      className="w-9 h-9 rounded-2xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-300 flex items-center justify-center shrink-0 transition text-sm"
                    >
                      📊
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowDocModal(true)}
                      title="Share Resource / Slide Link"
                      className="w-9 h-9 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 flex items-center justify-center shrink-0 transition text-sm"
                    >
                      📎
                    </button>

                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                      placeholder="Message your group team (use @name to mention)..."
                      className="aura-input flex-1 px-4 py-2.5 rounded-2xl text-xs sm:text-sm"
                    />

                    {/* Tag Deliverable dropdown trigger */}
                    {tasks.length > 0 && (
                      <select
                        aria-label="Tag deliverable to message"
                        value={selectedDeliverableTag}
                        onChange={(e) => setSelectedDeliverableTag(e.target.value)}
                        className="aura-input px-3 py-2.5 rounded-2xl text-xs bg-slate-900 border-white/15 max-w-[120px] truncate"
                      >
                        <option value="">🎯 Tag Task</option>
                        {tasks.map((t) => (
                          <option key={t.id} value={t.taskTitle}>
                            {t.taskTitle}
                          </option>
                        ))}
                      </select>
                    )}

                    {isCurrentUserAdmin && (
                      <label className="flex items-center gap-1 text-[11px] font-bold text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pinChecked}
                          onChange={(e) => setPinChecked(e.target.checked)}
                          className="rounded text-emerald-400"
                        />
                        <Pin className="w-3.5 h-3.5 text-amber-300" />
                      </label>
                    )}

                    <button
                      type="button"
                      onClick={handleSendMessage}
                      className="w-10 h-10 rounded-2xl bg-gradient-to-r from-emerald-400 to-sky-400 text-slate-950 flex items-center justify-center font-extrabold shadow-md hover:scale-105 active:scale-95 transition shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'DELIVERABLES' && (
              <div className="aura-glass rounded-3xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-white text-sm sm:text-base">
                    Group Deliverables &amp; Section Splits
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowAddTaskModal(true)}
                    className="aura-pill-btn px-3 py-1.5 bg-emerald-400/20 border border-emerald-400/40 text-emerald-300 text-xs hover:bg-emerald-400/30"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Assign Deliverable
                  </button>
                </div>

                {tasks.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-xs">
                    No deliverables defined yet. Split milestones across teammates!
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tasks.map((task) => (
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
                      Teammates &amp; Admin Privileges
                    </h4>
                    <p className="text-xs text-slate-400">
                      Coursemates added by login email can access this team and chat.
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
                    const isAdmin = activeProject.adminEmails
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
          </div>
        </div>
      ) : (
        <div className="aura-glass rounded-3xl p-10 text-center space-y-3">
          <Users className="w-12 h-12 text-slate-500 mx-auto" />
          <h3 className="text-base font-extrabold text-white">No Group Projects Yet</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Create your first group project team above to start delegating tasks, tracking milestone targets, and chatting live with coursemates!
          </p>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="aura-pill-btn px-4 py-2 bg-gradient-to-r from-emerald-400 to-sky-400 text-slate-950 text-xs font-bold"
          >
            Create Team Project
          </button>
        </div>
      )}

      {/* MODAL: Create New Team */}
      {showCreateModal && (
        <CreateTeamModal
          courses={vault.courses}
          creatorEmail={currentEmail}
          onClose={() => setShowCreateModal(false)}
          onCreate={(newProj) => {
            onUpdateVault((prev) => ({
              ...prev,
              groupProjects: [...prev.groupProjects, newProj]
            }));
            setSelectedProjectId(newProj.id);
            setShowCreateModal(false);
            onNotify(`Created '${newProj.teamName}' group project!`);
          }}
        />
      )}

      {/* MODAL: Group Settings & Admin Controls */}
      {showSettingsModal && activeProject && (
        <GroupSettingsModal
          project={activeProject}
          onClose={() => setShowSettingsModal(false)}
          onSave={(updated) => {
            onUpdateVault((prev) => ({
              ...prev,
              groupProjects: prev.groupProjects.map((p) => (p.id === updated.id ? updated : p))
            }));
            setShowSettingsModal(false);
            onNotify('Saved group settings and target!');
          }}
        />
      )}

      {/* MODAL: Add Member by Email */}
      {showAddMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl aura-glass p-5 space-y-4 border border-emerald-400/30">
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
              Enter the exact login email your teammate uses on this app/website (e.g. Google Sign-In email):
            </p>
            <input
              type="email"
              id="new_teammate_email_input"
              placeholder="coursemate@university.edu"
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
                className="aura-pill-btn px-4 py-1.5 bg-gradient-to-r from-emerald-400 to-sky-400 text-slate-950 text-xs font-extrabold"
              >
                Add Teammate
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
                onClick={() => {
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
                    onUpdateVault((prev) => ({
                      ...prev,
                      groupProjects: prev.groupProjects.map((p) =>
                        p.id === activeProject.id ? { ...p, tasks: [...p.tasks, newTask] } : p
                      )
                    }));
                    setShowAddTaskModal(false);
                    onNotify(`Added deliverable '${newTask.taskTitle}'!`);
                  }
                }}
                className="aura-pill-btn px-4 py-1.5 bg-gradient-to-r from-emerald-400 to-sky-400 text-slate-950 text-xs font-extrabold"
              >
                Create Task
              </button>
            </div>
        </div>
      )}

      {/* Modal: Create Team Poll */}
      {showPollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl aura-glass p-5 space-y-4 border border-sky-400/40">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-xl">📊</span>
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
                className="aura-pill-btn px-4 py-1.5 bg-gradient-to-r from-sky-400 to-emerald-400 text-slate-950 text-xs font-extrabold"
              >
                Post Poll to Chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Share Resource / Slide Link */}
      {showDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl aura-glass p-5 space-y-4 border border-emerald-400/40">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-xl">📎</span>
                <h4 className="font-extrabold text-white text-base">Share Document / Slide Link</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowDocModal(false)}
                className="w-7 h-7 rounded-full aura-subtle-surface flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-300 uppercase">Document Title</label>
                <input
                  type="text"
                  value={docTitleInput}
                  onChange={(e) => setDocTitleInput(e.target.value)}
                  placeholder="e.g. Sprint Architecture Slide Deck"
                  className="aura-input w-full px-4 py-2 rounded-xl mt-1"
                />
              </div>

              <div>
                <label className="font-bold text-slate-300 uppercase">URL / Google Drive Link</label>
                <input
                  type="text"
                  value={docUrlInput}
                  onChange={(e) => setDocUrlInput(e.target.value)}
                  placeholder="https://docs.google.com/presentation/..."
                  className="aura-input w-full px-4 py-2 rounded-xl mt-1"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowDocModal(false)}
                className="px-3 py-1.5 rounded-xl aura-subtle-surface text-xs font-bold text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendDoc}
                className="aura-pill-btn px-4 py-1.5 bg-gradient-to-r from-emerald-400 to-sky-400 text-slate-950 text-xs font-extrabold"
              >
                Share to Team Chat
              </button>
            </div>
          </div>
        </div>
      )}
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
            <label className="font-bold text-slate-300 uppercase">Team Profile Avatar</label>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {EMOJI_OPTIONS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setEmoji(em)}
                  className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center border transition ${
                    emoji === em ? 'bg-emerald-400/20 border-emerald-400 scale-110' : 'aura-subtle-surface'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-300 uppercase">Accent Color</label>
            <div className="flex items-center gap-2 mt-1.5">
              {COLOR_OPTIONS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColorHex(hex)}
                  className={`w-7 h-7 rounded-full border transition ${
                    colorHex === hex ? 'scale-125 border-white' : 'border-white/20'
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-300 uppercase">
              Invite Members by Email (comma-separated)
            </label>
            <input
              type="text"
              value={memberEmailsInput}
              onChange={(e) => setMemberEmailsInput(e.target.value)}
              placeholder="alex@university.edu, sara@gmail.com"
              className="aura-input w-full px-4 py-2 rounded-xl mt-1"
            />
          </div>

          <div>
            <label className="font-bold text-slate-300 uppercase">Days Until Submission</label>
            <input
              type="number"
              min="1"
              value={daysDue}
              onChange={(e) => setDaysDue(e.target.value)}
              className="aura-input w-full px-4 py-2 rounded-xl mt-1"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl aura-subtle-surface text-xs font-bold text-slate-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!title.trim()) return;
              const extraMembers = memberEmailsInput
                .split(',')
                .map((e) => e.trim().toLowerCase())
                .filter((e) => e.includes('@'));
              const allMembers = Array.from(new Set([creatorEmail, ...extraMembers]));
              const newProj: WebGroupProject = {
                id: uidGen('gp'),
                courseCode: courseCode.trim().toUpperCase() || 'GENERAL',
                teamName: teamName.trim() || 'Team 1',
                projectTitle: title.trim(),
                objective: target.trim(),
                groupTarget: target.trim(),
                avatarEmoji: emoji,
                avatarColorHex: colorHex,
                creatorEmail,
                adminEmails: [creatorEmail],
                memberEmails: allMembers,
                dueEpochMillis: Date.now() + (parseInt(daysDue) || 14) * 86_400_000,
                tasks: []
              };
              onCreate(newProj);
            }}
            className="aura-pill-btn px-4 py-1.5 bg-gradient-to-r from-emerald-400 to-sky-400 text-slate-950 text-xs font-extrabold"
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
  const [emoji, setEmoji] = useState(project.avatarEmoji);
  const [colorHex, setColorHex] = useState(project.avatarColorHex);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl aura-glass p-5 space-y-4 border border-amber-400/30">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <h4 className="font-extrabold text-white text-base">Group Admin Controls</h4>
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
            <label className="font-bold text-slate-300 uppercase">Team Name</label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className="aura-input w-full px-4 py-2 rounded-xl mt-1"
            />
          </div>
          <div>
            <label className="font-bold text-slate-300 uppercase">Project Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="aura-input w-full px-4 py-2 rounded-xl mt-1"
            />
          </div>
          <div>
            <label className="font-bold text-slate-300 uppercase">Group Target</label>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="aura-input w-full px-4 py-2 rounded-xl mt-1"
            />
          </div>
          <div>
            <label className="font-bold text-slate-300 uppercase">Avatar Icon</label>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {EMOJI_OPTIONS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setEmoji(em)}
                  className={`w-8 h-8 rounded-xl text-base flex items-center justify-center border transition ${
                    emoji === em ? 'bg-amber-400/20 border-amber-400 scale-110' : 'aura-subtle-surface'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="font-bold text-slate-300 uppercase">Accent Color</label>
            <div className="flex items-center gap-2 mt-1.5">
              {COLOR_OPTIONS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColorHex(hex)}
                  className={`w-7 h-7 rounded-full border transition ${
                    colorHex === hex ? 'scale-125 border-white' : 'border-white/20'
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
            className="px-3 py-1.5 rounded-xl aura-subtle-surface text-xs font-bold text-slate-300"
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
                avatarEmoji: emoji,
                avatarColorHex: colorHex
              });
            }}
            className="aura-pill-btn px-4 py-1.5 bg-gradient-to-r from-amber-400 to-emerald-400 text-slate-950 text-xs font-extrabold"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
