import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  BookmarkPlus,
  Check,
  Clock,
  Copy,
  Hand,
  Lock,
  Mic,
  MicOff,
  Plus,
  Share2,
  Shield,
  ShieldAlert,
  Sparkles,
  UserMinus
} from 'lucide-react';
import { AuraModal } from './AuraModal';
import type {
  CloudParticipant,
  CloudRoomMessage,
  CloudSharedCard,
  CloudStudyRoom,
  WebCourse
} from '../types';

/* 1. Host New Live Study Room Modal with 1-Click Fast Presets & Quick-Toggles */
interface HostRoomModalProps {
  open: boolean;
  onClose: () => void;
  courses: WebCourse[];
  defaultCityBadge: string;
  isSubmitting: boolean;
  errorText: string;
  onCreateRoom: (payload: {
    courseCode: string;
    roomTitle: string;
    focusTopic: string;
    activeMinutes: number;
    visibility: 'CAMPUS' | 'UNLISTED';
    waitingRoomEnabled: boolean;
    whiteboardLocked: boolean;
    cityBadge: string;
  }) => void;
}

const QUICK_PRESETS = [
  { label: '25m Pomodoro Sprint', mins: 25, titleSuffix: 'Pomodoro Focus Sprint' },
  { label: '50m Past Paper Review', mins: 50, titleSuffix: 'Past Paper Drill' },
  { label: '90m Deep Exam Prep', mins: 90, titleSuffix: 'Deep Exam Prep' },
  { label: '15m Speed Flashcards', mins: 15, titleSuffix: 'Rapid Flashcard Review' }
];

