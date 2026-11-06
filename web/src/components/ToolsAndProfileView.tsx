import React, { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Calculator,
  CloudDownload,
  CloudUpload,
  LogIn,
  LogOut,
  Moon,
  Plus,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  UserCircle
} from 'lucide-react';
import { signInWithGoogleBrowser, signOutBrowser } from '../firebase';
import {
  fetchAndMergeCloudBackupToWeb,
  saveCloudBackupFromWeb,
  uidGen
} from '../storage';
import type { AuraLocalVault } from '../types';

interface Props {
  user: User | null;
  vault: AuraLocalVault;
  onUpdateVault: (updater: (prev: AuraLocalVault) => AuraLocalVault) => void;
  onNotify: (msg: string) => void;
}

const GRADE_SCALE: Record<string, number> = {
  A: 4.0,
  'B+': 3.5,
  B: 3.0,
  'C+': 2.5,
  C: 2.0,
  D: 1.5,
  F: 0.0
};

export const ToolsAndProfileView: React.FC<Props> = ({
  user,
  vault,
  onUpdateVault,
  onNotify
}) => {
  const [busySync, setBusySync] = useState(false);

  // REM Sleep Calculator
  const [wakeTime, setWakeTime] = useState('06:30');

  // GPA Calculator
  const [gCode, setGCode] = useState('');
  const [gCredits, setGCredits] = useState('3');
  const [gLetter, setGLetter] = useState('A');

  const bedtimes = useMemo(() => {
    const [h, m] = wakeTime.split(':').map(Number);
    const wakeTotalMins = (h || 6) * 60 + (m || 30);
    // 90-minute REM sleep cycles + 15 min fall-asleep buffer (6, 5, 4 cycles)
    return [6, 5, 4].map((cycles) => {
      const sleepMins = cycles * 90 + 15;
      let target = (wakeTotalMins - sleepMins) % 1440;
      if (target < 0) target += 1440;
      const bh = Math.floor(target / 60);
      const bm = target % 60;
      return {
        cycles,
        hours: (cycles * 1.5).toFixed(1),
        time: `${String(bh).padStart(2, '0')}:${String(bm).padStart(2, '0')}`
      };
    });
  }, [wakeTime]);

  const gpaStats = useMemo(() => {
    const totalCredits = vault.grades.reduce((s, g) => s + g.creditHours, 0);
    const totalPoints = vault.grades.reduce((s, g) => s + g.creditHours * g.gradePoint, 0);
    const gpa = totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : '0.00';
    return { totalCredits, gpa };
  }, [vault.grades]);

  const handleBackupToCloud = async () => {
    if (!user) return;
    setBusySync(true);
    try {
      await saveCloudBackupFromWeb(user.uid, user.email || '', vault);
      onNotify(
        'Backed up Profile, Timetable, Flashcards, Notes & GPA to Cloud! Open your Android app to auto-import.'
      );
    } catch (e: unknown) {
      onNotify((e as Error)?.message || 'Cloud backup failed.');
    } finally {
      setBusySync(false);
    }
  };

  const handleImportFromCloud = async () => {
    if (!user) return;
    setBusySync(true);
    try {
      const res = await fetchAndMergeCloudBackupToWeb(user.uid, vault);
      if (!res) {
        onNotify('No Cloud Snapshot found on this Google account yet.');
      } else {
        onUpdateVault(() => res.updatedVault);
        onNotify(`Imported Cloud Backup: ${res.summary}`);
      }
    } catch (e: unknown) {
      onNotify((e as Error)?.message || 'Cloud import failed.');
    } finally {
      setBusySync(false);
    }
  };

  const totalFocusHrs = (
    vault.focusSessions.reduce((s, f) => s + f.durationMinutes, 0) / 60
  ).toFixed(1);

  return (
    <div className="space-y-4">
      {/* Cross-Platform Cloud Backup & Restore Card */}
      <div className="aura-glass rounded-3xl p-5 space-y-3.5 border border-emerald-400/35">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-extrabold">
              ANDROID ⇄ IPHONE / WEB CLOUD VAULT
            </span>
            <h3 className="font-extrabold text-base mt-1">
              {user ? user.displayName || user.email : 'Sign In to Sync Your Timetable & Profile'}
            </h3>
          </div>
          {user && (
            <button
              onClick={() => signOutBrowser()}
              className="p-2 rounded-xl bg-rose-500/15 text-rose-300"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>

        <p className="text-xs text-slate-400">
          Routine edits save locally on your browser for instant offline speed & zero database cost. Tap below whenever you want to push or pull your snapshot with the Android app!
        </p>

        {!user ? (
          <button
            onClick={async () => {
              try {
                await signInWithGoogleBrowser();
              } catch (e: unknown) {
                onNotify((e as Error)?.message || 'Sign-in cancelled or domain not yet authorized.');
              }
            }}
            className="w-full py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-extrabold text-xs inline-flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" /> Sign in with Google
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <button
              disabled={busySync}
              onClick={handleBackupToCloud}
              className="py-2.5 px-3 rounded-xl bg-emerald-500 text-slate-950 font-extrabold text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <CloudUpload className="w-4 h-4" /> Backup to Cloud
            </button>
            <button
              disabled={busySync}
              onClick={handleImportFromCloud}
              className="py-2.5 px-3 rounded-xl bg-sky-500/25 border border-sky-400/50 text-sky-200 font-extrabold text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <CloudDownload className="w-4 h-4" /> Import Android Backup
            </button>
          </div>
        )}
      </div>

      {/* iPhone Safari Add-to-Home-Screen Guide */}
      <div className="aura-glass rounded-3xl p-4 flex items-start gap-3 border border-sky-400/30">
        <Smartphone className="w-6 h-6 text-sky-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs">
          <div className="font-extrabold text-sky-300">Install on iPhone or iPad Home Screen</div>
          <p className="text-slate-400 leading-relaxed">
            On iPhone Safari, tap the <strong>Share</strong> icon at the bottom of Safari and choose{' '}
            <strong>"Add to Home Screen"</strong> for a full-screen native app icon with offline timetable access!
          </p>
        </div>
      </div>

      {/* Student Profile & Theme */}
      <div className="aura-glass rounded-3xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-sky-300 flex items-center gap-1.5">
            <UserCircle className="w-4 h-4" /> STUDENT PROFILE & THEME
          </span>
          <button
            onClick={() =>
              onUpdateVault((prev) => ({
                ...prev,
                profile: { ...prev.profile, isDarkTheme: !prev.profile.isDarkTheme }
              }))
            }
            className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-bold inline-flex items-center gap-1.5"
          >
            {vault.profile.isDarkTheme ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-300" /> Switch to Light Frost
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-sky-500" /> Switch to Dark Obsidian
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            value={vault.profile.name}
            onChange={(e) =>
              onUpdateVault((prev) => ({
                ...prev,
                profile: { ...prev.profile, name: e.target.value }
              }))
            }
            placeholder="Your Name"
            className="px-3.5 py-2.5 rounded-xl aura-input text-xs"
          />
          <input
            value={vault.profile.institution}
            onChange={(e) =>
              onUpdateVault((prev) => ({
                ...prev,
                profile: { ...prev.profile, institution: e.target.value }
              }))
            }
            placeholder="University / Campus"
            className="px-3.5 py-2.5 rounded-xl aura-input text-xs"
          />
          <input
            value={vault.profile.programme}
            onChange={(e) =>
              onUpdateVault((prev) => ({
                ...prev,
                profile: { ...prev.profile, programme: e.target.value }
              }))
            }
            placeholder="Programme / Department"
            className="px-3.5 py-2.5 rounded-xl aura-input text-xs"
          />
          <input
            value={vault.profile.semester}
            onChange={(e) =>
              onUpdateVault((prev) => ({
                ...prev,
                profile: { ...prev.profile, semester: e.target.value }
              }))
            }
            placeholder="Semester"
            className="px-3.5 py-2.5 rounded-xl aura-input text-xs"
          />
        </div>
      </div>

      {/* 90-Minute REM Sleep Cycle Planner */}
      <div className="aura-glass rounded-3xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-violet-300 flex items-center gap-1.5">
            <Moon className="w-4 h-4" /> 90-MIN REM SLEEP CYCLE WAKE-UP PLANNER
          </span>
          <input
            type="time"
            value={wakeTime}
            onChange={(e) => setWakeTime(e.target.value)}
            className="px-3 py-1 rounded-xl aura-input text-xs font-mono"
          />
        </div>
        <p className="text-xs text-slate-400">
          Ideal bedtimes to wake up refreshed at <strong>{wakeTime}</strong> between REM cycles:
        </p>
        <div className="grid grid-cols-3 gap-2">
          {bedtimes.map((b) => (
            <div
              key={b.cycles}
              className="p-3 rounded-2xl bg-violet-500/15 border border-violet-400/30 text-center"
            >
              <div className="text-base font-mono font-extrabold text-violet-200">{b.time}</div>
              <div className="text-[10px] text-slate-400">
                {b.cycles} Cycles ({b.hours}h)
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cumulative GPA Calculator */}
      <div className="aura-glass rounded-3xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-emerald-300 flex items-center gap-1.5">
            <Calculator className="w-4 h-4" /> GPA & GRADE TRACKER
          </span>
          <span className="text-sm font-mono font-extrabold text-emerald-400">
            GPA: {gpaStats.gpa} ({gpaStats.totalCredits} Cr)
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <input
            value={gCode}
            onChange={(e) => setGCode(e.target.value)}
            placeholder="Course"
            className="col-span-2 px-3.5 py-2.5 rounded-xl aura-input text-xs font-bold uppercase"
          />
          <input
            type="number"
            value={gCredits}
            onChange={(e) => setGCredits(e.target.value)}
            placeholder="Cr"
            className="px-2 py-2.5 rounded-xl aura-input text-xs font-mono text-center"
          />
          <select
            value={gLetter}
            onChange={(e) => setGLetter(e.target.value)}
            className="px-2 py-2.5 rounded-xl aura-input text-xs font-bold"
          >
            {Object.keys(GRADE_SCALE).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => {
            if (!gCode.trim()) return;
            onUpdateVault((prev) => ({
              ...prev,
              grades: [
                ...prev.grades,
                {
                  id: uidGen('g'),
                  courseCode: gCode.trim().toUpperCase(),
                  courseName: gCode.trim().toUpperCase(),
                  creditHours: Math.max(1, Number(gCredits) || 3),
                  letterGrade: gLetter,
                  gradePoint: GRADE_SCALE[gLetter] ?? 4.0,
                  semester: prev.profile.semester
                }
              ]
            }));
            setGCode('');
          }}
          className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold inline-flex items-center justify-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Add Course Grade
        </button>
        {vault.grades.map((g) => (
          <div key={g.id} className="p-2.5 rounded-xl bg-white/5 flex items-center justify-between text-xs">
            <span>
              <strong>{g.courseCode}</strong> • {g.creditHours} Cr • Grade <strong>{g.letterGrade}</strong> ({g.gradePoint.toFixed(1)})
            </span>
            <button
              onClick={() =>
                onUpdateVault((prev) => ({
                  ...prev,
                  grades: prev.grades.filter((x) => x.id !== g.id)
                }))
              }
              className="text-rose-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* AURA Semester Wrapped Summary */}
      <div className="rounded-3xl p-5 bg-gradient-to-br from-emerald-500/20 via-sky-500/20 to-violet-500/25 border border-white/15 space-y-3">
        <div className="text-xs font-extrabold text-emerald-300 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4" /> AURA SEMESTER WRAPPED SNAPSHOT
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
          <div className="p-3 rounded-2xl bg-black/25">
            <div className="text-xl font-extrabold text-sky-300">{vault.courses.length}</div>
            <div className="text-[11px] text-slate-400">Courses</div>
          </div>
          <div className="p-3 rounded-2xl bg-black/25">
            <div className="text-xl font-extrabold text-emerald-300">{vault.lectures.length}</div>
            <div className="text-[11px] text-slate-400">Weekly Slots</div>
          </div>
          <div className="p-3 rounded-2xl bg-black/25">
            <div className="text-xl font-extrabold text-violet-300">{vault.flashcards.length}</div>
            <div className="text-[11px] text-slate-400">SM-2 Cards</div>
          </div>
          <div className="p-3 rounded-2xl bg-black/25">
            <div className="text-xl font-extrabold text-amber-300">{totalFocusHrs}h</div>
            <div className="text-[11px] text-slate-400">Deep Focus</div>
          </div>
        </div>
      </div>
    </div>
  );
};
