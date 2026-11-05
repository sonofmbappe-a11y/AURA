import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import {
  BarChart3,
  BellRing,
  BookmarkPlus,
  Cast,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  DoorOpen,
  ExternalLink,
  Flame,
  Hand,
  Lock,
  LogIn,
  LogOut,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Monitor,
  Pause,
  Pin,
  Play,
  Plus,
  QrCode,
  Radio,
  RotateCw,
  Send,
  Share2,
  Shield,
  Sparkles,
  Trash2,
  Unlock,
  Users,
  Video,
  VideoOff,
  Volume2,
  Zap
} from 'lucide-react';
import {
  buildJitsiVoiceUrl,
  db,
  detectBrowserPlatform,
  normalizeJoinCode,
  signInWithGoogleBrowser
} from '../firebase';
import { uidGen } from '../storage';
import type {
  AuraLocalVault,
  CloudParticipant,
  CloudRoomMessage,
  CloudSharedCard,
  CloudStudyRoom
} from '../types';
import {
  CreatePollModal,
  CustomStageTimerModal,
  HostRoomModal,
  ModerateScholarModal,
  PinSpotlightModal,
  QrInviteModal,
  SessionRecapModal,
  ShareFlashcardModal
} from './LiveStageModals';

interface Props {
  user: User | null;
  vault: AuraLocalVault;
  onUpdateVault: (updater: (prev: AuraLocalVault) => AuraLocalVault) => void;
  initialRoomCode: string | null;
  onNotify: (msg: string) => void;
}

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function mapDocToRoom(id: string, d: Record<string, unknown>): CloudStudyRoom {
  const code = String(d.joinCode || id.replace(/^room_/, '')).toUpperCase();
  return {
    id,
    ownerId: String(d.ownerId || ''),
    ownerName: String(d.ownerName || 'Scholar'),
    courseCode: String(d.courseCode || 'GEN'),
    roomTitle: String(d.roomTitle || 'Study Session'),
    focusTopic: String(d.focusTopic || ''),
    status: String(d.status || 'ACTIVE'),
    visibility: String(d.visibility || 'CAMPUS'),
    activeMinutes: Number(d.activeMinutes || 45),
    joinCode: code,
    timerState: String(d.timerState || 'IDLE'),
    timerEndEpochMillis: Number(d.timerEndEpochMillis || 0),
    timerRemainingSeconds: Number(d.timerRemainingSeconds || 0),
    sharedBoardNote: String(d.sharedBoardNote || ''),
    waitingRoomEnabled: Boolean(d.waitingRoomEnabled),
    whiteboardLocked: Boolean(d.whiteboardLocked),
    coHostIds: Array.isArray(d.coHostIds) ? d.coHostIds.map(String) : [],
    voiceRoomUrl: String(d.voiceRoomUrl || buildJitsiVoiceUrl(code, id)),
    activePollQuestion: String(d.activePollQuestion || ''),
    activePollOptions: Array.isArray(d.activePollOptions) ? d.activePollOptions.map(String) : [],
    activePollCorrectIndex:
      typeof d.activePollCorrectIndex === 'number' ? d.activePollCorrectIndex : -1,
    activePollRevealed: Boolean(d.activePollRevealed),
    spotlightCardText: String(d.spotlightCardText || '')
  };
}

function mapDocToParticipant(
  id: string,
  x: Record<string, unknown>,
  fallbackVis: string,
  fallbackOwner: string
): CloudParticipant {
  return {
    id,
    userId: String(x.userId || id),
    displayName: String(x.displayName || 'Scholar'),
    cityOrCampus: String(x.cityOrCampus || 'Remote'),
    studyStatus: String(x.studyStatus || 'FOCUSING'),
    handRaised: Boolean(x.handRaised),
    reactionEmoji: String(x.reactionEmoji || '🎯'),
    roomVisibility: String(x.roomVisibility || fallbackVis),
    roomOwnerId: String(x.roomOwnerId || fallbackOwner),
    admissionStatus: String(x.admissionStatus || 'ADMITTED'),
    pollVoteIndex: typeof x.pollVoteIndex === 'number' ? x.pollVoteIndex : -1,
    devicePlatform: String(x.devicePlatform || 'WEB_BROWSER'),
    isMuted: Boolean(x.isMuted),
    cameraOn: Boolean(x.cameraOn),
    isMutedByHost: Boolean(x.isMutedByHost)
  };
}

function playDoorKnockChime(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [587.33, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, now + i * 0.13);
      gain.gain.exponentialRampToValueAtTime(0.08, now + i * 0.13 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.13 + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.13);
      osc.stop(now + i * 0.13 + 0.26);
    });
  } catch {
    // Ignore autoplay restriction if user hasn't tapped yet
  }
}

