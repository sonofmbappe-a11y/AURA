import React, { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Award,
  Calculator,
  CloudDownload,
  CloudUpload,
  GraduationCap,
  LogIn,
  LogOut,
  Moon,
  Plus,
  Shield,
  Smartphone,
  Sparkles,
  Sun,
  Target,
  Trash2,
  UserCircle
} from 'lucide-react';
import {
  signInWithGoogleBrowser,
  signOutBrowser,
  signInWithEmailBrowser,
  signUpWithEmailBrowser
} from '../firebase';
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
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  // REM Sleep Calculator
  const [wakeTime, setWakeTime] = useState('06:30');

  // GPA Calculator & Honors Simulator
  const [gCode, setGCode] = useState('');
  const [gCredits, setGCredits] = useState('3');
  const [gLetter, setGLetter] = useState('A');
  const [targetHonorsGpa, setTargetHonorsGpa] = useState<number>(3.80);
  const [remainingCredits, setRemainingCredits] = useState<number>(45);

  // Feature 1: Course Final Exam Grade & Target Cutoff Simulator
  const [courseworkScore, setCourseworkScore] = useState<number>(76);
  const [courseworkWeight, setCourseworkWeight] = useState<number>(40);
  const [targetFinalGrade, setTargetFinalGrade] = useState<number>(85); // 85% for Grade A

  // Attendance Safety Shield
  const [totalClasses, setTotalClasses] = useState<number>(36);
  const [attendedClasses, setAttendedClasses] = useState<number>(33);
  const [policyThreshold, setPolicyThreshold] = useState<number>(vault.profile.attendanceTargetPercent || 75);

  const examForecaster = useMemo(() => {
    const examWeight = Math.max(1, 100 - courseworkWeight);
    const currentPoints = (courseworkScore * courseworkWeight) / 100;
    const pointsNeeded = targetFinalGrade - currentPoints;
    const requiredExamScore = (pointsNeeded / examWeight) * 100;

    let status = 'Achievable with Focus';
    let isPossible = true;
    if (requiredExamScore <= 0) {
      status = 'Grade Already Secured!';
    } else if (requiredExamScore <= 60) {
      status = 'Comfortably Achievable';
    } else if (requiredExamScore <= 85) {
      status = 'Target Achievable with Steady Prep';
    } else if (requiredExamScore <= 100) {
      status = 'High Effort Sprint Required';
    } else {
      status = 'Mathematically Out of Reach';
      isPossible = false;
    }

    return {
      examWeight,
      currentPoints: currentPoints.toFixed(1),
      pointsNeeded: Math.max(0, pointsNeeded).toFixed(1),
      requiredExamScore: requiredExamScore.toFixed(1),
      isPossible,
      status
    };
  }, [courseworkScore, courseworkWeight, targetFinalGrade]);

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

  const simulationStats = useMemo(() => {
    const currentCredits = gpaStats.totalCredits;
    const currentPoints = vault.grades.reduce((s, g) => s + g.creditHours * g.gradePoint, 0);
    const target = targetHonorsGpa;
    const remCr = Math.max(1, remainingCredits);
    const totalFinalCredits = currentCredits + remCr;
    const requiredTotalPoints = totalFinalCredits * target;
    const neededPointsInRem = requiredTotalPoints - currentPoints;
    const neededGpaInRem = neededPointsInRem / remCr;

    return {
      neededGpa:
        neededGpaInRem > 4.0
          ? '> 4.00 (Unattainable)'
          : neededGpaInRem < 0
          ? '0.00 (Secured!)'
          : neededGpaInRem.toFixed(2),
      isPossible: neededGpaInRem <= 4.0,
      totalCredits: totalFinalCredits
    };
  }, [gpaStats, vault.grades, targetHonorsGpa, remainingCredits]);

  const attendanceShield = useMemo(() => {
    const total = Math.max(1, totalClasses);
    const attended = Math.min(total, Math.max(0, attendedClasses));
    const pct = Math.round((attended / total) * 100);
    const minThreshold = policyThreshold;
    const maxAbsencesAllowed = Math.floor(total * (1 - minThreshold / 100));
    const currentMissed = total - attended;
    const safeCutsLeft = Math.max(0, maxAbsencesAllowed - currentMissed);
    const isAtRisk = pct < minThreshold;
    const neededClassesToRecover = isAtRisk
      ? Math.ceil((minThreshold * total - 100 * attended) / (100 - minThreshold))
      : 0;

    return {
      pct,
      isAtRisk,
      safeCutsLeft,
      neededClassesToRecover
    };
  }, [totalClasses, attendedClasses, policyThreshold]);

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
          <div className="space-y-3">
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

            {/* Expandable Email/Password Option */}
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300">
                  {isRegister ? 'Create Scholar Account (Email)' : 'Sign In with Email & Password'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsRegister(!isRegister)}
                  className="text-[10px] font-extrabold text-emerald-400 hover:underline"
                >
                  {isRegister ? 'Switch to Sign In' : 'Create Account'}
                </button>
              </div>

              {isRegister && (
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full Name"
                  className="w-full px-3 py-2 rounded-xl aura-input text-xs"
                />
              )}

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="scholar@university.edu"
                className="w-full px-3 py-2 rounded-xl aura-input text-xs"
              />

              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="•••••••• (min 6 characters)"
                className="w-full px-3 py-2 rounded-xl aura-input text-xs"
              />

              <button
                type="button"
                onClick={async () => {
                  if (!email.trim() || password.length < 6) {
                    onNotify('Please enter a valid email and minimum 6 character password.');
                    return;
                  }
                  try {
                    if (isRegister) {
                      await signUpWithEmailBrowser(email, password, fullName.trim() || 'Scholar');
                      onNotify('Account created successfully!');
                    } else {
                      await signInWithEmailBrowser(email, password);
                      onNotify('Signed in successfully!');
                    }
                  } catch (err: unknown) {
                    onNotify((err as Error)?.message || 'Authentication failed.');
                  }
                }}
                className="w-full py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs transition"
              >
                {isRegister ? 'Create Account' : 'Sign In'}
              </button>
            </div>
          </div>
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

      {/* Feature: Target Honors & CGPA Predictor Simulator */}
      <div className="aura-glass rounded-3xl p-5 space-y-4 border border-amber-400/30">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5">
            <Award className="w-4 h-4" /> HONORS &amp; CGPA TARGET SIMULATOR
          </span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-extrabold">
            Target: {targetHonorsGpa.toFixed(2)}
          </span>
        </div>

        <p className="text-xs text-slate-400">
          Simulate what GPA average you need across remaining credits to graduate with your target honors.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold text-slate-300 uppercase">Target Cumulative GPA</label>
            <div className="flex items-center gap-2 mt-1">
              {[3.60, 3.75, 3.85, 3.95].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setTargetHonorsGpa(g)}
                  className={`flex-1 py-1 rounded-xl text-xs font-bold transition border ${
                    targetHonorsGpa === g
                      ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                      : 'aura-subtle-surface text-slate-400 hover:text-white'
                  }`}
                >
                  {g.toFixed(2)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 uppercase">
              <span>Remaining Credits</span>
              <span className="text-amber-300">{remainingCredits} Cr</span>
            </div>
            <input
              type="range"
              min="6"
              max="120"
              step="3"
              value={remainingCredits}
              onChange={(e) => setRemainingCredits(Number(e.target.value))}
              className="w-full mt-2 accent-amber-400"
            />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] text-slate-400">Required Future Average</div>
            <div className="text-lg font-mono font-extrabold text-white">
              {simulationStats.neededGpa} GPA
            </div>
          </div>
          <div className="text-right">
            <span
              className={`px-3 py-1 rounded-xl text-xs font-extrabold ${
                simulationStats.isPossible
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
              }`}
            >
              {simulationStats.isPossible ? 'Honors Achievable ✓' : 'Target Adjustment Needed'}
            </span>
          </div>
        </div>
      </div>

      {/* Feature 1: Course Final Exam Grade & Target Forecaster */}
      <div className="aura-glass rounded-2xl p-5 space-y-4 border border-slate-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <Target className="w-4 h-4 text-emerald-400" /> FINAL EXAM GRADE TARGET FORECASTER
          </span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
            Target: {targetFinalGrade}%
          </span>
        </div>

        <p className="text-xs text-slate-400">
          Calculate the exact exam score required to secure your target course grade based on your current coursework score.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 uppercase">
              <span>Coursework Score</span>
              <span className="text-emerald-400 font-mono font-bold">{courseworkScore}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={courseworkScore}
              onChange={(e) => setCourseworkScore(Number(e.target.value))}
              className="w-full mt-2 accent-emerald-400"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 uppercase">
              <span>Coursework Weight</span>
              <span className="text-sky-400 font-mono font-bold">{courseworkWeight}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="90"
              step="5"
              value={courseworkWeight}
              onChange={(e) => setCourseworkWeight(Number(e.target.value))}
              className="w-full mt-2 accent-sky-400"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 uppercase">
              <span>Target Final Mark</span>
              <span className="text-amber-400 font-mono font-bold">{targetFinalGrade}%</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              {[75, 80, 85, 90].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTargetFinalGrade(t)}
                  className={`flex-1 py-1 rounded-lg text-xs font-bold transition border ${
                    targetFinalGrade === t
                      ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                      : 'aura-subtle-surface text-slate-400 hover:text-white'
                  }`}
                >
                  {t}%
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] text-slate-400">
              Exam Weight: {examForecaster.examWeight}% • Current Points: {examForecaster.currentPoints} pts
            </div>
            <div className="text-xl font-mono font-extrabold text-white mt-0.5">
              {examForecaster.isPossible ? `${examForecaster.requiredExamScore}% on Final` : 'Out of Reach'}
            </div>
          </div>
          <div className="text-right">
            <span
              className={`px-3 py-1 rounded-lg text-xs font-bold ${
                examForecaster.isPossible
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
              }`}
            >
              {examForecaster.status}
            </span>
          </div>
        </div>
      </div>

      {/* Feature: Attendance Risk Shield */}
      <div className="aura-glass rounded-3xl p-5 space-y-4 border border-sky-400/30">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-sky-300 flex items-center gap-1.5">
            <Shield className="w-4 h-4" /> ATTENDANCE SAFETY SHIELD
          </span>
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-extrabold ${
              attendanceShield.isAtRisk
                ? 'bg-rose-500/20 text-rose-300 border border-rose-400/40'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
            }`}
          >
            {attendanceShield.pct}% Attendance
          </span>
        </div>

        <p className="text-xs text-slate-400">
          Ensure you meet your university’s mandatory exam qualification threshold ({policyThreshold}% policy).
        </p>

        <div className="grid grid-cols-3 gap-2.5">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase">Attended</label>
            <input
              type="number"
              min="0"
              value={attendedClasses}
              onChange={(e) => setAttendedClasses(Number(e.target.value) || 0)}
              className="aura-input w-full px-3 py-2 rounded-xl text-xs font-mono text-center mt-1"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase">Total Held</label>
            <input
              type="number"
              min="1"
              value={totalClasses}
              onChange={(e) => setTotalClasses(Math.max(1, Number(e.target.value) || 1))}
              className="aura-input w-full px-3 py-2 rounded-xl text-xs font-mono text-center mt-1"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase">Policy Min %</label>
            <input
              type="number"
              min="50"
              max="100"
              value={policyThreshold}
              onChange={(e) => setPolicyThreshold(Math.max(50, Math.min(100, Number(e.target.value) || 75)))}
              className="aura-input w-full px-3 py-2 rounded-xl text-xs font-mono text-center mt-1"
            />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] text-slate-400">Absence Safety Buffer</div>
            <div className="text-sm font-extrabold text-white">
              {attendanceShield.isAtRisk
                ? `Debarment Warning: Attend next ${attendanceShield.neededClassesToRecover} classes`
                : `Safe Margin: Up to ${attendanceShield.safeCutsLeft} classes available`}
            </div>
          </div>
        </div>
      </div>

      {/* AURA Semester Academic Summary */}
      <div className="rounded-3xl p-5 bg-slate-900/80 border border-slate-800 space-y-3">
        <div className="text-xs font-extrabold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
          <Sparkles className="w-4 h-4" /> Academic Progress Metrics
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
