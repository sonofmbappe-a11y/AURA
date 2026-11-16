import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  Edit3,
  MapPin,
  Plus,
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

const PALETTE = ['#1E3A8A', '#0F766E', '#B45309', '#374151', '#1D4ED8', '#047857'];

function getIsoDayToday(): number {
  const jsDay = new Date().getDay();
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

  const [cCode, setCCode] = useState('');
  const [cName, setCName] = useState('');
  const [cCredits, setCCredits] = useState('3');
  const [cLecturer, setCLecturer] = useState('');
  const [cVenue, setCVenue] = useState('');
  const [cColor, setCColor] = useState(PALETTE[0]);

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
      return {
        badge: 'NOW IN SESSION',
        lecture: inSession,
        sub: `${left}m remaining · ${inSession.venue || 'Main Hall'}`
      };
    }
    const upcoming = todays.find((l) => parseMinutes(l.startTime) > nowMinutes);
    if (upcoming) {
      const startsIn = parseMinutes(upcoming.startTime) - nowMinutes;
      return {
        badge: 'UP NEXT TODAY',
        lecture: upcoming,
        sub: `Starts in ${startsIn}m (Leave ${upcoming.walkingMinutes}m early) · ${upcoming.venue || 'TBA'}`
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
      {/* Editorial Summary Banner */}
      <div className="aura-glass rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[10px] font-semibold uppercase tracking-wider bg-[#EFF6FF] text-[#1E3A8A] border border-[#BFDBFE]">
              {liveBanner ? liveBanner.badge : 'ACADEMIC SCHEDULE'}
            </span>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-[#111827]">
              {liveBanner ? (
                <>
                  <span className="font-mono text-[#1E3A8A] mr-1.5">{liveBanner.lecture.courseCode}</span>
                  {liveBanner.lecture.courseName}
                </>
              ) : (
                `${vault.profile.semester} · Weekly Timetable`
              )}
            </h2>
            <p className="font-mono text-xs text-[#6B7280]">
              {liveBanner
                ? `${liveBanner.lecture.startTime}–${liveBanner.lecture.endTime} · ${liveBanner.sub}`
                : `${workloadSummary.totalCredits} Credits · ${workloadSummary.lectureHrs}h Class Load · ${workloadSummary.recommendedSelfStudyHrs}h Self-Study Target`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openAddCourse}
              className="px-3 py-2 rounded-md text-xs font-semibold bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#9CA3AF] text-[#111827] flex items-center gap-1.5 transition-colors duration-150"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#1E3A8A]" /> Add Course
            </button>
            <button
              onClick={openAddLecture}
              className="px-3.5 py-2 rounded-md text-xs font-semibold bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] flex items-center gap-1.5 transition-colors duration-150"
            >
              <Plus className="w-3.5 h-3.5" /> Add Class Slot
            </button>
          </div>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ['DAY', 'Daily View'],
            ['WEEK', 'Week Matrix'],
            ['COURSES', `Courses (${vault.courses.length})`]
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`py-2 px-3 rounded-md text-xs font-semibold border transition-colors duration-150 ${
              viewMode === mode
                ? 'bg-[#EFF6FF] border-[#1E3A8A] text-[#1E3A8A]'
                : 'bg-[#FFFFFF] border-[#E5E7EB] text-[#6B7280] hover:border-[#9CA3AF] hover:text-[#111827]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {viewMode === 'DAY' && (
        <>
          <div className="grid grid-cols-7 gap-1.5 overflow-x-auto no-scrollbar">
            {DAYS.map((d) => {
              const count = vault.lectures.filter((l) => l.dayOfWeek === d.num).length;
              const active = selectedDay === d.num;
              const isToday = d.num === todayIso;
              return (
                <button
                  key={d.num}
                  onClick={() => setSelectedDay(d.num)}
                  className={`min-w-[54px] py-2 px-2 rounded-md text-center border transition-colors duration-150 ${
                    active
                      ? 'bg-[#1E3A8A] text-[#FFFFFF] border-[#1E3A8A]'
                      : 'bg-[#FFFFFF] text-[#111827] border-[#E5E7EB] hover:border-[#9CA3AF]'
                  }`}
                >
                  <div className="text-xs font-semibold flex items-center justify-center gap-1">
                    {d.short}
                    {isToday && !active && <span className="w-1.5 h-1.5 rounded-full bg-[#1E3A8A]" />}
                  </div>
                  <div
                    className={`font-mono text-[10px] mt-0.5 ${
                      active ? 'text-[#DBEAFE]' : 'text-[#6B7280]'
                    }`}
                  >
                    {count} {count === 1 ? 'slot' : 'slots'}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Live Schedule Timeline Ribbon */}
          <div className="rounded-lg bg-[#FFFFFF] border border-[#E5E7EB] p-3 sm:p-4 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[#1E3A8A]" />
                <span className="font-mono text-[11px] font-bold text-[#111827] uppercase tracking-wider">
                  {DAYS.find((d) => d.num === selectedDay)?.full} Schedule Timeline (08:00 – 20:00)
                </span>
              </div>
              {selectedDay === todayIso && (
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#1E3A8A] font-semibold">
                  <span className="w-2 h-2 rounded-full bg-[#1E3A8A] animate-pulse" />
                  <span>
                    {String(Math.floor(nowMinutes / 60)).padStart(2, '0')}:
                    {String(nowMinutes % 60).padStart(2, '0')} Campus Time
                  </span>
                </div>
              )}
            </div>

            {/* Timeline Bar Track (Horizontally scrollable on mobile to prevent overlap) */}
            <div className="overflow-x-auto no-scrollbar pb-1">
              <div className="relative min-w-[540px] h-12 bg-[#F3F4F6] rounded-md border border-[#E5E7EB] overflow-hidden">
              {/* Hour Grid Markers */}
              {[8, 10, 12, 14, 16, 18, 20].map((hour) => {
                const pct = ((hour * 60 - 480) / 720) * 100;
                return (
                  <div
                    key={hour}
                    className="absolute top-0 bottom-0 border-l border-[#E5E7EB] flex flex-col justify-end pb-1 pl-1 pointer-events-none"
                    style={{ left: `${pct}%` }}
                  >
                    <span className="text-[9px] font-mono text-[#9CA3AF] select-none">
                      {hour}:00
                    </span>
                  </div>
                );
              })}

              {/* Class Blocks */}
              {dayLectures.map((lec) => {
                const sMin = parseMinutes(lec.startTime);
                const eMin = parseMinutes(lec.endTime);
                const left = Math.max(0, Math.min(100, ((sMin - 480) / 720) * 100));
                const width = Math.max(3, Math.min(100 - left, ((eMin - sMin) / 720) * 100));
                const isNow =
                  selectedDay === todayIso && nowMinutes >= sMin && nowMinutes < eMin;

                return (
                  <div
                    key={lec.id}
                    onClick={() => openEditLecture(lec)}
                    title={`${lec.courseCode} (${lec.startTime}-${lec.endTime}) @ ${lec.venue || 'TBA'}`}
                    className={`absolute top-1 bottom-1 rounded cursor-pointer px-1.5 py-0.5 flex flex-col justify-center overflow-hidden border transition-transform duration-150 hover:scale-[1.02] shadow-xs ${
                      isNow ? 'ring-2 ring-[#1E3A8A] ring-offset-1 z-10' : 'z-5'
                    }`}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: `${lec.colorHex || '#1E3A8A'}22`,
                      borderColor: lec.colorHex || '#1E3A8A'
                    }}
                  >
                    <span
                      className="font-mono font-bold text-[10px] leading-tight truncate"
                      style={{ color: lec.colorHex || '#1E3A8A' }}
                    >
                      {lec.courseCode}
                    </span>
                    <span className="text-[9px] text-[#4B5563] truncate hidden sm:block">
                      {lec.venue || lec.startTime}
                    </span>
                  </div>
                );
              })}

              {/* Real-time Indicator Needle */}
              {selectedDay === todayIso && nowMinutes >= 480 && nowMinutes <= 1200 && (
                <div
                  className="absolute top-0 bottom-0 z-20 pointer-events-none flex flex-col items-center"
                  style={{ left: `${((nowMinutes - 480) / 720) * 100}%` }}
                >
                  <span className="w-2 h-2 rounded-full bg-[#DC2626] -mt-1 shadow-xs" />
                  <div className="w-[2px] h-full bg-[#DC2626]" />
                </div>
              )}
            </div>
          </div>
        </div>

          {dayLectures.length === 0 ? (
            <div className="aura-glass rounded-lg p-8 text-center space-y-1.5">
              <Calendar className="w-7 h-7 text-[#6B7280] mx-auto" />
              <div className="font-semibold text-sm text-[#111827]">
                No lectures scheduled for {DAYS.find((d) => d.num === selectedDay)?.full}
              </div>
              <p className="text-xs text-[#6B7280]">
                Use this window for deep focus sprints, SM-2 card reviews, or team deliverables.
              </p>
            </div>
          ) : (
            <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-lg divide-y divide-[#E5E7EB]">
              {dayLectures.map((lec) => (
                <div
                  key={lec.id}
                  className="p-3.5 sm:px-4 flex items-center justify-between gap-3 border-l-4 hover:bg-[#F9FAFB] transition-colors duration-150"
                  style={{ borderLeftColor: lec.colorHex || '#1E3A8A' }}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-[#F3F4F6] border border-[#E5E7EB] font-mono text-[11px] font-bold text-[#111827]">
                        {lec.courseCode}
                      </span>
                      <span className="font-mono text-xs font-medium text-[#1E3A8A] flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {lec.startTime}–{lec.endTime}
                      </span>
                    </div>
                    <div className="font-semibold text-sm text-[#111827] truncate">{lec.courseName}</div>
                    <div className="text-xs text-[#6B7280] flex flex-wrap items-center gap-3">
                      {lec.venue && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-[#4B5563]" /> {lec.venue}
                        </span>
                      )}
                      {lec.lecturer && (
                        <span className="inline-flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5 text-[#4B5563]" /> {lec.lecturer}
                        </span>
                      )}
                      <span className="font-mono text-[11px] text-[#6B7280]">
                        {lec.walkingMinutes}m walk
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => openEditLecture(lec)}
                      aria-label="Edit class slot"
                      className="p-2 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] hover:border-[#9CA3AF] text-[#4B5563] hover:text-[#111827] transition-colors duration-150"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteLecture(lec.id)}
                      aria-label="Delete class slot"
                      className="p-2 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] hover:border-[#FECACA] hover:bg-[#FEF2F2] text-[#6B7280] hover:text-[#DC2626] transition-colors duration-150"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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
              <div key={d.num} className="aura-glass rounded-lg p-3.5 space-y-2.5">
                <div className="flex items-center justify-between pb-1.5 border-b border-[#E5E7EB]">
                  <span className="font-mono font-bold text-xs text-[#1E3A8A] uppercase tracking-wider">
                    {d.full}
                  </span>
                  <span className="font-mono text-[11px] text-[#6B7280]">{slots.length} slot(s)</span>
                </div>
                {slots.length === 0 ? (
                  <p className="text-xs text-[#9CA3AF]">No classes scheduled</p>
                ) : (
                  <div className="space-y-1.5">
                    {slots.map((s) => (
                      <div
                        key={s.id}
                        className="p-2.5 rounded-md bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#9CA3AF] flex items-center justify-between gap-2 transition-colors duration-150"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#111827] truncate">
                            <span className="font-mono text-[#1E3A8A] mr-1.5">{s.courseCode}</span>
                            {s.courseName}
                          </div>
                          <div className="text-[11px] text-[#6B7280] font-mono">
                            {s.startTime}–{s.endTime} {s.venue ? `· ${s.venue}` : ''}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteLecture(s.id)}
                          className="p-1.5 rounded text-[#6B7280] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-colors duration-150"
                          title="Delete slot"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {viewMode === 'COURSES' && (
        <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-lg divide-y divide-[#E5E7EB]">
          {vault.courses.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#6B7280]">
              No courses registered yet. Click <strong>Add Course</strong> above to populate your curriculum.
            </div>
          ) : (
            vault.courses.map((c) => (
              <div
                key={c.id}
                className="p-3.5 sm:px-4 flex items-center justify-between gap-3 border-l-4 hover:bg-[#F9FAFB] transition-colors duration-150"
                style={{ borderLeftColor: c.colorHex || '#1E3A8A' }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-[#F3F4F6] border border-[#E5E7EB] font-mono text-xs font-bold text-[#111827]">
                      {c.code}
                    </span>
                    <span className="font-mono text-xs text-[#6B7280]">{c.creditHours} Credits</span>
                  </div>
                  <div className="font-semibold text-sm text-[#111827] mt-1 truncate">{c.name}</div>
                  <div className="text-xs text-[#6B7280]">
                    {[c.lecturer, c.venue].filter(Boolean).join(' · ') || 'Click edit to add lecturer and venue'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => openEditCourse(c)}
                    className="p-2 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] hover:border-[#9CA3AF] text-[#4B5563] hover:text-[#111827] transition-colors duration-150"
                    title="Edit Course"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteCourse(c)}
                    className="p-2 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] hover:border-[#FECACA] hover:bg-[#FEF2F2] text-[#6B7280] hover:text-[#DC2626] transition-colors duration-150"
                    title="Delete Course & Its Slots"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
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
        badge="Curriculum"
        title={editingCourse ? 'Edit Course' : 'Add Semester Course'}
        subtitle="Courses sync across your daily timetable and academic trackers."
        accentColor="sky"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <input
              value={cCode}
              onChange={(e) => setCCode(e.target.value)}
              placeholder="Code (CS301)"
              className="col-span-2 px-3 py-2 rounded-md aura-input text-xs font-mono font-bold uppercase"
            />
            <input
              type="number"
              min={1}
              max={12}
              value={cCredits}
              onChange={(e) => setCCredits(e.target.value)}
              placeholder="Credits"
              className="px-3 py-2 rounded-md aura-input text-xs font-mono font-bold text-center"
            />
          </div>
          <input
            value={cName}
            onChange={(e) => setCName(e.target.value)}
            placeholder="Course Name (e.g. Operating Systems)"
            className="w-full px-3 py-2 rounded-md aura-input text-xs"
          />
          <input
            value={cLecturer}
            onChange={(e) => setCLecturer(e.target.value)}
            placeholder="Lecturer / Professor"
            className="w-full px-3 py-2 rounded-md aura-input text-xs"
          />
          <input
            value={cVenue}
            onChange={(e) => setCVenue(e.target.value)}
            placeholder="Default Lecture Hall / Venue"
            className="w-full px-3 py-2 rounded-md aura-input text-xs"
          />
          <div className="flex items-center gap-2.5 pt-1">
            <span className="font-mono text-[11px] font-semibold text-[#6B7280] uppercase">Accent:</span>
            {PALETTE.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => setCColor(hex)}
                className={`w-6 h-6 rounded-full border-2 transition-colors duration-150 ${
                  cColor === hex ? 'border-[#111827] ring-2 ring-[#1E3A8A]/25' : 'border-transparent opacity-80'
                }`}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowCourseModal(false)}
              className="flex-1 py-2 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] hover:border-[#9CA3AF] text-xs font-semibold text-[#4B5563]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveCourse}
              className="flex-1 py-2 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold"
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
        badge="Schedule Slot"
        title={editingLecture ? 'Edit Class Slot' : 'Add Weekly Class Slot'}
        subtitle="Includes live session countdowns and walking buffers."
        accentColor="sky"
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#6B7280] uppercase font-mono">Course Code</label>
            <input
              list="aura-course-codes"
              value={lCourseCode}
              onChange={(e) => setLCourseCode(e.target.value)}
              placeholder="e.g. CS301"
              className="w-full px-3 py-2 rounded-md aura-input text-xs font-mono font-bold uppercase"
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
            <label className="text-[11px] font-semibold text-[#6B7280] uppercase font-mono">Day of Week</label>
            <select
              value={lDay}
              onChange={(e) => setLDay(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-md aura-input text-xs font-semibold"
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
              <label className="text-[11px] font-semibold text-[#6B7280] uppercase font-mono">Start Time</label>
              <input
                type="time"
                value={lStart}
                onChange={(e) => setLStart(e.target.value)}
                className="w-full px-3 py-2 rounded-md aura-input text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#6B7280] uppercase font-mono">End Time</label>
              <input
                type="time"
                value={lEnd}
                onChange={(e) => setLEnd(e.target.value)}
                className="w-full px-3 py-2 rounded-md aura-input text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1">
              <label className="text-[11px] font-semibold text-[#6B7280] uppercase font-mono">Venue / Room</label>
              <input
                value={lVenue}
                onChange={(e) => setLVenue(e.target.value)}
                placeholder="Hall / Lab"
                className="w-full px-3 py-2 rounded-md aura-input text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#6B7280] uppercase font-mono">Walk (m)</label>
              <input
                type="number"
                min={0}
                max={120}
                value={lWalk}
                onChange={(e) => setLWalk(e.target.value)}
                className="w-full px-3 py-2 rounded-md aura-input text-xs font-mono text-center"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowLectureModal(false)}
              className="flex-1 py-2 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] hover:border-[#9CA3AF] text-xs font-semibold text-[#4B5563]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveLecture}
              className="flex-1 py-2 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold"
            >
              Save Slot
            </button>
          </div>
        </div>
      </AuraModal>
    </div>
  );
};