export const HostRoomModal: React.FC<HostRoomModalProps> = ({
  open,
  onClose,
  courses,
  defaultCityBadge,
  isSubmitting,
  errorText,
  onCreateRoom
}) => {
  const [courseCode, setCourseCode] = useState(courses[0]?.code || 'CS301');
  const [roomTitle, setRoomTitle] = useState('');
  const [focusTopic, setFocusTopic] = useState('');
  const [minutes, setMinutes] = useState('50');
  const [visibility, setVisibility] = useState<'CAMPUS' | 'UNLISTED'>('CAMPUS');
  const [waitingRoomEnabled, setWaitingRoomEnabled] = useState(false);
  const [whiteboardLocked, setWhiteboardLocked] = useState(false);
  const [cityBadge, setCityBadge] = useState(defaultCityBadge || 'Remote Browser');

  useEffect(() => {
    if (open) {
      setCityBadge(defaultCityBadge || 'Remote Browser');
    }
  }, [open, defaultCityBadge]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCourse = (courseCode.trim().toUpperCase() || 'GEN 101').slice(0, 24);
    const effectiveTitle =
      roomTitle.trim().length >= 2
        ? roomTitle.trim().slice(0, 100)
        : `${cleanCourse} Live Study Session`;

    onCreateRoom({
      courseCode: cleanCourse,
      roomTitle: effectiveTitle,
      focusTopic: (focusTopic.trim() || 'Collaborative Exam Prep & Deep Focus').slice(0, 240),
      activeMinutes: Math.round(Math.max(5, Math.min(360, Number(minutes) || 50))),
      visibility,
      waitingRoomEnabled,
      whiteboardLocked,
      cityBadge: (cityBadge.trim() || 'Remote Browser').slice(0, 80)
    });
  };

  const applyPreset = (preset: typeof QUICK_PRESETS[number]) => {
    setMinutes(String(preset.mins));
    const clean = courseCode.trim().toUpperCase() || 'CS301';
    setRoomTitle(`${clean} ${preset.titleSuffix}`);
  };

  return (
    <AuraModal
      open={open}
      onClose={onClose}
      badge="CROSS-PLATFORM HOST CONSOLE"
      title="Host Live Study Session"
      subtitle="Generates an instant 6-character code & universal QR code that Android, iPhone Safari, and Chrome friends can enter."
      accentColor="violet"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {errorText && (
          <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-400/60 text-xs font-bold text-rose-200">
            {errorText}
          </div>
        )}

        {/* 1-Click Fast Presets */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400">1-Click Sprint Presets</span>
            <span className="text-[10px] text-cyan-400 font-bold">Auto-fills title &amp; clock</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="px-2.5 py-1.5 rounded-lg aura-subtle-surface hover:border-cyan-500/50 text-[11px] font-semibold text-slate-300 hover:text-white text-left transition truncate"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div className="col-span-2 space-y-1">
            <label className="text-[11px] font-bold text-slate-400">Course Code</label>
            <input
              list="host-course-options"
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              placeholder="e.g. CS301"
              className="w-full px-3.5 py-2.5 rounded-lg aura-input text-xs font-bold uppercase"
            />
            <datalist id="host-course-options">
              {courses.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.name}
                </option>
              ))}
            </datalist>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400">Duration (Min)</label>
            <input
              type="number"
              min={5}
              max={360}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg aura-input text-xs font-mono font-bold text-center"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-400">
            Session Title <span className="text-slate-500 font-normal">(auto-filled if empty)</span>
          </label>
          <input
            value={roomTitle}
            onChange={(e) => setRoomTitle(e.target.value)}
            placeholder={`e.g. ${(courseCode || 'CS301').toUpperCase()} Past Paper Sprint`}
            className="w-full px-3.5 py-2.5 rounded-lg aura-input text-xs"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400">Focus Topic / Goal</label>
            <input
              value={focusTopic}
              onChange={(e) => setFocusTopic(e.target.value)}
              placeholder="e.g. Chapter 4 Proofs & Live Polls"
              className="w-full px-3.5 py-2.5 rounded-lg aura-input text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400">Host Campus / Town</label>
            <input
              value={cityBadge}
              onChange={(e) => setCityBadge(e.target.value)}
              placeholder="e.g. Accra • Legon / Kumasi"
              className="w-full px-3.5 py-2.5 rounded-lg aura-input text-xs"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-400">Room Visibility</label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['CAMPUS', 'Open Campus Lobby + Code'],
                ['UNLISTED', 'Private Code / Link Only']
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setVisibility(mode)}
                className={`py-2 px-3 rounded-lg text-xs font-semibold border transition ${
                  visibility === mode
                    ? 'bg-cyan-500/15 border-cyan-500 text-cyan-300'
                    : 'aura-subtle-surface text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Security & Moderation Toggles */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={() => setWaitingRoomEnabled((v) => !v)}
            className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between gap-3 transition ${
              waitingRoomEnabled
                ? 'bg-amber-500/15 border-amber-400/60'
                : 'aura-subtle-surface'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-amber-300 shrink-0" />
              <div>
                <div className="text-xs font-bold">Waiting Room ("Knock to Join")</div>
                <div className="text-[11px] text-slate-400">
                  Guests knock first and wait for you to tap Admit
                </div>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                waitingRoomEnabled
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-white/10 text-slate-400'
              }`}
            >
              {waitingRoomEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setWhiteboardLocked((v) => !v)}
            className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between gap-3 transition ${
              whiteboardLocked
                ? 'bg-violet-500/15 border-violet-400/60'
                : 'aura-subtle-surface'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-violet-300 shrink-0" />
              <div>
                <div className="text-xs font-bold">Lecture Chalkboard Mode</div>
                <div className="text-[11px] text-slate-400">
                  Only Host & Co-Hosts can edit the shared board
                </div>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                whiteboardLocked
                  ? 'bg-violet-400 text-slate-950'
                  : 'bg-white/10 text-slate-400'
              }`}
            >
              {whiteboardLocked ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>

        <div className="flex gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg aura-subtle-surface hover:border-slate-600 text-xs font-semibold transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 py-2.5 rounded-lg aura-shimmer-btn text-slate-950 text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {isSubmitting ? 'Launching Room...' : 'Go Live Now'}
          </button>
        </div>
      </form>
    </AuraModal>
  );
};

/* 2. QR & Invite Link Modal with Native Web Share */
interface QrInviteModalProps {
  open: boolean;
  onClose: () => void;
  room: CloudStudyRoom;
  displayCode: string;
  shareUrl: string;
  onNotify: (msg: string) => void;
}

export const QrInviteModal: React.FC<QrInviteModalProps> = ({
  open,
  onClose,
  room,
  displayCode,
  shareUrl,
  onNotify
}) => {
  const canWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <AuraModal
      open={open}
      onClose={onClose}
      badge="UNIVERSAL ROOM INVITE"
      title={`Invite to ${room.courseCode}`}
      subtitle="Anyone on Android, iPhone Safari, Chrome, or Mac/PC can scan or enter this 6-character code."
      accentColor="sky"
      maxWidthClass="max-w-sm"
    >
      <div className="text-center space-y-3.5">
        <div className="bg-white p-4 rounded-xl inline-block mx-auto">
          <QRCodeSVG value={shareUrl} size={184} />
        </div>

        <div className="p-3.5 rounded-lg aura-subtle-surface space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">
            6-CHARACTER JOIN CODE
          </div>
          <div className="font-mono text-3xl font-bold tracking-widest text-cyan-400">
            {displayCode}
          </div>
          <div className="text-[11px] text-slate-400 break-all pt-1">{shareUrl}</div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(shareUrl);
              onNotify(`Copied Invite Link (Code: ${displayCode})!`);
            }}
            className="flex-1 py-2.5 px-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
          >
            <Copy className="w-3.5 h-3.5" /> Copy Link
          </button>

          {canWebShare ? (
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.share({
                    title: `Join ${room.courseCode}: ${room.roomTitle}`,
                    text: `Join my live AURA study room (${room.courseCode})! Use code ${displayCode} or tap:`,
                    url: shareUrl
                  });
                } catch {
                  // Cancelled share sheet
                }
              }}
              className="flex-1 py-2.5 px-3 rounded-lg aura-subtle-surface hover:border-cyan-500/50 text-cyan-300 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(displayCode);
                onNotify(`Copied Code ${displayCode}!`);
              }}
              className="flex-1 py-2.5 px-3 rounded-lg aura-subtle-surface text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" /> Copy Code
            </button>
          )}
        </div>
      </div>
    </AuraModal>
  );
};

/* 3. Launch Live Pop-Quiz Poll Modal with Preset Exam Templates */
interface CreatePollModalProps {
  open: boolean;
  onClose: () => void;
  onLaunchPoll: (question: string, options: string[], correctIndex: number) => void;
}

const POLL_TEMPLATES = [
  {
    q: 'True or False: A Semaphore with count 1 behaves identically to a Mutex lock.',
    opts: ['True', 'False'],
    correct: 0
  },
  {
    q: 'What is the worst-case time complexity of QuickSort?',
    opts: ['O(n log n)', 'O(n²)', 'O(n)', 'O(log n)'],
    correct: 1
  },
  {
    q: 'Sprint Check-In: What is your energy & focus level right now?',
    opts: ['Locked in (100%)', 'Good pace (75%)', 'Need 5m break', 'Need concept review'],
    correct: -1
  }
];

export const CreatePollModal: React.FC<CreatePollModalProps> = ({
  open,
  onClose,
  onLaunchPoll
}) => {
  const [question, setQuestion] = useState('');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [hasCorrect, setHasCorrect] = useState(true);
  const [correctIdx, setCorrectIdx] = useState(0);

  const applyTemplate = (t: typeof POLL_TEMPLATES[number]) => {
    setQuestion(t.q);
    setOptA(t.opts[0] || '');
    setOptB(t.opts[1] || '');
    setOptC(t.opts[2] || '');
    setOptD(t.opts[3] || '');
    if (t.correct >= 0) {
      setHasCorrect(true);
      setCorrectIdx(t.correct);
    } else {
      setHasCorrect(false);
      setCorrectIdx(-1);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const opts = [optA, optB, optC, optD].map((s) => s.trim().slice(0, 160)).filter(Boolean);
    if (!question.trim() || opts.length < 2) return;
    const safeCorrect = hasCorrect ? Math.min(correctIdx, opts.length - 1) : -1;
    onLaunchPoll(question.trim().slice(0, 300), opts.slice(0, 4), safeCorrect);
    setQuestion('');
    setOptA('');
    setOptB('');
    setOptC('');
    setOptD('');
    onClose();
  };

  return (
    <AuraModal
      open={open}
      onClose={onClose}
      badge="LIVE STAGE POLL"
      title="Launch Pop-Quiz or Room Poll"
      subtitle="Pushes immediately to every Android phone & iPhone/Web browser in the room."
      accentColor="sky"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Fast Exam Templates */}
        <div className="space-y-1">
          <span className="text-[11px] font-bold text-slate-400">Instant Quick Templates</span>
          <div className="flex flex-wrap gap-1.5">
            {POLL_TEMPLATES.map((t, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => applyTemplate(t)}
                className="px-2.5 py-1 rounded-lg aura-subtle-surface hover:border-cyan-500/50 text-[10px] font-semibold text-slate-300 hover:text-white transition"
              >
                {t.q.slice(0, 32)}...
              </button>
            ))}
          </div>
        </div>

        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Question prompt (e.g. Which layer does TCP belong to?)"
          className="w-full px-3.5 py-2.5 rounded-lg aura-input text-xs font-semibold"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            value={optA}
            onChange={(e) => setOptA(e.target.value)}
            placeholder="Option A (required)"
            className="w-full px-3.5 py-2 rounded-lg aura-input text-xs"
          />
          <input
            value={optB}
            onChange={(e) => setOptB(e.target.value)}
            placeholder="Option B (required)"
            className="w-full px-3.5 py-2 rounded-lg aura-input text-xs"
          />
          <input
            value={optC}
            onChange={(e) => setOptC(e.target.value)}
            placeholder="Option C (optional)"
            className="w-full px-3.5 py-2 rounded-lg aura-input text-xs"
          />
          <input
            value={optD}
            onChange={(e) => setOptD(e.target.value)}
            placeholder="Option D (optional)"
            className="w-full px-3.5 py-2 rounded-lg aura-input text-xs"
          />
        </div>

        <label className="flex items-center gap-2 text-xs pt-1 cursor-pointer">
          <input
            type="checkbox"
            checked={hasCorrect}
            onChange={(e) => setHasCorrect(e.target.checked)}
          />
          <span>Mark a Correct Answer (Pop-Quiz Mode)</span>
        </label>

        {hasCorrect && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Correct:</span>
            {['A', 'B', 'C', 'D'].map((letter, idx) => (
              <button
                key={letter}
                type="button"
                onClick={() => setCorrectIdx(idx)}
                className={`px-3 py-1 rounded-lg font-bold transition ${
                  correctIdx === idx
                    ? 'bg-cyan-500 text-slate-950'
                    : 'aura-subtle-surface text-slate-300'
                }`}
              >
                {letter}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg aura-subtle-surface text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold"
          >
            Push Poll Live
          </button>
        </div>
      </form>
    </AuraModal>
  );
};

/* 4. Pin Spotlight Modal with Quick Sprint Goal Fillers */
interface PinSpotlightModalProps {
  open: boolean;
  onClose: () => void;
  initialText: string;
  onPin: (text: string) => void;
}

const SPOTLIGHT_SUGGESTIONS = [
  '50m Sprint Target: Complete 5 past-paper questions on Section B before break.',
  'Theorem Spotlight: Euler Formula e^(iπ) + 1 = 0 & Fourier transform identities.',
  'Key Discussion: How does Deadlock Avoidance differ from Deadlock Detection?'
];

export const PinSpotlightModal: React.FC<PinSpotlightModalProps> = ({
  open,
  onClose,
  initialText,
  onPin
}) => {
  const [draft, setDraft] = useState(initialText);

  useEffect(() => {
    if (open) setDraft(initialText);
  }, [open, initialText]);

  return (
    <AuraModal
      open={open}
      onClose={onClose}
      badge="STAGE SPOTLIGHT"
      title="Pin Top Stage Spotlight"
      subtitle="Pins a past-paper question, theorem, or focus target at the top of everyone's screen in real time."
      accentColor="amber"
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <span className="text-[11px] font-bold text-slate-400">Fast Suggestions</span>
          <div className="space-y-1">
            {SPOTLIGHT_SUGGESTIONS.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setDraft(s)}
                className="w-full text-left p-2 rounded-lg aura-subtle-surface hover:border-amber-500/50 text-[11px] text-slate-300 hover:text-white transition line-clamp-1"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <textarea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Paste past-paper question, theorem, or sprint goal..."
          className="w-full p-3.5 rounded-xl aura-input text-xs"
        />

        <div className="flex gap-2">
          {initialText ? (
            <button
              type="button"
              onClick={() => {
                onPin('');
                onClose();
              }}
              className="flex-1 py-2.5 rounded-xl bg-rose-500/20 text-rose-300 text-xs font-bold"
            >
              Unpin Spotlight
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl aura-subtle-surface text-xs font-bold"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onPin(draft.trim().slice(0, 600));
              onClose();
            }}
            className="flex-1 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-extrabold"
          >
            Pin to Stage
          </button>
        </div>
      </div>
    </AuraModal>
  );
};

/* 5. Share Flashcard Modal */
interface ShareFlashcardModalProps {
  open: boolean;
  onClose: () => void;
  courseCode: string;
  onShareCard: (question: string, answer: string) => void;
}

export const ShareFlashcardModal: React.FC<ShareFlashcardModalProps> = ({
  open,
  onClose,
  courseCode,
  onShareCard
}) => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim().length < 2 || !answer.trim()) return;
    onShareCard(question.trim().slice(0, 500), answer.trim().slice(0, 1000));
    setQuestion('');
    setAnswer('');
    onClose();
  };

  return (
    <AuraModal
      open={open}
      onClose={onClose}
      badge={`${courseCode} DECK`}
      title="Drop Flashcard to Room"
      subtitle="Every classmate in the room can save this card directly to their SM-2 deck."
      accentColor="emerald"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Question / Front of Card (min 2 chars)"
          className="w-full px-3.5 py-2.5 rounded-xl aura-input text-xs"
        />
        <textarea
          rows={3}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Verified Answer / Formula"
          className="w-full p-3.5 rounded-xl aura-input text-xs"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl aura-subtle-surface text-xs font-bold"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-extrabold inline-flex items-center justify-center gap-1 shadow-md shadow-emerald-500/20"
          >
            <Plus className="w-4 h-4" /> Drop Card
          </button>
        </div>
      </form>
    </AuraModal>
  );
};

/* 6. Custom Shared Room Timer Modal */
interface CustomStageTimerModalProps {
  open: boolean;
  onClose: () => void;
  currentMinutes: number;
  onApplyMinutes: (minutes: number) => void;
}

export const CustomStageTimerModal: React.FC<CustomStageTimerModalProps> = ({
  open,
  onClose,
  currentMinutes,
  onApplyMinutes
}) => {
  const [mins, setMins] = useState(String(currentMinutes || 45));

  useEffect(() => {
    if (open) setMins(String(currentMinutes || 45));
  }, [open, currentMinutes]);

  return (
    <AuraModal
      open={open}
      onClose={onClose}
      badge="SYNCED ROOM CLOCK"
      title="Set Shared Sprint Duration"
      subtitle="Updates the countdown timer across all Android & Browser screens."
      accentColor="emerald"
      maxWidthClass="max-w-sm"
    >
      <div className="flex flex-wrap gap-1.5">
        {[15, 25, 45, 60, 90, 120].map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setMins(String(preset))}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
              Number(mins) === preset
                ? 'bg-emerald-400 text-slate-950 border-emerald-300'
                : 'aura-subtle-surface text-slate-300'
            }`}
          >
            {preset}m
          </button>
        ))}
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-bold text-slate-400">Custom Minutes (1 – 360)</label>
        <input
          type="number"
          min={1}
          max={360}
          value={mins}
          onChange={(e) => setMins(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl aura-input text-center font-mono font-bold text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl aura-subtle-surface text-xs font-bold"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            const parsed = Math.round(Math.max(1, Math.min(360, Number(mins) || 45)));
            onApplyMinutes(parsed);
            onClose();
          }}
          className="flex-1 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20"
        >
          <Clock className="w-3.5 h-3.5" /> Apply Timer
        </button>
      </div>
    </AuraModal>
  );
};

