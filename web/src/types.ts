export interface WebUserProfile {
  name: string;
  email: string;
  institution: string;
  programme: string;
  academicLevel: string;
  semester: string;
  timeZone: string;
  isDarkTheme: boolean;
  attendanceTargetPercent: number;
  studyGoalHoursPerWeek: number;
  semesterBudgetLimit: number;
  currencySymbol: string;
}

export interface WebCourse {
  id: string;
  code: string;
  name: string;
  creditHours: number;
  lecturer: string;
  venue: string;
  colorHex: string;
}

export interface WebLecture {
  id: string;
  courseCode: string;
  courseName: string;
  dayOfWeek: number; // 1 = Monday .. 7 = Sunday (matches Android DayOfWeek)
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  venue: string;
  walkingMinutes: number;
  colorHex: string;
  lecturer: string;
  reminderEnabled: boolean;
  reminderMinutesBefore: number;
}

export interface WebAssessment {
  id: string;
  courseCode: string;
  courseName: string;
  title: string;
  type: 'EXAM' | 'ASSIGNMENT' | 'QUIZ';
  dueEpochMillis: number;
  status: 'PENDING' | 'COMPLETED';
  examVenue: string;
  seatNumber: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface WebFlashcard {
  id: string;
  courseCode: string;
  deckTitle: string;
  question: string;
  answer: string;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewEpoch: number;
}

export interface WebStudyNote {
  id: string;
  courseCode: string;
  title: string;
  category: string;
  isPinned: boolean;
  content: string;
  updatedAt: number;
}

export interface WebGrade {
  id: string;
  courseCode: string;
  courseName: string;
  creditHours: number;
  letterGrade: string;
  gradePoint: number;
  semester: string;
}

export interface WebFocusSession {
  id: string;
  courseCode: string;
  durationMinutes: number;
  completedAt: number;
}

export interface WebGroupTask {
  id: string;
  projectId: string;
  memberName: string;
  memberContact: string;
  taskTitle: string;
  isCompleted: boolean;
}

export interface WebGroupPoll {
  question: string;
  options: { text: string; votes: string[] }[]; // option text and array of voter emails
  isClosed?: boolean;
}

export interface WebGroupResourceDoc {
  id: string;
  title: string;
  linkOrFileName: string;
  category: 'SLIDES' | 'DOCUMENT' | 'RESEARCH_LINK' | 'PAST_PAPER';
  addedByEmail: string;
  addedAt: number;
}

export interface WebGroupChatMessage {
  id: string;
  projectId: string;
  senderEmail: string;
  senderName: string;
  messageText: string;
  timestamp: number;
  isPinned: boolean;
  messageType: 'TEXT' | 'DELIVERABLE' | 'TARGET_UPDATE' | 'NOTICE' | 'POLL' | 'DOC_SHARE' | 'POMODORO_SYNC' | 'VOICE_NOTE' | 'IMAGE_SHARE';
  taggedDeliverableTitle?: string;
  reactions?: Record<string, number>;
  pollData?: WebGroupPoll;
  docData?: WebGroupResourceDoc;
  audioUrl?: string;
  audioDurationSec?: number;
  imageUrl?: string;
}

export interface WebGroupProject {
  id: string;
  courseCode: string;
  projectTitle: string;
  teamName: string;
  objective: string;
  groupTarget: string;
  avatarEmoji: string;
  avatarColorHex: string;
  creatorUid?: string;
  creatorEmail: string;
  adminEmails: string[];
  memberEmails: string[];
  joinCode?: string;
  dueEpochMillis: number;
  tasks: WebGroupTask[];
  resources?: WebGroupResourceDoc[];
  syncedPomodoroState?: {
    isRunning: boolean;
    remainingSeconds: number;
    mode: 'FOCUS' | 'BREAK';
    lastUpdated: number;
    initiatorName: string;
  };
}

export interface WebGroupInvitation {
  id: string;
  projectId: string;
  teamName: string;
  projectTitle: string;
  courseCode: string;
  groupTarget: string;
  avatarEmoji?: string;
  avatarColorHex?: string;
  senderUid: string;
  senderEmail: string;
  senderName: string;
  inviteeEmail: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  joinCode?: string;
  createdAt: number;
}

export interface WebCitation {
  id: string;
  sourceType: 'BOOK' | 'JOURNAL' | 'WEBSITE' | 'SLIDES';
  title: string;
  authors: string;
  year: string;
  publicationOrPublisher: string;
  volumeOrEdition?: string;
  pagesOrUrl?: string;
  doiOrIsbn?: string;
  formattedApa: string;
  formattedMla: string;
  formattedHarvard: string;
  formattedChicago: string;
  formattedIeee: string;
  bibtexCode: string;
  createdAt: number;
}

export interface AuraLocalVault {
  profile: WebUserProfile;
  courses: WebCourse[];
  lectures: WebLecture[];
  assessments: WebAssessment[];
  flashcards: WebFlashcard[];
  notes: WebStudyNote[];
  grades: WebGrade[];
  focusSessions: WebFocusSession[];
  distractions: string[];
  groupProjects: WebGroupProject[];
  groupMessages: WebGroupChatMessage[];
  citations: WebCitation[];
  lastAutoRestoredUid?: string;
}

export interface CloudStudyRoom {
  id: string;
  ownerId: string;
  ownerName: string;
  courseCode: string;
  roomTitle: string;
  focusTopic: string;
  status: string;
  visibility: string;
  activeMinutes: number;
  joinCode: string;
  timerState: string;
  timerEndEpochMillis: number;
  timerRemainingSeconds: number;
  sharedBoardNote: string;
  waitingRoomEnabled: boolean;
  whiteboardLocked: boolean;
  coHostIds: string[];
  voiceRoomUrl: string;
  activePollQuestion: string;
  activePollOptions: string[];
  activePollCorrectIndex: number;
  activePollRevealed: boolean;
  spotlightCardText: string;
  muteAllTimestamp?: number;
}

export interface CloudParticipant {
  id: string;
  userId: string;
  displayName: string;
  cityOrCampus: string;
  studyStatus: string;
  handRaised: boolean;
  reactionEmoji: string;
  roomVisibility: string;
  roomOwnerId: string;
  admissionStatus: string;
  pollVoteIndex: number;
  devicePlatform: string;
  isMuted?: boolean;
  cameraOn?: boolean;
  isMutedByHost?: boolean;
}

export interface CloudRoomMessage {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  messageType: string;
  roomVisibility: string;
  roomOwnerId: string;
}

export interface CloudSharedCard {
  id: string;
  authorId: string;
  authorName: string;
  courseCode: string;
  question: string;
  answer: string;
  roomVisibility: string;
  roomOwnerId: string;
}
