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

const PALETTE = ['#1D3B8B', '#0F766E', '#B45309', '#374151', '#047857', '#7C2D12'];

const TIMELINE_START_MIN = 480; // 08:00
const TIMELINE_END_MIN = 1200; // 20:00
const TIMELINE_SPAN_MIN = TIMELINE_END_MIN - TIMELINE_START_MIN; // 720m

function getIsoDayToday(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 7 : jsDay;
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

interface PackedLectureItem {
  lecture: WebLecture;
  leftPct: number;
  widthPct: number;
  lane: number;
}

/**
 * Interval-packing algorithm that prevents class blocks from colliding horizontally or overlapping
 * when classes sit back-to-back, overlap in time, or expand to minimum readable block width.
 */
function packLecturesIntoLanes(lectures: WebLecture[]): {
  items: PackedLectureItem[];
  laneCount: number;
} {
  if (lectures.length === 0) return { items: [], laneCount: 1 };

  const sorted = [...lectures].sort((a, b) => {
    const diff = parseMinutes(a.startTime) - parseMinutes(b.startTime);
    return diff !== 0 ? diff : parseMinutes(a.endTime) - parseMinutes(b.endTime);
  });

  const laneRightEdgePct: number[] = [];
  const items: PackedLectureItem[] = [];

  for (const lec of sorted) {
    const rawStart = parseMinutes(lec.startTime);
    const rawEnd = Math.max(rawStart + 15, parseMinutes(lec.endTime));
    const clampedStart = Math.max(TIMELINE_START_MIN, Math.min(TIMELINE_END_MIN - 15, rawStart));
    const clampedEnd = Math.max(clampedStart + 15, Math.min(TIMELINE_END_MIN, rawEnd));

    const leftPct = ((clampedStart - TIMELINE_START_MIN) / TIMELINE_SPAN_MIN) * 100;
    const rawWidthPct = ((clampedEnd - clampedStart) / TIMELINE_SPAN_MIN) * 100;
    // Guarantee minimum readable block width (~50 mins visual) while strictly remaining inside [0, 100]
    const minVisualWidth = 7.2;
    const widthPct = Math.max(minVisualWidth, Math.min(100 - leftPct, rawWidthPct));
    const rightPct = leftPct + widthPct;

    // Require at least 0.7% clear visual gap between adjacent blocks on the same track
    let assignedLane = laneRightEdgePct.findIndex((endPct) => leftPct >= endPct + 0.7);
    if (assignedLane === -1) {
      assignedLane = laneRightEdgePct.length;
      laneRightEdgePct.push(rightPct);
    } else {
      laneRightEdgePct[assignedLane] = rightPct;
    }

    items.push({
      lecture: lec,
      leftPct,
      widthPct,
      lane: assignedLane
    });
  }

  return {
    items,
    laneCount: Math.max(1, laneRightEdgePct.length)
  };
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
        badge: 'Now in Session',
        lecture: inSession,
        sub: `${left}m remaining · ${inSession.venue || 'Main Hall'}`
      };
    }
    const upcoming = todays.find((l) => parseMinutes(l.startTime) > nowMinutes);
    if (upcoming) {
      const startsIn = parseMinutes(upcoming.startTime) - nowMinutes;
      return {
        badge: 'Up Next Today',
        lecture: upcoming,
        sub: `Starts in ${startsIn}m (leave ${upcoming.walkingMinutes}m early) · ${upcoming.venue || 'TBA'}`
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

  const packedTimeline = useMemo(() => packLecturesIntoLanes(dayLectures), [dayLectures]);
  const laneHeightPx = 50;
  const laneGapPx = 6;
  const trackPaddingY = 8;
  const trackContainerHeight =
    packedTimeline.laneCount * laneHeightPx +
    Math.max(0, packedTimeline.laneCount - 1) * laneGapPx +
    trackPaddingY * 2;

  const weekDayStats = useMemo(() => {
    return DAYS.map((d) => {
      const slots = vault.lectures.filter((l) => l.dayOfWeek === d.num);
      const mins = slots.reduce(
        (acc, l) => acc + Math.max(0, parseMinutes(l.endTime) - parseMinutes(l.startTime)),
        0
      );
      return {
        ...d,
        count: slots.length,
        hours: +(mins / 60).toFixed(1)
      };
    });
  }, [vault.lectures]);

  return (
    <div className="space-y-4">
      {/* Desktop & Tablet Bento Overview Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 aura-hero-card rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md font-mono text-[10px] font-bold uppercase tracking-wider bg-[#EEF2FA] text-[#1D3B8B] border border-[#C7D4F0]">
              {liveBanner ? liveBanner.badge : 'Academic Schedule'}
            </span>
            <h2 className="font-serif text-xl sm:text-2xl leading-tight text-[#141923]">
              {liveBanner ? (
                <>
                  <span className="font-mono text-base sm:text-lg font-bold text-[#1D3B8B] mr-2">
                    {liveBanner.lecture.courseCode}
                  </span>
                  {liveBanner.lecture.courseName}
                </>
              ) : (
                `${vault.profile.semester} · Weekly Timetable`
              )}
            </h2>
            {liveBanner ? (
              <p className="font-mono text-xs text-[#646B78] pt-0.5">
                {liveBanner.lecture.startTime}–{liveBanner.lecture.endTime} · {liveBanner.sub}
              </p>
            ) : (
              <p className="text-xs text-[#646B78] pt-0.5">
                Manage weekly lectures, venues, walking buffers, and active course loads across desktop and mobile.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={openAddCourse}
              className="px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-[#FFFFFF] border border-[#E4E0D8] hover:border-[#9CA3AF] text-[#141923] flex items-center gap-1.5 transition-colors duration-150"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#1D3B8B]" /> Add Course
            </button>
            <button
              type="button"
              onClick={openAddLecture}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#1D3B8B] hover:bg-[#162F70] text-[#FFFFFF] flex items-center gap-1.5 transition-colors duration-150 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Add Class Slot
            </button>
          </div>
        </div>

        {/* Academic Load KPI Strip */}
        <div className="xl:col-span-4 grid grid-cols-3 gap-2.5">
          <div className="aura-glass rounded-2xl p-3.5 flex flex-col justify-between">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#646B78]">
              Credits
            </span>
            <div className="font-mono text-2xl font-bold text-[#141923] mt-1">
              {workloadSummary.totalCredits}
            </div>
            <span className="text-[11px] text-[#646B78] truncate">
              {vault.courses.length} active courses
            </span>
          </div>
          <div className="aura-glass rounded-2xl p-3.5 flex flex-col justify-between">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#646B78]">
              Lectures
            </span>
            <div className="font-mono text-2xl font-bold text-[#1D3B8B] mt-1">
              {workloadSummary.lectureHrs}h
            </div>
            <span className="text-[11px] text-[#646B78] truncate">per week</span>
          </div>
          <div className="aura-glass rounded-2xl p-3.5 flex flex-col justify-between">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#646B78]">
              Study Goal
            </span>
            <div className="font-mono text-2xl font-bold text-[#0F766E] mt-1">
              {workloadSummary.recommendedSelfStudyHrs}h
            </div>
            <span className="text-[11px] text-[#646B78] truncate">recommended</span>
          </div>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="aura-glass rounded-xl p-1.5 grid grid-cols-3 gap-1.5">
        {(
          [
            ['DAY', 'Daily View'],
            ['WEEK', 'Week Matrix'],
            ['COURSES', `Courses (${vault.courses.length})`]
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors duration-150 ${
              viewMode === mode
                ? 'bg-[#1D3B8B] text-[#FFFFFF] shadow-xs'
                : 'text-[#646B78] hover:bg-[#EFECE6] hover:text-[#141923]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {viewMode === 'DAY' && (
        <>
          {/* Day Selector Strip (Scrollable on narrow phones, full 7-col grid on sm+) */}
          <div className="flex sm:grid sm:grid-cols-7 gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {DAYS.map((d) => {
              const count = vault.lectures.filter((l) => l.dayOfWeek === d.num).length;
              const active = selectedDay === d.num;
              const isToday = d.num === todayIso;
              return (
                <button
                  key={d.num}
                  type="button"
                  onClick={() => setSelectedDay(d.num)}
                  className={`min-w-[66px] sm:min-w-0 shrink-0 py-2.5 px-2 rounded-xl text-center border transition-colors duration-150 ${
                    active
                      ? 'bg-[#1D3B8B] text-[#FFFFFF] border-[#1D3B8B] shadow-xs'
                      : 'bg-[#FFFFFF] text-[#141923] border-[#E4E0D8] hover:border-[#9CA3AF]'
                  }`}
                >
                  <div className="text-xs font-semibold flex items-center justify-center gap-1">
                    {d.short}
                    {isToday && !active && <span className="w-1.5 h-1.5 rounded-full bg-[#1D3B8B]" />}
                  </div>
                  <div
                    className={`font-mono text-[10px] mt-0.5 ${
                      active ? 'text-[#DCE4F7]' : 'text-[#646B78]'
                    }`}
                  >
                    {count} {count === 1 ? 'slot' : 'slots'}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Overlap-Proof Schedule Timeline Ribbon */}
          <div className="aura-glass rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[#1D3B8B]" />
                <span className="font-mono text-[11px] font-bold text-[#141923] uppercase tracking-wider">
                  {DAYS.find((d) => d.num === selectedDay)?.full} Timeline (08:00 – 20:00)
                </span>
              </div>
              <div className="flex items-center gap-2">
                {selectedDay === todayIso && (
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#1D3B8B] font-semibold">
                    <span className="w-2 h-2 rounded-full bg-[#DC2626] animate-pulse" />
                    <span>
                      {String(Math.floor(nowMinutes / 60)).padStart(2, '0')}:
                      {String(nowMinutes % 60).padStart(2, '0')} Campus Time
                    </span>
                  </div>
                )}
                <span className="sm:hidden text-[10px] font-mono text-[#646B78]">
                  Swipe timeline
                </span>
              </div>
            </div>

            {/* Horizontally scrollable unified axis + interval-packed multi-lane canvas */}
            <div className="overflow-x-auto no-scrollbar pb-1">
              <div className="min-w-[680px] sm:min-w-full">
                {/* Dedicated Hour Ruler Row (never collides with course cards) */}
                <div className="relative h-5 mb-1 select-none">
                  {[8, 10, 12, 14, 16, 18, 20].map((hour) => {
                    const pct = ((hour * 60 - TIMELINE_START_MIN) / TIMELINE_SPAN_MIN) * 100;
                    const alignClass =
                      hour === 20
                        ? '-translate-x-full'
                        : hour === 8
                        ? 'translate-x-0'
                        : '-translate-x-1/2';
                    return (
                      <div
                        key={hour}
                        className={`absolute top-0 flex flex-col items-center ${alignClass}`}
                        style={{ left: `${pct}%` }}
                      >
                        <span className="text-[10px] font-mono font-semibold text-[#646B78] leading-none">
                          {String(hour).padStart(2, '0')}:00
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Interval-Packed Lanes Box */}
                <div
                  className="relative bg-[#FAF8F5] rounded-xl border border-[#E4E0D8] overflow-hidden"
                  style={{ height: `${trackContainerHeight}px` }}
                >
                  {/* Vertical Hour Gridlines */}
                  {[8, 10, 12, 14, 16, 18, 20].map((hour) => {
                    const pct = ((hour * 60 - TIMELINE_START_MIN) / TIMELINE_SPAN_MIN) * 100;
                    return (
                      <div
                        key={hour}
                        className="absolute top-0 bottom-0 border-l border-[#E4E0D8] pointer-events-none"
                        style={{ left: `${pct}%` }}
                      />
                    );
                  })}

                  {/* Packed Non-Overlapping Class Cards */}
                  {packedTimeline.items.map(({ lecture: lec, leftPct, widthPct, lane }) => {
                    const sMin = parseMinutes(lec.startTime);
                    const eMin = parseMinutes(lec.endTime);
                    const isNow =
                      selectedDay === todayIso && nowMinutes >= sMin && nowMinutes < eMin;
                    const accent = lec.colorHex || '#1D3B8B';
                    const topPx = trackPaddingY + lane * (laneHeightPx + laneGapPx);

                    return (
                      <button
                        key={lec.id}
                        type="button"
                        onClick={() => openEditLecture(lec)}
                        title={`${lec.courseCode} (${lec.startTime}–${lec.endTime}) @ ${lec.venue || 'TBA'}`}
                        className={`absolute rounded-lg box-border px-2.5 py-1 text-left flex flex-col justify-center overflow-hidden transition-colors duration-150 ${
                          isNow ? 'border-2 shadow-sm z-10' : 'border z-[5]'
                        }`}
                        style={{
                          top: `${topPx}px`,
                          height: `${laneHeightPx}px`,
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          backgroundColor: isNow ? `${accent}26` : `${accent}16`,
                          borderColor: accent
                        }}
                      >
                        <div className="flex items-center justify-between gap-1 min-w-0">
                          <span
                            className="font-mono font-bold text-[11px] leading-tight truncate"
                            style={{ color: accent }}
                          >
                            {lec.courseCode}
                          </span>
                          {isNow && (
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: accent }}
                            />
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-[#4B5563] leading-tight truncate">
                          {lec.startTime}–{lec.endTime}
                          {lec.venue ? ` · ${lec.venue}` : ''}
                        </span>
                      </button>
                    );
                  })}

                  {/* Real-time Campus Indicator Needle */}
                  {selectedDay === todayIso &&
                    nowMinutes >= TIMELINE_START_MIN &&
                    nowMinutes <= TIMELINE_END_MIN && (
                      <div
                        className="absolute top-0 bottom-0 z-20 pointer-events-none flex flex-col items-center -translate-x-1/2"
                        style={{
                          left: `${((nowMinutes - TIMELINE_START_MIN) / TIMELINE_SPAN_MIN) * 100}%`
                        }}
                      >
                        <span className="w-2 h-2 rounded-full bg-[#DC2626] -mt-0.5" />
                        <div className="w-[2px] flex-1 bg-[#DC2626]/90" />
                      </div>
                    )}
                </div>
              </div>
            </div>
          </div>

          {/* Desktop 2-Column Daily Split: Lecture List + Weekly Load Quick Switcher */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-8">
              {dayLectures.length === 0 ? (
                <div className="aura-glass rounded-2xl p-8 text-center space-y-2.5">
                  <Calendar className="w-7 h-7 text-[#646B78] mx-auto" />
                  <div className="font-serif text-lg text-[#141923]">
                    No lectures scheduled for {DAYS.find((d) => d.num === selectedDay)?.full}
                  </div>
                  <p className="text-xs text-[#646B78] max-w-sm mx-auto">
                    Use this open block for deep focus sprints, SM-2 card reviews, or team deliverables.
                  </p>
                  <button
                    type="button"
                    onClick={openAddLecture}
                    className="mt-1 px-4 py-2 rounded-lg bg-[#EEF2FA] border border-[#C7D4F0] text-[#1D3B8B] text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#1D3B8B] hover:text-[#FFFFFF] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Class for {DAYS.find((d) => d.num === selectedDay)?.short}
                  </button>
                </div>
              ) : (
                <div className="aura-glass rounded-2xl divide-y divide-[#E4E0D8] overflow-hidden">
                  {dayLectures.map((lec) => (
                    <div
                      key={lec.id}
                      className="p-4 flex items-center justify-between gap-3 border-l-4 hover:bg-[#FAF8F5] transition-colors duration-150"
                      style={{ borderLeftColor: lec.colorHex || '#1D3B8B' }}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-[#EFECE6] border border-[#E4E0D8] font-mono text-[11px] font-bold text-[#141923]">
                            {lec.courseCode}
                          </span>
                          <span className="font-mono text-xs font-semibold text-[#1D3B8B] flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {lec.startTime}–{lec.endTime}
                          </span>
                        </div>
                        <div className="font-semibold text-sm text-[#141923] truncate">{lec.courseName}</div>
                        <div className="text-xs text-[#646B78] flex flex-wrap items-center gap-3">
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
                          <span className="font-mono text-[11px] text-[#646B78]">
                            {lec.walkingMinutes}m walk
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditLecture(lec)}
                          aria-label="Edit class slot"
                          className="p-2 rounded-lg border border-[#E4E0D8] bg-[#FFFFFF] hover:border-[#9CA3AF] text-[#4B5563] hover:text-[#141923] transition-colors duration-150"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteLecture(lec.id)}
                          aria-label="Delete class slot"
                          className="p-2 rounded-lg border border-[#E4E0D8] bg-[#FFFFFF] hover:border-[#FECACA] hover:bg-[#FEF2F2] text-[#646B78] hover:text-[#DC2626] transition-colors duration-150"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right Desktop Rail: Weekly Density + Course Quick Directory */}
            <div className="lg:col-span-4 space-y-4">
              <div className="aura-glass rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#141923]">
                    Weekly Density
                  </span>
                  <span className="font-mono text-[10px] text-[#646B78]">Click day to jump</span>
                </div>
                <div className="space-y-2">
                  {weekDayStats.map((w) => {
                    const pct = Math.min(100, Math.round((w.hours / 8) * 100));
                    const isSel = selectedDay === w.num;
                    return (
                      <button
                        key={w.num}
                        type="button"
                        onClick={() => setSelectedDay(w.num)}
                        className={`w-full text-left p-2 rounded-lg border transition-colors ${
                          isSel
                            ? 'bg-[#EEF2FA] border-[#C7D4F0]'
                            : 'bg-[#FAF8F5] border-[#E4E0D8] hover:border-[#9CA3AF]'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className={`font-semibold ${isSel ? 'text-[#1D3B8B]' : 'text-[#141923]'}`}>
                            {w.full}
                          </span>
                          <span className="font-mono text-[#646B78]">
                            {w.count} {w.count === 1 ? 'slot' : 'slots'} · {w.hours}h
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-[#E4E0D8] overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isSel ? 'bg-[#1D3B8B]' : 'bg-[#64748B]'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {viewMode === 'WEEK' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {DAYS.map((d) => {
            const slots = vault.lectures
              .filter((l) => l.dayOfWeek === d.num)
              .sort((a, b) => parseMinutes(a.startTime) - parseMinutes(b.startTime));
            return (
              <div key={d.num} className="aura-glass rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b border-[#E4E0D8]">
                  <span className="font-mono font-bold text-xs text-[#1D3B8B] uppercase tracking-wider">
                    {d.full}
                  </span>
                  <span className="font-mono text-[11px] text-[#646B78]">{slots.length} slot(s)</span>
                </div>
                {slots.length === 0 ? (
                  <p className="text-xs text-[#8C929D]">No classes scheduled</p>
                ) : (
                  <div className="space-y-1.5">
                    {slots.map((s) => (
                      <div
                        key={s.id}
                        className="p-2.5 rounded-lg bg-[#FAF8F5] border border-[#E4E0D8] hover:border-[#9CA3AF] flex items-center justify-between gap-2 transition-colors duration-150"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#141923] truncate">
                            <span className="font-mono text-[#1D3B8B] mr-1.5">{s.courseCode}</span>
                            {s.courseName}
                          </div>
                          <div className="text-[11px] text-[#646B78] font-mono">
                            {s.startTime}–{s.endTime} {s.venue ? `· ${s.venue}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteLecture(s.id)}
                          className="p-1.5 rounded text-[#646B78] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-colors duration-150"
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
        <div className="aura-glass rounded-xl divide-y divide-[#E4E0D8] overflow-hidden">
          {vault.courses.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#646B78]">
              No courses registered yet. Click <strong>Add Course</strong> above to populate your curriculum.
            </div>
          ) : (
            vault.courses.map((c) => (
              <div
                key={c.id}
                className="p-3.5 sm:px-4 flex items-center justify-between gap-3 border-l-4 hover:bg-[#FAF8F5] transition-colors duration-150"
                style={{ borderLeftColor: c.colorHex || '#1D3B8B' }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-[#EFECE6] border border-[#E4E0D8] font-mono text-xs font-bold text-[#141923]">
                      {c.code}
                    </span>
                    <span className="font-mono text-xs text-[#646B78]">{c.creditHours} Credits</span>
                  </div>
                  <div className="font-semibold text-sm text-[#141923] mt-1 truncate">{c.name}</div>
                  <div className="text-xs text-[#646B78]">
                    {[c.lecturer, c.venue].filter(Boolean).join(' · ') || 'Click edit to add lecturer and venue'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditCourse(c)}
                    className="p-2 rounded-lg border border-[#E4E0D8] bg-[#FFFFFF] hover:border-[#9CA3AF] text-[#4B5563] hover:text-[#141923] transition-colors duration-150"
                    title="Edit Course"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCourse(c)}
                    className="p-2 rounded-lg border border-[#E4E0D8] bg-[#FFFFFF] hover:border-[#FECACA] hover:bg-[#FEF2F2] text-[#646B78] hover:text-[#DC2626] transition-colors duration-150"
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
              className="col-span-2 px-3 py-2 rounded-lg aura-input text-xs font-mono font-bold uppercase"
            />
            <input
              type="number"
              min={1}
              max={12}
              value={cCredits}
              onChange={(e) => setCCredits(e.target.value)}
              placeholder="Credits"
              className="px-3 py-2 rounded-lg aura-input text-xs font-mono font-bold text-center"
            />
          </div>
          <input
            value={cName}
            onChange={(e) => setCName(e.target.value)}
            placeholder="Course Name (e.g. Operating Systems)"
            className="w-full px-3 py-2 rounded-lg aura-input text-xs"
          />
          <input
            value={cLecturer}
            onChange={(e) => setCLecturer(e.target.value)}
            placeholder="Lecturer / Professor"
            className="w-full px-3 py-2 rounded-lg aura-input text-xs"
          />
          <input
            value={cVenue}
            onChange={(e) => setCVenue(e.target.value)}
            placeholder="Default Lecture Hall / Venue"
            className="w-full px-3 py-2 rounded-lg aura-input text-xs"
          />
          <div className="flex items-center gap-2.5 pt-1">
            <span className="font-mono text-[11px] font-semibold text-[#646B78] uppercase">Accent:</span>
            {PALETTE.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => setCColor(hex)}
                className={`w-6 h-6 rounded-full border-2 transition-colors duration-150 ${
                  cColor === hex ? 'border-[#141923] ring-2 ring-[#1D3B8B]/25' : 'border-transparent opacity-80'
                }`}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowCourseModal(false)}
              className="flex-1 py-2 rounded-lg border border-[#E4E0D8] bg-[#FFFFFF] hover:border-[#9CA3AF] text-xs font-semibold text-[#4B5563]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveCourse}
              className="flex-1 py-2 rounded-lg bg-[#1D3B8B] hover:bg-[#162F70] text-[#FFFFFF] text-xs font-semibold"
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
            <label className="text-[11px] font-semibold text-[#646B78] uppercase font-mono">Course Code</label>
            <input
              list="aura-course-codes"
              value={lCourseCode}
              onChange={(e) => setLCourseCode(e.target.value)}
              placeholder="e.g. CS301"
              className="w-full px-3 py-2 rounded-lg aura-input text-xs font-mono font-bold uppercase"
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
            <label className="text-[11px] font-semibold text-[#646B78] uppercase font-mono">Day of Week</label>
            <select
              value={lDay}
              onChange={(e) => setLDay(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg aura-input text-xs font-semibold"
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
              <label className="text-[11px] font-semibold text-[#646B78] uppercase font-mono">Start Time</label>
              <input
                type="time"
                value={lStart}
                onChange={(e) => setLStart(e.target.value)}
                className="w-full px-3 py-2 rounded-lg aura-input text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#646B78] uppercase font-mono">End Time</label>
              <input
                type="time"
                value={lEnd}
                onChange={(e) => setLEnd(e.target.value)}
                className="w-full px-3 py-2 rounded-lg aura-input text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1">
              <label className="text-[11px] font-semibold text-[#646B78] uppercase font-mono">Venue / Room</label>
              <input
                value={lVenue}
                onChange={(e) => setLVenue(e.target.value)}
                placeholder="Hall / Lab"
                className="w-full px-3 py-2 rounded-lg aura-input text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#646B78] uppercase font-mono">Walk (m)</label>
              <input
                type="number"
                min={0}
                max={120}
                value={lWalk}
                onChange={(e) => setLWalk(e.target.value)}
                className="w-full px-3 py-2 rounded-lg aura-input text-xs font-mono text-center"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowLectureModal(false)}
              className="flex-1 py-2 rounded-lg border border-[#E4E0D8] bg-[#FFFFFF] hover:border-[#9CA3AF] text-xs font-semibold text-[#4B5563]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveLecture}
              className="flex-1 py-2 rounded-lg bg-[#1D3B8B] hover:bg-[#162F70] text-[#FFFFFF] text-xs font-semibold"
            >
              Save Slot
            </button>
          </div>
        </div>
      </AuraModal>
    </div>
  );
};
