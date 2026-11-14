import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db, defaultDb } from './firebase';
import type {
  AuraLocalVault,
  WebAssessment,
  WebCourse,
  WebFlashcard,
  WebGrade,
  WebLecture,
  WebStudyNote
} from './types';

const STORAGE_KEY = 'aura_web_vault_v1';
const DELIM = '||';

export function uidGen(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createDefaultVault(): AuraLocalVault {
  return {
    profile: {
      name: 'Scholar',
      email: '',
      institution: 'University Campus',
      programme: 'BSc. Computer Science',
      academicLevel: 'Level 300',
      semester: 'Semester 1',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      isDarkTheme: true,
      attendanceTargetPercent: 75,
      studyGoalHoursPerWeek: 18,
      semesterBudgetLimit: 1500,
      currencySymbol: 'GH₵'
    },
    courses: [
      {
        id: 'c_cs301',
        code: 'CS301',
        name: 'Algorithms & Complexity',
        creditHours: 3,
        lecturer: 'Dr. Mensah',
        venue: 'JQB Room 14',
        colorHex: '#38BDF8'
      },
      {
        id: 'c_math304',
        code: 'MATH304',
        name: 'Linear Algebra & Numerical Methods',
        creditHours: 3,
        lecturer: 'Prof. Owusu',
        venue: 'N-Block Hall 2',
        colorHex: '#34D399'
      }
    ],
    lectures: [
      {
        id: 'l_1',
        courseCode: 'CS301',
        courseName: 'Algorithms & Complexity',
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '11:00',
        venue: 'JQB Room 14',
        walkingMinutes: 10,
        colorHex: '#38BDF8',
        lecturer: 'Dr. Mensah',
        reminderEnabled: true,
        reminderMinutesBefore: 15
      },
      {
        id: 'l_2',
        courseCode: 'MATH304',
        courseName: 'Linear Algebra & Numerical Methods',
        dayOfWeek: 3,
        startTime: '13:30',
        endTime: '15:30',
        venue: 'N-Block Hall 2',
        walkingMinutes: 12,
        colorHex: '#34D399',
        lecturer: 'Prof. Owusu',
        reminderEnabled: true,
        reminderMinutesBefore: 15
      }
    ],
    assessments: [
      {
        id: 'a_1',
        courseCode: 'CS301',
        courseName: 'Algorithms & Complexity',
        title: 'Mid-Semester Dynamic Programming Quiz',
        type: 'QUIZ',
        dueEpochMillis: Date.now() + 5 * 86_400_000,
        status: 'PENDING',
        examVenue: 'UGCS Lab 3',
        seatNumber: 'B-14',
        priority: 'HIGH'
      }
    ],
    flashcards: [
      {
        id: 'f_1',
        courseCode: 'CS301',
        deckTitle: 'Core Algorithms',
        question: 'What is the time complexity of Dijkstra’s shortest path using a binary min-heap?',
        answer: 'O((V + E) log V), where V is vertices and E is edges.',
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 0,
        nextReviewEpoch: Date.now()
      },
      {
        id: 'f_2',
        courseCode: 'MATH304',
        deckTitle: 'Eigenvalues & Matrices',
        question: 'When is an n × n matrix A diagonalizable?',
        answer: 'When A has n linearly independent eigenvectors (i.e., geometric multiplicity equals algebraic multiplicity for every eigenvalue).',
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 0,
        nextReviewEpoch: Date.now()
      }
    ],
    notes: [
      {
        id: 'n_1',
        courseCode: 'CS301',
        title: 'Master Theorem Quick Reference',
        category: 'Formula',
        isPinned: true,
        content:
          'For T(n) = aT(n/b) + f(n) with a >= 1, b > 1:\n1. If f(n) = O(n^(log_b(a) - eps)) => T(n) = Theta(n^log_b(a))\n2. If f(n) = Theta(n^log_b(a)) => T(n) = Theta(n^log_b(a) log n)\n3. If f(n) = Omega(n^(log_b(a) + eps)) => T(n) = Theta(f(n))',
        updatedAt: Date.now()
      }
    ],
    grades: [],
    focusSessions: [],
    distractions: [],
    groupProjects: [
      {
        id: 'gp_1',
        courseCode: 'CS301',
        projectTitle: 'Distributed Cache & Consensus Engine',
        teamName: 'Team AURA Alpha',
        objective: 'Build Raft consensus engine with 99.9% uptime',
        groupTarget: 'Achieve 95%+ / Grade A',
        avatarEmoji: 'CS3',
        avatarColorHex: '#06B6D4',
        creatorEmail: 'scholar@university.edu',
        adminEmails: ['scholar@university.edu'],
        memberEmails: ['scholar@university.edu'],
        dueEpochMillis: Date.now() + 14 * 86_400_000,
        tasks: [
          {
            id: 'gt_1',
            projectId: 'gp_1',
            memberName: 'Scholar',
            memberContact: 'scholar@university.edu',
            taskTitle: 'Implement Heartbeat Leader Election',
            isCompleted: true
          },
          {
            id: 'gt_2',
            projectId: 'gp_1',
            memberName: 'Teammate',
            memberContact: 'teammate@university.edu',
            taskTitle: 'Write Distributed Benchmarks & Report',
            isCompleted: false
          }
        ]
      }
    ],
    groupMessages: [
      {
        id: 'gm_1',
        projectId: 'gp_1',
        senderEmail: 'scholar@university.edu',
        senderName: 'Scholar',
        messageText: 'Welcome to our Team AURA workspace! Goal is 95% on the consensus engine demo.',
        timestamp: Date.now() - 3600_000,
        isPinned: true,
        messageType: 'TEXT'
      }
    ],
    citations: [
      {
        id: 'cit_1',
        sourceType: 'BOOK',
        title: 'Introduction to Algorithms',
        authors: 'Cormen, T. H., Leiserson, C. E., Rivest, R. L., & Stein, C.',
        year: '2022',
        publicationOrPublisher: 'MIT Press',
        volumeOrEdition: '4th ed.',
        doiOrIsbn: '978-0262046305',
        formattedApa: 'Cormen, T. H., Leiserson, C. E., Rivest, R. L., & Stein, C. (2022). Introduction to algorithms (4th ed.). MIT Press.',
        formattedMla: 'Cormen, Thomas H., et al. Introduction to Algorithms. 4th ed., MIT Press, 2022.',
        formattedHarvard: 'Cormen, T.H., Leiserson, C.E., Rivest, R.L. and Stein, C. (2022) Introduction to algorithms. 4th edn. Cambridge, MA: MIT Press.',
        formattedChicago: 'Cormen, Thomas H., Charles E. Leiserson, Ronald L. Rivest, and Clifford Stein. Introduction to Algorithms. 4th ed. Cambridge, MA: MIT Press, 2022.',
        formattedIeee: 'T. H. Cormen, C. E. Leiserson, R. L. Rivest, and C. Stein, Introduction to Algorithms, 4th ed. Cambridge, MA: MIT Press, 2022.',
        bibtexCode: '@book{cormen2022algorithms,\n  author = {Cormen, Thomas H. and Leiserson, Charles E. and Rivest, Ronald L. and Stein, Clifford},\n  title = {Introduction to Algorithms},\n  edition = {4th},\n  publisher = {MIT Press},\n  year = {2022}\n}',
        createdAt: Date.now()
      }
    ]
  };
}

export function loadLocalVault(): AuraLocalVault {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultVault();
    const parsed = JSON.parse(raw) as Partial<AuraLocalVault>;
    const def = createDefaultVault();
    return {
      profile: { ...def.profile, ...(parsed.profile || {}) },
      courses: Array.isArray(parsed.courses) ? parsed.courses : def.courses,
      lectures: Array.isArray(parsed.lectures) ? parsed.lectures : def.lectures,
      assessments: Array.isArray(parsed.assessments) ? parsed.assessments : def.assessments,
      flashcards: Array.isArray(parsed.flashcards) ? parsed.flashcards : def.flashcards,
      notes: Array.isArray(parsed.notes) ? parsed.notes : def.notes,
      grades: Array.isArray(parsed.grades) ? parsed.grades : def.grades,
      focusSessions: Array.isArray(parsed.focusSessions) ? parsed.focusSessions : [],
      distractions: Array.isArray(parsed.distractions) ? parsed.distractions : [],
      groupProjects: Array.isArray(parsed.groupProjects) ? parsed.groupProjects : def.groupProjects,
      groupMessages: Array.isArray(parsed.groupMessages) ? parsed.groupMessages : def.groupMessages,
      citations: Array.isArray(parsed.citations) ? parsed.citations : def.citations,
      lastAutoRestoredUid: parsed.lastAutoRestoredUid
    };
  } catch {
    return createDefaultVault();
  }
}

