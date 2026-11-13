import React, { useEffect, useRef, useState } from 'react';
import {
  Headphones,
  Pause,
  Play,
  RotateCcw,
  Sliders,
  Sparkles,
  Volume2,
  VolumeX,
  Plus
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

  // Custom H : M : S modal
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customHours, setCustomHours] = useState('0');
  const [customMinutes, setCustomMinutes] = useState('45');
  const [customSecs, setCustomSecs] = useState('0');

  // Distraction scratchpad
  const [distractionInput, setDistractionInput] = useState('');

  // Web Audio Synthesizer
  const [soundMode, setSoundMode] = useState<SoundMode>('OFF');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const cleanupSoundRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isRunning) {
      document.title = 'AURA • Academic Companion & Live Study Stage';
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

    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
      right.frequency.value = 240; // 40Hz Binaural Gamma Focus beat
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

    // Synthesized Brown Noise or Soft Rain using buffered noise + lowpass filter
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
      <div className="aura-glass rounded-xl p-6 text-center space-y-5 border border-slate-800">
        <div className="flex items-center justify-between">
          <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> DEEP FOCUS SANCTUARY
          </span>
          <span className="text-xs text-emerald-400 font-mono font-bold">
            {(totalLoggedMins / 60).toFixed(1)}h Logged
          </span>
        </div>

        {/* Course Selector + Custom Time Trigger */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <select
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
            className="px-3.5 py-1.5 rounded-lg aura-input text-xs font-bold"
          >
            {vault.courses.map((c) => (
              <option key={c.id} value={c.code}>
                {c.code} • {c.name}
              </option>
            ))}
            <option value="GENERAL">GENERAL STUDY</option>
          </select>

          <button
            onClick={() => setShowCustomModal(true)}
            className="px-3 py-1.5 rounded-lg aura-subtle-surface hover:border-cyan-500/50 text-cyan-400 text-xs font-semibold inline-flex items-center gap-1.5 transition"
          >
            <Sliders className="w-3.5 h-3.5" /> Any Custom Time (10s – 12h)
          </button>
        </div>

        {/* Circular Progress Dial */}
        <div className="relative w-60 h-60 mx-auto flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 240 240">
            <circle
              cx="120"
              cy="120"
              r="104"
              fill="none"
              stroke="#1E293B"
              strokeWidth="12"
            />
            <circle
              cx="120"
              cy="120"
              r="104"
              fill="none"
              stroke="#06B6D4"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-4xl font-mono font-bold tracking-tight">{formatted}</div>
            <div className="text-[11px] uppercase tracking-widest text-slate-400 mt-1">
              {isRunning ? 'Locked In' : 'Ready to Sprint'}
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
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                totalSeconds === sec
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                  : 'aura-subtle-surface text-slate-300 hover:border-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Play / Pause / Reset */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setIsRunning((r) => !r)}
            className="px-7 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm inline-flex items-center gap-2 transition"
          >
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isRunning ? 'Pause Focus' : 'Start Focus'}
          </button>
          <button
            onClick={() => {
              setIsRunning(false);
              setRemainingSeconds(totalSeconds);
            }}
            className="p-2.5 rounded-lg aura-subtle-surface hover:border-slate-600 text-slate-200 transition"
            title="Reset Timer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Zero-Cost Synthesized Focus Soundscapes */}
      <div className="aura-glass rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-cyan-400">
            <Headphones className="w-4 h-4" /> ACOUSTIC FOCUS SOUNDSCAPES (OFFLINE SYNTH)
          </div>
          {soundMode !== 'OFF' ? (
            <Volume2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <VolumeX className="w-4 h-4 text-slate-500" />
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
              className={`py-2 px-3 rounded-lg text-xs font-semibold border transition ${
                soundMode === mode
                  ? 'bg-cyan-500/15 border-cyan-500 text-cyan-300'
                  : 'aura-subtle-surface text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Distraction Parking Pad */}
      <div className="aura-glass rounded-xl p-4 space-y-3">
        <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">
          Distraction Parking Pad (Capture Thoughts &amp; Keep Studying)
        </div>
        <div className="flex gap-2">
          <input
            value={distractionInput}
            onChange={(e) => setDistractionInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDistraction()}
            placeholder="Park an intrusive thought or to-do here..."
            className="flex-1 px-3.5 py-2.5 rounded-lg aura-input text-xs"
          />
          <button
            onClick={addDistraction}
            className="px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold inline-flex items-center gap-1 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Park
          </button>
        </div>
        {vault.distractions.length > 0 && (
          <div className="space-y-1.5">
            {vault.distractions.map((item, idx) => (
              <div
                key={`${item}_${idx}`}
                className="p-2.5 rounded-lg aura-subtle-surface flex items-center justify-between gap-2 text-xs"
              >
                <span className="truncate">{item}</span>
                <button
                  onClick={() => promoteDistractionToNote(item, idx)}
                  className="text-[11px] font-semibold text-cyan-400 shrink-0 hover:underline"
                >
                  Save to Notes
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
        badge="CUSTOM SPRINT CLOCK"
        title="Set Any Custom Focus Time"
        subtitle="Choose any duration from 10 seconds up to 12 hours."
        accentColor="sky"
        maxWidthClass="max-w-sm"
      >
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400">Hours (0–12)</label>
            <input
              type="number"
              min={0}
              max={12}
              value={customHours}
              onChange={(e) => setCustomHours(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg aura-input text-center font-mono font-bold"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400">Mins (0–59)</label>
            <input
              type="number"
              min={0}
              max={59}
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg aura-input text-center font-mono font-bold"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400">Secs (0–59)</label>
            <input
              type="number"
              min={0}
              max={59}
              value={customSecs}
              onChange={(e) => setCustomSecs(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg aura-input text-center font-mono font-bold"
            />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => setShowCustomModal(false)}
            className="flex-1 py-2.5 rounded-lg aura-subtle-surface text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={applyCustomDuration}
            className="flex-1 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold"
          >
            Apply Time
          </button>
        </div>
      </AuraModal>
    </div>
  );
};
