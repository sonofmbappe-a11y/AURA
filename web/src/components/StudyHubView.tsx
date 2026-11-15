import React, { useMemo, useState } from 'react';
import {
  Award,
  BookMarked,
  CheckCircle2,
  FileText,
  Layers,
  Pin,
  Plus,
  RotateCw,
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

  const [noteCourse, setNoteCourse] = useState(vault.courses[0]?.code || 'CS301');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteCategory, setNoteCategory] = useState('Lecture');
  const [noteContent, setNoteContent] = useState('');

  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [newCardCourse, setNewCardCourse] = useState(vault.courses[0]?.code || 'CS301');
  const [newCardQ, setNewCardQ] = useState('');
  const [newCardA, setNewCardA] = useState('');

  const [quizStarted, setQuizStarted] = useState(false);
  const [quizStep, setQuizStep] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  const [examTitle, setExamTitle] = useState('');
  const [examCourse, setExamCourse] = useState(vault.courses[0]?.code || 'CS301');
  const [examType, setExamType] = useState<'EXAM' | 'ASSIGNMENT' | 'QUIZ'>('EXAM');
  const [examDate, setExamDate] = useState('');
  const [examVenue, setExamVenue] = useState('');

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
      }
      if (keyTakeaways.length < 20 && cleaned.length >= 12) {
        keyTakeaways.push(`• ${cleaned}`);
      }
    }

    onUpdateVault((prev) => ({
      ...prev,
      notes: [
        {
          id: uidGen('n'),
          courseCode: slideCourse.toUpperCase(),
          title: `${slideCourse.toUpperCase()} Extracted Slide Summary`,
          category: 'Summary',
          isPinned: true,
          content: keyTakeaways.join('\n'),
          updatedAt: Date.now()
        },
        ...prev.notes
      ],
      flashcards: [...prev.flashcards, ...extractedCards]
    }));

    setExtractSummaryMsg(
      `Extracted 1 Study Note and ${extractedCards.length} SM-2 Flashcards locally.`
    );
    setRawSlideText('');
  };

  const addAssessment = () => {
    if (!examTitle.trim()) return;
    const dueMs = examDate ? new Date(examDate).getTime() : Date.now() + 7 * 86_400_000;
    onUpdateVault((prev) => ({
      ...prev,
      assessments: [
        ...prev.assessments,
        {
          id: uidGen('a'),
          courseCode: examCourse.toUpperCase(),
          courseName: examCourse.toUpperCase(),
          title: examTitle.trim(),
          type: examType,
          dueEpochMillis: dueMs,
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

  return (
    <div className="space-y-4">
      {/* Sub-navigation & Scholar Telemetry */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {(
            [
              ['NOTES', 'Notes Vault'],
              ['FLASHCARDS', `SM-2 Cards (${vault.flashcards.length})`],
              ['QUIZ_SIM', 'Exam Simulator'],
              ['EXAMS', `Exams & Tasks (${vault.assessments.length})`],
              ['SLIDE_PARSER', 'Slide Extractor']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSubTab(id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap border transition-colors duration-150 ${
                subTab === id
                  ? 'bg-[#1E3A8A] text-[#FFFFFF] border-[#1E3A8A]'
                  : 'bg-[#FFFFFF] border-[#E5E7EB] text-[#6B7280] hover:border-[#9CA3AF] hover:text-[#111827]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[11px]">
          <span className="px-2 py-1 rounded bg-[#F3F4F6] border border-[#E5E7EB] text-[#111827] font-semibold">
            {scholarStreakDays}d Streak
          </span>
          <span className="px-2 py-1 rounded bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E3A8A] font-semibold">
            {scholarRank}
          </span>
        </div>
      </div>

      {subTab === 'NOTES' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 aura-glass rounded-lg p-4 space-y-3 h-fit">
            <div className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#1E3A8A] flex items-center gap-1.5">
              <FileText className="w-4 h-4" /> New Study Note
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={noteCourse}
                onChange={(e) => setNoteCourse(e.target.value)}
                placeholder="Course (CS301)"
                className="px-3 py-2 rounded-md aura-input text-xs font-mono font-bold uppercase"
              />
              <select
                value={noteCategory}
                onChange={(e) => setNoteCategory(e.target.value)}
                className="px-3 py-2 rounded-md aura-input text-xs font-semibold"
              >
                <option value="Lecture">Lecture</option>
                <option value="Formula">Formula</option>
                <option value="Summary">Summary</option>
                <option value="Exam Tip">Exam Tip</option>
              </select>
            </div>
            <input
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Note Title (e.g. Laplace Transform Identities)"
              className="w-full px-3 py-2 rounded-md aura-input text-xs"
            />
            <textarea
              rows={5}
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Write lecture takeaways, proofs, or formulas..."
              className="w-full px-3 py-2 rounded-md aura-input text-xs"
            />
            <button
              onClick={addNote}
              className="w-full py-2 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors duration-150"
            >
              <Plus className="w-4 h-4" /> Save Note
            </button>
          </div>

          <div className="lg:col-span-7 space-y-2.5">
            {[...vault.notes]
              .sort((a, b) => Number(b.isPinned) - Number(a.isPinned))
              .map((note) => (
                <div key={note.id} className="aura-glass rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E3A8A] font-mono text-[10px] font-bold">
                        {note.courseCode}
                      </span>
                      <span className="font-mono text-[11px] text-[#6B7280]">{note.category}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
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
                        className="text-[11px] text-[#1E3A8A] font-semibold px-2 py-1 rounded border border-[#E5E7EB] bg-[#F9FAFB] hover:border-[#1E3A8A] transition-colors duration-150"
                      >
                        + Card
                      </button>
                      <button
                        onClick={() =>
                          onUpdateVault((prev) => ({
                            ...prev,
                            notes: prev.notes.map((n) =>
                              n.id === note.id ? { ...n, isPinned: !n.isPinned } : n
                            )
                          }))
                        }
                        className={`p-1.5 rounded border transition-colors duration-150 ${
                          note.isPinned
                            ? 'text-[#B45309] bg-[#FFFBEB] border-[#FDE68A]'
                            : 'text-[#6B7280] bg-[#FFFFFF] border-[#E5E7EB] hover:border-[#9CA3AF]'
                        }`}
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          onUpdateVault((prev) => ({
                            ...prev,
                            notes: prev.notes.filter((n) => n.id !== note.id)
                          }))
                        }
                        className="p-1.5 rounded border border-[#E5E7EB] bg-[#FFFFFF] hover:border-[#FECACA] hover:bg-[#FEF2F2] text-[#6B7280] hover:text-[#DC2626] transition-colors duration-150"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <h4 className="font-bold text-sm text-[#111827]">{note.title}</h4>
                  <pre className="text-xs text-[#374151] whitespace-pre-wrap font-sans leading-relaxed">
                    {note.content}
                  </pre>
                </div>
              ))}
          </div>
        </div>
      )}

      {subTab === 'FLASHCARDS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7">
            {activeCard ? (
              <div className="aura-glass rounded-lg p-5 text-center space-y-4">
                <div className="flex items-center justify-between text-xs text-[#6B7280]">
                  <span className="px-2 py-0.5 rounded bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E3A8A] font-mono font-bold">
                    {activeCard.courseCode}
                  </span>
                  <span className="font-mono text-[11px]">
                    Card {(cardIndex % vault.flashcards.length) + 1}/{vault.flashcards.length} · Interval: {activeCard.intervalDays}d
                  </span>
                  <button
                    onClick={() => {
                      onUpdateVault((prev) => ({
                        ...prev,
                        flashcards: prev.flashcards.filter((c) => c.id !== activeCard.id)
                      }));
                      setCardIndex(0);
                    }}
                    className="text-[#6B7280] hover:text-[#DC2626] transition-colors duration-150"
                    title="Delete card"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div
                  onClick={() => setFlipped((f) => !f)}
                  className="min-h-[170px] rounded-md bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#9CA3AF] p-6 flex flex-col items-center justify-center cursor-pointer select-none transition-colors duration-150"
                >
                  <span className="font-mono text-[10px] uppercase tracking-widest text-[#1E3A8A] font-bold mb-2">
                    {flipped ? 'Answer' : 'Prompt (Click to Flip)'}
                  </span>
                  <p className="text-base font-semibold text-[#111827] leading-relaxed">
                    {flipped ? activeCard.answer : activeCard.question}
                  </p>
                </div>

                {flipped ? (
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      onClick={() => rateCurrentCard(1)}
                      className="py-2 rounded-md bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-xs font-semibold"
                    >
                      Again (1d)
                    </button>
                    <button
                      onClick={() => rateCurrentCard(3)}
                      className="py-2 rounded-md bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] text-xs font-semibold"
                    >
                      Hard
                    </button>
                    <button
                      onClick={() => rateCurrentCard(4)}
                      className="py-2 rounded-md bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E3A8A] text-xs font-semibold"
                    >
                      Good
                    </button>
                    <button
                      onClick={() => rateCurrentCard(5)}
                      className="py-2 rounded-md bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] text-xs font-semibold"
                    >
                      Easy
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setFlipped(true)}
                    className="w-full py-2.5 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors duration-150"
                  >
                    <RotateCw className="w-3.5 h-3.5" /> Reveal Answer
                  </button>
                )}
              </div>
            ) : (
              <div className="aura-glass rounded-lg p-8 text-center text-xs text-[#6B7280]">
                No flashcards yet. Create one on the right or extract cards from lecture slides.
              </div>
            )}
          </div>

          <div className="lg:col-span-5 aura-glass rounded-lg p-4 space-y-2.5 h-fit">
            <div className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#1E3A8A] flex items-center gap-1.5">
              <Layers className="w-4 h-4" /> Add SM-2 Flashcard
            </div>
            <input
              value={newCardCourse}
              onChange={(e) => setNewCardCourse(e.target.value)}
              placeholder="Course Code (CS301)"
              className="w-full px-3 py-2 rounded-md aura-input text-xs font-mono font-bold uppercase"
            />
            <input
              value={newCardQ}
              onChange={(e) => setNewCardQ(e.target.value)}
              placeholder="Question / Front of Card"
              className="w-full px-3 py-2 rounded-md aura-input text-xs"
            />
            <textarea
              rows={3}
              value={newCardA}
              onChange={(e) => setNewCardA(e.target.value)}
              placeholder="Verified Answer / Back of Card"
              className="w-full px-3 py-2 rounded-md aura-input text-xs"
            />
            <button
              onClick={addCard}
              className="w-full py-2 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold transition-colors duration-150"
            >
              Add Card to Deck
            </button>
          </div>
        </div>
      )}

      {subTab === 'QUIZ_SIM' && (
        <div className="aura-glass rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#E5E7EB]">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#1E3A8A] flex items-center gap-1.5">
              <Award className="w-4 h-4" /> Exam Hall Mock Simulator
            </span>
            <span className="font-mono text-[11px] text-[#6B7280]">Generated from SM-2 Deck</span>
          </div>

          {quizQuestions.length === 0 ? (
            <p className="text-xs text-[#6B7280]">
              Add at least 2 flashcards in the SM-2 Cards tab to unlock rapid mock drills.
            </p>
          ) : !quizStarted ? (
            <div className="text-center py-6 space-y-3">
              <div className="text-base font-bold text-[#111827]">
                {quizQuestions.length}-Question Mock Exam Drill
              </div>
              <button
                onClick={() => {
                  setQuizStarted(true);
                  setQuizFinished(false);
                  setQuizStep(0);
                  setQuizScore(0);
                }}
                className="px-6 py-2.5 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] font-semibold text-xs transition-colors duration-150"
              >
                Start Mock Drill
              </button>
            </div>
          ) : quizFinished ? (
            <div className="text-center py-6 space-y-3">
              <div className="text-3xl font-bold text-[#1E3A8A] font-mono">
                {quizScore} / {quizQuestions.length}
              </div>
              <p className="font-mono text-xs text-[#4B5563]">
                Accuracy: {Math.round((quizScore / quizQuestions.length) * 100)}%
              </p>
              <button
                onClick={() => setQuizStarted(false)}
                className="px-5 py-2 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] hover:border-[#9CA3AF] text-xs font-semibold text-[#111827]"
              >
                Finish Review
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="font-mono text-xs text-[#1E3A8A] font-bold">
                Question {quizStep + 1}/{quizQuestions.length} · {quizQuestions[quizStep].courseCode}
              </div>
              <div className="font-semibold text-sm text-[#111827]">{quizQuestions[quizStep].question}</div>
              <div className="space-y-2">
                {quizQuestions[quizStep].options.map((opt, idx) => (
                  <button
                    key={idx}
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
                    className="w-full text-left p-3 rounded-md bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#1E3A8A] text-xs text-[#111827] transition-colors duration-150"
                  >
                    <strong className="font-mono text-[#1E3A8A] mr-2">
                      {['A', 'B', 'C', 'D'][idx]}.
                    </strong>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'EXAMS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 aura-glass rounded-lg p-4 space-y-2.5 h-fit">
            <div className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#1E3A8A] flex items-center gap-1.5">
              <BookMarked className="w-4 h-4" /> Log Exam, Quiz or Task
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={examCourse}
                onChange={(e) => setExamCourse(e.target.value)}
                placeholder="Course Code"
                className="px-3 py-2 rounded-md aura-input text-xs font-mono font-bold uppercase"
              />
              <select
                value={examType}
                onChange={(e) => setExamType(e.target.value as 'EXAM' | 'ASSIGNMENT' | 'QUIZ')}
                className="px-3 py-2 rounded-md aura-input text-xs font-semibold"
              >
                <option value="EXAM">EXAM</option>
                <option value="QUIZ">QUIZ</option>
                <option value="ASSIGNMENT">ASSIGNMENT</option>
              </select>
            </div>
            <input
              value={examTitle}
              onChange={(e) => setExamTitle(e.target.value)}
              placeholder="Title (e.g. Final Paper 1 / Lab Report)"
              className="w-full px-3 py-2 rounded-md aura-input text-xs"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="px-3 py-2 rounded-md aura-input text-xs font-mono"
              />
              <input
                value={examVenue}
                onChange={(e) => setExamVenue(e.target.value)}
                placeholder="Exam Hall / Venue"
                className="px-3 py-2 rounded-md aura-input text-xs"
              />
            </div>
            <button
              onClick={addAssessment}
              className="w-full py-2 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold transition-colors duration-150"
            >
              Add Assessment
            </button>
          </div>

          <div className="lg:col-span-7 bg-[#FFFFFF] border border-[#E5E7EB] rounded-lg divide-y divide-[#E5E7EB]">
            {vault.assessments.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#6B7280]">No assessments logged.</div>
            ) : (
              vault.assessments.map((a) => {
                const daysLeft = Math.ceil((a.dueEpochMillis - Date.now()) / 86_400_000);
                return (
                  <div
                    key={a.id}
                    className="p-3.5 flex items-center justify-between gap-3 hover:bg-[#F9FAFB] transition-colors duration-150"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-[#F3F4F6] border border-[#E5E7EB] font-mono text-[10px] font-bold text-[#111827]">
                          {a.courseCode} · {a.type}
                        </span>
                        <span className="font-mono text-[11px] font-semibold text-[#1E3A8A]">
                          {daysLeft >= 0 ? `T-${daysLeft}d` : 'Past'}
                        </span>
                      </div>
                      <div
                        className={`font-semibold text-sm mt-1 ${
                          a.status === 'COMPLETED' ? 'line-through text-[#9CA3AF]' : 'text-[#111827]'
                        }`}
                      >
                        {a.title}
                      </div>
                      {a.examVenue && <div className="text-xs text-[#6B7280]">{a.examVenue}</div>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() =>
                          onUpdateVault((prev) => ({
                            ...prev,
                            assessments: prev.assessments.map((item) =>
                              item.id === a.id
                                ? {
                                    ...item,
                                    status: item.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED'
                                  }
                                : item
                            )
                          }))
                        }
                        className={`p-2 rounded-md border transition-colors duration-150 ${
                          a.status === 'COMPLETED'
                            ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]'
                            : 'bg-[#FFFFFF] border-[#E5E7EB] text-[#6B7280] hover:border-[#9CA3AF]'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() =>
                          onUpdateVault((prev) => ({
                            ...prev,
                            assessments: prev.assessments.filter((item) => item.id !== a.id)
                          }))
                        }
                        className="p-2 rounded-md border border-[#E5E7EB] bg-[#FFFFFF] hover:border-[#FECACA] hover:bg-[#FEF2F2] text-[#6B7280] hover:text-[#DC2626] transition-colors duration-150"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {subTab === 'SLIDE_PARSER' && (
        <div className="aura-glass rounded-lg p-4 space-y-3">
          <div className="font-mono text-[11px] font-bold text-[#1E3A8A] uppercase tracking-wider">
            Local Slide &amp; Outline Parser
          </div>
          <p className="text-xs text-[#6B7280]">
            Paste lecture outline text or upload a <code>.txt</code> / <code>.md</code> file. Lines formatted as{' '}
            <code>Term: Definition</code> convert into SM-2 Flashcards and key points save to your Notes.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={slideCourse}
              onChange={(e) => setSlideCourse(e.target.value)}
              placeholder="Course Code"
              className="px-3 py-2 rounded-md aura-input text-xs font-mono font-bold uppercase w-36"
            />
            <label className="px-3 py-2 rounded-md bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#1E3A8A] text-[#1E3A8A] text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 transition-colors duration-150">
              <Upload className="w-3.5 h-3.5" /> Load .txt / .md
              <input type="file" accept=".txt,.md,.csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          <textarea
            rows={6}
            value={rawSlideText}
            onChange={(e) => setRawSlideText(e.target.value)}
            placeholder={
              'Paste lecture text here...\nExample:\nDeadlock: A state where processes wait indefinitely for resources held by each other.'
            }
            className="w-full px-3 py-2.5 rounded-md aura-input text-xs"
          />

          <button
            onClick={extractNotesAndCardsLocally}
            className="w-full py-2.5 rounded-md bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold transition-colors duration-150"
          >
            Extract Note &amp; SM-2 Flashcards
          </button>

          {extractSummaryMsg && (
            <div className="p-3 rounded-md bg-[#ECFDF5] border border-[#A7F3D0] text-xs font-medium text-[#065F46]">
              {extractSummaryMsg}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