export function saveLocalVault(vault: AuraLocalVault): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));
  } catch {
    // Ignore storage quota issues in private browsing
  }
}

function cleanField(val: string | number | boolean): string {
  return String(val ?? '').replace(/\|\|/g, ' ').trim();
}

/**
 * Saves local Web/iPhone vault to user_backups/{uid} using the EXACT same ||-delimited schema
 * and Firestore Security Rule constraints as the Android AuraViewModel!
 */
export async function saveCloudBackupFromWeb(
  uid: string,
  accountEmail: string,
  vault: AuraLocalVault
): Promise<void> {
  const ref = doc(db, 'user_backups', uid);
  const existingSnap = await getDoc(ref);
  const existingCreatedAt = existingSnap.exists() ? existingSnap.data()?.createdAt : null;

  const p = vault.profile;
  const effectiveEmail = accountEmail || p.email;
  const webPortalOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://aura-study-companion.vercel.app';

  const profileSettings = [
    `name=${p.name}`,
    `email=${effectiveEmail}`,
    `institution=${p.institution}`,
    `programme=${p.programme}`,
    `academicLevel=${p.academicLevel}`,
    `semester=${p.semester}`,
    `timeZone=${p.timeZone}`,
    `isDarkTheme=${p.isDarkTheme}`,
    `attendanceTargetPercent=${p.attendanceTargetPercent}`,
    `studyGoalHoursPerWeek=${p.studyGoalHoursPerWeek}`,
    `semesterBudgetLimit=${p.semesterBudgetLimit}`,
    `currencySymbol=${p.currencySymbol}`,
    `webPortalUrl=${webPortalOrigin}`
  ].map((s) => s.replace(/\n/g, ' ').slice(0, 190));

  const courseRecords = vault.courses.slice(0, 50).map((c) =>
    [c.code, c.name, c.creditHours, c.lecturer, c.venue, c.colorHex]
      .map(cleanField)
      .join(DELIM)
      .slice(0, 490)
  );

  const lectureRecords = vault.lectures.slice(0, 80).map((l) =>
    [
      l.courseCode,
      l.courseName,
      l.dayOfWeek,
      l.startTime,
      l.endTime,
      l.venue,
      l.walkingMinutes,
      l.colorHex,
      l.lecturer,
      l.reminderEnabled,
      l.reminderMinutesBefore,
      'AURORA_CHIME'
    ]
      .map(cleanField)
      .join(DELIM)
      .slice(0, 490)
  );

  const assessmentRecords = vault.assessments.slice(0, 80).map((a) =>
    [
      a.courseCode,
      a.courseName,
      a.title,
      a.type,
      a.dueEpochMillis,
      a.status,
      a.examVenue,
      a.seatNumber,
      '',
      a.priority,
      true
    ]
      .map(cleanField)
      .join(DELIM)
      .slice(0, 490)
  );

  const flashcardRecords = vault.flashcards.slice(0, 100).map((f) =>
    [
      f.courseCode,
      f.deckTitle,
      f.question.slice(0, 160),
      f.answer.slice(0, 220),
      f.easeFactor,
      f.intervalDays,
      f.repetitions
    ]
      .map(cleanField)
      .join(DELIM)
      .slice(0, 490)
  );

  const noteRecords = vault.notes.slice(0, 60).map((n) =>
    [
      n.courseCode,
      n.title.slice(0, 80),
      n.category,
      n.isPinned,
      n.content.replace(/\n/g, '\\n').slice(0, 420)
    ]
      .map(cleanField)
      .join(DELIM)
      .slice(0, 590)
  );

  const gradeRecords = vault.grades.slice(0, 50).map((g) =>
    [
      g.courseCode,
      g.courseName.slice(0, 90),
      g.creditHours,
      g.letterGrade,
      g.gradePoint,
      g.semester
    ]
      .map(cleanField)
      .join(DELIM)
      .slice(0, 290)
  );

  const totalFocusMinutes = vault.focusSessions.reduce((acc, s) => acc + s.durationMinutes, 0);

  const basePayload = {
    userId: uid,
    studentName: (p.name.trim() || 'Scholar').slice(0, 100),
    institution: (p.institution.trim() || 'University').slice(0, 150),
    department: (p.programme.trim() || 'General Studies').slice(0, 150),
    targetGpa: 4.0,
    coursesCount: courseRecords.length,
    lecturesCount: lectureRecords.length,
    assessmentsCount: assessmentRecords.length,
    flashcardsCount: flashcardRecords.length,
    totalFocusMinutes: Math.round(Math.min(Math.max(0, totalFocusMinutes), 1_000_000)),
    profileSettings,
    courseRecords,
    lectureRecords,
    assessmentRecords,
    flashcardRecords,
    noteRecords,
    gradeRecords,
    expenseRecords: existingSnap.exists() && Array.isArray(existingSnap.data()?.expenseRecords)
      ? existingSnap.data()?.expenseRecords
      : [],
    createdAt: existingCreatedAt || serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(ref, basePayload);
  if (db !== defaultDb) {
    try {
      const defaultRef = doc(defaultDb, 'user_backups', uid);
      const defaultSnap = await getDoc(defaultRef).catch(() => null);
      const defaultCreatedAt = defaultSnap?.exists() ? defaultSnap.data()?.createdAt : null;
      const defaultExpenses =
        defaultSnap?.exists() && Array.isArray(defaultSnap.data()?.expenseRecords)
          ? defaultSnap.data()?.expenseRecords
          : basePayload.expenseRecords;
      await setDoc(defaultRef, {
        ...basePayload,
        expenseRecords: defaultExpenses,
        createdAt: defaultCreatedAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch {
      // Secondary fallback DB best-effort sync
    }
  }
}

function isFulfilled<T>(res: PromiseSettledResult<T>): res is PromiseFulfilledResult<T> {
  return res.status === 'fulfilled';
}

/**
 * Fetches user_backups/{uid} created on Android (or Web) and merges/restores into local vault!
 */
export async function fetchAndMergeCloudBackupToWeb(
  uid: string,
  current: AuraLocalVault
): Promise<{ updatedVault: AuraLocalVault; summary: string } | null> {
  const refs = db !== defaultDb
    ? [doc(defaultDb, 'user_backups', uid), doc(db, 'user_backups', uid)]
    : [doc(defaultDb, 'user_backups', uid)];

  const results = await Promise.allSettled(refs.map((r) => getDoc(r)));
  const existingSnaps = results
    .filter(isFulfilled)
    .map((r) => r.value)
    .filter((s) => s.exists());

  if (existingSnaps.length === 0) return null;

  const snap = existingSnaps.reduce((best, cur) => {
    const bestData = (best.data() || {}) as Record<string, any>;
    const curData = (cur.data() || {}) as Record<string, any>;
    const bestMs =
      bestData?.updatedAt?.toMillis?.() ??
      bestData?.createdAt?.toMillis?.() ??
      0;
    const curMs =
      curData?.updatedAt?.toMillis?.() ??
      curData?.createdAt?.toMillis?.() ??
      0;
    return curMs > bestMs ? cur : best;
  });

  const data = (snap.data() || {}) as Record<string, any>;
  const settingsArr: string[] = Array.isArray(data.profileSettings) ? data.profileSettings : [];
  const settingsMap: Record<string, string> = {};
  settingsArr.forEach((entry) => {
    const idx = entry.indexOf('=');
    if (idx > 0) {
      settingsMap[entry.slice(0, idx).trim()] = entry.slice(idx + 1).trim();
    }
  });

  const updatedProfile = {
    ...current.profile,
    name: settingsMap.name || data.studentName || current.profile.name,
    email: settingsMap.email || current.profile.email,
    institution: settingsMap.institution || data.institution || current.profile.institution,
    programme: settingsMap.programme || data.department || current.profile.programme,
    academicLevel: settingsMap.academicLevel || current.profile.academicLevel,
    semester: settingsMap.semester || current.profile.semester,
    timeZone: settingsMap.timeZone || current.profile.timeZone,
    isDarkTheme:
      settingsMap.isDarkTheme !== undefined
        ? settingsMap.isDarkTheme === 'true'
        : current.profile.isDarkTheme,
    attendanceTargetPercent:
      Number(settingsMap.attendanceTargetPercent) || current.profile.attendanceTargetPercent,
    studyGoalHoursPerWeek:
      Number(settingsMap.studyGoalHoursPerWeek) || current.profile.studyGoalHoursPerWeek,
    semesterBudgetLimit:
      Number(settingsMap.semesterBudgetLimit) || current.profile.semesterBudgetLimit,
    currencySymbol: settingsMap.currencySymbol || current.profile.currencySymbol
  };

  const importedCourses: WebCourse[] = (Array.isArray(data.courseRecords) ? data.courseRecords : [])
    .map((row: string) => {
      const p = row.split(DELIM);
      const code = (p[0] || '').trim().toUpperCase();
      if (!code) return null;
      return {
        id: uidGen('c'),
        code,
        name: p[1] || code,
        creditHours: Number(p[2]) || 3,
        lecturer: p[3] || '',
        venue: p[4] || '',
        colorHex: p[5] || '#38BDF8'
      };
    })
    .filter(Boolean) as WebCourse[];

  const importedLectures: WebLecture[] = (Array.isArray(data.lectureRecords) ? data.lectureRecords : [])
    .map((row: string) => {
      const p = row.split(DELIM);
      const courseCode = (p[0] || '').trim().toUpperCase();
      if (!courseCode) return null;
      return {
        id: uidGen('l'),
        courseCode,
        courseName: p[1] || courseCode,
        dayOfWeek: Number(p[2]) || 1,
        startTime: p[3] || '09:00',
        endTime: p[4] || '11:00',
        venue: p[5] || '',
        walkingMinutes: Number(p[6]) || 10,
        colorHex: p[7] || '#38BDF8',
        lecturer: p[8] || '',
        reminderEnabled: p[9] !== 'false',
        reminderMinutesBefore: Number(p[10]) || 15
      };
    })
    .filter(Boolean) as WebLecture[];

  const importedAssessments: WebAssessment[] = (
    Array.isArray(data.assessmentRecords) ? data.assessmentRecords : []
  )
    .map((row: string) => {
      const p = row.split(DELIM);
      const title = (p[2] || '').trim();
      if (!title) return null;
      const rawType = (p[3] || 'EXAM').toUpperCase();
      return {
        id: uidGen('a'),
        courseCode: (p[0] || 'GEN').toUpperCase(),
        courseName: p[1] || p[0] || 'Course',
        title,
        type: rawType === 'ASSIGNMENT' || rawType === 'QUIZ' ? rawType : 'EXAM',
        dueEpochMillis: Number(p[4]) || Date.now() + 86_400_000,
        status: p[5] === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
        examVenue: p[6] || '',
        seatNumber: p[7] || '',
        priority: p[9] === 'LOW' || p[9] === 'MEDIUM' ? p[9] : 'HIGH'
      };
    })
    .filter(Boolean) as WebAssessment[];

  const importedCards: WebFlashcard[] = (
    Array.isArray(data.flashcardRecords) ? data.flashcardRecords : []
  )
    .map((row: string) => {
      const p = row.split(DELIM);
      if (!p[2] || !p[3]) return null;
      return {
        id: uidGen('f'),
        courseCode: (p[0] || 'GEN').toUpperCase(),
        deckTitle: p[1] || 'Cloud Deck',
        question: p[2],
        answer: p[3],
        easeFactor: Number(p[4]) || 2.5,
        intervalDays: Number(p[5]) || 1,
        repetitions: Number(p[6]) || 0,
        nextReviewEpoch: Date.now()
      };
    })
    .filter(Boolean) as WebFlashcard[];

  const importedNotes: WebStudyNote[] = (Array.isArray(data.noteRecords) ? data.noteRecords : [])
    .map((row: string) => {
      const p = row.split(DELIM);
      if (!p[1]) return null;
      return {
        id: uidGen('n'),
        courseCode: (p[0] || 'GEN').toUpperCase(),
        title: p[1],
        category: p[2] || 'Lecture',
        isPinned: p[3] === 'true',
        content: (p[4] || '').replace(/\\n/g, '\n'),
        updatedAt: Date.now()
      };
    })
    .filter(Boolean) as WebStudyNote[];

  const importedGrades: WebGrade[] = (Array.isArray(data.gradeRecords) ? data.gradeRecords : [])
    .map((row: string) => {
      const p = row.split(DELIM);
      if (!p[0]) return null;
      return {
        id: uidGen('g'),
        courseCode: p[0].toUpperCase(),
        courseName: p[1] || p[0],
        creditHours: Number(p[2]) || 3,
        letterGrade: p[3] || 'A',
        gradePoint: Number(p[4]) || 4.0,
        semester: p[5] || updatedProfile.semester
      };
    })
    .filter(Boolean) as WebGrade[];

  const updatedVault: AuraLocalVault = {
    ...current,
    profile: updatedProfile,
    courses: importedCourses.length > 0 ? importedCourses : current.courses,
    lectures: importedLectures.length > 0 ? importedLectures : current.lectures,
    assessments: importedAssessments.length > 0 ? importedAssessments : current.assessments,
    flashcards: importedCards.length > 0 ? importedCards : current.flashcards,
    notes: importedNotes.length > 0 ? importedNotes : current.notes,
    grades: importedGrades.length > 0 ? importedGrades : current.grades,
    lastAutoRestoredUid: uid
  };

  return {
    updatedVault,
    summary: `${importedCourses.length} courses, ${importedLectures.length} classes, ${importedCards.length} flashcards & ${importedNotes.length} notes synced!`
  };
}
