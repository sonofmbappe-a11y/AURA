import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  Edit3,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
  UserCheck,
  BookOpen
} from 'lucide-react';
import type { AuraLocalVault, WebCourse, WebLecture } from '../types';
import { uidGen } from '../storage';
import { AuraModal } from './AuraModal';

interface Props {
  vault: AuraLocalVault;
  onUpdateVault: (updater: (prev: AuraLocalVault) => AuraLocalVault) => void;
}

const DAYS = [
  { num: 1, short: 'Mon', full: 'Monday' },
  { num: 2, short: 'Tue', full: 'Tuesday' },
  { num: 3, short: 'Wed', full: 'Wednesday' },
  { num: 4, short: 'Thu', full: 'Thursday' },
  { num: 5, short: 'Fri', full: 'Friday' },
  { num: 6, short: 'Sat', full: 'Saturday' },
  { num: 7, short: 'Sun', full: 'Sunday' }
];

const PALETTE = ['#38BDF8', '#34D399', '#A78BFA', '#FBBF24', '#F472B6', '#FB7185'];

function getIsoDayToday(): number {
  const jsDay = new Date().getDay(); // 0=Sun..6=Sat
  return jsDay === 0 ? 7 : jsDay;
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export const TimetableView: React.FC<Props> = ({ vault, onUpdateVault }) => {
  const todayIso = getIsoDayToday();
  const [selectedDay, setSelectedDay] = useState<number>(todayIso);
  const [viewMode, setViewMode] = useState<'DAY' | 'WEEK' | 'COURSES'>('DAY');

  const [showLectureModal, setShowLectureModal] = useState(false);
  const [editingLecture, setEditingLecture] = useState<WebLecture | null>(null);

  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<WebCourse | null>(null);

  // Course form state
  const [cCode, setCCode] = useState('');
  const [cName, setCName] = useState('');
  const [cCredits, setCCredits] = useState('3');
  const [cLecturer, setCLecturer] = useState('');
  const [cVenue, setCVenue] = useState('');
  const [cColor, setCColor] = useState(PALETTE[0]);

  // Lecture form state
  const [lCourseCode, setLCourseCode] = useState('');
  const [lDay, setLDay] = useState<number>(todayIso);
  const [lStart, setLStart] = useState('09:00');
  const [lEnd, setLEnd] = useState('11:00');
  const [lVenue, setLVenue] = useState('');
  const [lWalk, setLWalk] = useState('10');

  const nowMinutes = useMemo(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }, []);

  const liveBanner = useMemo(() => {
    const todays = vault.lectures
      .filter((l) => l.dayOfWeek === todayIso)
      .sort((a, b) => parseMinutes(a.startTime) - parseMinutes(b.startTime));

    const inSession = todays.find(
      (l) => nowMinutes >= parseMinutes(l.startTime) && nowMinutes < parseMinutes(l.endTime)
    );
    if (inSession) {
      const left = parseMinutes(inSession.endTime) - nowMinutes;
      return { badge: 'NOW IN SESSION', lecture: inSession, sub: `${left} min remaining • ${inSession.venue || 'Main Hall'}` };
    }
    const upcoming = todays.find((l) => parseMinutes(l.startTime) > nowMinutes);
    if (upcoming) {
      const startsIn = parseMinutes(upcoming.startTime) - nowMinutes;
      return {
        badge: 'UP NEXT TODAY',
        lecture: upcoming,
        sub: `Starts in ${startsIn} min (Leave ${upcoming.walkingMinutes}m early) • ${upcoming.venue || 'TBA'}`
      };
    }
    return null;
  }, [vault.lectures, todayIso, nowMinutes]);

  const workloadSummary = useMemo(() => {
    const totalCredits = vault.courses.reduce((s, c) => s + c.creditHours, 0);
    const weeklyLectureMins = vault.lectures.reduce(
      (s, l) => s + Math.max(0, parseMinutes(l.endTime) - parseMinutes(l.startTime)),
      0
    );
    const lectureHrs = +(weeklyLectureMins / 60).toFixed(1);
    const recommendedSelfStudyHrs = Math.max(10, totalCredits * 2);
    return { totalCredits, lectureHrs, recommendedSelfStudyHrs };
  }, [vault.courses, vault.lectures]);

  const openAddCourse = () => {
    setEditingCourse(null);
    setCCode('');
    setCName('');
    setCCredits('3');
    setCLecturer('');
    setCVenue('');
    setCColor(PALETTE[vault.courses.length % PALETTE.length]);
    setShowCourseModal(true);
  };

  const openEditCourse = (c: WebCourse) => {
    setEditingCourse(c);
    setCCode(c.code);
    setCName(c.name);
    setCCredits(String(c.creditHours));
    setCLecturer(c.lecturer);
    setCVenue(c.venue);
    setCColor(c.colorHex || PALETTE[0]);
    setShowCourseModal(true);
  };

  const saveCourse = () => {
    const code = cCode.trim().toUpperCase();
    if (!code) return;
    onUpdateVault((prev) => {
      const courseObj: WebCourse = {
        id: editingCourse?.id || uidGen('c'),
        code,
        name: cName.trim() || code,
        creditHours: Math.max(1, Math.min(12, Number(cCredits) || 3)),
        lecturer: cLecturer.trim(),
        venue: cVenue.trim(),
        colorHex: cColor
      };
      const updatedCourses = editingCourse
        ? prev.courses.map((item) => (item.id === editingCourse.id ? courseObj : item))
        : [...prev.courses.filter((item) => item.code !== code), courseObj];

      const updatedLectures = prev.lectures.map((lec) =>
        lec.courseCode === (editingCourse?.code || code)
          ? {
              ...lec,
              courseCode: code,
              courseName: courseObj.name,
              colorHex: courseObj.colorHex
            }
          : lec
      );
      return { ...prev, courses: updatedCourses, lectures: updatedLectures };
    });
    setShowCourseModal(false);
  };

  const deleteCourse = (course: WebCourse) => {
    onUpdateVault((prev) => ({
      ...prev,
      courses: prev.courses.filter((c) => c.id !== course.id),
      lectures: prev.lectures.filter((l) => l.courseCode !== course.code)
    }));
  };

  const openAddLecture = () => {
    setEditingLecture(null);
    const defaultCourse = vault.courses[0];
    setLCourseCode(defaultCourse?.code || 'CS301');
    setLDay(selectedDay);
    setLStart('09:00');
    setLEnd('11:00');
    setLVenue(defaultCourse?.venue || '');
    setLWalk('10');
    setShowLectureModal(true);
  };

  const openEditLecture = (lec: WebLecture) => {
    setEditingLecture(lec);
    setLCourseCode(lec.courseCode);
    setLDay(lec.dayOfWeek);
    setLStart(lec.startTime);
    setLEnd(lec.endTime);
    setLVenue(lec.venue);
    setLWalk(String(lec.walkingMinutes));
    setShowLectureModal(true);
  };

  const saveLecture = () => {
    const code = lCourseCode.trim().toUpperCase();
    if (!code) return;
    onUpdateVault((prev) => {
      let matchedCourse = prev.courses.find((c) => c.code === code);
      let nextCourses = prev.courses;
      if (!matchedCourse) {
        matchedCourse = {
          id: uidGen('c'),
          code,
          name: code,
          creditHours: 3,
          lecturer: '',
          venue: lVenue.trim(),
          colorHex: PALETTE[prev.courses.length % PALETTE.length]
        };
        nextCourses = [...prev.courses, matchedCourse];
      }
      const lecObj: WebLecture = {
        id: editingLecture?.id || uidGen('l'),
        courseCode: code,
        courseName: matchedCourse.name,
        dayOfWeek: lDay,
        startTime: lStart,
        endTime: lEnd,
        venue: lVenue.trim() || matchedCourse.venue,
        walkingMinutes: Math.max(0, Number(lWalk) || 10),
        colorHex: matchedCourse.colorHex,
        lecturer: matchedCourse.lecturer,
        reminderEnabled: true,
        reminderMinutesBefore: 15
      };
      const nextLectures = editingLecture
        ? prev.lectures.map((item) => (item.id === editingLecture.id ? lecObj : item))
        : [...prev.lectures, lecObj];
      return { ...prev, courses: nextCourses, lectures: nextLectures };
    });
    setShowLectureModal(false);
  };

  const deleteLecture = (id: string) => {
    onUpdateVault((prev) => ({
      ...prev,
      lectures: prev.lectures.filter((l) => l.id !== id)
    }));
  };

  const dayLectures = useMemo(
    () =>
      vault.lectures
        .filter((l) => l.dayOfWeek === selectedDay)
        .sort((a, b) => parseMinutes(a.startTime) - parseMinutes(b.startTime)),
    [vault.lectures, selectedDay]
  );

  return (
    <div className="space-y-4">
      {/* Live Now / Up Next Hero Card */}
      <div className="aura-glass rounded-xl p-4 sm:p-5 border border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/25">
              <Sparkles className="w-3.5 h-3.5" />
              {liveBanner ? liveBanner.badge : 'TIMETABLE & COURSE ARCHITECT'}
            </span>
            <h2 className="text-lg font-bold mt-1.5 tracking-tight">
              {liveBanner
                ? `${liveBanner.lecture.courseCode} • ${liveBanner.lecture.courseName}`
                : `${vault.profile.semester} Smart Schedule`}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {liveBanner
                ? `${liveBanner.lecture.startTime} – ${liveBanner.lecture.endTime} • ${liveBanner.sub}`
                : `${workloadSummary.totalCredits} Credit Hrs • ${workloadSummary.lectureHrs}h Weekly Classes • Target ${workloadSummary.recommendedSelfStudyHrs}h Self-Study/wk`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openAddCourse}
              className="px-3 py-2 rounded-lg text-xs font-semibold aura-subtle-surface hover:border-cyan-500/50 text-cyan-400 flex items-center gap-1.5 transition"
            >
              <BookOpen className="w-3.5 h-3.5" /> + Course
            </button>
            <button
              onClick={openAddLecture}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 flex items-center gap-1.5 transition"
            >
              <Plus className="w-4 h-4" /> + Class Slot
            </button>
          </div>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex gap-2">
        {(
          [
            ['DAY', 'Daily Timetable'],
            ['WEEK', 'Full Week Grid'],
            ['COURSES', `Courses (${vault.courses.length})`]
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-semibold border transition ${
              viewMode === mode
                ? 'bg-cyan-500/15 border-cyan-500 text-cyan-300'
                : 'aura-glass border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {viewMode === 'DAY' && (
        <>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {DAYS.map((d) => {
              const count = vault.lectures.filter((l) => l.dayOfWeek === d.num).length;
              const active = selectedDay === d.num;
              return (
                <button
                  key={d.num}
                  onClick={() => setSelectedDay(d.num)}
                  className={`min-w-[64px] py-2 px-2 rounded-lg text-center border transition ${
                    active
                      ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold'
                      : 'aura-glass text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs">{d.short}</div>
                  <div className={`text-[10px] mt-0.5 ${active ? 'text-slate-900' : 'text-slate-400'}`}>
                    {count} {count === 1 ? 'class' : 'classes'}
                  </div>
                </button>
              );
            })}
          </div>

          {dayLectures.length === 0 ? (
            <div className="aura-glass rounded-xl p-8 text-center space-y-2">
              <Calendar className="w-8 h-8 text-cyan-400 mx-auto" />
              <div className="font-bold text-sm">
                Free Day on {DAYS.find((d) => d.num === selectedDay)?.full}
              </div>
              <p className="text-xs text-slate-400">
                Great window for deep focus sprints, flashcard reviews, or hosting a live study session.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {dayLectures.map((lec) => (
                <div
                  key={lec.id}
                  className="aura-glass rounded-xl p-4 flex items-center justify-between gap-3 border-l-4"
                  style={{ borderLeftColor: lec.colorHex || '#06B6D4' }}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="px-2 py-0.5 rounded-md text-[11px] font-bold"
                        style={{
                          backgroundColor: `${lec.colorHex}24`,
                          color: lec.colorHex
                        }}
                      >
                        {lec.courseCode}
                      </span>
                      <span className="text-xs font-mono text-cyan-300 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {lec.startTime} – {lec.endTime}
                      </span>
                    </div>
                    <div className="font-semibold text-sm truncate">{lec.courseName}</div>
                    <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3">
                      {lec.venue && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-cyan-400" /> {lec.venue}
                        </span>
                      )}
                      {lec.lecturer && (
                        <span className="inline-flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5 text-violet-400" /> {lec.lecturer}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => openEditLecture(lec)}
                      aria-label="Edit class slot"
                      className="p-2 rounded-lg aura-subtle-surface hover:border-cyan-500/50 text-cyan-400"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteLecture(lec.id)}
                      aria-label="Delete class slot"
                      className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {viewMode === 'WEEK' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {DAYS.map((d) => {
            const slots = vault.lectures
              .filter((l) => l.dayOfWeek === d.num)
              .sort((a, b) => parseMinutes(a.startTime) - parseMinutes(b.startTime));
            return (
              <div key={d.num} className="aura-glass rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-cyan-400 uppercase tracking-wider">
                    {d.full}
                  </span>
                  <span className="text-[11px] text-slate-400">{slots.length} slot(s)</span>
                </div>
                {slots.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No classes scheduled</p>
                ) : (
                  slots.map((s) => (
                    <div
                      key={s.id}
                      className="p-2.5 rounded-lg aura-subtle-surface flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">
                          <span style={{ color: s.colorHex }}>{s.courseCode}</span> • {s.courseName}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {s.startTime}–{s.endTime} {s.venue ? `• ${s.venue}` : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteLecture(s.id)}
                        className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15"
                        title="Delete slot"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      {viewMode === 'COURSES' && (
        <div className="space-y-3">
          {vault.courses.length === 0 ? (
            <div className="aura-glass rounded-xl p-8 text-center text-xs text-slate-400">
              No courses registered yet. Tap <strong>+ Course</strong> above to add your semester courses.
            </div>
          ) : (
            vault.courses.map((c) => (
              <div
                key={c.id}
                className="aura-glass rounded-xl p-4 flex items-center justify-between gap-3 border-l-4"
                style={{ borderLeftColor: c.colorHex }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded-md text-xs font-bold"
                      style={{ backgroundColor: `${c.colorHex}26`, color: c.colorHex }}
                    >
                      {c.code}
                    </span>
                    <span className="text-xs text-slate-400">{c.creditHours} Credits</span>
                  </div>
                  <div className="font-semibold text-sm mt-1 truncate">{c.name}</div>
                  <div className="text-xs text-slate-400">
                    {[c.lecturer, c.venue].filter(Boolean).join(' • ') || 'Tap edit to set lecturer & venue'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openEditCourse(c)}
                    className="p-2 rounded-lg aura-subtle-surface hover:border-cyan-500/50 text-cyan-400"
                    title="Edit Course"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteCourse(c)}
                    className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-400"
                    title="Delete Course & Its Slots"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add / Edit Course Modal */}
      <AuraModal
        open={showCourseModal}
        onClose={() => setShowCourseModal(false)}
        badge="SEMESTER CURRICULUM"
        title={editingCourse ? 'Edit Course' : 'Add Semester Course'}
        subtitle="Color-coded courses automatically sync across your daily & weekly timetable."
        accentColor="sky"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <input
              value={cCode}
              onChange={(e) => setCCode(e.target.value)}
              placeholder="Code (CS301)"
              className="col-span-2 px-3.5 py-2.5 rounded-xl aura-input text-xs font-bold uppercase"
            />
            <input
              type="number"
              min={1}
              max={12}
              value={cCredits}
              onChange={(e) => setCCredits(e.target.value)}
              placeholder="Credits"
              className="px-3 py-2.5 rounded-xl aura-input text-xs font-mono font-bold text-center"
            />
          </div>
          <input
            value={cName}
            onChange={(e) => setCName(e.target.value)}
            placeholder="Course Name (e.g. Operating Systems)"
            className="w-full px-3.5 py-2.5 rounded-xl aura-input text-xs"
          />
          <input
            value={cLecturer}
            onChange={(e) => setCLecturer(e.target.value)}
            placeholder="Lecturer / Professor"
            className="w-full px-3.5 py-2.5 rounded-xl aura-input text-xs"
          />
          <input
            value={cVenue}
            onChange={(e) => setCVenue(e.target.value)}
            placeholder="Default Lecture Hall / Venue"
            className="w-full px-3.5 py-2.5 rounded-xl aura-input text-xs"
          />
          <div className="flex items-center gap-2.5 pt-1">
            <span className="text-[11px] font-bold text-slate-400">Color:</span>
            {PALETTE.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => setCColor(hex)}
                className={`w-7 h-7 rounded-full border-2 transition ${
                  cColor === hex ? 'border-white scale-110 shadow-md' : 'border-transparent opacity-75'
                }`}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowCourseModal(false)}
              className="flex-1 py-2.5 rounded-lg aura-subtle-surface text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveCourse}
              className="flex-1 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold"
            >
              Save Course
            </button>
          </div>
        </div>
      </AuraModal>

      {/* Add / Edit Class Slot Modal */}
      <AuraModal
        open={showLectureModal}
        onClose={() => setShowLectureModal(false)}
        badge="CLASS SCHEDULE"
        title={editingLecture ? 'Edit Class Slot' : 'Add Weekly Class Slot'}
        subtitle="Includes live countdown banners & walking buffer reminders."
        accentColor="sky"
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400">Course Code</label>
            <input
              list="aura-course-codes"
              value={lCourseCode}
              onChange={(e) => setLCourseCode(e.target.value)}
              placeholder="e.g. CS301"
              className="w-full px-3.5 py-2.5 rounded-lg aura-input text-xs font-bold uppercase"
            />
            <datalist id="aura-course-codes">
              {vault.courses.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.name}
                </option>
              ))}
            </datalist>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400">Day of Week</label>
            <select
              value={lDay}
              onChange={(e) => setLDay(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-lg aura-input text-xs font-semibold"
            >
              {DAYS.map((d) => (
                <option key={d.num} value={d.num}>
                  {d.full}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400">Start Time</label>
              <input
                type="time"
                value={lStart}
                onChange={(e) => setLStart(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg aura-input text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400">End Time</label>
              <input
                type="time"
                value={lEnd}
                onChange={(e) => setLEnd(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg aura-input text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1">
              <label className="text-[11px] font-bold text-slate-400">Venue / Room</label>
              <input
                value={lVenue}
                onChange={(e) => setLVenue(e.target.value)}
                placeholder="Hall / Lab"
                className="w-full px-3.5 py-2.5 rounded-lg aura-input text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400">Walk (min)</label>
              <input
                type="number"
                min={0}
                max={120}
                value={lWalk}
                onChange={(e) => setLWalk(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg aura-input text-xs font-mono text-center"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowLectureModal(false)}
              className="flex-1 py-2.5 rounded-lg aura-subtle-surface text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveLecture}
              className="flex-1 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold"
            >
              Save Slot
            </button>
          </div>
        </div>
      </AuraModal>
    </div>
  );
};