/* 7. Moderate Participant Modal */
interface ModerateScholarModalProps {
  target: CloudParticipant | null;
  isHost: boolean;
  isTargetCoHost: boolean;
  onClose: () => void;
  onLowerHand: (p: CloudParticipant) => void;
  onToggleCoHost: (uid: string) => void;
  onRemoveParticipant: (uid: string) => void;
  onToggleMuteParticipant?: (uid: string, mute: boolean) => void;
}

export const ModerateScholarModal: React.FC<ModerateScholarModalProps> = ({
  target,
  isHost,
  isTargetCoHost,
  onClose,
  onLowerHand,
  onToggleCoHost,
  onRemoveParticipant,
  onToggleMuteParticipant
}) => {
  if (!target) return null;
  return (
    <AuraModal
      open={Boolean(target)}
      onClose={onClose}
      badge="STAGE MODERATION"
      title={`Moderate ${target.displayName}`}
      subtitle={`${target.cityOrCampus || 'Remote'} • ${target.devicePlatform}`}
      accentColor="sky"
      maxWidthClass="max-w-sm"
    >
      <div className="space-y-2">
        {onToggleMuteParticipant && (
          <button
            type="button"
            onClick={() => {
              onToggleMuteParticipant(target.userId, !target.isMuted);
              onClose();
            }}
            className={`w-full py-2.5 px-3 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-2 transition ${
              target.isMuted
                ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200 hover:bg-emerald-500/30'
                : 'bg-amber-500/20 border-amber-400/50 text-amber-200 hover:bg-amber-500/30'
            }`}
          >
            {target.isMuted ? <Mic className="w-4 h-4 text-emerald-300" /> : <MicOff className="w-4 h-4 text-amber-300" />}
            {target.isMuted ? 'Unmute Scholar' : 'Mute Scholar Mic'}
          </button>
        )}

        {target.handRaised && (
          <button
            type="button"
            onClick={() => {
              onLowerHand(target);
              onClose();
            }}
            className="w-full py-2.5 px-3 rounded-xl aura-subtle-surface hover:bg-white/15 text-xs font-bold flex items-center justify-center gap-2"
          >
            <Hand className="w-4 h-4 text-amber-300" /> Lower Raised Hand
          </button>
        )}

        {isHost && (
          <button
            type="button"
            onClick={() => {
              onToggleCoHost(target.userId);
              onClose();
            }}
            className="w-full py-2.5 px-3 rounded-xl bg-sky-500/20 border border-sky-400/50 text-sky-200 text-xs font-extrabold flex items-center justify-center gap-2"
          >
            <ShieldAlert className="w-4 h-4" />
            {isTargetCoHost ? 'Remove Co-Host Privilege' : 'Promote to Co-Host'}
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            onRemoveParticipant(target.userId);
            onClose();
          }}
          className="w-full py-2.5 px-3 rounded-xl bg-rose-500/20 border border-rose-400/50 text-rose-300 text-xs font-extrabold flex items-center justify-center gap-2"
        >
          <UserMinus className="w-4 h-4" /> Remove from Session
        </button>
      </div>
    </AuraModal>
  );
};

