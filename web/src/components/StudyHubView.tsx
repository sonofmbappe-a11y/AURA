import React, { useMemo, useState } from 'react';
import {
  Award,
  BookMarked,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Filter,
  Layers,
  Pin,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  Trash2,
  Upload
} from 'lucide-react';
import type { AuraLocalVault, WebFlashcard } from '../types';
import { uidGen } from '../storage';

interface Props {
  vault: AuraLocalVault;
  onUpdateVault: (updater: (prev: AuraLocalVault) => AuraLocalVault) => void;
}

type SubTab = 'NOTES' | 'FLASHCARDS' | 'QUIZ_SIM' | 'EXAMS' | 'SLIDE_PARSER';

export const StudyHubView: React.FC<Props> = ({ vault, onUpdateVault }) => {
  const [subTab, setSubTab] = useState<SubTab>('NOTES');

  // Notes state
  const [noteCourse, setNoteCourse] = useState(vault.courses[0]?.code || 'CS301');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteCategory, setNoteCategory] = useState('Lecture');
  const [noteContent, setNoteContent] = useState('');
  const [noteSearchQuery, setNoteSearchQuery] = useState('');
  const [selectedNoteFilter, setSelectedNoteFilter] = useState<string>('ALL');

  // Flashcards state
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [newCardCourse, setNewCardCourse] = useState(vault.courses[0]?.code || 'CS301');
  const [newCardQ, setNewCardQ] = useState('');
  const [newCardA, setNewCardA] = useState('');
  const [flashcardSearch, setFlashcardSearch] = useState('');

  // Quiz state
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizStep, setQuizStep] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  // Exams & assessments state
  const [examTitle, setExamTitle] = useState('');
  const [examCourse, setExamCourse] = useState(vault.courses[0]?.code || 'CS301');
  const [examType, setExamType] = useState<'EXAM' | 'ASSIGNMENT' | 'QUIZ'>('EXAM');
  const [examDate, setExamDate] = useState('');
  const [examVenue, setExamVenue] = useState('');

  // Slide extractor state
  const [rawSlideText, setRawSlideText] = useState('');
  const [slideCourse, setSlideCourse] = useState(vault.courses[0]?.code || 'CS301');
  const [extractSummaryMsg, setExtractSummaryMsg] = useState('');

  const addNote = () => {
    if (!noteTitle.trim() || !noteContent.trim()) return;
    onUpdateVault((prev) => ({
      ...prev,
      notes: [
        {
          id: uidGen('n'),
          courseCode: noteCourse.toUpperCase(),
          title: noteTitle.trim(),
          category: noteCategory,
          isPinned: false,
          content: noteContent.trim(),
          updatedAt: Date.now()
        },
        ...prev.notes
      ]
    }));
    setNoteTitle('');
    setNoteContent('');
  };

  const addCard = () => {
    if (!newCardQ.trim() || !newCardA.trim()) return;
    onUpdateVault((prev) => ({
      ...prev,
      flashcards: [
        ...prev.flashcards,
        {
          id: uidGen('f'),
          courseCode: newCardCourse.toUpperCase(),
          deckTitle: `${newCardCourse.toUpperCase()} Deck`,
          question: newCardQ.trim(),
          answer: newCardA.trim(),
          easeFactor: 2.5,
          intervalDays: 1,
          repetitions: 0,
          nextReviewEpoch: Date.now()
        }
      ]
    }));
    setNewCardQ('');
    setNewCardA('');
  };

  const rateCurrentCard = (quality: 1 | 3 | 4 | 5) => {
    const activeCard = vault.flashcards[cardIndex];
    if (!activeCard) return;

    let reps = activeCard.repetitions;
    let interval = activeCard.intervalDays;
    let ease = activeCard.easeFactor;

    if (quality < 3) {
      reps = 0;
      interval = 1;
    } else {
      if (reps === 0) interval = 1;
      else if (reps === 1) interval = 4;
      else interval = Math.max(1, Math.round(interval * ease));
      reps += 1;
      ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
    }

    const updatedCard: WebFlashcard = {
      ...activeCard,
      repetitions: reps,
      intervalDays: interval,
      easeFactor: Number(ease.toFixed(2)),
      nextReviewEpoch: Date.now() + interval * 86_400_000
    };

    onUpdateVault((prev) => ({
      ...prev,
      flashcards: prev.flashcards.map((c) => (c.id === activeCard.id ? updatedCard : c))
    }));
    setFlipped(false);
    setCardIndex((prev) => (vault.flashcards.length > 0 ? (prev + 1) % vault.flashcards.length : 0));
  };

  const quizQuestions = useMemo(() => {
    if (vault.flashcards.length < 2) return [];
    return vault.flashcards.slice(0, 10).map((card, idx, arr) => {
      const wrongPool = arr.filter((c) => c.id !== card.id).map((c) => c.answer);
      while (wrongPool.length < 3) {
        wrongPool.push(`Alternative concept #${wrongPool.length + 1} (review lecture notes)`);
      }
      const distractors = wrongPool.slice(0, 3);
      const options = [...distractors];
      const correctPos = idx % 4;
      options.splice(correctPos, 0, card.answer);
      return {
        question: card.question,
        courseCode: card.courseCode,
        options: options.slice(0, 4),
        correctAnswer: card.answer
      };
    });
  }, [vault.flashcards]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRawSlideText(text.slice(0, 25000));
  };

  const extractNotesAndCardsLocally = () => {
    const lines = rawSlideText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 3);

    if (lines.length === 0) return;

    const extractedCards: WebFlashcard[] = [];
    const keyTakeaways: string[] = [];

    for (const line of lines) {
      const cleaned = line.replace(/^[-•*\d.)]+\s*/, '');
      const sepMatch = /^([^:–—-]{3,75})\s*(?::|–|—|\s-\s)\s*(.{8,260})$/.exec(cleaned);
      if (sepMatch && extractedCards.length < 25) {
        const term = sepMatch[1].trim();
        const def = sepMatch[2].trim();
        extractedCards.push({
          id: uidGen('f'),
          courseCode: slideCourse.toUpperCase(),
          deckTitle: `${slideCourse.toUpperCase()} Slide Deck`,
          question: term.endsWith('?') ? term : `Define / Explain: ${term}`,
          answer: def,
          easeFactor: 2.5,
          intervalDays: 1,
          repetitions: 0,
          nextReviewEpoch: Date.now()
        });
      } else if (cleaned.length > 20 && keyTakeaways.length < 15) {
        keyTakeaways.push(cleaned);
      }
    }

    if (extractedCards.length === 0 && keyTakeaways.length === 0) {
      setExtractSummaryMsg('No clear definitions found. Try using "Term: Definition" on each line.');
      return;
    }

    onUpdateVault((prev) => ({
      ...prev,
      flashcards: [...prev.flashcards, ...extractedCards],
      notes:
        keyTakeaways.length > 0
          ? [
              {
                id: uidGen('n'),
                courseCode: slideCourse.toUpperCase(),
                title: `${slideCourse.toUpperCase()} Slide Extraction`,
                category: 'Summary',
                isPinned: false,
                content: keyTakeaways.map((p) => `• ${p}`).join('\n\n'),
                updatedAt: Date.now()
              },
              ...prev.notes
            ]
          : prev.notes
    }));

    setExtractSummaryMsg(
      `Extracted ${extractedCards.length} SM-2 cards and ${keyTakeaways.length > 0 ? '1 summary note' : '0 notes'} into your study vault.`
    );
  };

  const addAssessment = () => {
    if (!examTitle.trim()) return;
    const dueEpochMillis = examDate ? new Date(examDate).getTime() : Date.now() + 7 * 86_400_000;
    const matchedCourse = vault.courses.find(
      (c) => c.code.toUpperCase() === examCourse.trim().toUpperCase()
    );
    const resolvedCourseName = matchedCourse?.name || `${examCourse.trim().toUpperCase()} Course`;

    onUpdateVault((prev) => ({
      ...prev,
      assessments: [
        ...prev.assessments,
        {
          id: uidGen('a'),
          courseCode: examCourse.toUpperCase(),
          courseName: resolvedCourseName,
          title: examTitle.trim(),
          type: examType,
          dueEpochMillis,
          status: 'PENDING',
          examVenue: examVenue.trim(),
          seatNumber: '',
          priority: 'HIGH'
        }
      ]
    }));
    setExamTitle('');
    setExamVenue('');
  };

  const activeCard = vault.flashcards[cardIndex] || vault.flashcards[0];

  const scholarStreakDays = useMemo(() => {
    const uniqueDays = new Set(
      vault.focusSessions.map((s) => new Date(s.completedAt).toDateString())
    );
    return Math.max(1, uniqueDays.size);
  }, [vault.focusSessions]);

  const scholarRank = useMemo(() => {
    const totalMins = vault.focusSessions.reduce((sum, s) => sum + s.durationMinutes, 0);
    if (totalMins >= 900) return "Dean's Fellow";
    if (totalMins >= 300) return 'Senior Scholar';
    if (totalMins >= 60) return 'Focused Scholar';
    return 'Initiated Scholar';
  }, [vault.focusSessions]);

  // Unique course codes for filtering
  const availableCourseCodes = useMemo(() => {
    const codes = new Set<string>();
    vault.courses.forEach((c) => codes.add(c.code));
    vault.notes.forEach((n) => codes.add(n.courseCode));
    return Array.from(codes);
  }, [vault.courses, vault.notes]);

  // Filtered notes
  const filteredNotes = useMemo(() => {
    return vault.notes
      .filter((note) => {
        const matchesFilter = selectedNoteFilter === 'ALL' || note.courseCode === selectedNoteFilter;
        const matchesSearch =
          !noteSearchQuery.trim() ||
          note.title.toLowerCase().includes(noteSearchQuery.toLowerCase()) ||
          note.content.toLowerCase().includes(noteSearchQuery.toLowerCase()) ||
          note.courseCode.toLowerCase().includes(noteSearchQuery.toLowerCase());
        return matchesFilter && matchesSearch;
      })
      .sort((a, b) => Number(b.isPinned) - Number(a.isPinned));
  }, [vault.notes, selectedNoteFilter, noteSearchQuery]);

  // Filtered flashcards for browser
  const filteredCards = useMemo(() => {
    if (!flashcardSearch.trim()) return vault.flashcards;
    const q = flashcardSearch.toLowerCase();
    return vault.flashcards.filter(
      (c) =>
        c.question.toLowerCase().includes(q) ||
        c.answer.toLowerCase().includes(q) ||
        c.courseCode.toLowerCase().includes(q)
    );
  }, [vault.flashcards, flashcardSearch]);

  return (
    <div className="space-y-4">
      {/* Study Hub Editorial Header & Sub-navigation */}
      <div className="aura-hero-card rounded-2xl p-4 sm:p-5 space-y-3.5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <span className="px-2.5 py-0.5 rounded-full bg-[#EEF2FA] border border-[#C7D4F0] font-mono text-[10px] font-bold uppercase tracking-wider text-[#1D3B8B]">
              Course Knowledge Archive
            </span>
            <h2 className="font-serif text-xl sm:text-2xl text-[#141923] mt-1 font-semibold tracking-tight">
              Study Hub &amp; SM-2 Spaced Recall
            </h2>
            <p className="text-xs text-[#646B78] mt-0.5">
              Structured lecture notes, active recall decks, mock exam hall &amp; slide synthesis.
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="px-3 py-1 rounded-lg bg-[#EFECE6] border border-[#E4E0D8] text-[#141923] font-semibold">
              {scholarStreakDays}d Active Streak
            </span>
            <span className="px-3 py-1 rounded-lg bg-[#EEF2FA] border border-[#C7D4F0] text-[#1D3B8B] font-semibold">
              {scholarRank}
            </span>
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5 pt-1">
          {(
            [
              ['NOTES', `Notes Vault (${vault.notes.length})`],
              ['FLASHCARDS', `SM-2 Cards (${vault.flashcards.length})`],
              ['QUIZ_SIM', 'Mock Exam Drill'],
              ['EXAMS', `Exams & Deliverables (${vault.assessments.length})`],
              ['SLIDE_PARSER', 'Slide Extractor']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSubTab(id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-all duration-150 ${
                subTab === id
                  ? 'bg-[#1D3B8B] text-[#FFFFFF] border-[#1D3B8B] shadow-sm'
                  : 'bg-[#FFFFFF] border-[#E4E0D8] text-[#646B78] hover:border-[#9CA3AF] hover:text-[#141923]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* SUBTAB 1: NOTES VAULT (EDITORIAL 2-COLUMN SPLIT) */}
      {subTab === 'NOTES' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          {/* Left: New Study Note Composer */}
          <div className="lg:col-span-4 aura-glass rounded-2xl p-4 sm:p-5 space-y-3.5 h-fit sticky lg:top-5">
            <div className="flex items-center justify-between pb-2 border-b border-[#E4E0D8]">
              <div className="font-mono text-xs font-bold uppercase tracking-wider text-[#1D3B8B] flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> New Lecture Note
              </div>
              <span className="font-mono text-[10px] text-[#646B78]">Markdown Ready</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-mono text-[#646B78] uppercase tracking-wider font-semibold block mb-1">
                  Course
                </label>
                <input
                  value={noteCourse}
                  onChange={(e) => setNoteCourse(e.target.value)}
                  placeholder="CS301"
                  className="w-full px-3 py-2 rounded-lg aura-input text-xs font-mono font-bold uppercase"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-[#646B78] uppercase tracking-wider font-semibold block mb-1">
                  Category
                </label>
                <select
                  value={noteCategory}
                  onChange={(e) => setNoteCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg aura-input text-xs font-semibold"
                >
                  <option value="Lecture">Lecture</option>
                  <option value="Formula">Formula</option>
                  <option value="Summary">Summary</option>
                  <option value="Exam Tip">Exam Tip</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-[#646B78] uppercase tracking-wider font-semibold block mb-1">
                Note Title
              </label>
              <input
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="e.g. Eigenvalues & Diagonalization Proof"
                className="w-full px-3 py-2 rounded-lg aura-input text-xs"
              />
            </div>

            <div>
              <label className="text-[10px] font-mono text-[#646B78] uppercase tracking-wider font-semibold block mb-1">
                Content &amp; Key Takeaways
              </label>
              <textarea
                rows={6}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Write lecture takeaways, proofs, formulas, or code snippets..."
                className="w-full px-3 py-2 rounded-lg aura-input text-xs leading-relaxed font-sans"
              />
            </div>

            <button
              type="button"
              onClick={addNote}
              className="w-full py-2.5 rounded-lg bg-[#1D3B8B] hover:bg-[#162F70] text-[#FFFFFF] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors duration-150 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Save Note to Vault
            </button>
          </div>

          {/* Right: Notes Desk with Search, Filter & 2-Column Bento Grid */}
          <div className="lg:col-span-8 space-y-3.5">
            {/* Filter & Search Bar */}
            <div className="aura-glass rounded-xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-[#646B78] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={noteSearchQuery}
                  onChange={(e) => setNoteSearchQuery(e.target.value)}
                  placeholder="Search notes by title, concept, or course code..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg aura-input text-xs"
                />
              </div>

              {availableCourseCodes.length > 0 && (
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedNoteFilter('ALL')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold transition-colors ${
                      selectedNoteFilter === 'ALL'
                        ? 'bg-[#1D3B8B] text-[#FFFFFF]'
                        : 'bg-[#EFECE6] text-[#4B5563] hover:text-[#141923]'
                    }`}
                  >
                    All
                  </button>
                  {availableCourseCodes.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setSelectedNoteFilter(code)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold transition-colors ${
                        selectedNoteFilter === code
                          ? 'bg-[#1D3B8B] text-[#FFFFFF]'
                          : 'bg-[#EFECE6] text-[#4B5563] hover:text-[#141923]'
                      }`}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Notes Grid */}
            {filteredNotes.length === 0 ? (
              <div className="aura-glass rounded-2xl p-10 text-center space-y-2">
                <FileText className="w-8 h-8 text-[#9CA3AF] mx-auto" />
                <p className="font-bold text-sm text-[#141923]">No notes found</p>
                <p className="text-xs text-[#646B78] max-w-sm mx-auto">
                  {noteSearchQuery || selectedNoteFilter !== 'ALL'
                    ? 'No notes match your filter. Try adjusting your query or resetting filters.'
                    : 'Create your first lecture note on the left or extract notes automatically from slides.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredNotes.map((note) => (
                  <div
                    key={note.id}
                    className="aura-glass rounded-xl p-4 flex flex-col justify-between space-y-3 hover:border-[#1D3B8B] transition-colors duration-150"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[#EEF2FA] border border-[#C7D4F0] text-[#1D3B8B] font-mono text-[10px] font-bold">
                            {note.courseCode}
                          </span>
                          <span className="font-mono text-[11px] text-[#646B78] font-medium">
                            {note.category}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateVault((prev) => ({
                                ...prev,
                                notes: prev.notes.map((n) =>
                                  n.id === note.id ? { ...n, isPinned: !n.isPinned } : n
                                )
                              }))
                            }
                            title={note.isPinned ? 'Unpin' : 'Pin to top'}
                            className={`p-1.5 rounded-lg border transition-colors duration-150 ${
                              note.isPinned
                                ? 'text-[#B45309] bg-[#FFFBEB] border-[#FDE68A]'
                                : 'text-[#646B78] bg-[#FFFFFF] border-[#E4E0D8] hover:border-[#9CA3AF]'
                            }`}
                          >
                            <Pin className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateVault((prev) => ({
                                ...prev,
                                notes: prev.notes.filter((n) => n.id !== note.id)
                              }))
                            }
                            title="Delete note"
                            className="p-1.5 rounded-lg border border-[#E4E0D8] bg-[#FFFFFF] hover:border-[#FECACA] hover:bg-[#FEF2F2] text-[#646B78] hover:text-[#DC2626] transition-colors duration-150"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <h4 className="font-bold text-sm text-[#141923] line-clamp-2 leading-snug">
                        {note.title}
                      </h4>

                      <p className="text-xs text-[#374151] whitespace-pre-wrap font-sans leading-relaxed line-clamp-6">
                        {note.content}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-[#E4E0D8] flex items-center justify-between text-[11px]">
                      <span className="text-[10px] font-mono text-[#8C929D]">
                        {new Date(note.updatedAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateVault((prev) => ({
                            ...prev,
                            flashcards: [
                              ...prev.flashcards,
                              {
                                id: uidGen('f'),
                                courseCode: note.courseCode,
                                deckTitle: `${note.courseCode} Notes`,
                                question: note.title,
                                answer: note.content.slice(0, 240),
                                easeFactor: 2.5,
                                intervalDays: 1,
                                repetitions: 0,
                                nextReviewEpoch: Date.now()
                              }
                            ]
                          }))
                        }
                        className="text-[11px] text-[#1D3B8B] font-semibold px-2.5 py-1 rounded-md border border-[#C7D4F0] bg-[#EEF2FA] hover:bg-[#1D3B8B] hover:text-[#FFFFFF] transition-colors duration-150 flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Make Flashcard</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 2: FLASHCARDS & SM-2 ACTIVE RECALL */}
      {subTab === 'FLASHCARDS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          {/* Left: Interactive SM-2 Study Deck */}
          <div className="lg:col-span-7 space-y-4">
            {activeCard ? (
              <div className="aura-glass rounded-2xl p-5 sm:p-6 text-center space-y-4">
                <div className="flex items-center justify-between text-xs text-[#646B78] pb-3 border-b border-[#E4E0D8]">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-[#EEF2FA] border border-[#C7D4F0] text-[#1D3B8B] font-mono text-[11px] font-bold">
                      {activeCard.courseCode}
                    </span>
                    <span className="text-[11px] font-mono font-medium">
                      Ease: {activeCard.easeFactor}x
                    </span>
                  </div>
                  <span className="font-mono text-xs font-semibold text-[#141923]">
                    Card {(cardIndex % vault.flashcards.length) + 1} of {vault.flashcards.length}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setCardIndex(
                          (prev) => (prev - 1 + vault.flashcards.length) % vault.flashcards.length
                        )
                      }
                      className="p-1 rounded-md border border-[#E4E0D8] hover:border-[#9CA3AF] text-[#646B78]"
                      title="Previous Card"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCardIndex((prev) => (prev + 1) % vault.flashcards.length)}
                      className="p-1 rounded-md border border-[#E4E0D8] hover:border-[#9CA3AF] text-[#646B78]"
                      title="Next Card"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateVault((prev) => ({
                          ...prev,
                          flashcards: prev.flashcards.filter((c) => c.id !== activeCard.id)
                        }));
                        setCardIndex(0);
                      }}
                      className="p-1 rounded-md border border-[#E4E0D8] hover:border-[#FECACA] hover:bg-[#FEF2F2] text-[#646B78] hover:text-[#DC2626] transition-colors"
                      title="Delete card"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Tactile Card Stage */}
                <div
                  onClick={() => setFlipped((f) => !f)}
                  className="min-h-[220px] sm:min-h-[260px] rounded-xl bg-[#FAF8F5] border border-[#E4E0D8] hover:border-[#1D3B8B] p-6 sm:p-8 flex flex-col items-center justify-center cursor-pointer select-none transition-all duration-150 shadow-xs group"
                >
                  <span className="font-mono text-[10px] uppercase tracking-widest text-[#1D3B8B] font-bold mb-3 px-2.5 py-1 rounded bg-[#EEF2FA] border border-[#C7D4F0]">
                    {flipped ? 'Verified Answer' : 'Question / Concept Prompt (Click to Flip)'}
                  </span>
                  <p className="text-base sm:text-lg font-serif font-semibold text-[#141923] leading-relaxed max-w-xl">
                    {flipped ? activeCard.answer : activeCard.question}
                  </p>
                  <span className="text-[11px] font-mono text-[#8C929D] mt-4 opacity-75 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                    <RotateCw className="w-3 h-3" /> Click anywhere to flip
                  </span>
                </div>

                {/* SM-2 Recall Feedback Strip */}
                {flipped ? (
                  <div className="space-y-2">
                    <div className="text-[11px] font-mono text-[#646B78]">
                      Rate recall accuracy to recalculate SM-2 interval:
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => rateCurrentCard(1)}
                        className="py-2.5 px-2 rounded-lg bg-[#FEF2F2] border border-[#FECACA] hover:bg-[#FEE2E2] text-[#991B1B] text-xs font-semibold transition-colors"
                      >
                        <div className="font-bold">Again</div>
                        <div className="text-[10px] font-mono opacity-80">1 day</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => rateCurrentCard(3)}
                        className="py-2.5 px-2 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] hover:bg-[#FEF3C7] text-[#92400E] text-xs font-semibold transition-colors"
                      >
                        <div className="font-bold">Hard</div>
                        <div className="text-[10px] font-mono opacity-80">2 days</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => rateCurrentCard(4)}
                        className="py-2.5 px-2 rounded-lg bg-[#EEF2FA] border border-[#C7D4F0] hover:bg-[#E0E9FA] text-[#1D3B8B] text-xs font-semibold transition-colors"
                      >
                        <div className="font-bold">Good</div>
                        <div className="text-[10px] font-mono opacity-80">
                          {Math.max(4, Math.round(activeCard.intervalDays * 1.5))}d
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => rateCurrentCard(5)}
                        className="py-2.5 px-2 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] hover:bg-[#D1FAE5] text-[#065F46] text-xs font-semibold transition-colors"
                      >
                        <div className="font-bold">Easy</div>
                        <div className="text-[10px] font-mono opacity-80">
                          {Math.max(6, Math.round(activeCard.intervalDays * 2.2))}d
                        </div>
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFlipped(true)}
                    className="w-full py-2.5 rounded-lg bg-[#1D3B8B] hover:bg-[#162F70] text-[#FFFFFF] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors duration-150 shadow-sm"
                  >
                    <RotateCw className="w-3.5 h-3.5" /> Reveal Answer
                  </button>
                )}
              </div>
            ) : (
              <div className="aura-glass rounded-2xl p-10 text-center space-y-2">
                <Layers className="w-8 h-8 text-[#9CA3AF] mx-auto" />
                <p className="font-bold text-sm text-[#141923]">No flashcards yet</p>
                <p className="text-xs text-[#646B78] max-w-sm mx-auto">
                  Add a new flashcard on the right or upload lecture slides in the Slide Extractor tab.
                </p>
              </div>
            )}

            {/* Deck Browser Strip */}
            {vault.flashcards.length > 0 && (
              <div className="aura-glass rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="font-mono text-xs font-bold uppercase tracking-wider text-[#141923]">
                    Deck Card List ({filteredCards.length})
                  </div>
                  <input
                    type="text"
                    value={flashcardSearch}
                    onChange={(e) => setFlashcardSearch(e.target.value)}
                    placeholder="Search cards..."
                    className="px-3 py-1 rounded-md aura-input text-xs w-48"
                  />
                </div>

                <div className="max-h-60 overflow-y-auto divide-y divide-[#E4E0D8] no-scrollbar">
                  {filteredCards.map((card, i) => (
                    <div
                      key={card.id}
                      onClick={() => {
                        const originalIdx = vault.flashcards.findIndex((c) => c.id === card.id);
                        if (originalIdx >= 0) setCardIndex(originalIdx);
                        setFlipped(false);
                      }}
                      className="py-2.5 px-2 flex items-center justify-between gap-3 hover:bg-[#FAF8F5] cursor-pointer rounded-lg transition-colors text-xs"
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold text-[#1D3B8B] px-1.5 py-0.5 rounded bg-[#EEF2FA] shrink-0">
                          {card.courseCode}
                        </span>
                        <span className="font-semibold text-[#141923] truncate">{card.question}</span>
                      </div>
                      <span className="font-mono text-[10px] text-[#646B78] shrink-0">
                        {card.intervalDays}d interval
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Add SM-2 Flashcard Composer & Deck Stats */}
          <div className="lg:col-span-5 space-y-4">
            <div className="aura-glass rounded-2xl p-4 sm:p-5 space-y-3.5 h-fit">
              <div className="font-mono text-xs font-bold uppercase tracking-wider text-[#1D3B8B] flex items-center gap-1.5 pb-2 border-b border-[#E4E0D8]">
                <Layers className="w-4 h-4" /> Add SM-2 Flashcard
              </div>

              <div>
                <label className="text-[10px] font-mono text-[#646B78] uppercase tracking-wider font-semibold block mb-1">
                  Course Code
                </label>
                <input
                  value={newCardCourse}
                  onChange={(e) => setNewCardCourse(e.target.value)}
                  placeholder="CS301"
                  className="w-full px-3 py-2 rounded-lg aura-input text-xs font-mono font-bold uppercase"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-[#646B78] uppercase tracking-wider font-semibold block mb-1">
                  Front Prompt / Question
                </label>
                <input
                  value={newCardQ}
                  onChange={(e) => setNewCardQ(e.target.value)}
                  placeholder="e.g. What is the Master Theorem for divide & conquer?"
                  className="w-full px-3 py-2 rounded-lg aura-input text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-[#646B78] uppercase tracking-wider font-semibold block mb-1">
                  Back / Verified Answer
                </label>
                <textarea
                  rows={4}
                  value={newCardA}
                  onChange={(e) => setNewCardA(e.target.value)}
                  placeholder="e.g. T(n) = aT(n/b) + f(n)..."
                  className="w-full px-3 py-2 rounded-lg aura-input text-xs leading-relaxed"
                />
              </div>

              <button
                type="button"
                onClick={addCard}
                className="w-full py-2.5 rounded-lg bg-[#1D3B8B] hover:bg-[#162F70] text-[#FFFFFF] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors duration-150 shadow-sm"
              >
                <Plus className="w-4 h-4" /> Add Card to Deck
              </button>
            </div>

            {/* Deck Telemetry */}
            <div className="aura-glass rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="font-mono text-xs font-bold uppercase tracking-wider text-[#141923]">
                Deck Health &amp; Retention
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E4E0D8]">
                  <div className="text-xl font-bold font-mono text-[#1D3B8B]">
                    {vault.flashcards.length}
                  </div>
                  <div className="text-[11px] text-[#646B78] font-medium">Total Cards</div>
                </div>
                <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E4E0D8]">
                  <div className="text-xl font-bold font-mono text-[#065F46]">
                    {vault.flashcards.filter((c) => c.repetitions > 2).length}
                  </div>
                  <div className="text-[11px] text-[#646B78] font-medium">Mastered</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 3: QUIZ SIMULATOR */}
      {subTab === 'QUIZ_SIM' && (
        <div className="aura-glass rounded-2xl p-5 sm:p-7 space-y-5 max-w-3xl mx-auto">
          <div className="flex items-center justify-between pb-3 border-b border-[#E4E0D8]">
            <div>
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#1D3B8B] flex items-center gap-1.5">
                <Award className="w-4 h-4" /> Exam Hall Mock Simulator
              </span>
              <p className="text-xs text-[#646B78] mt-0.5">
                Rapid multiple-choice drills synthesized directly from your active flashcards.
              </p>
            </div>
            <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-[#EEF2FA] border border-[#C7D4F0] text-[#1D3B8B] font-semibold">
              {quizQuestions.length} Questions Ready
            </span>
          </div>

          {quizQuestions.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-xs text-[#646B78]">
                Add at least 2 flashcards in the SM-2 Cards tab to unlock mock drills.
              </p>
              <button
                type="button"
                onClick={() => setSubTab('FLASHCARDS')}
                className="px-4 py-2 rounded-lg bg-[#1D3B8B] text-[#FFFFFF] text-xs font-semibold"
              >
                Go to SM-2 Cards
              </button>
            </div>
          ) : !quizStarted ? (
            <div className="text-center py-8 space-y-4">
              <div className="text-lg font-serif font-bold text-[#141923]">
                {quizQuestions.length}-Question Timed Drill
              </div>
              <p className="text-xs text-[#646B78] max-w-md mx-auto leading-relaxed">
                Test your retrieval strength under simulated exam hall pressure. Four options per question with real-time scoring.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuizStarted(true);
                  setQuizFinished(false);
                  setQuizStep(0);
                  setQuizScore(0);
                }}
                className="px-6 py-2.5 rounded-lg bg-[#1D3B8B] hover:bg-[#162F70] text-[#FFFFFF] font-semibold text-xs transition-colors duration-150 shadow-sm"
              >
                Start Drill Now
              </button>
            </div>
          ) : quizFinished ? (
            <div className="text-center py-8 space-y-4">
              <div className="text-3xl font-bold text-[#1D3B8B] font-mono">
                {quizScore} / {quizQuestions.length}
              </div>
              <p className="font-mono text-xs text-[#4B5563]">
                Accuracy: {Math.round((quizScore / quizQuestions.length) * 100)}% · Rank:{' '}
                {quizScore >= quizQuestions.length * 0.8 ? 'Distinction' : 'Proficient'}
              </p>
              <button
                type="button"
                onClick={() => setQuizStarted(false)}
                className="px-5 py-2.5 rounded-lg border border-[#E4E0D8] bg-[#FFFFFF] hover:border-[#9CA3AF] text-xs font-semibold text-[#141923] shadow-xs"
              >
                Finish &amp; Review Next Set
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#1D3B8B] font-bold">
                  Question {quizStep + 1} of {quizQuestions.length}
                </span>
                <span className="text-[#646B78] px-2 py-0.5 rounded bg-[#FAF8F5] border border-[#E4E0D8]">
                  {quizQuestions[quizStep].courseCode}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E4E0D8]">
                <h3 className="font-serif font-semibold text-base text-[#141923] leading-relaxed">
                  {quizQuestions[quizStep].question}
                </h3>
              </div>

              <div className="space-y-2.5">
                {quizQuestions[quizStep].options.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (opt === quizQuestions[quizStep].correctAnswer) {
                        setQuizScore((s) => s + 1);
                      }
                      if (quizStep + 1 >= quizQuestions.length) {
                        setQuizFinished(true);
                      } else {
                        setQuizStep((s) => s + 1);
                      }
                    }}
                    className="w-full text-left p-3.5 rounded-xl bg-[#FFFFFF] border border-[#E4E0D8] hover:border-[#1D3B8B] hover:bg-[#EEF2FA]/40 text-xs text-[#141923] transition-all duration-150 flex items-start gap-3 group"
                  >
                    <span className="w-5 h-5 rounded-md bg-[#FAF8F5] group-hover:bg-[#1D3B8B] group-hover:text-[#FFFFFF] border border-[#E4E0D8] flex items-center justify-center font-mono text-[11px] font-bold text-[#1D3B8B] shrink-0 transition-colors">
                      {['A', 'B', 'C', 'D'][idx]}
                    </span>
                    <span className="leading-relaxed pt-0.5">{opt}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 4: EXAMS & ASSIGNMENTS TIMELINE */}
      {subTab === 'EXAMS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          {/* Left: Log Exam, Quiz or Task */}
          <div className="lg:col-span-4 aura-glass rounded-2xl p-4 sm:p-5 space-y-3.5 h-fit sticky lg:top-5">
            <div className="font-mono text-xs font-bold uppercase tracking-wider text-[#1D3B8B] flex items-center gap-1.5 pb-2 border-b border-[#E4E0D8]">
              <BookMarked className="w-4 h-4" /> Log Assessment / Deadline
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-mono text-[#646B78] uppercase tracking-wider font-semibold block mb-1">
                  Course
                </label>
                <input
                  value={examCourse}
                  onChange={(e) => setExamCourse(e.target.value)}
                  placeholder="CS301"
                  className="w-full px-3 py-2 rounded-lg aura-input text-xs font-mono font-bold uppercase"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-[#646B78] uppercase tracking-wider font-semibold block mb-1">
                  Type
                </label>
                <select
                  value={examType}
                  onChange={(e) => setExamType(e.target.value as 'EXAM' | 'ASSIGNMENT' | 'QUIZ')}
                  className="w-full px-3 py-2 rounded-lg aura-input text-xs font-semibold"
                >
                  <option value="EXAM">EXAM</option>
                  <option value="QUIZ">QUIZ</option>
                  <option value="ASSIGNMENT">ASSIGNMENT</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-[#646B78] uppercase tracking-wider font-semibold block mb-1">
                Assessment Title
              </label>
              <input
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
                placeholder="e.g. Midterm Examination / Project Paper"
                className="w-full px-3 py-2 rounded-lg aura-input text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-mono text-[#646B78] uppercase tracking-wider font-semibold block mb-1">
                  Due / Exam Date
                </label>
                <input
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg aura-input text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-[#646B78] uppercase tracking-wider font-semibold block mb-1">
                  Hall / Venue
                </label>
                <input
                  value={examVenue}
                  onChange={(e) => setExamVenue(e.target.value)}
                  placeholder="Hall B / Online"
                  className="w-full px-3 py-2 rounded-lg aura-input text-xs"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={addAssessment}
              className="w-full py-2.5 rounded-lg bg-[#1D3B8B] hover:bg-[#162F70] text-[#FFFFFF] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors duration-150 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Add Assessment
            </button>
          </div>

          {/* Right: Assessment Timeline Strip */}
          <div className="lg:col-span-8 aura-glass rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="font-mono text-xs font-bold uppercase tracking-wider text-[#141923] pb-2 border-b border-[#E4E0D8]">
              Upcoming Milestones ({vault.assessments.length})
            </div>

            {vault.assessments.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#646B78]">
                No assessments logged. Use the form on the left to track exam dates and due dates.
              </div>
            ) : (
              <div className="space-y-2.5">
                {vault.assessments
                  .slice()
                  .sort((a, b) => a.dueEpochMillis - b.dueEpochMillis)
                  .map((a) => {
                    const daysLeft = Math.ceil((a.dueEpochMillis - Date.now()) / 86_400_000);
                    const isOverdue = daysLeft < 0 && a.status !== 'COMPLETED';
                    const isToday = daysLeft === 0;

                    return (
                      <div
                        key={a.id}
                        className={`p-3.5 rounded-xl border transition-colors flex items-center justify-between gap-3 ${
                          a.status === 'COMPLETED'
                            ? 'bg-[#FAF8F5] border-[#E4E0D8] opacity-75'
                            : isOverdue
                            ? 'bg-[#FEF2F2] border-[#FECACA]'
                            : isToday
                            ? 'bg-[#FFFBEB] border-[#FDE68A]'
                            : 'bg-[#FFFFFF] border-[#E4E0D8] hover:border-[#1D3B8B]'
                        }`}
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded-md bg-[#EEF2FA] border border-[#C7D4F0] font-mono text-[10px] font-bold text-[#1D3B8B]">
                              {a.courseCode} · {a.type}
                            </span>
                            <span
                              className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                                a.status === 'COMPLETED'
                                  ? 'bg-[#ECFDF5] text-[#065F46]'
                                  : isOverdue
                                  ? 'bg-[#FEE2E2] text-[#991B1B]'
                                  : isToday
                                  ? 'bg-[#FEF3C7] text-[#92400E]'
                                  : 'bg-[#EFECE6] text-[#4B5563]'
                              }`}
                            >
                              {a.status === 'COMPLETED'
                                ? 'Completed'
                                : isToday
                                ? 'Due Today'
                                : daysLeft > 0
                                ? `T-${daysLeft}d`
                                : 'Past'}
                            </span>
                            {a.examVenue && (
                              <span className="text-[11px] text-[#646B78] font-mono">
                                📍 {a.examVenue}
                              </span>
                            )}
                          </div>
                          <div
                            className={`font-bold text-sm leading-snug ${
                              a.status === 'COMPLETED'
                                ? 'line-through text-[#8C929D]'
                                : 'text-[#141923]'
                            }`}
                          >
                            {a.title}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateVault((prev) => ({
                                ...prev,
                                assessments: prev.assessments.map((item) =>
                                  item.id === a.id
                                    ? {
                                        ...item,
                                        status:
                                          item.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED'
                                      }
                                    : item
                                )
                              }))
                            }
                            className={`p-2 rounded-lg border transition-colors ${
                              a.status === 'COMPLETED'
                                ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]'
                                : 'bg-[#FFFFFF] border-[#E4E0D8] text-[#646B78] hover:border-[#1D3B8B]'
                            }`}
                            title="Toggle Completed"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateVault((prev) => ({
                                ...prev,
                                assessments: prev.assessments.filter((item) => item.id !== a.id)
                              }))
                            }
                            className="p-2 rounded-lg border border-[#E4E0D8] bg-[#FFFFFF] hover:border-[#FECACA] hover:bg-[#FEF2F2] text-[#646B78] hover:text-[#DC2626] transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 5: LOCAL SLIDE PARSER */}
      {subTab === 'SLIDE_PARSER' && (
        <div className="aura-glass rounded-2xl p-5 sm:p-7 space-y-4 max-w-4xl mx-auto">
          <div className="space-y-1 pb-3 border-b border-[#E4E0D8]">
            <span className="font-mono text-xs font-bold text-[#1D3B8B] uppercase tracking-wider">
              Lecture Slide &amp; Outline Extractor
            </span>
            <p className="text-xs text-[#646B78] leading-relaxed">
              Paste lecture outlines or upload a <code>.txt</code> / <code>.md</code> file. Lines
              formatted as <code>Term: Definition</code> convert into active recall SM-2 Flashcards
              and key takeaways save to your Notes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={slideCourse}
              onChange={(e) => setSlideCourse(e.target.value)}
              placeholder="Course Code"
              className="px-3 py-2 rounded-lg aura-input text-xs font-mono font-bold uppercase w-36"
            />
            <label className="px-3.5 py-2 rounded-lg bg-[#FFFFFF] border border-[#E4E0D8] hover:border-[#1D3B8B] text-[#1D3B8B] text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 transition-colors duration-150">
              <Upload className="w-3.5 h-3.5" /> Load .txt / .md
              <input
                type="file"
                accept=".txt,.md,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <textarea
            rows={8}
            value={rawSlideText}
            onChange={(e) => setRawSlideText(e.target.value)}
            placeholder={
              'Paste lecture text here...\nExample:\nDeadlock: A state where processes wait indefinitely for resources held by each other.\nPaging: Memory management scheme that stores data in fixed-size blocks.'
            }
            className="w-full px-3.5 py-3 rounded-xl aura-input text-xs font-mono leading-relaxed"
          />

          <button
            type="button"
            onClick={extractNotesAndCardsLocally}
            className="w-full py-2.5 rounded-lg bg-[#1D3B8B] hover:bg-[#162F70] text-[#FFFFFF] text-xs font-semibold transition-colors duration-150 shadow-sm"
          >
            Extract Notes &amp; SM-2 Flashcards
          </button>

          {extractSummaryMsg && (
            <div className="p-3.5 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-xs font-medium text-[#065F46]">
              {extractSummaryMsg}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
