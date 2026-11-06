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

  // Notes state
  const [noteCourse, setNoteCourse] = useState(vault.courses[0]?.code || 'CS301');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteCategory, setNoteCategory] = useState('Lecture');
  const [noteContent, setNoteContent] = useState('');

  // Flashcards state
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [newCardCourse, setNewCardCourse] = useState(vault.courses[0]?.code || 'CS301');
  const [newCardQ, setNewCardQ] = useState('');
  const [newCardA, setNewCardA] = useState('');

  // Exam Simulator state
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizStep, setQuizStep] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  // Assessments / Exams state
  const [examTitle, setExamTitle] = useState('');
  const [examCourse, setExamCourse] = useState(vault.courses[0]?.code || 'CS301');
  const [examType, setExamType] = useState<'EXAM' | 'ASSIGNMENT' | 'QUIZ'>('EXAM');
  const [examDate, setExamDate] = useState('');
  const [examVenue, setExamVenue] = useState('');

  // $0 Client-Side Slide / Text Extractor state
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

  // Genuine SuperMemo-2 (SM-2) review calculation ($0 offline algorithm)
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

  /**
   * 100% Client-Side Heuristic Extractor ($0 API Cost — never calls Gemini or any external server).
   * Parses "Term: Definition" / "Term - Definition" / "Q: ... A: ..." into SM-2 Flashcards
   * and compiles key bullet points & formulas into a structured Study Note!
   */
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
      `Extracted 1 structured Study Note + ${extractedCards.length} SM-2 Flashcards locally on your browser ($0 API cost)!`
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

  return (
    <div className="space-y-4">
      {/* Sub-navigation */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {(
          [
            ['NOTES', '📝 Notes Vault'],
            ['FLASHCARDS', `🃏 SM-2 Cards (${vault.flashcards.length})`],
            ['QUIZ_SIM', '🎓 Exam Simulator'],
            ['EXAMS', `📅 Exams/Tasks (${vault.assessments.length})`],
            ['SLIDE_PARSER', '⚡ Slide Extractor']
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            className={`px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap border transition ${
              subTab === id
                ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                : 'aura-glass border-white/10 text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'NOTES' && (
        <div className="space-y-4">
          <div className="aura-glass rounded-3xl p-4 space-y-3 border border-sky-400/30">
            <div className="text-xs font-extrabold text-sky-300 flex items-center gap-1.5">
              <FileText className="w-4 h-4" /> ADD STUDY NOTE OR FORMULA SHEET
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={noteCourse}
                onChange={(e) => setNoteCourse(e.target.value)}
                placeholder="Course (e.g. CS301)"
                className="px-3.5 py-2.5 rounded-xl aura-input text-xs font-bold uppercase"
              />
              <select
                value={noteCategory}
                onChange={(e) => setNoteCategory(e.target.value)}
                className="px-3.5 py-2.5 rounded-xl aura-input text-xs font-semibold"
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
              className="w-full px-3.5 py-2.5 rounded-xl aura-input text-xs"
            />
            <textarea
              rows={4}
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Write lecture takeaways, proofs, or formulas..."
              className="w-full px-3.5 py-2.5 rounded-xl aura-input text-xs"
            />
            <button
              onClick={addNote}
              className="w-full py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-extrabold flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Save to Study Vault
            </button>
          </div>

          <div className="space-y-3">
            {[...vault.notes]
              .sort((a, b) => Number(b.isPinned) - Number(a.isPinned))
              .map((note) => (
                <div key={note.id} className="aura-glass rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 text-[11px] font-bold">
                        {note.courseCode}
                      </span>
                      <span className="text-[11px] text-slate-400">{note.category}</span>
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
                        className="text-[11px] text-emerald-300 font-bold px-2 py-1 rounded-lg bg-emerald-500/10"
                      >
                        + Make Card
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
                        className={`p-1.5 rounded-lg ${
                          note.isPinned ? 'text-amber-300 bg-amber-400/20' : 'text-slate-400 bg-white/5'
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
                        className="p-1.5 rounded-lg text-rose-400 bg-rose-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <h4 className="font-bold text-sm">{note.title}</h4>
                  <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                    {note.content}
                  </pre>
                </div>
              ))}
          </div>
        </div>
      )}

      {subTab === 'FLASHCARDS' && (
        <div className="space-y-4">
          {activeCard ? (
            <div className="aura-glass rounded-3xl p-6 text-center space-y-4 border border-emerald-400/35">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                  {activeCard.courseCode}
                </span>
                <span>
                  Card {(cardIndex % vault.flashcards.length) + 1} of {vault.flashcards.length} • Interval:{' '}
                  {activeCard.intervalDays}d
                </span>
                <button
                  onClick={() => {
                    onUpdateVault((prev) => ({
                      ...prev,
                      flashcards: prev.flashcards.filter((c) => c.id !== activeCard.id)
                    }));
                    setCardIndex(0);
                  }}
                  className="text-rose-400 hover:text-rose-300"
                  title="Delete card"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div
                onClick={() => setFlipped((f) => !f)}
                className="min-h-[170px] rounded-2xl bg-white/5 border border-white/10 p-6 flex flex-col items-center justify-center cursor-pointer select-none"
              >
                <span className="text-[10px] uppercase tracking-widest text-sky-300 font-bold mb-2">
                  {flipped ? 'VERIFIED ANSWER' : 'QUESTION PROMPT (TAP TO FLIP)'}
                </span>
                <p className="text-base font-bold leading-relaxed">
                  {flipped ? activeCard.answer : activeCard.question}
                </p>
              </div>

              {flipped ? (
                <div className="grid grid-cols-4 gap-2">
                  <button
                    onClick={() => rateCurrentCard(1)}
                    className="py-2.5 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-300 text-xs font-bold"
                  >
                    Again (1d)
                  </button>
                  <button
                    onClick={() => rateCurrentCard(3)}
                    className="py-2.5 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-bold"
                  >
                    Hard
                  </button>
                  <button
                    onClick={() => rateCurrentCard(4)}
                    className="py-2.5 rounded-xl bg-sky-500/20 border border-sky-400/40 text-sky-300 text-xs font-bold"
                  >
                    Good
                  </button>
                  <button
                    onClick={() => rateCurrentCard(5)}
                    className="py-2.5 rounded-xl bg-emerald-500/25 border border-emerald-400 text-emerald-200 text-xs font-extrabold"
                  >
                    Easy
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setFlipped(true)}
                  className="w-full py-2.5 rounded-xl bg-sky-500/25 border border-sky-400/50 text-sky-200 text-xs font-bold inline-flex items-center justify-center gap-1.5"
                >
                  <RotateCw className="w-3.5 h-3.5" /> Reveal Answer
                </button>
              )}
            </div>
          ) : (
            <div className="aura-glass rounded-3xl p-6 text-center text-xs text-slate-400">
              No flashcards yet. Create one below or extract cards from slides!
            </div>
          )}

          <div className="aura-glass rounded-3xl p-4 space-y-2.5">
            <div className="text-xs font-extrabold text-emerald-300 flex items-center gap-1.5">
              <Layers className="w-4 h-4" /> ADD SM-2 FLASHCARD
            </div>
            <input
              value={newCardCourse}
              onChange={(e) => setNewCardCourse(e.target.value)}
              placeholder="Course Code (e.g. CS301)"
              className="w-full px-3.5 py-2.5 rounded-xl aura-input text-xs font-bold uppercase"
            />
            <input
              value={newCardQ}
              onChange={(e) => setNewCardQ(e.target.value)}
              placeholder="Question / Front of Card"
              className="w-full px-3.5 py-2.5 rounded-xl aura-input text-xs"
            />
            <textarea
              rows={2}
              value={newCardA}
              onChange={(e) => setNewCardA(e.target.value)}
              placeholder="Verified Answer / Back of Card"
              className="w-full px-3.5 py-2.5 rounded-xl aura-input text-xs"
            />
            <button
              onClick={addCard}
              className="w-full py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-extrabold"
            >
              + Add Card to Deck
            </button>
          </div>
        </div>
      )}

      {subTab === 'QUIZ_SIM' && (
        <div className="aura-glass rounded-3xl p-5 space-y-4 border border-violet-400/35">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-violet-300 flex items-center gap-1.5">
              <Award className="w-4 h-4" /> EXAM HALL MOCK SIMULATOR
            </span>
            <span className="text-[11px] text-slate-400">Built from your Flashcard Vault</span>
          </div>

          {quizQuestions.length === 0 ? (
            <p className="text-xs text-slate-400">
              Add at least 2 flashcards in the SM-2 Cards tab to unlock instant Exam Hall Mock Quizzes!
            </p>
          ) : !quizStarted ? (
            <div className="text-center py-4 space-y-3">
              <div className="text-base font-bold">
                Ready for a {quizQuestions.length}-Question Rapid Exam Drill?
              </div>
              <button
                onClick={() => {
                  setQuizStarted(true);
                  setQuizFinished(false);
                  setQuizStep(0);
                  setQuizScore(0);
                }}
                className="px-6 py-2.5 rounded-2xl bg-emerald-500 text-slate-950 font-extrabold text-xs"
              >
                Start Mock Exam
              </button>
            </div>
          ) : quizFinished ? (
            <div className="text-center py-4 space-y-3">
              <div className="text-3xl font-extrabold text-emerald-400">
                {quizScore} / {quizQuestions.length}
              </div>
              <p className="text-xs text-slate-300">
                Accuracy: {Math.round((quizScore / quizQuestions.length) * 100)}%
              </p>
              <button
                onClick={() => setQuizStarted(false)}
                className="px-5 py-2 rounded-xl bg-white/10 text-xs font-bold"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-sky-300 font-bold">
                Question {quizStep + 1} of {quizQuestions.length} • {quizQuestions[quizStep].courseCode}
              </div>
              <div className="font-bold text-sm">{quizQuestions[quizStep].question}</div>
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
                    className="w-full text-left p-3 rounded-2xl bg-white/5 hover:bg-sky-500/20 border border-white/10 text-xs"
                  >
                    <strong className="text-emerald-300 mr-2">
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
        <div className="space-y-4">
          <div className="aura-glass rounded-3xl p-4 space-y-2.5">
            <div className="text-xs font-extrabold text-amber-300 flex items-center gap-1.5">
              <BookMarked className="w-4 h-4" /> TRACK EXAM, QUIZ OR ASSIGNMENT
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={examCourse}
                onChange={(e) => setExamCourse(e.target.value)}
                placeholder="Course Code"
                className="px-3.5 py-2.5 rounded-xl aura-input text-xs font-bold uppercase"
              />
              <select
                value={examType}
                onChange={(e) => setExamType(e.target.value as 'EXAM' | 'ASSIGNMENT' | 'QUIZ')}
                className="px-3.5 py-2.5 rounded-xl aura-input text-xs font-semibold"
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
              className="w-full px-3.5 py-2.5 rounded-xl aura-input text-xs"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="px-3.5 py-2.5 rounded-xl aura-input text-xs"
              />
              <input
                value={examVenue}
                onChange={(e) => setExamVenue(e.target.value)}
                placeholder="Exam Hall / Venue"
                className="px-3.5 py-2.5 rounded-xl aura-input text-xs"
              />
            </div>
            <button
              onClick={addAssessment}
              className="w-full py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-extrabold"
            >
              + Add Assessment
            </button>
          </div>

          <div className="space-y-2.5">
            {vault.assessments.map((a) => {
              const daysLeft = Math.ceil((a.dueEpochMillis - Date.now()) / 86_400_000);
              return (
                <div
                  key={a.id}
                  className="aura-glass rounded-2xl p-3.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 text-[10px] font-extrabold">
                        {a.courseCode} • {a.type}
                      </span>
                      <span className="text-[11px] text-emerald-300 font-mono">
                        {daysLeft >= 0 ? `In ${daysLeft}d` : 'Past'}
                      </span>
                    </div>
                    <div
                      className={`font-bold text-sm mt-1 ${
                        a.status === 'COMPLETED' ? 'line-through text-slate-500' : ''
                      }`}
                    >
                      {a.title}
                    </div>
                    {a.examVenue && <div className="text-xs text-slate-400">{a.examVenue}</div>}
                  </div>
                  <div className="flex items-center gap-1.5">
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
                      className={`p-2 rounded-xl ${
                        a.status === 'COMPLETED'
                          ? 'bg-emerald-500/25 text-emerald-300'
                          : 'bg-white/5 text-slate-400'
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
                      className="p-2 rounded-xl bg-rose-500/15 text-rose-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {subTab === 'SLIDE_PARSER' && (
        <div className="aura-glass rounded-3xl p-5 space-y-3 border border-emerald-400/35">
          <div className="text-xs font-extrabold text-emerald-300">
            ⚡ LOCAL SLIDE & LECTURE NOTE EXTRACTOR (100% BROWSER-SIDE)
          </div>
          <p className="text-xs text-slate-400">
            Paste lecture slide text or upload a <code>.txt</code> / <code>.md</code> outline. Definitions like{' '}
            <code>Concept: Explanation</code> automatically become SM-2 Flashcards and key points save to your Notes!
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={slideCourse}
              onChange={(e) => setSlideCourse(e.target.value)}
              placeholder="Course Code"
              className="px-3.5 py-2 rounded-xl aura-input text-xs font-bold uppercase w-36"
            />
            <label className="px-3.5 py-2 rounded-xl bg-sky-500/20 border border-sky-400/40 text-sky-200 text-xs font-bold cursor-pointer inline-flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Load .txt / .md File
              <input type="file" accept=".txt,.md,.csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          <textarea
            rows={6}
            value={rawSlideText}
            onChange={(e) => setRawSlideText(e.target.value)}
            placeholder={
              'Paste lecture text here...\nExample:\nDeadlock: A state where processes wait indefinitely for resources held by each other.\nMutex - Mutual exclusion lock ensuring single-thread critical section access.'
            }
            className="w-full px-3.5 py-2.5 rounded-2xl aura-input text-xs"
          />

          <button
            onClick={extractNotesAndCardsLocally}
            className="w-full py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-extrabold"
          >
            Extract Summary Note & SM-2 Flashcards
          </button>

          {extractSummaryMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-xs text-emerald-200">
              {extractSummaryMsg}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
