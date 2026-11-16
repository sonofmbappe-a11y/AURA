import React, { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Award,
  BarChart3,
  Calculator,
  CloudDownload,
  CloudUpload,
  LogIn,
  LogOut,
  Moon,
  Plus,
  Shield,
  Smartphone,
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
  onSignOut?: () => void | Promise<void>;
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
  onNotify,
  onSignOut
}) => {
  const [busySync, setBusySync] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const [wakeTime, setWakeTime] = useState('06:30');

  const [gCode, setGCode] = useState('');
  const [gCredits, setGCredits] = useState('3');
  const [gLetter, setGLetter] = useState('A');
  const [targetHonorsGpa, setTargetHonorsGpa] = useState<number>(3.80);
  const [remainingCredits, setRemainingCredits] = useState<number>(45);

  const [courseworkScore, setCourseworkScore] = useState<number>(76);
  const [courseworkWeight, setCourseworkWeight] = useState<number>(40);
  const [targetFinalGrade, setTargetFinalGrade] = useState<number>(85);

  const [totalClasses, setTotalClasses] = useState<number>(36);
  const [attendedClasses, setAttendedClasses] = useState<number>(33);
  const [policyThreshold, setPolicyThreshold] = useState<number>(
    vault.profile.attendanceTargetPercent || 75
  );

  const examForecaster = useMemo(() => {
    const examWeight = Math.max(1, 100 - courseworkWeight);
    const currentPoints = (courseworkScore * courseworkWeight) / 100;
    const pointsNeeded = targetFinalGrade - currentPoints;
    const requiredExamScore = (pointsNeeded / examWeight) * 100;

    let status = 'Achievable with Focus';
    let isPossible = true;
    if (requiredExamScore <= 0) {
      status = 'Target Secured';
    } else if (requiredExamScore <= 60) {
      status = 'Comfortably Achievable';
    } else if (requiredExamScore <= 85) {
      status = 'Achievable with Prep';
    } else if (requiredExamScore <= 100) {
      status = 'High Effort Required';
    } else {
      status = 'Out of Reach';
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
          ? '0.00 (Secured)'
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
      const savedAtMs = await saveCloudBackupFromWeb(user.uid, user.email || '', vault);
      onUpdateVault((prev) => ({ ...prev, lastBackupUpdatedAtMs: savedAtMs }));
      onNotify(
        'Backed up Profile, Timetable, Flashcards, Notes & GPA to Cloud Vault.'
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
      const res = await fetchAndMergeCloudBackupToWeb(user.uid, vault, user.email || '');
      if (!res) {
        onNotify('No Cloud Snapshot found on this account yet.');
      } else {
        onUpdateVault(() => res.updatedVault);
        onNotify(`Restored Cloud Backup: ${res.summary}`);
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

  const lastSyncedLabel = vault.lastBackupUpdatedAtMs
    ? new Date(vault.lastBackupUpdatedAtMs).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Not yet synced';

  return (
    <div className="space-y-4">
      {/* Cross-Platform Cloud Backup & Restore Card */}
      <div className="aura-glass rounded-lg p-4 space-y-3.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="px-2 py-0.5 rounded bg-[#EFF6FF] text-[#1E3A8A] border border-[#BFDBFE] font-mono text-[10px] font-semibold uppercase tracking-wider">
              Cross-Platform Cloud Vault
            </span>
            <h3 className="font-bold text-base text-[#111827] mt-1.5">
              {user ? user.displayName || user.email : 'Sign In to Sync Timetable & Profile'}
            </h3>
            {user && (
              <div className="font-mono text-[11px] text-[#6B7280] mt-0.5">
                {user.email} · Last Sync: {lastSyncedLabel}
              </div>
            )}
          </div>
          {user && (
            <button
              onClick={() => (onSignOut ? onSignOut() : signOutBrowser())}
              className="p-2 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] hover:border-[#FECACA] hover:bg-[#FEF2F2] text-[#6B7280] hover:text-[#DC2626] transition-colors duration-150"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>

        <p className="text-xs text-[#6B7280] leading-relaxed">
          Edits save locally for offline speed and automatically synchronize with your Android AURA account whenever signed in.
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
              className="w-full py-2.5 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] font-semibold text-xs inline-flex items-center justify-center gap-2 transition-colors duration-150"
            >
              <LogIn className="w-4 h-4" /> Sign in with Google
            </button>

            <div className="p-3 rounded-md bg-[#F9FAFB] border border-[#E5E7EB] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#111827]">
                  {isRegister ? 'Create Scholar Account (Email)' : 'Sign In with Email & Password'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsRegister(!isRegister)}
                  className="text-[11px] font-semibold text-[#1E3A8A] hover:underline"
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
                  className="w-full px-3 py-2 rounded-md aura-input text-xs"
                />
              )}

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="scholar@university.edu"
                className="w-full px-3 py-2 rounded-md aura-input text-xs"
              />

              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="•••••••• (min 6 characters)"
                className="w-full px-3 py-2 rounded-md aura-input text-xs"
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
                      onNotify('Account created successfully.');
                    } else {
                      await signInWithEmailBrowser(email, password);
                      onNotify('Signed in successfully.');
                    }
                  } catch (err: unknown) {
                    onNotify((err as Error)?.message || 'Authentication failed.');
                  }
                }}
                className="w-full py-2 rounded-md bg-[#FFFFFF] border border-[#D1D5DB] hover:border-[#1E3A8A] text-[#111827] font-semibold text-xs transition-colors duration-150"
              >
                {isRegister ? 'Create Account' : 'Sign In'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              disabled={busySync}
              onClick={handleBackupToCloud}
              className="py-2.5 px-3 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] font-semibold text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors duration-150"
            >
              <CloudUpload className="w-4 h-4" /> Push Backup to Cloud
            </button>
            <button
              disabled={busySync}
              onClick={handleImportFromCloud}
              className="py-2.5 px-3 rounded-md bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#1E3A8A] text-[#1E3A8A] font-semibold text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors duration-150"
            >
              <CloudDownload className="w-4 h-4" /> Restore from Cloud
            </button>
          </div>
        )}
      </div>

      {/* Student Profile */}
      <div className="aura-glass rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#1E3A8A] flex items-center gap-1.5">
            <UserCircle className="w-4 h-4" /> Scholar Profile
          </span>
          <span className="font-mono text-[11px] text-[#6B7280]">{vault.profile.academicLevel}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <input
            value={vault.profile.name}
            onChange={(e) =>
              onUpdateVault((prev) => ({
                ...prev,
                profile: { ...prev.profile, name: e.target.value }
              }))
            }
            placeholder="Your Name"
            className="px-3 py-2 rounded-md aura-input text-xs"
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
            className="px-3 py-2 rounded-md aura-input text-xs"
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
            className="px-3 py-2 rounded-md aura-input text-xs"
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
            className="px-3 py-2 rounded-md aura-input text-xs"
          />
        </div>
      </div>

      {/* Cumulative GPA Calculator + Honors Simulator Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="aura-glass rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#111827] flex items-center gap-1.5">
              <Calculator className="w-4 h-4 text-[#1E3A8A]" /> GPA &amp; Grade Ledger
            </span>
            <span className="px-2 py-0.5 rounded bg-[#EFF6FF] border border-[#BFDBFE] font-mono text-xs font-bold text-[#1E3A8A]">
              {gpaStats.gpa} GPA · {gpaStats.totalCredits} Cr
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <input
              value={gCode}
              onChange={(e) => setGCode(e.target.value)}
              placeholder="CS301"
              className="col-span-2 px-3 py-2 rounded-md aura-input text-xs font-mono font-bold uppercase"
            />
            <input
              type="number"
              value={gCredits}
              onChange={(e) => setGCredits(e.target.value)}
              placeholder="Cr"
              className="px-2 py-2 rounded-md aura-input text-xs font-mono text-center"
            />
            <select
              value={gLetter}
              onChange={(e) => setGLetter(e.target.value)}
              className="px-2 py-2 rounded-md aura-input text-xs font-mono font-bold"
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
            className="w-full py-2 rounded-md bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#1E3A8A] text-xs font-semibold text-[#111827] inline-flex items-center justify-center gap-1 transition-colors duration-150"
          >
            <Plus className="w-3.5 h-3.5 text-[#1E3A8A]" /> Record Grade
          </button>

          {vault.grades.length > 0 && (
            <div className="border border-[#E5E7EB] rounded-md divide-y divide-[#E5E7EB]">
              {vault.grades.map((g) => (
                <div key={g.id} className="px-3 py-2 flex items-center justify-between text-xs">
                  <span className="font-mono text-[#111827]">
                    <strong>{g.courseCode}</strong> · {g.creditHours} Cr · {g.letterGrade} ({g.gradePoint.toFixed(1)})
                  </span>
                  <button
                    onClick={() =>
                      onUpdateVault((prev) => ({
                        ...prev,
                        grades: prev.grades.filter((x) => x.id !== g.id)
                      }))
                    }
                    className="text-[#9CA3AF] hover:text-[#DC2626] transition-colors duration-150"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Honors & CGPA Target Simulator */}
        <div className="aura-glass rounded-lg p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#111827] flex items-center gap-1.5">
              <Award className="w-4 h-4 text-[#1E3A8A]" /> Honors Target Simulator
            </span>
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#F3F4F6] border border-[#E5E7EB] text-[#111827] font-bold">
              Target: {targetHonorsGpa.toFixed(2)}
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="font-mono text-[10px] font-semibold text-[#6B7280] uppercase">
                Target Cumulative GPA
              </label>
              <div className="grid grid-cols-4 gap-1.5 mt-1">
                {[3.60, 3.75, 3.85, 3.95].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setTargetHonorsGpa(g)}
                    className={`py-1.5 rounded-md font-mono text-xs font-semibold transition-colors duration-150 border ${
                      targetHonorsGpa === g
                        ? 'bg-[#1E3A8A] border-[#1E3A8A] text-[#FFFFFF]'
                        : 'bg-[#FFFFFF] border-[#E5E7EB] text-[#4B5563] hover:border-[#9CA3AF]'
                    }`}
                  >
                    {g.toFixed(2)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between font-mono text-[10px] font-semibold text-[#6B7280] uppercase">
                <span>Remaining Credits</span>
                <span className="text-[#111827]">{remainingCredits} Cr</span>
              </div>
              <input
                type="range"
                min="6"
                max="120"
                step="3"
                value={remainingCredits}
                onChange={(e) => setRemainingCredits(Number(e.target.value))}
                className="w-full mt-1.5 accent-[#1E3A8A]"
              />
            </div>
          </div>

          <div className="p-3 rounded-md bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] text-[#6B7280]">Required Future Average</div>
              <div className="text-base font-mono font-bold text-[#111827]">
                {simulationStats.neededGpa} GPA
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold border ${
                simulationStats.isPossible
                  ? 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]'
                  : 'bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]'
              }`}
            >
              {simulationStats.isPossible ? 'Achievable' : 'Adjust Target'}
            </span>
          </div>
        </div>
      </div>

      {/* Final Exam Forecaster & Attendance Shield */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="aura-glass rounded-lg p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#111827] flex items-center gap-1.5">
              <Target className="w-4 h-4 text-[#1E3A8A]" /> Final Exam Forecaster
            </span>
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#EFF6FF] text-[#1E3A8A] border border-[#BFDBFE] font-bold">
              Target: {targetFinalGrade}%
            </span>
          </div>

          <div className="space-y-2.5">
            <div>
              <div className="flex items-center justify-between font-mono text-[10px] font-semibold text-[#6B7280] uppercase">
                <span>Coursework Score</span>
                <span className="text-[#1E3A8A] font-bold">{courseworkScore}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={courseworkScore}
                onChange={(e) => setCourseworkScore(Number(e.target.value))}
                className="w-full mt-1 accent-[#1E3A8A]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between font-mono text-[10px] font-semibold text-[#6B7280] uppercase">
                <span>Coursework Weight</span>
                <span className="text-[#111827] font-bold">{courseworkWeight}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="90"
                step="5"
                value={courseworkWeight}
                onChange={(e) => setCourseworkWeight(Number(e.target.value))}
                className="w-full mt-1 accent-[#1E3A8A]"
              />
            </div>

            <div>
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {[75, 80, 85, 90].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTargetFinalGrade(t)}
                    className={`py-1 rounded-md font-mono text-xs font-semibold transition-colors duration-150 border ${
                      targetFinalGrade === t
                        ? 'bg-[#1E3A8A] border-[#1E3A8A] text-[#FFFFFF]'
                        : 'bg-[#FFFFFF] border-[#E5E7EB] text-[#4B5563] hover:border-[#9CA3AF]'
                    }`}
                  >
                    {t}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-3 rounded-md bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] text-[#6B7280]">
                Exam Weight: {examForecaster.examWeight}% · Secured: {examForecaster.currentPoints} pts
              </div>
              <div className="text-base font-mono font-bold text-[#111827] mt-0.5">
                {examForecaster.isPossible ? `${examForecaster.requiredExamScore}% on Final` : 'Out of Reach'}
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded font-mono text-[11px] font-semibold border ${
                examForecaster.isPossible
                  ? 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]'
                  : 'bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]'
              }`}
            >
              {examForecaster.status}
            </span>
          </div>
        </div>

        {/* Attendance Safety Shield */}
        <div className="aura-glass rounded-lg p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#111827] flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-[#1E3A8A]" /> Attendance Safety Margin
            </span>
            <span
              className={`font-mono text-xs px-2 py-0.5 rounded font-bold border ${
                attendanceShield.isAtRisk
                  ? 'bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]'
                  : 'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]'
              }`}
            >
              {attendanceShield.pct}%
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="font-mono text-[10px] font-semibold text-[#6B7280] uppercase">Attended</label>
              <input
                type="number"
                min="0"
                value={attendedClasses}
                onChange={(e) => setAttendedClasses(Number(e.target.value) || 0)}
                className="aura-input w-full px-2.5 py-2 rounded-md text-xs font-mono text-center mt-1"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] font-semibold text-[#6B7280] uppercase">Total Held</label>
              <input
                type="number"
                min="1"
                value={totalClasses}
                onChange={(e) => setTotalClasses(Math.max(1, Number(e.target.value) || 1))}
                className="aura-input w-full px-2.5 py-2 rounded-md text-xs font-mono text-center mt-1"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] font-semibold text-[#6B7280] uppercase">Policy %</label>
              <input
                type="number"
                min="50"
                max="100"
                value={policyThreshold}
                onChange={(e) =>
                  setPolicyThreshold(Math.max(50, Math.min(100, Number(e.target.value) || 75)))
                }
                className="aura-input w-full px-2.5 py-2 rounded-md text-xs font-mono text-center mt-1"
              />
            </div>
          </div>

          <div className="p-3 rounded-md bg-[#F9FAFB] border border-[#E5E7EB]">
            <div className="font-mono text-[10px] text-[#6B7280] uppercase">Exam Qualification Buffer</div>
            <div className="text-xs font-semibold text-[#111827] mt-0.5">
              {attendanceShield.isAtRisk
                ? `Debarment Risk: Attend next ${attendanceShield.neededClassesToRecover} classes consecutively.`
                : `Safe Margin: Up to ${attendanceShield.safeCutsLeft} permitted absences remaining.`}
            </div>
          </div>
        </div>
      </div>

      {/* 90-Minute REM Sleep Cycle Planner & Academic Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="aura-glass rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#111827] flex items-center gap-1.5">
              <Moon className="w-4 h-4 text-[#1E3A8A]" /> 90-Min REM Sleep Planner
            </span>
            <input
              type="time"
              value={wakeTime}
              onChange={(e) => setWakeTime(e.target.value)}
              className="px-2.5 py-1 rounded-md aura-input text-xs font-mono"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {bedtimes.map((b) => (
              <div
                key={b.cycles}
                className="p-2.5 rounded-md bg-[#F9FAFB] border border-[#E5E7EB] text-center"
              >
                <div className="text-sm font-mono font-bold text-[#1E3A8A]">{b.time}</div>
                <div className="font-mono text-[10px] text-[#6B7280] mt-0.5">
                  {b.cycles} cycles · {b.hours}h
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="aura-glass rounded-lg p-4 space-y-3">
          <div className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#111827] flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-[#1E3A8A]" /> Semester Telemetry
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="p-2.5 rounded-md bg-[#F9FAFB] border border-[#E5E7EB]">
              <div className="text-lg font-bold font-mono text-[#111827]">{vault.courses.length}</div>
              <div className="text-[10px] text-[#6B7280]">Courses</div>
            </div>
            <div className="p-2.5 rounded-md bg-[#F9FAFB] border border-[#E5E7EB]">
              <div className="text-lg font-bold font-mono text-[#111827]">{vault.lectures.length}</div>
              <div className="text-[10px] text-[#6B7280]">Slots</div>
            </div>
            <div className="p-2.5 rounded-md bg-[#F9FAFB] border border-[#E5E7EB]">
              <div className="text-lg font-bold font-mono text-[#111827]">{vault.flashcards.length}</div>
              <div className="text-[10px] text-[#6B7280]">Cards</div>
            </div>
            <div className="p-2.5 rounded-md bg-[#F9FAFB] border border-[#E5E7EB]">
              <div className="text-lg font-bold font-mono text-[#1E3A8A]">{totalFocusHrs}h</div>
              <div className="text-[10px] text-[#6B7280]">Focus</div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile PWA Add-to-Home-Screen Notice */}
      <div className="aura-glass rounded-lg p-3.5 flex items-start gap-3">
        <Smartphone className="w-4 h-4 text-[#1E3A8A] shrink-0 mt-0.5" />
        <div className="text-xs text-[#6B7280] leading-relaxed">
          <strong className="text-[#111827]">Install as Web App:</strong> In iOS Safari or desktop Chrome, select{' '}
          <strong>Share → Add to Home Screen</strong> (or Install App) for offline timetable access.
        </div>
      </div>
    </div>
  );
};
