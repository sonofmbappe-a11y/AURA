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
  Radio,
  Share2,
  Shield,
  ShieldAlert,
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

/* 1. Host New Live Study Room Modal */
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
      badge="Live Session Console"
      title="Host Live Study Session"
      subtitle="Creates a 6-character code and QR link compatible with Android and desktop browsers."
      accentColor="sky"
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {errorText && (
          <div className="p-3 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#991B1B]">
            {errorText}
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold text-[#6B7280] uppercase">Quick Presets</span>
            <span className="font-mono text-[10px] text-[#1E3A8A] font-semibold">Auto-fills duration</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="px-2.5 py-1.5 rounded-md bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#1E3A8A] text-[11px] font-semibold text-[#111827] text-left transition-colors duration-150 truncate"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div className="col-span-2 space-y-1">
            <label className="font-mono text-[10px] font-bold text-[#6B7280] uppercase">Course Code</label>
            <input
              list="host-course-options"
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              placeholder="CS301"
              className="w-full px-3 py-2 rounded-md aura-input text-xs font-mono font-bold uppercase"
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
            <label className="font-mono text-[10px] font-bold text-[#6B7280] uppercase">Duration (m)</label>
            <input
              type="number"
              min={5}
              max={360}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-full px-3 py-2 rounded-md aura-input text-xs font-mono font-bold text-center"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="font-mono text-[10px] font-bold text-[#6B7280] uppercase">
            Session Title
          </label>
          <input
            value={roomTitle}
            onChange={(e) => setRoomTitle(e.target.value)}
            placeholder={`${(courseCode || 'CS301').toUpperCase()} Past Paper Sprint`}
            className="w-full px-3 py-2 rounded-md aura-input text-xs"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <label className="font-mono text-[10px] font-bold text-[#6B7280] uppercase">Focus Topic</label>
            <input
              value={focusTopic}
              onChange={(e) => setFocusTopic(e.target.value)}
              placeholder="Chapter 4 Proofs"
              className="w-full px-3 py-2 rounded-md aura-input text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="font-mono text-[10px] font-bold text-[#6B7280] uppercase">Campus / Location</label>
            <input
              value={cityBadge}
              onChange={(e) => setCityBadge(e.target.value)}
              placeholder="Campus Library"
              className="w-full px-3 py-2 rounded-md aura-input text-xs"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="font-mono text-[10px] font-bold text-[#6B7280] uppercase">Visibility</label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['CAMPUS', 'Campus Lobby + Code'],
                ['UNLISTED', 'Private Code / Link']
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setVisibility(mode)}
                className={`py-2 px-3 rounded-md text-xs font-semibold border transition-colors duration-150 ${
                  visibility === mode
                    ? 'bg-[#EFF6FF] border-[#1E3A8A] text-[#1E3A8A]'
                    : 'bg-[#FFFFFF] border-[#E5E7EB] text-[#6B7280] hover:border-[#9CA3AF]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={() => setWaitingRoomEnabled((v) => !v)}
            className={`w-full p-2.5 rounded-md border text-left flex items-center justify-between gap-3 transition-colors duration-150 ${
              waitingRoomEnabled
                ? 'bg-[#FFFBEB] border-[#FDE68A]'
                : 'bg-[#F9FAFB] border-[#E5E7EB]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-[#B45309] shrink-0" />
              <div>
                <div className="text-xs font-semibold text-[#111827]">Waiting Room Approval</div>
                <div className="text-[11px] text-[#6B7280]">
                  Guests knock before entering the live stage
                </div>
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                waitingRoomEnabled
                  ? 'bg-[#B45309] text-[#FFFFFF]'
                  : 'bg-[#E5E7EB] text-[#4B5563]'
              }`}
            >
              {waitingRoomEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setWhiteboardLocked((v) => !v)}
            className={`w-full p-2.5 rounded-md border text-left flex items-center justify-between gap-3 transition-colors duration-150 ${
              whiteboardLocked
                ? 'bg-[#EFF6FF] border-[#BFDBFE]'
                : 'bg-[#F9FAFB] border-[#E5E7EB]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-[#1E3A8A] shrink-0" />
              <div>
                <div className="text-xs font-semibold text-[#111827]">Host-Only Chalkboard</div>
                <div className="text-[11px] text-[#6B7280]">
                  Restrict shared board edits to host and co-hosts
                </div>
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                whiteboardLocked
                  ? 'bg-[#1E3A8A] text-[#FFFFFF]'
                  : 'bg-[#E5E7EB] text-[#4B5563]'
              }`}
            >
              {whiteboardLocked ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] hover:border-[#9CA3AF] text-xs font-semibold text-[#4B5563] transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 py-2 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors duration-150"
          >
            <Radio className="w-3.5 h-3.5" />
            {isSubmitting ? 'Launching...' : 'Start Live Room'}
          </button>
        </div>
      </form>
    </AuraModal>
  );
};

/* 2. QR & Invite Link Modal */
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
      badge="Room Invite"
      title={`Invite to ${room.courseCode}`}
      subtitle="Scan QR or enter the 6-character code on Android or Web."
      accentColor="sky"
      maxWidthClass="max-w-sm"
    >
      <div className="text-center space-y-3.5">
        <div className="bg-[#FFFFFF] p-4 rounded-md border border-[#E5E7EB] inline-block mx-auto">
          <QRCodeSVG value={shareUrl} size={180} />
        </div>

        <div className="p-3.5 rounded-md bg-[#F9FAFB] border border-[#E5E7EB] space-y-1">
          <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#6B7280]">
            Join Code
          </div>
          <div className="font-mono text-3xl font-bold tracking-widest text-[#1E3A8A]">
            {displayCode}
          </div>
          <div className="font-mono text-[10px] text-[#6B7280] break-all pt-1">{shareUrl}</div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(shareUrl);
              onNotify(`Copied Invite Link (${displayCode}).`);
            }}
            className="flex-1 py-2 px-3 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
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
                    text: `Join live study room (${room.courseCode}). Code: ${displayCode}`,
                    url: shareUrl
                  });
                } catch {}
              }}
              className="flex-1 py-2 px-3 rounded-md bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#1E3A8A] text-[#1E3A8A] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(displayCode);
                onNotify(`Copied Code ${displayCode}.`);
              }}
              className="flex-1 py-2 px-3 rounded-md bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#9CA3AF] text-[#111827] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" /> Copy Code
            </button>
          )}
        </div>
      </div>
    </AuraModal>
  );
};

/* 3. Launch Live Pop-Quiz Poll Modal */
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
    q: 'Sprint Check-In: What is your focus status right now?',
    opts: ['Deep Focus (100%)', 'Steady Pace', 'Need 5m Break', 'Need Concept Review'],
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
      badge="Stage Poll"
      title="Launch Pop-Quiz or Poll"
      subtitle="Pushes simultaneously to every participant in the study room."
      accentColor="sky"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <span className="font-mono text-[10px] font-bold text-[#6B7280] uppercase">Quick Templates</span>
          <div className="flex flex-wrap gap-1.5">
            {POLL_TEMPLATES.map((t, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => applyTemplate(t)}
                className="px-2.5 py-1 rounded-md bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#1E3A8A] text-[10px] font-semibold text-[#374151] transition-colors duration-150"
              >
                {t.q.slice(0, 32)}...
              </button>
            ))}
          </div>
        </div>

        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Question prompt"
          className="w-full px-3 py-2 rounded-md aura-input text-xs font-semibold"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            value={optA}
            onChange={(e) => setOptA(e.target.value)}
            placeholder="Option A (required)"
            className="w-full px-3 py-2 rounded-md aura-input text-xs"
          />
          <input
            value={optB}
            onChange={(e) => setOptB(e.target.value)}
            placeholder="Option B (required)"
            className="w-full px-3 py-2 rounded-md aura-input text-xs"
          />
          <input
            value={optC}
            onChange={(e) => setOptC(e.target.value)}
            placeholder="Option C (optional)"
            className="w-full px-3 py-2 rounded-md aura-input text-xs"
          />
          <input
            value={optD}
            onChange={(e) => setOptD(e.target.value)}
            placeholder="Option D (optional)"
            className="w-full px-3 py-2 rounded-md aura-input text-xs"
          />
        </div>

        <label className="flex items-center gap-2 text-xs pt-1 cursor-pointer text-[#111827]">
          <input
            type="checkbox"
            checked={hasCorrect}
            onChange={(e) => setHasCorrect(e.target.checked)}
            className="accent-[#1E3A8A]"
          />
          <span>Mark a Correct Answer (Pop-Quiz Mode)</span>
        </label>

        {hasCorrect && (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-[#6B7280] text-[11px]">Correct:</span>
            {['A', 'B', 'C', 'D'].map((letter, idx) => (
              <button
                key={letter}
                type="button"
                onClick={() => setCorrectIdx(idx)}
                className={`px-3 py-1 rounded-md font-mono font-bold transition-colors duration-150 ${
                  correctIdx === idx
                    ? 'bg-[#1E3A8A] text-[#FFFFFF]'
                    : 'bg-[#F3F4F6] text-[#4B5563] border border-[#E5E7EB]'
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
            className="flex-1 py-2 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] text-xs font-semibold text-[#4B5563]"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 py-2 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold"
          >
            Push Poll Live
          </button>
        </div>
      </form>
    </AuraModal>
  );
};

/* 4. Pin Spotlight Modal */
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
      badge="Stage Spotlight"
      title="Pin Stage Spotlight"
      subtitle="Pins a theorem, prompt, or goal at the top of the stage for all scholars."
      accentColor="amber"
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <span className="font-mono text-[10px] font-bold text-[#6B7280] uppercase">Quick Prompts</span>
          <div className="space-y-1">
            {SPOTLIGHT_SUGGESTIONS.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setDraft(s)}
                className="w-full text-left p-2 rounded-md bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#1E3A8A] text-[11px] text-[#374151] transition-colors duration-150 line-clamp-1"
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
          placeholder="Paste question, theorem, or sprint goal..."
          className="w-full p-3 rounded-md aura-input text-xs"
        />

        <div className="flex gap-2">
          {initialText ? (
            <button
              type="button"
              onClick={() => {
                onPin('');
                onClose();
              }}
              className="flex-1 py-2 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-xs font-semibold"
            >
              Unpin Spotlight
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] text-xs font-semibold text-[#4B5563]"
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
            className="flex-1 py-2 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold"
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
      badge={`${courseCode} Deck`}
      title="Share Flashcard to Room"
      subtitle="Participants can import this card straight into their SM-2 review deck."
      accentColor="sky"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Question / Prompt"
          className="w-full px-3 py-2 rounded-md aura-input text-xs"
        />
        <textarea
          rows={3}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Verified Answer / Formula"
          className="w-full p-3 rounded-md aura-input text-xs"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] text-xs font-semibold text-[#4B5563]"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 py-2 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold inline-flex items-center justify-center gap-1"
          >
            <Plus className="w-4 h-4" /> Share Card
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
      badge="Synchronized Clock"
      title="Set Shared Sprint Duration"
      subtitle="Updates the countdown timer across all connected scholars."
      accentColor="sky"
      maxWidthClass="max-w-sm"
    >
      <div className="flex flex-wrap gap-1.5">
        {[15, 25, 45, 60, 90, 120].map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setMins(String(preset))}
            className={`px-3 py-1.5 rounded-md font-mono text-xs font-semibold border transition-colors duration-150 ${
              Number(mins) === preset
                ? 'bg-[#1E3A8A] text-[#FFFFFF] border-[#1E3A8A]'
                : 'bg-[#FFFFFF] border-[#E5E7EB] text-[#4B5563] hover:border-[#9CA3AF]'
            }`}
          >
            {preset}m
          </button>
        ))}
      </div>
      <div className="space-y-1">
        <label className="font-mono text-[10px] font-bold text-[#6B7280] uppercase">Custom Minutes (1 – 360)</label>
        <input
          type="number"
          min={1}
          max={360}
          value={mins}
          onChange={(e) => setMins(e.target.value)}
          className="w-full px-3 py-2 rounded-md aura-input text-center font-mono font-bold text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] text-xs font-semibold text-[#4B5563]"
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
          className="flex-1 py-2 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
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
      badge="Moderation"
      title={`Moderate ${target.displayName}`}
      subtitle={`${target.cityOrCampus || 'Remote'} · ${target.devicePlatform}`}
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
            className={`w-full py-2 px-3 rounded-md border text-xs font-semibold flex items-center justify-center gap-2 transition-colors duration-150 ${
              target.isMuted
                ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]'
                : 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]'
            }`}
          >
            {target.isMuted ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
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
            className="w-full py-2 px-3 rounded-md bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#9CA3AF] text-xs font-semibold text-[#111827] flex items-center justify-center gap-2"
          >
            <Hand className="w-4 h-4 text-[#B45309]" /> Lower Raised Hand
          </button>
        )}

        {isHost && (
          <button
            type="button"
            onClick={() => {
              onToggleCoHost(target.userId);
              onClose();
            }}
            className="w-full py-2 px-3 rounded-md bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E3A8A] text-xs font-semibold flex items-center justify-center gap-2"
          >
            <ShieldAlert className="w-4 h-4" />
            {isTargetCoHost ? 'Revoke Co-Host' : 'Promote to Co-Host'}
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            onRemoveParticipant(target.userId);
            onClose();
          }}
          className="w-full py-2 px-3 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-xs font-semibold flex items-center justify-center gap-2"
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
    `AURA STUDY MINUTES`,
    `Course: ${room.courseCode} — ${room.roomTitle}`,
    `Host: ${room.ownerName} · Sprint: ${room.activeMinutes} mins`,
    `Topic: ${room.focusTopic}`,
    ``,
    `ATTENDEES (${Math.max(1, participants.filter((p) => p.admissionStatus !== 'REMOVED').length)}):`,
    ...participants
      .filter((p) => p.admissionStatus !== 'REMOVED')
      .map((p) => `• ${p.displayName} (${p.cityOrCampus || 'Remote'} · ${p.devicePlatform})`),
    ...(room.spotlightCardText
      ? ['', 'SPOTLIGHTED FOCUS:', room.spotlightCardText]
      : []),
    ...(room.sharedBoardNote
      ? ['', 'SHARED BOARD NOTES:', room.sharedBoardNote]
      : []),
    ...(sharedCards.length > 0
      ? [
          '',
          `FLASHCARDS SHARED (${sharedCards.length}):`,
          ...sharedCards.slice(0, 15).map((c, idx) => `${idx + 1}. Q: ${c.question}\n   A: ${c.answer}`)
        ]
      : []),
    ...(messages.length > 0
      ? [
          '',
          'LIVE Q&A LOG:',
          ...messages.slice(-10).map((m) => `• ${m.authorName}: ${m.text}`)
        ]
      : [])
  ].join('\n');

  return (
    <AuraModal
      open={open}
      onClose={onClose}
      badge="Session Minutes"
      title="Study Session Recap"
      subtitle="Save shared notes, flashcards, and Q&A straight to your Notes Vault."
      accentColor="sky"
    >
      <pre className="p-3 rounded-md bg-[#F9FAFB] border border-[#E5E7EB] text-[11px] text-[#111827] whitespace-pre-wrap font-mono max-h-60 overflow-y-auto leading-relaxed">
        {recapText}
      </pre>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            onSaveToNotes(`Meeting Recap: ${room.roomTitle}`, recapText);
            onClose();
          }}
          className="flex-1 py-2 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
        >
          <BookmarkPlus className="w-4 h-4" /> Save to Notes
        </button>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(recapText);
            onNotify('Copied session minutes.');
          }}
          className="flex-1 py-2 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] hover:border-[#9CA3AF] text-[#111827] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
        >
          <Copy className="w-3.5 h-3.5" /> Copy Text
        </button>
      </div>
    </AuraModal>
  );
};