export const LiveStudyStage: React.FC<Props> = ({
  user,
  vault,
  onUpdateVault,
  initialRoomCode,
  onNotify
}) => {
  const [campusRooms, setCampusRooms] = useState<CloudStudyRoom[]>([]);
  const [myHostedRooms, setMyHostedRooms] = useState<CloudStudyRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [liveRoom, setLiveRoom] = useState<CloudStudyRoom | null>(null);
  const [myDirectParticipant, setMyDirectParticipant] = useState<CloudParticipant | null>(null);
  const [participants, setParticipants] = useState<CloudParticipant[]>([]);
  const [messages, setMessages] = useState<CloudRoomMessage[]>([]);
  const [sharedCards, setSharedCards] = useState<CloudSharedCard[]>([]);

  const [joinCodeInput, setJoinCodeInput] = useState(initialRoomCode || '');
  const [cityBadge, setCityBadge] = useState(vault.profile.institution || 'Remote Browser');
  const [isJoiningCode, setIsJoiningCode] = useState(false);
  const [autoJoinedInitial, setAutoJoinedInitial] = useState(false);

  // Stage Sub-UI State
  const [stageTab, setStageTab] = useState<'BOARD' | 'CHAT' | 'CARDS'>('BOARD');
  const [boardDraft, setBoardDraft] = useState('');
  const [boardDirty, setBoardDirty] = useState(false);
  const [chatText, setChatText] = useState('');
  const [chatType, setChatType] = useState<'CHAT' | 'QUESTION' | 'INSIGHT'>('CHAT');
  const [liveSeconds, setLiveSeconds] = useState(25 * 60);

  // Modals State
  const [showHostModal, setShowHostModal] = useState(false);
  const [isHostingRoom, setIsHostingRoom] = useState(false);
  const [hostModalError, setHostModalError] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showSpotlightModal, setShowSpotlightModal] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showCustomTimerModal, setShowCustomTimerModal] = useState(false);
  const [showRecapModal, setShowRecapModal] = useState(false);
  const [moderatingParticipant, setModeratingParticipant] = useState<CloudParticipant | null>(null);

  // In-App Video Stage & Screen Cast State
  const [isCastingScreen, setIsCastingScreen] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isMeetingExpanded, setIsMeetingExpanded] = useState(false);
  const [isMyMicMuted, setIsMyMicMuted] = useState(false);
  const [isMyCameraOn, setIsMyCameraOn] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; left: number }[]>([]);
  const [chatFilter, setChatFilter] = useState<'ALL' | 'QUESTION' | 'INSIGHT' | 'CHAT'>('ALL');

  const triggerFloatingReaction = (emoji: string) => {
    const id = uidGen('fx');
    const left = 15 + Math.random() * 70;
    setFloatingReactions((prev) => [...prev.slice(-12), { id, emoji, left }]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 1800);
  };

  const handRaisedScholars = useMemo(
    () => participants.filter((p) => p.handRaised && p.admissionStatus !== 'REMOVED'),
    [participants]
  );

  const handleCallOnScholar = async (targetUid: string) => {
    if (!liveRoom || !user) return;
    try {
      const pRef = doc(db, 'study_rooms', liveRoom.id, 'participants', targetUid);
      await updateDoc(pRef, {
        handRaised: false,
        isMuted: false,
        isMutedByHost: false,
        updatedAt: serverTimestamp()
      });
      onNotify('🎙️ Floor granted to scholar: Hand cleared & mic unmuted.');
    } catch (err) {
      onNotify('Could not call on scholar: ' + ((err as Error)?.message || 'error'));
    }
  };

  const handleLowerAllHands = async () => {
    if (!liveRoom || !user) return;
    try {
      for (const p of handRaisedScholars) {
        const pRef = doc(db, 'study_rooms', liveRoom.id, 'participants', p.userId);
        await updateDoc(pRef, {
          handRaised: false,
          updatedAt: serverTimestamp()
        }).catch(() => {});
      }
      onNotify('Lowered all hands on stage.');
    } catch (err) {
      onNotify('Could not lower hands: ' + ((err as Error)?.message || 'error'));
    }
  };

  const handleApplySprintPreset = async (mins: number, label: string) => {
    if (!liveRoom || !user) return;
    try {
      await updateDoc(doc(db, 'study_rooms', liveRoom.id), {
        activeMinutes: mins,
        timerState: 'RUNNING',
        timerEndEpochMillis: Date.now() + mins * 60 * 1000,
        timerRemainingSeconds: mins * 60,
        updatedAt: serverTimestamp()
      });
      onNotify(`⚡ ${label} started: ${mins}-minute synchronized focus clock running!`);
    } catch (err) {
      onNotify('Could not start sprint: ' + ((err as Error)?.message || 'error'));
    }
  };

  const handleHostMuteParticipant = async (targetUid: string, mute: boolean) => {
    if (!liveRoom || !user) return;
    try {
      const pRef = doc(db, 'study_rooms', liveRoom.id, 'participants', targetUid);
      await updateDoc(pRef, {
        isMuted: mute,
        isMutedByHost: mute,
        updatedAt: serverTimestamp()
      });
      onNotify(mute ? 'Muted scholar on stage.' : 'Unmuted scholar.');
    } catch (err) {
      onNotify('Could not update scholar mic: ' + ((err as Error)?.message || 'error'));
    }
  };

  const handleHostMuteAll = async () => {
    if (!liveRoom || !user) return;
    try {
      const rRef = doc(db, 'study_rooms', liveRoom.id);
      await updateDoc(rRef, {
        muteAllTimestamp: Date.now(),
        updatedAt: serverTimestamp()
      });
      for (const p of participants) {
        if (p.userId !== user.uid && p.admissionStatus !== 'REMOVED') {
          const pRef = doc(db, 'study_rooms', liveRoom.id, 'participants', p.userId);
          await updateDoc(pRef, {
            isMuted: true,
            isMutedByHost: true,
            updatedAt: serverTimestamp()
          }).catch(() => {});
        }
      }
      onNotify('🔇 Muted all other scholars on stage.');
    } catch (err) {
      onNotify('Could not mute all scholars: ' + ((err as Error)?.message || 'error'));
    }
  };

  const startScreenCast = async () => {
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        onNotify('Screen capture is supported in modern desktop browsers (Chrome, Edge, Safari 13+).');
        return;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as MediaTrackConstraints,
        audio: false
      });
      setScreenStream(stream);
      setIsCastingScreen(true);
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
      }
      stream.getVideoTracks()[0].onended = () => {
        stopScreenCast();
      };
      onNotify('🔴 Live Screen Cast started! Broadcasting your screen.');
    } catch (err) {
      if ((err as Error)?.name !== 'NotAllowedError') {
        onNotify('Screen casting cancelled.');
      }
    }
  };

  const stopScreenCast = () => {
    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
    }
    setScreenStream(null);
    setIsCastingScreen(false);
    onNotify('Screen cast ended.');
  };

  const toggleMyMic = async () => {
    const nextMute = !isMyMicMuted;
    setIsMyMicMuted(nextMute);
    if (liveRoom && user) {
      try {
        const pRef = doc(db, 'study_rooms', liveRoom.id, 'participants', user.uid);
        await updateDoc(pRef, {
          isMuted: nextMute,
          isMutedByHost: false,
          updatedAt: serverTimestamp()
        });
        onNotify(nextMute ? 'Mic muted.' : 'Mic unmuted.');
      } catch (err) {
        onNotify('Could not update mic: ' + ((err as Error)?.message || 'error'));
      }
    }
  };

  const toggleMyCamera = async () => {
    const nextCam = !isMyCameraOn;
    setIsMyCameraOn(nextCam);
    if (liveRoom && user) {
      try {
        const pRef = doc(db, 'study_rooms', liveRoom.id, 'participants', user.uid);
        await updateDoc(pRef, {
          cameraOn: nextCam,
          updatedAt: serverTimestamp()
        });
        onNotify(nextCam ? 'Camera activated.' : 'Camera turned off.');
      } catch (err) {
        onNotify('Could not update camera: ' + ((err as Error)?.message || 'error'));
      }
    }
  };

  useEffect(() => {
    if (isCastingScreen && screenStream && screenVideoRef.current) {
      screenVideoRef.current.srcObject = screenStream;
    }
  }, [isCastingScreen, screenStream]);

  useEffect(() => {
    return () => {
      if (screenStream) {
        screenStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [screenStream]);

  const knownWaitingIdsRef = useRef<Set<string>>(new Set());
  const platformBadge = useMemo(() => detectBrowserPlatform(), []);

  // 1. Observe Open Campus Lobby Rooms + User's Own Hosted Rooms (including Private UNLISTED rooms)
  useEffect(() => {
    if (!user) {
      setCampusRooms([]);
      setMyHostedRooms([]);
      return;
    }
    const qCampus = query(
      collection(db, 'study_rooms'),
      where('visibility', '==', 'CAMPUS'),
      limit(35)
    );
    const unsubCampus = onSnapshot(
      qCampus,
      (snap) => {
        const list = snap.docs
          .map((d) => mapDocToRoom(d.id, d.data()))
          .filter((r) => r.status !== 'COMPLETED');
        setCampusRooms(list);
      },
      (err) => console.warn('Lobby listener error:', err)
    );

    const qMine = query(
      collection(db, 'study_rooms'),
      where('ownerId', '==', user.uid),
      limit(20)
    );
    const unsubMine = onSnapshot(
      qMine,
      (snap) => {
        const list = snap.docs
          .map((d) => mapDocToRoom(d.id, d.data()))
          .filter((r) => r.status !== 'COMPLETED');
        setMyHostedRooms(list);
      },
      (err) => console.warn('Hosted rooms listener error:', err)
    );

    return () => {
      unsubCampus();
      unsubMine();
    };
  }, [user]);

  // 2. Observe Active Room Document + My Own Participant Document (Instant Knock -> Admit Detection)
  useEffect(() => {
    if (!user || !selectedRoomId) {
      setLiveRoom(null);
      setMyDirectParticipant(null);
      knownWaitingIdsRef.current = new Set();
      return;
    }

    const roomRef = doc(db, 'study_rooms', selectedRoomId);
    const unsubRoom = onSnapshot(
      roomRef,
      (snap) => {
        if (!snap.exists()) {
          setLiveRoom(null);
          setSelectedRoomId(null);
          onNotify('Study session ended or was closed by the host.');
          return;
        }
        const mapped = mapDocToRoom(snap.id, snap.data());
        setLiveRoom(mapped);
        setBoardDraft((prev) => (boardDirty ? prev : mapped.sharedBoardNote));
      },
      (err) => {
        console.warn('Room listener error:', err);
        setLiveRoom(null);
      }
    );

    const myPartRef = doc(db, 'study_rooms', selectedRoomId, 'participants', user.uid);
    const unsubMe = onSnapshot(
      myPartRef,
      (snap) => {
        if (!snap.exists()) {
          setMyDirectParticipant(null);
          return;
        }
        const mapped = mapDocToParticipant(snap.id, snap.data(), 'CAMPUS', '');
        setMyDirectParticipant(mapped);
        if (typeof snap.data()?.isMuted === 'boolean') {
          setIsMyMicMuted(Boolean(snap.data()?.isMuted));
        }
        if (typeof snap.data()?.cameraOn === 'boolean') {
          setIsMyCameraOn(Boolean(snap.data()?.cameraOn));
        }
      },
      () => setMyDirectParticipant(null)
    );

    return () => {
      unsubRoom();
      unsubMe();
    };
  }, [user, selectedRoomId, boardDirty, onNotify]);

  // 3. Observe Subcollections (participants, messages, shared_cards) with Rule-Aligned Filters
  useEffect(() => {
    if (!user || !liveRoom) {
      setParticipants([]);
      setMessages([]);
      setSharedCards([]);
      return;
    }

    const filterField =
      liveRoom.visibility === 'CAMPUS' || liveRoom.visibility === 'UNLISTED'
        ? where('roomVisibility', '==', liveRoom.visibility)
        : where('roomOwnerId', '==', liveRoom.ownerId);

    const pUnsub = onSnapshot(
      query(collection(db, 'study_rooms', liveRoom.id, 'participants'), filterField, limit(60)),
      (snap) => {
        const list = snap.docs.map((d) =>
          mapDocToParticipant(d.id, d.data(), liveRoom.visibility, liveRoom.ownerId)
        );
        setParticipants(list);

        // Alert Host / Co-Host immediately when a new scholar knocks in the Waiting Room!
        const amModerator =
          liveRoom.ownerId === user.uid || liveRoom.coHostIds.includes(user.uid);
        if (amModerator) {
          const currentWaiting = list.filter((p) => p.admissionStatus === 'WAITING');
          for (const guest of currentWaiting) {
            if (!knownWaitingIdsRef.current.has(guest.userId)) {
              knownWaitingIdsRef.current.add(guest.userId);
              playDoorKnockChime();
              onNotify(`🚪 ${guest.displayName} is knocking to join! Tap Admit at the top.`);
            }
          }
          const activeSet = new Set(currentWaiting.map((g) => g.userId));
          knownWaitingIdsRef.current.forEach((uid) => {
            if (!activeSet.has(uid)) knownWaitingIdsRef.current.delete(uid);
          });
        }
      },
      (err) => console.warn('Participants listener error:', err)
    );

    const mUnsub = onSnapshot(
      query(collection(db, 'study_rooms', liveRoom.id, 'messages'), filterField, limit(80)),
      (snap) => {
        setMessages(
          snap.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              authorId: String(x.authorId || ''),
              authorName: String(x.authorName || 'Scholar'),
              text: String(x.text || ''),
              messageType: String(x.messageType || 'CHAT'),
              roomVisibility: String(x.roomVisibility || liveRoom.visibility),
              roomOwnerId: String(x.roomOwnerId || liveRoom.ownerId)
            };
          })
        );
      },
      (err) => console.warn('Messages listener error:', err)
    );

    const cUnsub = onSnapshot(
      query(collection(db, 'study_rooms', liveRoom.id, 'shared_cards'), filterField, limit(80)),
      (snap) => {
        setSharedCards(
          snap.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              authorId: String(x.authorId || ''),
              authorName: String(x.authorName || 'Scholar'),
              courseCode: String(x.courseCode || liveRoom.courseCode),
              question: String(x.question || ''),
              answer: String(x.answer || ''),
              roomVisibility: String(x.roomVisibility || liveRoom.visibility),
              roomOwnerId: String(x.roomOwnerId || liveRoom.ownerId)
            };
          })
        );
      },
      (err) => console.warn('Shared cards listener error:', err)
    );

    return () => {
      pUnsub();
      mUnsub();
      cUnsub();
    };
  }, [user, liveRoom?.id, liveRoom?.visibility, liveRoom?.ownerId, liveRoom?.coHostIds, onNotify]);

  // 4. Synchronized Room Countdown Ticker
  useEffect(() => {
    if (!liveRoom) return;
    const calc = () => {
      if (liveRoom.timerState === 'RUNNING' && liveRoom.timerEndEpochMillis > 0) {
        return Math.max(0, Math.floor((liveRoom.timerEndEpochMillis - Date.now()) / 1000));
      }
      return liveRoom.timerRemainingSeconds > 0
        ? liveRoom.timerRemainingSeconds
        : liveRoom.activeMinutes * 60;
    };
    setLiveSeconds(calc());
    if (liveRoom.timerState !== 'RUNNING') return;
    const id = window.setInterval(() => setLiveSeconds(calc()), 1000);
    return () => window.clearInterval(id);
  }, [
    liveRoom?.timerState,
    liveRoom?.timerEndEpochMillis,
    liveRoom?.timerRemainingSeconds,
    liveRoom?.activeMinutes
  ]);

  /**
   * Rule-exact participant upsert matching `/firestore.rules`:
   * Includes `roomId`, `focusMinutesLogged`, bounded strings, and valid `studyStatus`.
   */
  const upsertMyPresence = async (
    room: CloudStudyRoom,
    status: 'FOCUSING' | 'BREAK' | 'QUIZZING' | 'READY' = 'FOCUSING',
    handRaised = false,
    emoji = '👋',
    overrideCity?: string,
    overrideMuted?: boolean,
    overrideCamera?: boolean
  ) => {
    if (!user) return;
    const pRef = doc(db, 'study_rooms', room.id, 'participants', user.uid);
    const existing = await getDoc(pRef);
    const displayName =
      (user.displayName || vault.profile.name || 'Scholar').trim().slice(0, 80) || 'Scholar';
    const city = (overrideCity ?? cityBadge ?? 'Remote Browser').trim().slice(0, 80);
    const isHostOrCoHost = room.ownerId === user.uid || room.coHostIds.includes(user.uid);
    const mutedVal = overrideMuted !== undefined ? overrideMuted : isMyMicMuted;
    const camVal = overrideCamera !== undefined ? overrideCamera : isMyCameraOn;

    if (existing.exists()) {
      const data = existing.data();
      const curAdmission = String(data?.admissionStatus || 'ADMITTED');
      if (curAdmission === 'REMOVED') {
        throw new Error('The host removed you from this study session.');
      }

      const visibilityChanged = data?.roomVisibility !== room.visibility;
      const canUpgradeFromWaiting =
        curAdmission === 'WAITING' && (!room.waitingRoomEnabled || isHostOrCoHost);

      if (!visibilityChanged && !canUpgradeFromWaiting) {
        await updateDoc(pRef, {
          displayName,
          cityOrCampus: city,
          studyStatus: status,
          handRaised,
          reactionEmoji: emoji.slice(0, 16),
          devicePlatform: platformBadge,
          isMuted: mutedVal,
          cameraOn: camVal,
          updatedAt: serverTimestamp()
        });
        return;
      }
      await deleteDoc(pRef);
    }

    const initialAdmission =
      room.waitingRoomEnabled && !isHostOrCoHost ? 'WAITING' : 'ADMITTED';

    await setDoc(pRef, {
      roomId: room.id,
      roomOwnerId: room.ownerId,
      roomVisibility: room.visibility === 'UNLISTED' ? 'UNLISTED' : 'CAMPUS',
      userId: user.uid,
      displayName,
      cityOrCampus: city,
      studyStatus: status,
      handRaised,
      reactionEmoji: emoji.slice(0, 16),
      focusMinutesLogged: 0,
      admissionStatus: initialAdmission,
      pollVoteIndex: -1,
      devicePlatform: platformBadge,
      isMuted: mutedVal,
      cameraOn: camVal,
      isMutedByHost: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  };

  const enterExistingRoom = async (roomId: string, fallbackCode?: string) => {
    if (!user) return;
    setIsJoiningCode(true);
    try {
      const snap = await getDoc(doc(db, 'study_rooms', roomId));
      let found: CloudStudyRoom | null = snap.exists() ? mapDocToRoom(snap.id, snap.data()) : null;

      if (!found && fallbackCode) {
        const candidateId = `room_${fallbackCode.trim().toUpperCase()}`;
        if (candidateId !== roomId) {
          const directSnap = await getDoc(doc(db, 'study_rooms', candidateId));
          if (directSnap.exists()) {
            found = mapDocToRoom(directSnap.id, directSnap.data());
          }
        }
      }

      if (!found && fallbackCode) {
        try {
          const fallback = await getDocs(
            query(
              collection(db, 'study_rooms'),
              where('visibility', '==', 'CAMPUS'),
              where('joinCode', '==', fallbackCode.trim().toUpperCase()),
              limit(1)
            )
          );
          if (!fallback.empty) {
            found = mapDocToRoom(fallback.docs[0].id, fallback.docs[0].data());
          }
        } catch {
          // List query ignored if permission/index restricted
        }
      }

      if (!found) {
        onNotify(
          fallbackCode
            ? `No live session found with code "${fallbackCode}". Double-check the 6-character code with your host.`
            : 'That study room is no longer available.'
        );
        return;
      }

      if (found.status === 'COMPLETED') {
        onNotify(`"${found.roomTitle}" has already ended.`);
        return;
      }

      await upsertMyPresence(found, 'FOCUSING', false, '👋');
      setBoardDirty(false);
      setSelectedRoomId(found.id);

      const isModerator = found.ownerId === user.uid || found.coHostIds.includes(user.uid);
      if (found.waitingRoomEnabled && !isModerator) {
        onNotify(`🚪 Knocked on "${found.roomTitle}"! Waiting for ${found.ownerName} to tap Admit.`);
      } else {
        onNotify(`Joined "${found.roomTitle}" (${found.courseCode})!`);
      }
    } catch (e: unknown) {
      onNotify((e as Error)?.message || 'Could not join study room. Please try again.');
    } finally {
      setIsJoiningCode(false);
    }
  };

  const joinByCode = async (rawInput: string) => {
    const clean = normalizeJoinCode(rawInput);
    if (clean.length < 4) {
      onNotify('Enter a valid 6-character Join Code or paste the invite link.');
      return;
    }
    await enterExistingRoom(`room_${clean}`, clean);
  };

  // Auto-join if user opened an invite link (?room=CODE)
  useEffect(() => {
    if (user && initialRoomCode && !autoJoinedInitial && !selectedRoomId) {
      setAutoJoinedInitial(true);
      joinByCode(initialRoomCode);
    }
  }, [user, initialRoomCode, autoJoinedInitial, selectedRoomId]);

  const handleHostCreateRoom = async (payload: {
    courseCode: string;
    roomTitle: string;
    focusTopic: string;
    activeMinutes: number;
    visibility: 'CAMPUS' | 'UNLISTED';
    waitingRoomEnabled: boolean;
    whiteboardLocked: boolean;
    cityBadge: string;
  }) => {
    if (!user) return;
    setIsHostingRoom(true);
    setHostModalError('');
    const code = generateJoinCode();
    const roomId = `room_${code}`;
    const mins = Math.round(Math.max(5, Math.min(360, payload.activeMinutes || 50)));
    const ownerName =
      (user.displayName || vault.profile.name || 'Scholar').trim().slice(0, 80) || 'Scholar';
    const voiceUrl = buildJitsiVoiceUrl(code, roomId);
    const welcomeBoard = `Welcome to ${payload.roomTitle}! Drop formulas, past-paper notes, or sprint goals here.`.slice(
      0,
      2000
    );

    try {
      await setDoc(doc(db, 'study_rooms', roomId), {
        ownerId: user.uid,
        ownerName,
        courseCode: payload.courseCode.slice(0, 24),
        roomTitle: payload.roomTitle.slice(0, 120),
        focusTopic: payload.focusTopic.slice(0, 240),
        status: 'ACTIVE',
        visibility: payload.visibility,
        activeMinutes: mins,
        joinCode: code,
        timerState: 'IDLE',
        timerEndEpochMillis: 0,
        timerRemainingSeconds: mins * 60,
        sharedBoardNote: welcomeBoard,
        waitingRoomEnabled: payload.waitingRoomEnabled,
        whiteboardLocked: payload.whiteboardLocked,
        coHostIds: [],
        voiceRoomUrl: voiceUrl,
        activePollQuestion: '',
        activePollOptions: [],
        activePollCorrectIndex: -1,
        activePollRevealed: false,
        spotlightCardText: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      const createdStub: CloudStudyRoom = {
        id: roomId,
        ownerId: user.uid,
        ownerName,
        courseCode: payload.courseCode,
        roomTitle: payload.roomTitle,
        focusTopic: payload.focusTopic,
        status: 'ACTIVE',
        visibility: payload.visibility,
        activeMinutes: mins,
        joinCode: code,
        timerState: 'IDLE',
        timerEndEpochMillis: 0,
        timerRemainingSeconds: mins * 60,
        sharedBoardNote: welcomeBoard,
        waitingRoomEnabled: payload.waitingRoomEnabled,
        whiteboardLocked: payload.whiteboardLocked,
        coHostIds: [],
        voiceRoomUrl: voiceUrl,
        activePollQuestion: '',
        activePollOptions: [],
        activePollCorrectIndex: -1,
        activePollRevealed: false,
        spotlightCardText: ''
      };

      setCityBadge(payload.cityBadge);
      setShowHostModal(false);
      setBoardDirty(false);
      setSelectedRoomId(roomId);
      try {
        await upsertMyPresence(createdStub, 'FOCUSING', false, '🎙️', payload.cityBadge);
      } catch (presenceErr) {
        console.warn('Initial presence upsert warning:', presenceErr);
      }
      onNotify(`🎉 Room Live! Share Code ${code} or QR Link with Android & iPhone classmates.`);
    } catch (e: unknown) {
      const msg = (e as Error)?.message || 'Failed to create study session.';
      setHostModalError(msg);
      onNotify(msg);
    } finally {
      setIsHostingRoom(false);
    }
  };

  /**
   * 1-Click Instant Host: Launches a rapid 50m sprint immediately without opening a lengthy form
   */
  const handleInstantQuickHost = async () => {
    if (!user) return;
    const defaultCourse = vault.courses[0]?.code || 'CS301';
    await handleHostCreateRoom({
      courseCode: defaultCourse,
      roomTitle: `${defaultCourse} Live Study Session`,
      focusTopic: 'Collaborative Past-Paper Drill & Deep Focus',
      activeMinutes: 50,
      visibility: 'CAMPUS',
      waitingRoomEnabled: false,
      whiteboardLocked: false,
      cityBadge: cityBadge || vault.profile.institution || 'Remote Browser'
    });
  };

  const leaveStage = async () => {
    if (!user || !liveRoom) {
      setSelectedRoomId(null);
      return;
    }
    const rId = liveRoom.id;
    setSelectedRoomId(null);
    try {
      const myRef = doc(db, 'study_rooms', rId, 'participants', user.uid);
      const snap = await getDoc(myRef);
      if (snap.exists() && snap.data()?.admissionStatus !== 'REMOVED') {
        await deleteDoc(myRef);
      }
    } catch {
      // Ignore cleanup errors
    }
  };

  const toggleSharedTimer = async () => {
    if (!liveRoom || liveRoom.status === 'COMPLETED') return;
    const ref = doc(db, 'study_rooms', liveRoom.id);
    if (liveRoom.timerState === 'RUNNING') {
      const rem = Math.max(0, Math.floor((liveRoom.timerEndEpochMillis - Date.now()) / 1000));
      await updateDoc(ref, {
        timerState: 'PAUSED',
        timerEndEpochMillis: 0,
        timerRemainingSeconds: Math.min(43200, rem),
        updatedAt: serverTimestamp()
      });
    } else {
      const base =
        liveRoom.timerRemainingSeconds > 0
          ? liveRoom.timerRemainingSeconds
          : liveRoom.activeMinutes * 60;
      await updateDoc(ref, {
        timerState: 'RUNNING',
        timerEndEpochMillis: Date.now() + base * 1000,
        timerRemainingSeconds: Math.min(43200, base),
        updatedAt: serverTimestamp()
      });
    }
  };

  const sendRoomMessage = async () => {
    if (!user || !liveRoom || !chatText.trim() || liveRoom.status === 'COMPLETED') return;
    const msgId = uidGen('msg');
    const txt = chatText.trim().slice(0, 600);
    setChatText('');
    try {
      await setDoc(doc(db, 'study_rooms', liveRoom.id, 'messages', msgId), {
        roomId: liveRoom.id,
        roomOwnerId: liveRoom.ownerId,
        roomVisibility: liveRoom.visibility,
        authorId: user.uid,
        authorName:
          (user.displayName || vault.profile.name || 'Scholar').trim().slice(0, 80) || 'Scholar',
        text: txt,
        messageType: chatType,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (e: unknown) {
      onNotify((e as Error)?.message || 'Unable to send message.');
    }
  };

  // Sign-In Gate
  if (!user) {
    return (
      <div className="aura-glass rounded-3xl p-6 sm:p-8 text-center space-y-5 border border-sky-400/35">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 via-sky-500 to-violet-500 mx-auto flex items-center justify-center shadow-lg shadow-sky-500/25">
          <Users className="w-8 h-8 text-slate-950" />
        </div>
        <div className="space-y-1.5">
          <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/35">
            ANDROID • IPHONE SAFARI • CHROME • MAC / PC
          </span>
          <h2 className="text-xl sm:text-2xl font-extrabold pt-1">Universal Live Study Stage</h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Sign in with Google to join Android or Web study sessions via 6-character code or QR link,
            knock on Waiting Rooms, vote in live pop-quiz polls, co-edit the chalkboard, or host your own room.
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await signInWithGoogleBrowser();
            } catch (e: unknown) {
              onNotify(
                (e as Error)?.message ||
                  'Google Sign-In failed. Ensure your Vercel domain is in Firebase Auth -> Settings -> Authorized Domains.'
              );
            }
          }}
          className="px-6 py-3.5 rounded-2xl aura-shimmer-btn text-slate-950 font-extrabold text-sm inline-flex items-center gap-2 shadow-lg shadow-emerald-500/20"
        >
          <LogIn className="w-4 h-4" /> Sign in with Google
        </button>
      </div>
    );
  }

  // Active Live Study Stage View
  if (liveRoom) {
    const isHost = liveRoom.ownerId === user.uid;
    const isCoHost = liveRoom.coHostIds.includes(user.uid);
    const canControl = isHost || isCoHost;
    const isLocked = liveRoom.status === 'COMPLETED';

    const myP =
      participants.find((p) => p.userId === user.uid) || myDirectParticipant;
    const myAdmission =
      myP?.admissionStatus || (liveRoom.waitingRoomEnabled && !canControl ? 'WAITING' : 'ADMITTED');

    const waitingList = participants.filter((p) => p.admissionStatus === 'WAITING');
    const admittedList = participants.filter(
      (p) => p.admissionStatus !== 'WAITING' && p.admissionStatus !== 'REMOVED'
    );

    const displayCode = liveRoom.joinCode || liveRoom.id.replace(/^room_/, '').toUpperCase();
    const shareUrl = `${window.location.origin}/?room=${displayCode}`;

    const timerM = Math.floor(liveSeconds / 60);
    const timerS = liveSeconds % 60;
    const formattedClock = `${String(timerM).padStart(2, '0')}:${String(timerS).padStart(2, '0')}`;

    const totalVotes = admittedList.filter((p) => p.pollVoteIndex >= 0).length;

    return (
      <div className="space-y-4">
        <div className="aura-glass rounded-3xl p-4 sm:p-5 space-y-4 border border-emerald-400/40">
          {/* Header Row */}
          <div className="flex flex-wrap items-start justify-between gap-2.5">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/35">
                  {isLocked ? 'SESSION COMPLETED' : '● LIVE STAGE'} • {liveRoom.courseCode}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(displayCode);
                    onNotify(`Copied 6-character Join Code: ${displayCode}`);
                  }}
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-extrabold bg-sky-500/20 text-sky-200 border border-sky-400/35 inline-flex items-center gap-1 hover:bg-sky-500/30"
                  title="Tap to copy 6-character code"
                >
                  CODE: {displayCode} <Copy className="w-3 h-3" />
                </button>
                {liveRoom.visibility === 'UNLISTED' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/20 text-violet-300">
                    🔑 Code-Only
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold leading-snug">{liveRoom.roomTitle}</h2>
              <p className="text-xs text-slate-400">
                Hosted by <strong>{liveRoom.ownerName}</strong>
                {liveRoom.focusTopic ? ` • ${liveRoom.focusTopic}` : ''}
              </p>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className="px-3 py-2 rounded-xl bg-sky-500/20 border border-sky-400/45 text-sky-200 text-xs font-extrabold inline-flex items-center gap-1.5 hover:bg-sky-500/30"
              >
                <QrCode className="w-3.5 h-3.5" /> Invite
              </button>
              <button
                type="button"
                onClick={() => setShowRecapModal(true)}
                className="px-3 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/45 text-emerald-200 text-xs font-extrabold inline-flex items-center gap-1.5 hover:bg-emerald-500/30"
              >
                <BookmarkPlus className="w-3.5 h-3.5" /> Recap
              </button>
              <button
                type="button"
                onClick={leaveStage}
                className="px-3 py-2 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-300 text-xs font-extrabold inline-flex items-center gap-1 hover:bg-rose-500/30"
                title="Leave Stage"
              >
                <LogOut className="w-3.5 h-3.5" /> Leave
              </button>
            </div>
          </div>

          {/* Removed Gate */}
          {myAdmission === 'REMOVED' ? (
            <div className="p-6 rounded-2xl bg-rose-500/15 border border-rose-400/50 text-center space-y-2">
              <div className="text-sm font-extrabold text-rose-300">
                You were removed from this study session by the host.
              </div>
              <button
                type="button"
                onClick={() => setSelectedRoomId(null)}
                className="px-4 py-2 rounded-xl aura-subtle-surface text-xs font-bold"
              >
                Return to Study Lobby
              </button>
            </div>
          ) : myAdmission === 'WAITING' && !canControl ? (
            /* Knocking / Waiting Room Screen for Guests */
            <div className="p-6 rounded-3xl bg-amber-500/15 border border-amber-400/55 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-amber-400/20 border border-amber-400/50 mx-auto flex items-center justify-center animate-pulse">
                <DoorOpen className="w-7 h-7 text-amber-300" />
              </div>
              <div className="space-y-1">
                <div className="text-base font-extrabold text-amber-200">
                  Knocked! Waiting for {liveRoom.ownerName} to Admit You...
                </div>
                <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                  Your knock has been delivered to the host & co-hosts in real time. Keep this tab open—the stage will unlock automatically the instant they tap <strong>Admit</strong>!
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await upsertMyPresence(
                        liveRoom,
                        (myP?.studyStatus as 'FOCUSING') || 'FOCUSING',
                        true,
                        '🚪'
                      );
                      onNotify(`🔔 Rang the Waiting Room bell for ${liveRoom.ownerName}!`);
                    } catch (e: unknown) {
                      onNotify((e as Error)?.message || 'Could not ring bell.');
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl bg-amber-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1.5 shadow-md"
                >
                  <BellRing className="w-3.5 h-3.5" /> Ring Bell Again
                </button>
                <button
                  type="button"
                  onClick={leaveStage}
                  className="px-4 py-2.5 rounded-xl aura-subtle-surface text-xs font-bold"
                >
                  Cancel & Leave
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Host / Co-Host Waiting Room Knock Queue (Pulses Amber When Someone Knocks!) */}
              {canControl && waitingList.length > 0 && (
                <div className="p-4 rounded-2xl bg-amber-500/20 border-2 border-amber-400 aura-knock-pulse space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-extrabold uppercase tracking-wider text-amber-200 flex items-center gap-1.5">
                      <BellRing className="w-4 h-4 text-amber-300 animate-bounce" />
                      🚪 WAITING ROOM KNOCKS ({waitingList.length})
                    </div>
                    {waitingList.length > 1 && (
                      <button
                        type="button"
                        onClick={async () => {
                          await Promise.all(
                            waitingList.map((w) =>
                              updateDoc(
                                doc(db, 'study_rooms', liveRoom.id, 'participants', w.userId),
                                {
                                  admissionStatus: 'ADMITTED',
                                  updatedAt: serverTimestamp()
                                }
                              )
                            )
                          );
                          onNotify(`Admitted all ${waitingList.length} waiting scholars!`);
                        }}
                        className="px-3 py-1 rounded-lg bg-emerald-400 text-slate-950 text-[11px] font-extrabold"
                      >
                        Admit All ({waitingList.length})
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {waitingList.map((w) => (
                      <div
                        key={w.userId}
                        className="flex items-center justify-between gap-2 bg-slate-950/55 p-3 rounded-xl border border-amber-400/35"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold text-white truncate">
                            {w.displayName}{' '}
                            <span className="text-[10px] font-semibold text-amber-300">
                              ({w.devicePlatform === 'ANDROID' ? '📱 Android' : w.devicePlatform === 'IPHONE_WEB' ? '🍏 iPhone' : '💻 Web'})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-300 truncate">
                            {w.cityOrCampus || 'Remote Campus'}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={async () => {
                              await updateDoc(
                                doc(db, 'study_rooms', liveRoom.id, 'participants', w.userId),
                                {
                                  admissionStatus: 'ADMITTED',
                                  updatedAt: serverTimestamp()
                                }
                              );
                              onNotify(`✅ Admitted ${w.displayName} into the room!`);
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-extrabold"
                          >
                            Admit
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await updateDoc(
                                doc(db, 'study_rooms', liveRoom.id, 'participants', w.userId),
                                {
                                  admissionStatus: 'REMOVED',
                                  updatedAt: serverTimestamp()
                                }
                              );
                              onNotify(`Declined ${w.displayName}.`);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-rose-500/25 text-rose-200 text-xs font-bold"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Host & Co-Host Stage Control Strip */}
              {canControl && !isLocked && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {isHost && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          updateDoc(doc(db, 'study_rooms', liveRoom.id), {
                            waitingRoomEnabled: !liveRoom.waitingRoomEnabled,
                            updatedAt: serverTimestamp()
                          })
                        }
                        className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold whitespace-nowrap border transition ${
                          liveRoom.waitingRoomEnabled
                            ? 'bg-amber-400/20 border-amber-400 text-amber-200'
                            : 'aura-subtle-surface text-slate-300'
                        }`}
                      >
                        <Shield className="w-3 h-3 inline mr-1" />
                        Waiting Room: {liveRoom.waitingRoomEnabled ? 'ON' : 'OFF'}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          updateDoc(doc(db, 'study_rooms', liveRoom.id), {
                            whiteboardLocked: !liveRoom.whiteboardLocked,
                            updatedAt: serverTimestamp()
                          })
                        }
                        className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold whitespace-nowrap border transition ${
                          liveRoom.whiteboardLocked
                            ? 'bg-violet-500/25 border-violet-400 text-violet-200'
                            : 'aura-subtle-surface text-slate-300'
                        }`}
                      >
                        {liveRoom.whiteboardLocked ? (
                          <Lock className="w-3 h-3 inline mr-1" />
                        ) : (
                          <Unlock className="w-3 h-3 inline mr-1" />
                        )}
                        {liveRoom.whiteboardLocked ? 'Lecture Board' : 'Open Board'}
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowPollModal(true)}
                    className="px-3 py-1.5 rounded-full text-[11px] font-extrabold whitespace-nowrap bg-sky-500/20 border border-sky-400/50 text-sky-200"
                  >
                    <BarChart3 className="w-3 h-3 inline mr-1" /> Pop-Quiz Poll
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowSpotlightModal(true)}
                    className="px-3 py-1.5 rounded-full text-[11px] font-extrabold whitespace-nowrap bg-emerald-500/20 border border-emerald-400/50 text-emerald-200"
                  >
                    <Pin className="w-3 h-3 inline mr-1" /> Pin Spotlight
                  </button>

                  {isHost && (
                    <button
                      type="button"
                      onClick={async () => {
                        await updateDoc(doc(db, 'study_rooms', liveRoom.id), {
                          status: 'COMPLETED',
                          timerState: 'IDLE',
                          timerRemainingSeconds: 0,
                          updatedAt: serverTimestamp()
                        });
                        onNotify('Session marked Completed. Tap Recap to save minutes!');
                      }}
                      className="px-3 py-1.5 rounded-full text-[11px] font-extrabold whitespace-nowrap bg-rose-500/20 border border-rose-400/45 text-rose-200"
                    >
                      <CheckCircle2 className="w-3 h-3 inline mr-1" /> End Session
                    </button>
                  )}
                </div>
              )}

              {isHost && isLocked && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={async () => {
                      const rid = liveRoom.id;
                      setSelectedRoomId(null);
                      await deleteDoc(doc(db, 'study_rooms', rid));
                      onNotify('Deleted completed room.');
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-300 text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Room Permanently
                  </button>
                </div>
              )}

              {/* Spotlight Banner */}
              {liveRoom.spotlightCardText && (
                <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-400/55 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
                      📌 STAGE SPOTLIGHT
                    </div>
                    <div className="text-xs font-bold mt-1 leading-relaxed">
                      {liveRoom.spotlightCardText}
                    </div>
                  </div>
                  {canControl && !isLocked && (
                    <button
                      type="button"
                      onClick={() =>
                        updateDoc(doc(db, 'study_rooms', liveRoom.id), {
                          spotlightCardText: '',
                          updatedAt: serverTimestamp()
                        })
                      }
                      className="text-xs font-bold text-amber-300 px-2 py-1 rounded-lg hover:bg-amber-400/20"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}

              {/* Live Pop-Quiz Poll Card */}
              {liveRoom.activePollQuestion && liveRoom.activePollOptions.length >= 2 && (
                <div className="p-4 rounded-2xl bg-indigo-950/65 border border-violet-400/50 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] font-extrabold text-violet-200">
                      📊 LIVE POP-QUIZ POLL • {totalVotes} VOTE(S)
                    </span>
                    {canControl && !isLocked && (
                      <div className="flex gap-2 text-[11px] font-extrabold">
                        {liveRoom.activePollCorrectIndex >= 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              updateDoc(doc(db, 'study_rooms', liveRoom.id), {
                                activePollRevealed: !liveRoom.activePollRevealed,
                                updatedAt: serverTimestamp()
                              })
                            }
                            className="text-emerald-300 hover:underline"
                          >
                            {liveRoom.activePollRevealed ? 'Hide Answer' : 'Reveal Answer'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            updateDoc(doc(db, 'study_rooms', liveRoom.id), {
                              activePollQuestion: '',
                              activePollOptions: [],
                              activePollCorrectIndex: -1,
                              activePollRevealed: false,
                              updatedAt: serverTimestamp()
                            })
                          }
                          className="text-rose-300 hover:underline"
                        >
                          Close Poll
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="text-sm font-extrabold text-white">
                    {liveRoom.activePollQuestion}
                  </div>

                  <div className="space-y-1.5">
                    {liveRoom.activePollOptions.map((opt, idx) => {
                      const votes = admittedList.filter((p) => p.pollVoteIndex === idx).length;
                      const pct = totalVotes > 0 ? Math.round((votes * 100) / totalVotes) : 0;
                      const myVote = myP?.pollVoteIndex === idx;
                      const isCorrect =
                        liveRoom.activePollRevealed && liveRoom.activePollCorrectIndex === idx;
                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={isLocked}
                          onClick={async () => {
                            if (!myP) {
                              await upsertMyPresence(liveRoom, 'QUIZZING', false, '📊');
                            }
                            await updateDoc(
                              doc(db, 'study_rooms', liveRoom.id, 'participants', user.uid),
                              {
                                pollVoteIndex: idx,
                                updatedAt: serverTimestamp()
                              }
                            );
                          }}
                          className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between text-xs transition ${
                            isCorrect
                              ? 'bg-emerald-500/30 border-emerald-400 text-white'
                              : myVote
                              ? 'bg-sky-500/25 border-sky-400 text-white'
                              : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                          }`}
                        >
                          <span>
                            <strong className="mr-1.5">{['A', 'B', 'C', 'D'][idx]}.</strong>
                            {opt}
                          </span>
                          <span className="font-mono font-bold">
                            {votes} ({pct}%)
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Shared Synchronized Countdown + Voice Stage Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl aura-subtle-surface flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">
                      SYNCED ROOM CLOCK ({liveRoom.timerState})
                    </div>
                    <div className="text-3xl font-mono font-extrabold text-emerald-400 mt-0.5">
                      {formattedClock}
                    </div>
                  </div>
                  {canControl && !isLocked && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={toggleSharedTimer}
                        className="p-2.5 rounded-xl bg-emerald-400 text-slate-950 font-bold shadow-md hover:bg-emerald-300 transition"
                        title={liveRoom.timerState === 'RUNNING' ? 'Pause Clock' : 'Start Clock'}
                      >
                        {liveRoom.timerState === 'RUNNING' ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCustomTimerModal(true)}
                        className="px-2.5 py-2 rounded-xl aura-subtle-surface text-[11px] font-bold inline-flex items-center gap-1 hover:border-sky-400/50"
                        title="Set Custom Sprint Duration"
                      >
                        <Clock className="w-3.5 h-3.5" /> Set
                      </button>
                    </div>
                  )}
                </div>

                {/* QUICK STUDY SPRINT PRESETS */}
                {canControl && !isLocked && (
                  <div className="pt-2 border-t border-white/10 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    <span className="text-[10px] font-extrabold uppercase text-slate-400 shrink-0">
                      ⚡ Sprints:
                    </span>
                    {[
                      { label: '🍅 Pomodoro 25m', mins: 25 },
                      { label: '⚡ Deep Work 50m', mins: 50 },
                      { label: '🚀 Exam Cram 90m', mins: 90 },
                      { label: '☕ Break 10m', mins: 10 }
                    ].map((sp) => (
                      <button
                        key={sp.mins}
                        type="button"
                        onClick={() => handleApplySprintPreset(sp.mins, sp.label)}
                        className="px-2.5 py-1 rounded-lg aura-subtle-surface hover:border-emerald-400 text-[11px] font-bold text-slate-200 aura-sprint-chip whitespace-nowrap shrink-0"
                      >
                        {sp.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* HAND-RAISE SPEAKER QUEUE */}
              {handRaisedScholars.length > 0 && (
                <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-400/50 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-base">✋</span>
                    <div>
                      <div className="text-xs font-black text-amber-300">
                        HAND-RAISE QUEUE ({handRaisedScholars.length} Waiting to Speak)
                      </div>
                      <div className="text-[11px] text-slate-300 truncate max-w-xs sm:max-w-md">
                        {handRaisedScholars.map((s) => s.displayName).join(', ')}
                      </div>
                    </div>
                  </div>
                  {canControl && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleCallOnScholar(handRaisedScholars[0].userId)}
                        className="px-3 py-1 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs transition"
                        title="Call on first scholar in queue and unmute"
                      >
                        🎙️ Call On {handRaisedScholars[0].displayName.split(' ')[0]}
                      </button>
                      <button
                        type="button"
                        onClick={handleLowerAllHands}
                        className="px-2.5 py-1 rounded-xl aura-subtle-surface text-slate-300 hover:text-white text-xs font-bold transition"
                      >
                        Lower All
                      </button>
                    </div>
                  )}
                </div>
              )}

                {/* IN-APP LIVE MEETING STAGE & SCREEN CAST (No external browser needed!) */}
                <div
                  className={`relative rounded-3xl overflow-hidden border border-sky-400/30 bg-slate-950 shadow-2xl transition-all duration-300 ${
                    isMeetingExpanded
                      ? 'fixed inset-3 z-50 flex flex-col backdrop-blur-2xl bg-slate-950/95 border-emerald-400/50'
                      : 'w-full aspect-video min-h-[300px] max-h-[500px]'
                  }`}
                >
                  {/* Floating Reaction Emojis Burst */}
                  {floatingReactions.map((fx) => (
                    <div
                      key={fx.id}
                      className="absolute bottom-12 z-30 aura-float-emoji text-3xl select-none"
                      style={{ left: `${fx.left}%` }}
                    >
                      {fx.emoji}
                    </div>
                  ))}

                  {/* Stage Top Bar Overlay */}
                  <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-3.5 py-2.5 bg-gradient-to-b from-black/85 via-black/45 to-transparent">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[11px] font-black tracking-wider text-emerald-400 uppercase">
                        LIVE STAGE • AUDIO & SCREEN CAST
                      </span>
                      <div className="hidden sm:flex items-end gap-0.5 h-3">
                        <span className="w-1 bg-emerald-400 rounded-full aura-sound-bar" />
                        <span className="w-1 bg-sky-400 rounded-full aura-sound-bar" />
                        <span className="w-1 bg-violet-400 rounded-full aura-sound-bar" />
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Cast Screen Button */}
                      <button
                        type="button"
                        onClick={isCastingScreen ? stopScreenCast : startScreenCast}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                          isCastingScreen
                            ? 'bg-rose-500 text-white aura-cast-glow'
                            : 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40 hover:bg-emerald-500/40'
                        }`}
                        title="Broadcast your screen to all scholars"
                      >
                        <Cast className="w-3.5 h-3.5" />
                        {isCastingScreen ? 'Stop Cast' : 'Cast Screen'}
                      </button>

                      {/* Theater Mode Toggle */}
                      <button
                        type="button"
                        onClick={() => setIsMeetingExpanded((v) => !v)}
                        className="p-1.5 rounded-xl bg-black/60 text-white/90 hover:text-white border border-white/15"
                        title={isMeetingExpanded ? 'Exit Fullscreen' : 'Expand Theater Mode'}
                      >
                        {isMeetingExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                      </button>

                      {/* External Tab Popout */}
                      <a
                        href={liveRoom.voiceRoomUrl || buildJitsiVoiceUrl(displayCode, liveRoom.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-xl bg-black/60 text-white/80 hover:text-white border border-white/15"
                        title="Open in new window"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>

                  {/* Embedded WebRTC Stage Iframe */}
                  <iframe
                    src={liveRoom.voiceRoomUrl || buildJitsiVoiceUrl(displayCode, liveRoom.id)}
                    allow="camera; microphone; display-capture; autoplay; clipboard-write; fullscreen"
                    className="w-full h-full border-0 pt-8"
                    title={`AURA Live Stage - ${liveRoom.roomTitle}`}
                  />
                </div>

                {/* ACTIVE LIVE SCREEN BROADCAST PREVIEW TILE */}
                {isCastingScreen && (
                  <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-400 aura-cast-glow bg-slate-950 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                        <span className="text-xs font-black text-emerald-400 tracking-wider">
                          🔴 LIVE SCREEN CAST ACTIVE • Broadcasting to Android & Web
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={stopScreenCast}
                        className="px-3 py-1 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition"
                      >
                        Stop Cast
                      </button>
                    </div>
                    <div className="relative rounded-xl overflow-hidden aspect-video bg-black border border-white/10">
                      <video
                        ref={screenVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>
                )}

                {/* HOST MUTED BANNER */}
                {myP?.isMutedByHost && (
                  <div className="mb-2 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-between text-xs text-rose-200">
                    <span className="flex items-center gap-2">
                      <MicOff className="w-4 h-4 text-rose-400" />
                      The host muted your mic on stage.
                    </span>
                    <button
                      type="button"
                      onClick={toggleMyMic}
                      className="px-2.5 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-bold text-[11px] transition"
                    >
                      Unmute
                    </button>
                  </div>
                )}

                {/* ZOOM & GOOGLE MEET STYLE TACTILE MEETING DOCK */}
                <div className="p-3 rounded-2xl aura-dock flex items-center justify-between gap-2 flex-wrap shadow-xl">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Mic Toggle Button */}
                    <button
                      type="button"
                      onClick={toggleMyMic}
                      className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                        isMyMicMuted
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                      }`}
                      title={isMyMicMuted ? 'Unmute your microphone' : 'Mute your microphone'}
                    >
                      {isMyMicMuted ? (
                        <>
                          <MicOff className="w-4 h-4 text-rose-400" />
                          <span>Muted</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-4 h-4 text-emerald-400" />
                          <span>Mute Mic</span>
                        </>
                      )}
                    </button>

                    {/* Camera Toggle Button */}
                    <button
                      type="button"
                      onClick={toggleMyCamera}
                      className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                        isMyCameraOn
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'aura-subtle-surface text-slate-300 hover:border-slate-400/50'
                      }`}
                      title={isMyCameraOn ? 'Turn camera off' : 'Turn camera on'}
                    >
                      {isMyCameraOn ? (
                        <>
                          <Video className="w-4 h-4 text-emerald-400" />
                          <span>Camera On</span>
                        </>
                      ) : (
                        <>
                          <VideoOff className="w-4 h-4 text-slate-400" />
                          <span>Camera Off</span>
                        </>
                      )}
                    </button>

                    {/* Screen Cast */}
                    <button
                      type="button"
                      onClick={isCastingScreen ? stopScreenCast : startScreenCast}
                      className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                        isCastingScreen
                          ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
                          : 'aura-subtle-surface text-slate-200 hover:border-emerald-400/50'
                      }`}
                    >
                      <Cast className="w-4 h-4 text-emerald-400" />
                      {isCastingScreen ? 'Stop Cast' : 'Cast Screen'}
                    </button>

                    {/* Raise Hand */}
                    <button
                      type="button"
                      onClick={() => {
                        const newHand = !myP?.handRaised;
                        upsertMyPresence(
                          liveRoom,
                          (myP?.studyStatus as 'FOCUSING' | 'BREAK' | 'QUIZZING' | 'READY') || 'FOCUSING',
                          newHand,
                          newHand ? '✋' : myP?.reactionEmoji || '🎯'
                        );
                        onNotify(newHand ? '✋ Raised hand on stage' : 'Hand lowered');
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                        myP?.handRaised
                          ? 'bg-amber-400 text-slate-950 font-black shadow-lg shadow-amber-400/20'
                          : 'aura-subtle-surface text-slate-200 hover:border-amber-400/50'
                      }`}
                    >
                      <Hand className="w-4 h-4 text-amber-400" />
                      {myP?.handRaised ? 'Hand Raised' : 'Raise Hand'}
                    </button>

                    {/* Host Mute All Button */}
                    {canControl && (
                      <button
                        type="button"
                        onClick={handleHostMuteAll}
                        className="px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 bg-rose-500/15 border border-rose-500/40 text-rose-200 hover:bg-rose-500/25 transition"
                        title="Mute all other students on stage"
                      >
                        <Volume2 className="w-4 h-4 text-rose-400" />
                        <span>Mute All</span>
                      </button>
                    )}
                  </div>

                  {/* Reaction Emojis Burst Bar */}
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                    {['🎯', '🔥', '💡', '👏', '🚀', '💯'].map((emo) => (
                      <button
                        key={emo}
                        type="button"
                        onClick={() => {
                          upsertMyPresence(
                            liveRoom,
                            (myP?.studyStatus as 'FOCUSING' | 'BREAK' | 'QUIZZING' | 'READY') || 'FOCUSING',
                            Boolean(myP?.handRaised),
                            emo
                          );
                          triggerFloatingReaction(emo);
                          onNotify(`Reacted ${emo}`);
                        }}
                        className="px-2 py-1 rounded-lg hover:bg-white/10 text-base transition"
                      >
                        {emo}
                      </button>
                    ))}
                  </div>

                  {/* Pin Spotlight & Invite */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowSpotlightModal(true)}
                      className="px-3 py-2 rounded-xl text-xs font-bold aura-subtle-surface hover:border-sky-400/50 flex items-center gap-1 text-slate-200"
                      title="Spotlight Key Topic or Problem Set"
                    >
                      <Pin className="w-3.5 h-3.5 text-sky-400" /> Pin
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowQrModal(true)}
                      className="px-3 py-2 rounded-xl text-xs font-bold aura-subtle-surface hover:border-emerald-400/50 flex items-center gap-1 text-slate-200"
                      title="QR & Browser Invite Link"
                    >
                      <QrCode className="w-3.5 h-3.5 text-emerald-400" /> Invite
                    </button>
                  </div>
                </div>
              </div>

              {/* Live Participant Tiles */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-slate-300">
                    👥 SCHOLARS IN STAGE ({Math.max(1, admittedList.length)})
                  </span>
                  {canControl && (
                    <span className="text-[11px] text-slate-400">
                      Tap a classmate tile to moderate or promote Co-Host
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {admittedList.map((p) => {
                    const pIsHost = p.userId === liveRoom.ownerId;
                    const pIsCoHost = liveRoom.coHostIds.includes(p.userId);
                    const clickable = canControl && p.userId !== user.uid && !pIsHost;
                    const devTag =
                      p.devicePlatform === 'ANDROID'
                        ? '📱 Android'
                        : p.devicePlatform === 'IPHONE_WEB'
                        ? '🍏 iPhone'
                        : '💻 Web';
                    return (
                      <div
                        key={p.userId}
                        onClick={() => clickable && setModeratingParticipant(p)}
                        className={`p-3 rounded-2xl border transition ${
                          p.handRaised
                            ? 'bg-amber-500/15 border-amber-400/60 shadow-amber-400/10'
                            : 'aura-subtle-surface'
                        } ${clickable ? 'cursor-pointer hover:border-sky-400/60' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-extrabold truncate">{p.displayName}</span>
                          <span className="text-sm shrink-0">
                            {p.handRaised ? '✋' : p.reactionEmoji || '🎯'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                          {devTag} • {p.cityOrCampus || 'Remote'}
                        </div>
                        <div className="flex items-center justify-between gap-1 text-[10px] font-extrabold mt-1">
                          <span className="text-emerald-400 truncate">
                            {pIsHost
                              ? `HOST • ${p.studyStatus}`
                              : pIsCoHost
                              ? `CO-HOST • ${p.studyStatus}`
                              : p.studyStatus}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {p.cameraOn && (
                              <span className="px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[9px] flex items-center gap-0.5" title="Camera Active">
                                <Video className="w-2.5 h-2.5" /> Cam
                              </span>
                            )}
                            {p.isMuted ? (
                              <span className="px-1 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold text-[9px] flex items-center gap-0.5" title="Microphone Muted">
                                <MicOff className="w-2.5 h-2.5" /> Muted
                              </span>
                            ) : (
                              <span className="px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[9px] flex items-center gap-0.5" title="Microphone Live">
                                <Mic className="w-2.5 h-2.5" />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Raise Hand, Status Pills & Quick Reactions */}
              {!isLocked && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  <button
                    type="button"
                    onClick={() =>
                      upsertMyPresence(
                        liveRoom,
                        (myP?.studyStatus as 'FOCUSING' | 'BREAK' | 'QUIZZING' | 'READY') ||
                          'FOCUSING',
                        !myP?.handRaised,
                        !myP?.handRaised ? '✋' : '🎯'
                      )
                    }
                    className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold border whitespace-nowrap inline-flex items-center gap-1 transition ${
                      myP?.handRaised
                        ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md'
                        : 'aura-subtle-surface'
                    }`}
                  >
                    <Hand className="w-3.5 h-3.5" />
                    {myP?.handRaised ? 'Hand Raised' : 'Raise Hand'}
                  </button>

                  {(['FOCUSING', 'QUIZZING', 'READY', 'BREAK'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() =>
                        upsertMyPresence(
                          liveRoom,
                          st,
                          Boolean(myP?.handRaised),
                          myP?.reactionEmoji || '🎯'
                        )
                      }
                      className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap border transition ${
                        myP?.studyStatus === st
                          ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                          : 'aura-subtle-surface text-slate-400'
                      }`}
                    >
                      {st}
                    </button>
                  ))}

                  {['🔥', '💡', '👏', '✅', '🎯'].map((emo) => (
                    <button
                      key={emo}
                      type="button"
                      onClick={() =>
                        upsertMyPresence(
                          liveRoom,
                          (myP?.studyStatus as 'FOCUSING' | 'BREAK' | 'QUIZZING' | 'READY') ||
                            'FOCUSING',
                          Boolean(myP?.handRaised),
                          emo
                        )
                      }
                      className="px-2.5 py-1.5 rounded-full aura-subtle-surface hover:bg-white/15 text-sm"
                    >
                      {emo}
                    </button>
                  ))}
                </div>
              )}

              {/* Collaborative Workspace Tabs */}
              <div className="flex gap-2">
                {(
                  [
                    ['BOARD', '📝 Pinboard'],
                    ['CHAT', `💬 Live Q&A (${messages.length})`],
                    ['CARDS', `🃏 Cards (${sharedCards.length})`]
                  ] as const
                ).map(([t, label]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setStageTab(t)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold border transition ${
                      stageTab === t
                        ? 'bg-sky-500/25 border-sky-400 text-sky-200 shadow-sm'
                        : 'aura-subtle-surface text-slate-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {stageTab === 'BOARD' && (
                <div className="space-y-2.5">
                  {liveRoom.whiteboardLocked && !canControl && (
                    <p className="text-[11px] font-semibold text-amber-300">
                      🔒 Lecture Chalkboard Mode: Only Host & Co-Hosts can edit right now.
                    </p>
                  )}
                  {/* Quick Format Insert Chips */}
                  {(!liveRoom.whiteboardLocked || canControl) && !isLocked && (
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                      {[
                        { label: '☑️ Task', snip: '\n- [ ] ' },
                        { label: '∑ Formula', snip: '\n📌 Formula: ' },
                        { label: '💡 Concept', snip: '\n💡 Key Concept: ' },
                        { label: '❓ Question', snip: '\n❓ Q: ' },
                        { label: '🎯 Sprint Goal', snip: '\n🎯 Sprint Goal: ' }
                      ].map((fmt) => (
                        <button
                          key={fmt.label}
                          type="button"
                          onClick={() => {
                            setBoardDraft((prev) => prev + fmt.snip);
                            setBoardDirty(true);
                          }}
                          className="px-2.5 py-1 rounded-lg aura-subtle-surface text-[10px] font-extrabold text-slate-300 hover:border-emerald-400 whitespace-nowrap"
                        >
                          {fmt.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea
                    rows={4}
                    disabled={isLocked || (liveRoom.whiteboardLocked && !canControl)}
                    value={boardDraft}
                    onChange={(e) => {
                      setBoardDraft(e.target.value);
                      setBoardDirty(true);
                    }}
                    placeholder="Write shared formulas, outline steps, or sprint targets..."
                    className="w-full p-3.5 rounded-2xl aura-input text-xs leading-relaxed"
                  />
                  {(!liveRoom.whiteboardLocked || canControl) && !isLocked && (
                    <button
                      type="button"
                      onClick={async () => {
                        await updateDoc(doc(db, 'study_rooms', liveRoom.id), {
                          sharedBoardNote: boardDraft.slice(0, 2000),
                          updatedAt: serverTimestamp()
                        });
                        setBoardDirty(false);
                        onNotify('Synced pinboard across all Android & Browser screens!');
                      }}
                      className="w-full py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-extrabold transition shadow-md shadow-emerald-500/20"
                    >
                      Sync Pinboard to Room
                    </button>
                  )}
                </div>
              )}

              {stageTab === 'CHAT' && (
                <div className="space-y-2.5">
                  {/* Chat Filter Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                    {(['ALL', 'QUESTION', 'INSIGHT', 'CHAT'] as const).map((flt) => (
                      <button
                        key={flt}
                        type="button"
                        onClick={() => setChatFilter(flt)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition whitespace-nowrap ${
                          chatFilter === flt
                            ? 'bg-sky-400/25 border border-sky-400 text-sky-200'
                            : 'aura-subtle-surface text-slate-400 hover:text-white'
                        }`}
                      >
                        {flt === 'ALL'
                          ? `All (${messages.length})`
                          : flt === 'QUESTION'
                          ? `❓ Questions (${messages.filter((m) => m.messageType === 'QUESTION').length})`
                          : flt === 'INSIGHT'
                          ? `💡 Insights (${messages.filter((m) => m.messageType === 'INSIGHT').length})`
                          : `💬 Chat (${messages.filter((m) => m.messageType === 'CHAT').length})`}
                      </button>
                    ))}
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2 p-2.5 rounded-2xl aura-subtle-surface">
                    {messages.length === 0 ? (
                      <p className="text-xs text-slate-400 p-2 text-center">
                        Ask a past-paper question or share an insight with Android & iPhone classmates!
                      </p>
                    ) : (
                      (chatFilter === 'ALL'
                        ? messages
                        : messages.filter((m) => m.messageType === chatFilter)
                      ).slice(-35).map((m) => (
                        <div key={m.id} className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-extrabold text-sky-300">
                              {m.authorName}
                            </span>
                            {m.messageType !== 'CHAT' && (
                              <span
                                className={`px-2 py-0.5 rounded text-[9px] font-extrabold ${
                                  m.messageType === 'QUESTION'
                                    ? 'bg-amber-400/20 text-amber-300'
                                    : 'bg-emerald-400/20 text-emerald-300'
                                }`}
                              >
                                {m.messageType}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 leading-relaxed">{m.text}</div>
                        </div>
                      ))
                    )}
                  </div>

                  {!isLocked && (
                    <div className="space-y-2">
                      <div className="flex gap-1.5">
                        {(
                          [
                            ['CHAT', '💬 Chat'],
                            ['QUESTION', '❓ Question'],
                            ['INSIGHT', '💡 Insight']
                          ] as const
                        ).map(([tp, label]) => (
                          <button
                            key={tp}
                            type="button"
                            onClick={() => setChatType(tp)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold border ${
                              chatType === tp
                                ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                                : 'aura-subtle-surface text-slate-400'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={chatText}
                          onChange={(e) => setChatText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') sendRoomMessage();
                          }}
                          placeholder="Message Android & iPhone classmates..."
                          className="flex-1 px-3.5 py-2.5 rounded-xl aura-input text-xs"
                        />
                        <button
                          type="button"
                          onClick={sendRoomMessage}
                          aria-label="Send message"
                          className="px-4 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-extrabold"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {stageTab === 'CARDS' && (
                <div className="space-y-2.5">
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => setShowCardModal(true)}
                      className="w-full py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20"
                    >
                      <Plus className="w-4 h-4" /> Drop Flashcard to Room
                    </button>
                  )}

                  {sharedCards.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-3">
                      No flashcards dropped yet. Share a formula or definition card above!
                    </p>
                  ) : (
                    sharedCards.map((c) => (
                      <div
                        key={c.id}
                        className="p-3.5 rounded-2xl aura-subtle-surface space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-sky-300 font-extrabold">
                            {c.courseCode} • by {c.authorName}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateVault((prev) => ({
                                ...prev,
                                flashcards: [
                                  ...prev.flashcards,
                                  {
                                    id: uidGen('f'),
                                    courseCode: c.courseCode,
                                    deckTitle: `Live Room • ${liveRoom.roomTitle}`,
                                    question: c.question,
                                    answer: c.answer,
                                    easeFactor: 2.5,
                                    intervalDays: 1,
                                    repetitions: 0,
                                    nextReviewEpoch: Date.now()
                                  }
                                ]
                              }));
                              onNotify(`Saved "${c.courseCode}" card to your SM-2 Deck!`);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-extrabold hover:bg-emerald-500/30"
                          >
                            + Save to Deck
                          </button>
                        </div>
                        <div className="text-xs font-bold">Q: {c.question}</div>
                        <div className="text-xs text-slate-300">A: {c.answer}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Stage Modals — Accessible, Fast Presets, Esc Key, Backdrop Dismiss */}
        <QrInviteModal
          open={showQrModal}
          onClose={() => setShowQrModal(false)}
          room={liveRoom}
          displayCode={displayCode}
          shareUrl={shareUrl}
          onNotify={onNotify}
        />

        <CreatePollModal
          open={showPollModal}
          onClose={() => setShowPollModal(false)}
          onLaunchPoll={async (question, options, correctIndex) => {
            await updateDoc(doc(db, 'study_rooms', liveRoom.id), {
              activePollQuestion: question,
              activePollOptions: options,
              activePollCorrectIndex: correctIndex,
              activePollRevealed: false,
              updatedAt: serverTimestamp()
            });
            onNotify('📊 Live Pop-Quiz Poll pushed to all screens!');
          }}
        />

        <PinSpotlightModal
          open={showSpotlightModal}
          onClose={() => setShowSpotlightModal(false)}
          initialText={liveRoom.spotlightCardText}
          onPin={async (text) => {
            await updateDoc(doc(db, 'study_rooms', liveRoom.id), {
              spotlightCardText: text,
              updatedAt: serverTimestamp()
            });
            onNotify(text ? '📌 Pinned Stage Spotlight!' : 'Cleared Stage Spotlight.');
          }}
        />

        <ShareFlashcardModal
          open={showCardModal}
          onClose={() => setShowCardModal(false)}
          courseCode={liveRoom.courseCode}
          onShareCard={async (question, answer) => {
            const cardId = uidGen('card');
            await setDoc(doc(db, 'study_rooms', liveRoom.id, 'shared_cards', cardId), {
              roomId: liveRoom.id,
              roomOwnerId: liveRoom.ownerId,
              roomVisibility: liveRoom.visibility,
              authorId: user.uid,
              authorName:
                (user.displayName || vault.profile.name || 'Scholar').trim().slice(0, 80) ||
                'Scholar',
              courseCode: liveRoom.courseCode.slice(0, 24),
              question: question.slice(0, 500),
              answer: answer.slice(0, 1000),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            onNotify('🃏 Flashcard dropped to live study room!');
          }}
        />

        <CustomStageTimerModal
          open={showCustomTimerModal}
          onClose={() => setShowCustomTimerModal(false)}
          currentMinutes={liveRoom.activeMinutes}
          onApplyMinutes={async (mins) => {
            await updateDoc(doc(db, 'study_rooms', liveRoom.id), {
              activeMinutes: mins,
              timerState: 'IDLE',
              timerEndEpochMillis: 0,
              timerRemainingSeconds: mins * 60,
              updatedAt: serverTimestamp()
            });
            onNotify(`⏱️ Room clock set to ${mins} minutes.`);
          }}
        />

        <ModerateScholarModal
          target={moderatingParticipant}
          isHost={isHost}
          isTargetCoHost={
            moderatingParticipant ? liveRoom.coHostIds.includes(moderatingParticipant.userId) : false
          }
          onClose={() => setModeratingParticipant(null)}
          onToggleMuteParticipant={handleHostMuteParticipant}
          onLowerHand={async (p) => {
            await updateDoc(doc(db, 'study_rooms', liveRoom.id, 'participants', p.userId), {
              admissionStatus: p.admissionStatus || 'ADMITTED',
              handRaised: false,
              updatedAt: serverTimestamp()
            });
          }}
          onToggleCoHost={async (uid) => {
            const next = liveRoom.coHostIds.includes(uid)
              ? liveRoom.coHostIds.filter((id) => id !== uid)
              : [...liveRoom.coHostIds, uid].slice(0, 10);
            await updateDoc(doc(db, 'study_rooms', liveRoom.id), {
              coHostIds: next,
              updatedAt: serverTimestamp()
            });
            onNotify(
              next.includes(uid) ? 'Promoted scholar to Co-Host!' : 'Removed Co-Host privilege.'
            );
          }}
          onRemoveParticipant={async (uid) => {
            await updateDoc(doc(db, 'study_rooms', liveRoom.id, 'participants', uid), {
              admissionStatus: 'REMOVED',
              updatedAt: serverTimestamp()
            });
            onNotify('Removed participant from study room.');
          }}
        />

        <SessionRecapModal
          open={showRecapModal}
          onClose={() => setShowRecapModal(false)}
          room={liveRoom}
          participants={participants}
          messages={messages}
          sharedCards={sharedCards}
          onSaveToNotes={(title, content) => {
            onUpdateVault((prev) => ({
              ...prev,
              notes: [
                {
                  id: uidGen('n'),
                  courseCode: liveRoom.courseCode,
                  title,
                  category: 'Live Recap',
                  isPinned: true,
                  content,
                  updatedAt: Date.now()
                },
                ...prev.notes
              ]
            }));
            onNotify('📋 Saved Smart Study Minutes to your Notes Vault!');
          }}
          onNotify={onNotify}
        />
      </div>
    );
  }

  // Lobby View (Join by 6-Char Code / Invite Link, Re-Enter Hosted Rooms, or Host New Session)
  const publicOtherRooms = campusRooms.filter((r) => r.ownerId !== user.uid);

  return (
    <div className="space-y-4">
      {/* Hero Join & Host Card with Dual-Action Workflow */}
      <div className="aura-hero-card rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5 max-w-xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-violet-500/20 text-violet-300 border border-violet-400/40">
                <Sparkles className="w-3 h-3" /> UNIVERSAL ANDROID • IPHONE • CHROME STAGE
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">
                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" /> Live Realtime Sync
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              Host or Join Live Study Session
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Launch a shared room for your class with real-time countdown clocks, synchronized past-paper chalkboard,
              instant pop-quiz polls, and knock-to-join Waiting Rooms.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {/* 1-Click Fast Launch Sprint */}
            <button
              type="button"
              disabled={isHostingRoom}
              onClick={handleInstantQuickHost}
              className="px-4 py-2.5 rounded-2xl aura-shimmer-btn text-slate-950 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/25 hover:opacity-95 transition"
              title="Instantly host a 50m sprint for your primary course"
            >
              <Zap className="w-4 h-4" /> 1-Click 50m Sprint
            </button>
            <button
              type="button"
              onClick={() => {
                setHostModalError('');
                setShowHostModal(true);
              }}
              className="px-4 py-2.5 rounded-2xl aura-subtle-surface hover:border-sky-400/60 text-slate-200 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition"
            >
              <Video className="w-4 h-4 text-sky-400" /> Custom Room Settings
            </button>
          </div>
        </div>

        {/* Join by Code or Link */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <input
            value={cityBadge}
            onChange={(e) => setCityBadge(e.target.value)}
            placeholder="Your Campus / Town (e.g. Accra • Legon)"
            className="px-3.5 py-2.5 rounded-xl aura-input text-xs"
          />
          <div className="sm:col-span-2 flex gap-2">
            <input
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') joinByCode(joinCodeInput);
              }}
              placeholder="Enter 6-Char Code (e.g. AUR7K2) or paste Link"
              className="flex-1 px-3.5 py-2.5 rounded-xl aura-input text-xs font-mono font-bold uppercase placeholder:normal-case placeholder:font-sans placeholder:font-normal"
            />
            <button
              type="button"
              disabled={isJoiningCode || normalizeJoinCode(joinCodeInput).length < 4}
              onClick={() => joinByCode(joinCodeInput)}
              className="px-5 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 disabled:opacity-45 text-slate-950 font-extrabold text-xs whitespace-nowrap transition shadow-md shadow-emerald-500/20"
            >
              {isJoiningCode ? 'Joining...' : 'Enter Stage'}
            </button>
          </div>
        </div>
      </div>

      {/* User's Own Active Hosted Rooms (Including Private Code-Only Rooms!) */}
      {myHostedRooms.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-emerald-400" /> Your Active Hosted Sessions ({myHostedRooms.length})
            </h3>
            <span className="text-[11px] text-slate-400">One-tap resume for your class</span>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {myHostedRooms.map((r) => {
              const code = r.joinCode || r.id.replace(/^room_/, '').toUpperCase();
              return (
                <div
                  key={r.id}
                  className="aura-glass rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border border-emerald-400/40 shadow-lg shadow-emerald-500/5"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[11px] font-extrabold">
                        {r.courseCode}
                      </span>
                      <span className="font-mono text-xs font-extrabold text-sky-300">
                        CODE: {code}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {r.visibility === 'UNLISTED' ? '🔑 Private Code-Only' : '🌐 Campus Lobby'}
                      </span>
                      {r.waitingRoomEnabled && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-extrabold">
                          🚪 Waiting Room Active
                        </span>
                      )}
                    </div>
                    <div className="font-bold text-sm truncate">{r.roomTitle}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(code);
                        onNotify(`Copied Room Code ${code}!`);
                      }}
                      className="px-3 py-2 rounded-xl aura-subtle-surface hover:border-sky-400/50 text-xs font-bold inline-flex items-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy Code
                    </button>
                    <button
                      type="button"
                      onClick={() => enterExistingRoom(r.id, code)}
                      className="px-4 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-extrabold shadow-md shadow-emerald-500/20"
                    >
                      Open Stage
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Open Campus Study Lobby */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-sky-400" /> Open Campus Study Lobby ({publicOtherRooms.length})
          </h3>
          <span className="text-[11px] text-slate-400">Realtime cross-platform study rooms</span>
        </div>

        {publicOtherRooms.length === 0 ? (
          <div className="aura-glass rounded-3xl p-8 text-center space-y-2.5 border border-sky-400/20">
            <Users className="w-8 h-8 text-sky-400 mx-auto opacity-80" />
            <div className="font-bold text-sm">No Public Campus Rooms Right Now</div>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              Have a private 6-character code from an Android classmate? Enter it above—or tap{' '}
              <strong>1-Click 50m Sprint</strong> to host your own live study stage!
            </p>
          </div>
        ) : (
          publicOtherRooms.map((r) => {
            const code = r.joinCode || r.id.replace(/^room_/, '').toUpperCase();
            return (
              <div
                key={r.id}
                className="aura-glass rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 hover:border-sky-400/45 transition shadow-sm"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 text-[11px] font-extrabold">
                      {r.courseCode}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Host: <strong>{r.ownerName}</strong> • {r.activeMinutes}m
                    </span>
                    {r.waitingRoomEnabled && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-extrabold">
                        🚪 Knock to Join
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-sm truncate">{r.roomTitle}</div>
                  {r.focusTopic && (
                    <div className="text-xs text-slate-400 truncate">{r.focusTopic}</div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isJoiningCode}
                  onClick={() => enterExistingRoom(r.id, code)}
                  className="px-4 py-2 rounded-xl bg-sky-500/25 hover:bg-sky-500/35 border border-sky-400/50 text-sky-200 text-xs font-extrabold transition"
                >
                  {r.waitingRoomEnabled ? 'Knock to Join' : 'Join Stage'}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Host Room Modal — Always Closeable via X, Cancel, Backdrop Click, or Escape */}
      <HostRoomModal
        open={showHostModal}
        onClose={() => {
          setShowHostModal(false);
          setHostModalError('');
        }}
        courses={vault.courses}
        defaultCityBadge={cityBadge}
        isSubmitting={isHostingRoom}
        errorText={hostModalError}
        onCreateRoom={handleHostCreateRoom}
      />
    </div>
  );
};