/* 8. Smart Session Recap Modal */
interface SessionRecapModalProps {
  open: boolean;
  onClose: () => void;
  room: CloudStudyRoom;
  participants: CloudParticipant[];
  messages: CloudRoomMessage[];
  sharedCards: CloudSharedCard[];
  onSaveToNotes: (title: string, content: string) => void;
  onNotify: (msg: string) => void;
}

export const SessionRecapModal: React.FC<SessionRecapModalProps> = ({
  open,
  onClose,
  room,
  participants,
  messages,
  sharedCards,
  onSaveToNotes,
  onNotify
}) => {
  const recapText = [
    `AURA SMART STUDY MINUTES`,
    `Course: ${room.courseCode} — ${room.roomTitle}`,
    `Host: ${room.ownerName} • Sprint: ${room.activeMinutes} mins`,
    `Topic: ${room.focusTopic}`,
    ``,
    `ATTENDEES (${Math.max(1, participants.filter((p) => p.admissionStatus !== 'REMOVED').length)}):`,
    ...participants
      .filter((p) => p.admissionStatus !== 'REMOVED')
      .map((p) => `• ${p.displayName} (${p.cityOrCampus || 'Remote'} • ${p.devicePlatform})`),
    ...(room.spotlightCardText
      ? ['', 'SPOTLIGHTED FOCUS:', room.spotlightCardText]
      : []),
    ...(room.sharedBoardNote
      ? ['', 'SHARED CHALKBOARD / FORMULAS:', room.sharedBoardNote]
      : []),
    ...(sharedCards.length > 0
      ? [
          '',
          `FLASHCARDS DROPPED (${sharedCards.length}):`,
          ...sharedCards.slice(0, 15).map((c, idx) => `${idx + 1}. Q: ${c.question}\n   A: ${c.answer}`)
        ]
      : []),
    ...(messages.length > 0
      ? [
          '',
          'KEY LIVE Q&A HIGHLIGHTS:',
          ...messages.slice(-10).map((m) => `• ${m.authorName}: ${m.text}`)
        ]
      : [])
  ].join('\n');

  return (
    <AuraModal
      open={open}
      onClose={onClose}
      badge="SESSION MINUTES"
      title="Smart Study Session Recap"
      subtitle="Save the shared formulas, flashcards, and Q&A straight to your Notes Vault."
      accentColor="sky"
    >
      <pre className="p-3.5 rounded-lg aura-subtle-surface text-[11px] whitespace-pre-wrap font-sans max-h-60 overflow-y-auto leading-relaxed">
        {recapText}
      </pre>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            onSaveToNotes(`Meeting Recap: ${room.roomTitle}`, recapText);
            onClose();
          }}
          className="flex-1 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
        >
          <BookmarkPlus className="w-4 h-4" /> Save to Notes
        </button>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(recapText);
            onNotify('Copied Smart Study Minutes to clipboard!');
          }}
          className="flex-1 py-2.5 rounded-lg aura-subtle-surface text-xs font-semibold inline-flex items-center justify-center gap-1.5"
        >
          <Copy className="w-3.5 h-3.5" /> Copy Text
        </button>
      </div>
    </AuraModal>
  );
};
