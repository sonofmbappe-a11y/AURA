import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Headphones,
  Pause,
  Play,
  RotateCcw,
  Sliders,
  Volume2,
  VolumeX,
  Plus,
  Flame
} from 'lucide-react';
import type { AuraLocalVault } from '../types';
import { uidGen } from '../storage';
import { AuraModal } from './AuraModal';

interface Props {
  vault: AuraLocalVault;
  onUpdateVault: (updater: (prev: AuraLocalVault) => AuraLocalVault) => void;
}

type SoundMode = 'OFF' | 'BROWN' | 'RAIN' | 'GAMMA';

export const FocusView: React.FC<Props> = ({ vault, onUpdateVault }) => {
  const [totalSeconds, setTotalSeconds] = useState(25 * 60);
  const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(vault.courses[0]?.code || 'CS301');

  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customHours, setCustomHours] = useState('0');
  const [customMinutes, setCustomMinutes] = useState('45');
  const [customSecs, setCustomSecs] = useState('0');

  const [distractionInput, setDistractionInput] = useState('');

  const [soundMode, setSoundMode] = useState<SoundMode>('OFF');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const cleanupSoundRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isRunning) {
      document.title = 'AURA • Academic Workspace';
      return;
    }
    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          const minsEarned = Math.max(1, Math.round(totalSeconds / 60));
          onUpdateVault((v) => ({
            ...v,
            focusSessions: [
              {
                id: uidGen('foc'),
                courseCode: selectedCourse,
                durationMinutes: minsEarned,
                completedAt: Date.now()
              },
              ...v.focusSessions
            ]
          }));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRunning, totalSeconds, selectedCourse, onUpdateVault]);

  useEffect(() => {
    if (isRunning) {
      const m = Math.floor(remainingSeconds / 60);
      const s = remainingSeconds % 60;
      document.title = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} • AURA Focus`;
    }
  }, [remainingSeconds, isRunning]);

  const stopSoundscape = () => {
    if (cleanupSoundRef.current) {
      cleanupSoundRef.current();
      cleanupSoundRef.current = null;
    }
  };

  const applySoundscape = (mode: SoundMode) => {
    stopSoundscape();
    setSoundMode(mode);
    if (mode === 'OFF') return;

    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new Ctx();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    if (mode === 'GAMMA') {
      const left = ctx.createOscillator();
      const right = ctx.createOscillator();
      const merger = ctx.createChannelMerger(2);
      const gain = ctx.createGain();
      gain.gain.value = 0.04;
      left.frequency.value = 200;
      right.frequency.value = 240;
      left.connect(merger, 0, 0);
      right.connect(merger, 0, 1);
      merger.connect(gain);
      gain.connect(ctx.destination);
      left.start();
      right.start();
      cleanupSoundRef.current = () => {
        try {
          left.stop();
          right.stop();
          gain.disconnect();
        } catch {
          // ignore
        }
      };
      return;
    }

    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (mode === 'BROWN') {
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        output[i] *= 3.2;
      } else {
        output[i] = white * 0.5;
      }
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = mode === 'RAIN' ? 950 : 380;

    const gain = ctx.createGain();
    gain.gain.value = mode === 'RAIN' ? 0.06 : 0.09;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start();

    cleanupSoundRef.current = () => {
      try {
        noise.stop();
        gain.disconnect();
      } catch {
        // ignore
      }
    };
  };

  useEffect(() => () => stopSoundscape(), []);

  const setPresetSeconds = (secs: number) => {
    const clamped = Math.max(10, Math.min(43200, secs));
    setIsRunning(false);
    setTotalSeconds(clamped);
    setRemainingSeconds(clamped);
  };

  const applyCustomDuration = () => {
    const h = Math.max(0, Math.min(12, Number(customHours) || 0));
    const m = Math.max(0, Math.min(59, Number(customMinutes) || 0));
    const s = Math.max(0, Math.min(59, Number(customSecs) || 0));
    const total = Math.max(10, Math.min(43200, h * 3600 + m * 60 + s));
    setPresetSeconds(total);
    setShowCustomModal(false);
  };

  const hrs = Math.floor(remainingSeconds / 3600);
  const mins = Math.floor((remainingSeconds % 3600) / 60);
  const secs = remainingSeconds % 60;
  const formatted =
    hrs > 0
      ? `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const progress = totalSeconds > 0 ? (totalSeconds - remainingSeconds) / totalSeconds : 0;
  const circumference = 2 * Math.PI * 104;
  const totalLoggedMins = vault.focusSessions.reduce((s, x) => s + x.durationMinutes, 0);

  const scholarStreakDays = useMemo(() => {
    const uniqueDays = new Set(
      vault.focusSessions.map((s) => new Date(s.completedAt).toDateString())
    );
    return Math.max(1, uniqueDays.size);
  }, [vault.focusSessions]);

  const scholarRank = useMemo(() => {
    if (totalLoggedMins >= 900) return "Dean's Fellow";
    if (totalLoggedMins >= 300) return 'Senior Scholar';
    if (totalLoggedMins >= 60) return 'Focused Scholar';
    return 'Initiated Scholar';
  }, [totalLoggedMins]);

  const addDistraction = () => {
    const text = distractionInput.trim();
    if (!text) return;
    onUpdateVault((prev) => ({
      ...prev,
      distractions: [text, ...prev.distractions].slice(0, 20)
    }));
    setDistractionInput('');
  };

  const promoteDistractionToNote = (text: string, index: number) => {
    onUpdateVault((prev) => ({
      ...prev,
      notes: [
        {
          id: uidGen('n'),
          courseCode: selectedCourse,
          title: text.slice(0, 48),
          category: 'Focus Capture',
          isPinned: false,
          content: text,
          updatedAt: Date.now()
        },
        ...prev.notes
      ],
      distractions: prev.distractions.filter((_, idx) => idx !== index)
    }));
  };

  return (
    <div className="space-y-4">
      <div className="aura-glass rounded-lg p-5 text-center space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="px-2 py-0.5 rounded font-mono text-[10px] font-semibold uppercase tracking-wider bg-[#EFF6FF] text-[#1E3A8A] border border-[#BFDBFE] inline-flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5" /> Deep Focus Timer
          </span>
          <div className="flex items-center gap-2 flex-wrap font-mono text-[11px]">
            <span className="px-2 py-0.5 rounded bg-[#F3F4F6] border border-[#E5E7EB] text-[#111827] font-semibold">
              {scholarStreakDays}d Streak
            </span>
            <span className="px-2 py-0.5 rounded bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E3A8A] font-semibold">
              {scholarRank}
            </span>
            <span className="px-2 py-0.5 rounded bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] font-bold">
              {(totalLoggedMins / 60).toFixed(1)}h Logged
            </span>
          </div>
        </div>

        {/* Course Selector + Custom Time Trigger */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <select
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
            className="px-3 py-1.5 rounded-md aura-input text-xs font-semibold"
          >
            {vault.courses.map((c) => (
              <option key={c.id} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
            <option value="GENERAL">GENERAL STUDY</option>
          </select>

          <button
            onClick={() => setShowCustomModal(true)}
            className="px-3 py-1.5 rounded-md bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#9CA3AF] text-[#111827] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors duration-150"
          >
            <Sliders className="w-3.5 h-3.5 text-[#1E3A8A]" /> Custom Duration (10s – 12h)
          </button>
        </div>

        {/* Circular Progress Dial */}
        <div className="relative w-56 h-56 mx-auto flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 240 240">
            <circle
              cx="120"
              cy="120"
              r="104"
              fill="none"
              stroke="#E5E7EB"
              strokeWidth="10"
            />
            <circle
              cx="120"
              cy="120"
              r="104"
              fill="none"
              stroke="#1E3A8A"
              strokeWidth="10"
              strokeLinecap="butt"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-4xl font-mono font-bold tracking-tight text-[#111827]">{formatted}</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-[#6B7280] mt-1">
              {isRunning ? 'Session Active' : 'Ready'}
            </div>
          </div>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap justify-center gap-2">
          {[
            ['25m', 25 * 60],
            ['45m', 45 * 60],
            ['60m', 60 * 60],
            ['90m', 90 * 60],
            ['2h', 120 * 60]
          ].map(([label, sec]) => (
            <button
              key={label}
              onClick={() => setPresetSeconds(sec as number)}
              className={`px-3.5 py-1.5 rounded-md font-mono text-xs font-semibold border transition-colors duration-150 ${
                totalSeconds === sec
                  ? 'bg-[#1E3A8A] text-[#FFFFFF] border-[#1E3A8A]'
                  : 'bg-[#FFFFFF] border-[#E5E7EB] text-[#4B5563] hover:border-[#9CA3AF] hover:text-[#111827]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Play / Pause / Reset */}
        <div className="flex items-center justify-center gap-2.5">
          <button
            onClick={() => setIsRunning((r) => !r)}
            className="px-6 py-2.5 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] font-semibold text-xs sm:text-sm inline-flex items-center gap-2 transition-colors duration-150"
          >
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isRunning ? 'Pause Session' : 'Start Focus'}
          </button>
          <button
            onClick={() => {
              setIsRunning(false);
              setRemainingSeconds(totalSeconds);
            }}
            className="p-2.5 rounded-md bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#9CA3AF] text-[#4B5563] hover:text-[#111827] transition-colors duration-150"
            title="Reset Timer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Acoustic Focus Soundscapes */}
      <div className="aura-glass rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wider text-[#111827]">
            <Headphones className="w-4 h-4 text-[#1E3A8A]" /> Acoustic Focus Synthesis
          </div>
          {soundMode !== 'OFF' ? (
            <Volume2 className="w-4 h-4 text-[#1E3A8A]" />
          ) : (
            <VolumeX className="w-4 h-4 text-[#9CA3AF]" />
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(
            [
              ['OFF', 'Silent'],
              ['RAIN', 'Soft Rain'],
              ['BROWN', 'Brown Noise'],
              ['GAMMA', '40Hz Gamma']
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => applySoundscape(mode)}
              className={`py-2 px-3 rounded-md text-xs font-semibold border transition-colors duration-150 ${
                soundMode === mode
                  ? 'bg-[#EFF6FF] border-[#1E3A8A] text-[#1E3A8A]'
                  : 'bg-[#FFFFFF] border-[#E5E7EB] text-[#6B7280] hover:border-[#9CA3AF] hover:text-[#111827]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Distraction Parking Pad */}
      <div className="aura-glass rounded-lg p-4 space-y-3">
        <div className="font-mono text-[11px] font-bold text-[#111827] uppercase tracking-wider">
          Distraction Scratchpad
        </div>
        <div className="flex gap-2">
          <input
            value={distractionInput}
            onChange={(e) => setDistractionInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDistraction()}
            placeholder="Capture a thought without breaking focus..."
            className="flex-1 px-3 py-2 rounded-md aura-input text-xs"
          />
          <button
            onClick={addDistraction}
            className="px-3.5 py-2 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold inline-flex items-center gap-1 transition-colors duration-150"
          >
            <Plus className="w-3.5 h-3.5" /> Capture
          </button>
        </div>
        {vault.distractions.length > 0 && (
          <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-md divide-y divide-[#E5E7EB]">
            {vault.distractions.map((item, idx) => (
              <div
                key={`${item}_${idx}`}
                className="px-3 py-2 flex items-center justify-between gap-2 text-xs text-[#111827]"
              >
                <span className="truncate">{item}</span>
                <button
                  onClick={() => promoteDistractionToNote(item, idx)}
                  className="text-[11px] font-semibold text-[#1E3A8A] shrink-0 hover:underline"
                >
                  Move to Notes
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Custom Time Picker Modal */}
      <AuraModal
        open={showCustomModal}
        onClose={() => setShowCustomModal(false)}
        badge="Timer Configuration"
        title="Set Custom Focus Duration"
        subtitle="Specify any interval from 10 seconds to 12 hours."
        accentColor="sky"
        maxWidthClass="max-w-sm"
      >
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <label className="font-mono text-[10px] font-semibold text-[#6B7280] uppercase">Hours (0–12)</label>
            <input
              type="number"
              min={0}
              max={12}
              value={customHours}
              onChange={(e) => setCustomHours(e.target.value)}
              className="w-full px-3 py-2 rounded-md aura-input text-center font-mono font-bold text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="font-mono text-[10px] font-semibold text-[#6B7280] uppercase">Mins (0–59)</label>
            <input
              type="number"
              min={0}
              max={59}
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              className="w-full px-3 py-2 rounded-md aura-input text-center font-mono font-bold text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="font-mono text-[10px] font-semibold text-[#6B7280] uppercase">Secs (0–59)</label>
            <input
              type="number"
              min={0}
              max={59}
              value={customSecs}
              onChange={(e) => setCustomSecs(e.target.value)}
              className="w-full px-3 py-2 rounded-md aura-input text-center font-mono font-bold text-xs"
            />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => setShowCustomModal(false)}
            className="flex-1 py-2 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] hover:border-[#9CA3AF] text-xs font-semibold text-[#4B5563]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={applyCustomDuration}
            className="flex-1 py-2 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold"
          >
            Apply Duration
          </button>
        </div>
      </AuraModal>
    </div>
  );
};
