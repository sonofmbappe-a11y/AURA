import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Flame,
  Headphones,
  Pause,
  Play,
  RotateCcw,
  Sliders,
  Sparkles,
  Volume2,
  VolumeX,
  Wind,
  Plus,
  X
} from 'lucide-react';
import type { AuraLocalVault } from '../types';
import { uidGen } from '../storage';
import { AuraModal } from './AuraModal';

interface Props {
  vault: AuraLocalVault;
  onUpdateVault: (updater: (prev: AuraLocalVault) => AuraLocalVault) => void;
}

type SoundMode = 'OFF' | 'RAIN' | 'LIBRARY' | 'COFFEE' | 'BROWN' | 'GAMMA';

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

  // Audio Soundscape Synthesis State
  const [soundMode, setSoundMode] = useState<SoundMode>('OFF');
  const [soundVolume, setSoundVolume] = useState<number>(0.65);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const cleanupSoundRef = useRef<(() => void) | null>(null);

  // Box Breathing Reset Modal State
  const [showBreathingModal, setShowBreathingModal] = useState(false);
  const [breathingPhase, setBreathingPhase] = useState<'INHALE' | 'HOLD' | 'EXHALE'>('INHALE');
  const [breathingSecondsLeft, setBreathingSecondsLeft] = useState(4);

  // Breathing cycle timer
  useEffect(() => {
    if (!showBreathingModal) return;
    const interval = window.setInterval(() => {
      setBreathingSecondsLeft((prev) => {
        if (prev <= 1) {
          setBreathingPhase((cur) => {
            if (cur === 'INHALE') return 'HOLD';
            if (cur === 'HOLD') return 'EXHALE';
            return 'INHALE';
          });
          return breathingPhase === 'INHALE' ? 7 : breathingPhase === 'HOLD' ? 8 : 4;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [showBreathingModal, breathingPhase]);

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
    gainNodeRef.current = null;
  };

  const handleVolumeChange = (newVol: number) => {
    setSoundVolume(newVol);
    if (gainNodeRef.current && audioCtxRef.current) {
      const mult =
        soundMode === 'GAMMA'
          ? 0.04
          : soundMode === 'BROWN'
          ? 0.1
          : soundMode === 'LIBRARY'
          ? 0.08
          : 0.06;
      gainNodeRef.current.gain.setValueAtTime(newVol * mult, audioCtxRef.current.currentTime);
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
      gain.gain.value = soundVolume * 0.04;
      gainNodeRef.current = gain;
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
      if (mode === 'BROWN' || mode === 'LIBRARY') {
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        output[i] *= 3.2;
      } else if (mode === 'COFFEE') {
        output[i] = (lastOut + 0.05 * white) / 1.05;
        lastOut = output[i];
        output[i] = output[i] * 2.2 + white * 0.15;
      } else {
        output[i] = white * 0.5;
      }
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = mode === 'LIBRARY' ? 'bandpass' : 'lowpass';
    filter.frequency.value =
      mode === 'RAIN' ? 950 : mode === 'LIBRARY' ? 240 : mode === 'COFFEE' ? 620 : 380;
    if (mode === 'LIBRARY') filter.Q.value = 1.2;

    const gain = ctx.createGain();
    const mult =
      mode === 'BROWN' ? 0.1 : mode === 'LIBRARY' ? 0.08 : mode === 'COFFEE' ? 0.07 : 0.06;
    gain.gain.value = soundVolume * mult;
    gainNodeRef.current = gain;

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

  // Academic Energy & Burnout Sentinel Computations
  const todayFocusMinutes = useMemo(() => {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    return vault.focusSessions
      .filter((s) => s.completedAt >= todayStart)
      .reduce((acc, s) => acc + s.durationMinutes, 0);
  }, [vault.focusSessions]);

  const upcomingDueIn48h = useMemo(() => {
    const now = Date.now();
    const in48h = now + 48 * 3600 * 1000;
    return vault.assessments.filter(
      (a) => a.status !== 'COMPLETED' && a.dueEpochMillis >= now && a.dueEpochMillis <= in48h
    ).length;
  }, [vault.assessments]);

  const energyScore = useMemo(() => {
    let score = 88;
    if (todayFocusMinutes > 240) score -= Math.round((todayFocusMinutes - 240) / 10);
    if (upcomingDueIn48h > 1) score -= upcomingDueIn48h * 5;
    return Math.max(15, Math.min(100, score));
  }, [todayFocusMinutes, upcomingDueIn48h]);

  const sentinelStatus = useMemo(() => {
    if (energyScore >= 75) {
      return {
        label: 'OPTIMAL FLOW',
        color: '#059669',
        bg: '#ECFDF5',
        border: '#A7F3D0',
        advice: 'Cognitive faculties are sharp. Prime time for deep problem-solving and rigorous exam revision.'
      };
    }
    if (energyScore >= 50) {
      return {
        label: 'MODERATE COGNITIVE LOAD',
        color: '#D97706',
        bg: '#FFFBEB',
        border: '#FDE68A',
        advice: 'Pacing well. Consider taking a 5-minute hydration stretch before your next study block.'
      };
    }
    return {
      label: 'FATIGUE RISK · BREAK RECOMMENDED',
      color: '#DC2626',
      bg: '#FEF2F2',
      border: '#FECACA',
      advice: 'Cognitive saturation reached. 4-7-8 Academic Reset breathing recommended to lower cortical fatigue.'
    };
  }, [energyScore]);

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
      <div className="aura-hero-card rounded-xl p-5 sm:p-6 text-center space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-left">
            <span className="px-2 py-0.5 rounded font-mono text-[10px] font-semibold uppercase tracking-wider bg-[#EEF2FA] text-[#1D3B8B] border border-[#C7D4F0] inline-flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5" /> Deep Focus Session
            </span>
            <h2 className="font-serif text-xl sm:text-2xl text-[#141923] mt-1">
              Academic Focus Studio
            </h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap font-mono text-[11px]">
            <span className="px-2.5 py-1 rounded-md bg-[#EFECE6] border border-[#E4E0D8] text-[#141923] font-semibold">
              {scholarStreakDays}d Streak
            </span>
            <span className="px-2.5 py-1 rounded-md bg-[#EEF2FA] border border-[#C7D4F0] text-[#1D3B8B] font-semibold">
              {scholarRank}
            </span>
            <span className="px-2.5 py-1 rounded-md bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] font-bold">
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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wider text-[#111827]">
            <Headphones className="w-4 h-4 text-[#1E3A8A]" /> Acoustic Focus Synthesis
            {soundMode !== 'OFF' && (
              <span className="flex items-center gap-0.5 ml-1">
                <span className="w-1 h-3 bg-[#1E3A8A] rounded-full animate-pulse" />
                <span className="w-1 h-4 bg-[#1E3A8A] rounded-full animate-bounce" />
                <span className="w-1 h-2 bg-[#1E3A8A] rounded-full animate-pulse" />
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-[#6B7280]">
              <Volume2 className="w-3.5 h-3.5" />
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={soundVolume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-16 h-1 bg-[#E5E7EB] rounded-lg accent-[#1E3A8A] cursor-pointer"
                title={`Volume: ${Math.round(soundVolume * 100)}%`}
              />
              <span className="font-mono text-[10px] w-7">{Math.round(soundVolume * 100)}%</span>
            </div>
            {soundMode !== 'OFF' ? (
              <Volume2 className="w-4 h-4 text-[#1E3A8A]" />
            ) : (
              <VolumeX className="w-4 h-4 text-[#9CA3AF]" />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {(
            [
              ['OFF', 'Silent'],
              ['RAIN', 'Quad Rain'],
              ['LIBRARY', 'Old Library'],
              ['COFFEE', 'Campus Cafe'],
              ['BROWN', 'Brown Noise'],
              ['GAMMA', '40Hz Gamma']
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => applySoundscape(mode)}
              className={`py-2 px-2.5 rounded-md text-xs font-semibold border transition-colors duration-150 ${
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

      {/* Academic Burnout Sentinel & Energy Meter Card */}
      <div className="aura-glass rounded-lg p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#1E3A8A]" />
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#111827]">
              Academic Burnout Sentinel & Cognitive Meter
            </h3>
          </div>
          <span
            className="px-2.5 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-wider border"
            style={{
              backgroundColor: sentinelStatus.bg,
              borderColor: sentinelStatus.border,
              color: sentinelStatus.color
            }}
          >
            {sentinelStatus.label}
          </span>
        </div>

        {/* Cognitive Energy Meter Gauge */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-[#4B5563]">Cognitive Energy Reserve</span>
            <span className="font-mono font-bold" style={{ color: sentinelStatus.color }}>
              {energyScore}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[#E5E7EB] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${energyScore}%`,
                backgroundColor: sentinelStatus.color
              }}
            />
          </div>
        </div>

        {/* Academic Vitals Grid */}
        <div className="grid grid-cols-3 gap-2.5 pt-1">
          <div className="p-2.5 rounded-md bg-[#FFFFFF] border border-[#E5E7EB] text-center">
            <div className="font-mono font-bold text-sm text-[#111827]">{todayFocusMinutes}m</div>
            <div className="text-[10px] text-[#6B7280] uppercase tracking-wider font-mono">Today's Focus</div>
          </div>
          <div className="p-2.5 rounded-md bg-[#FFFFFF] border border-[#E5E7EB] text-center">
            <div className="font-mono font-bold text-sm text-[#111827]">{upcomingDueIn48h}</div>
            <div className="text-[10px] text-[#6B7280] uppercase tracking-wider font-mono">48h Deadlines</div>
          </div>
          <div className="p-2.5 rounded-md bg-[#FFFFFF] border border-[#E5E7EB] text-center">
            <div className="font-mono font-bold text-sm text-[#1E3A8A]">{scholarStreakDays}d</div>
            <div className="text-[10px] text-[#6B7280] uppercase tracking-wider font-mono">Study Streak</div>
          </div>
        </div>

        {/* Sentinel Physiological Guidance & Action */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-[#E5E7EB]">
          <p className="text-xs text-[#6B7280] flex-1 min-w-[220px]">
            {sentinelStatus.advice}
          </p>
          <button
            type="button"
            onClick={() => {
              setBreathingPhase('INHALE');
              setBreathingSecondsLeft(4);
              setShowBreathingModal(true);
            }}
            className="px-3 py-1.5 rounded-md bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#9CA3AF] text-[#111827] text-xs font-semibold flex items-center gap-1.5 transition-colors duration-150 shrink-0"
          >
            <Wind className="w-3.5 h-3.5 text-[#1E3A8A]" />
            4-7-8 Academic Reset
          </button>
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

      {/* 4-7-8 Academic Reset Breathing Modal */}
      <AuraModal
        open={showBreathingModal}
        onClose={() => setShowBreathingModal(false)}
        badge="Autonomic Regulation"
        title="4-7-8 Academic Reset"
        subtitle="Physiological reset technique to clear cognitive fog, lower cortisol, and restore deep focus."
        accentColor="sky"
        maxWidthClass="max-w-md"
      >
        <div className="py-6 flex flex-col items-center justify-center space-y-5">
          <div className="relative w-44 h-44 flex items-center justify-center">
            {/* Visual pulsing breath guide */}
            <div
              className={`absolute rounded-full transition-all duration-1000 border-2 ${
                breathingPhase === 'INHALE'
                  ? 'w-40 h-40 bg-[#EFF6FF] border-[#1E3A8A]'
                  : breathingPhase === 'HOLD'
                  ? 'w-44 h-44 bg-[#FEF3C7] border-[#D97706]'
                  : 'w-24 h-24 bg-[#ECFDF5] border-[#059669]'
              }`}
            />
            <div className="relative z-10 text-center">
              <div
                className="font-mono text-3xl font-extrabold"
                style={{
                  color:
                    breathingPhase === 'INHALE'
                      ? '#1E3A8A'
                      : breathingPhase === 'HOLD'
                      ? '#D97706'
                      : '#059669'
                }}
              >
                {breathingSecondsLeft}s
              </div>
              <div className="font-mono text-xs uppercase tracking-widest font-bold text-[#111827] mt-1">
                {breathingPhase === 'INHALE'
                  ? 'Inhale (Nose)'
                  : breathingPhase === 'HOLD'
                  ? 'Hold Breath'
                  : 'Exhale (Mouth)'}
              </div>
            </div>
          </div>

          <div className="text-center space-y-1 max-w-xs">
            <p className="text-xs text-[#4B5563]">
              {breathingPhase === 'INHALE' && 'Inhale quietly through your nose for 4 seconds.'}
              {breathingPhase === 'HOLD' && 'Hold your breath gently for 7 seconds.'}
              {breathingPhase === 'EXHALE' && 'Exhale completely through your mouth with a steady release for 8 seconds.'}
            </p>
            <p className="text-[10px] font-mono text-[#9CA3AF]">
              Stimulates the vagus nerve to reduce test anxiety and restore clarity within 2–3 cycles.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowBreathingModal(false)}
            className="px-6 py-2 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold transition-colors duration-150"
          >
            End Breathing Exercise
          </button>
        </div>
      </AuraModal>
    </div>
  );
};
