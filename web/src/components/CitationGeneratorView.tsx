import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  Copy,
  Download,
  FileCode,
  FileText,
  Globe,
  GraduationCap,
  Plus,
  Quote,
  Trash2
} from 'lucide-react';
import { uidGen } from '../storage';
import type { AuraLocalVault, WebCitation } from '../types';

interface Props {
  vault: AuraLocalVault;
  onUpdateVault: (updater: (prev: AuraLocalVault) => AuraLocalVault) => void;
  onNotify: (msg: string) => void;
}

type CitationStyle = 'APA' | 'MLA' | 'HARVARD' | 'CHICAGO' | 'IEEE';

export const CitationGeneratorView: React.FC<Props> = ({
  vault,
  onUpdateVault,
  onNotify
}) => {
  const [sourceType, setSourceType] = useState<'BOOK' | 'JOURNAL' | 'WEBSITE' | 'SLIDES'>('JOURNAL');
  const [activeStyle, setActiveStyle] = useState<CitationStyle>('APA');

  // Input fields
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [year, setYear] = useState('2024');
  const [publisherOrJournal, setPublisherOrJournal] = useState('');
  const [volumeOrEdition, setVolumeOrEdition] = useState('');
  const [pagesOrUrl, setPagesOrUrl] = useState('');
  const [doiOrIsbn, setDoiOrIsbn] = useState('');

  // Formatted citations preview computed dynamically
  const computedCitations = useMemo(() => {
    const cleanTitle = title.trim() || 'Untitled Academic Work';
    const cleanAuthors = authors.trim() || 'Author, A. A.';
    const cleanYear = year.trim() || 'n.d.';
    const cleanPub = publisherOrJournal.trim() || 'Academic Publisher';
    const cleanVol = volumeOrEdition.trim();
    const cleanPages = pagesOrUrl.trim();
    const cleanDoi = doiOrIsbn.trim();

    // APA 7th
    let apa = '';
    if (sourceType === 'JOURNAL') {
      apa = `${cleanAuthors} (${cleanYear}). ${cleanTitle}. ${cleanPub}${cleanVol ? `, ${cleanVol}` : ''}${cleanPages ? `, ${cleanPages}` : ''}.${cleanDoi ? ` https://doi.org/${cleanDoi}` : ''}`;
    } else if (sourceType === 'BOOK') {
      apa = `${cleanAuthors} (${cleanYear}). ${cleanTitle}${cleanVol ? ` (${cleanVol})` : ''}. ${cleanPub}.${cleanDoi ? ` ISBN: ${cleanDoi}` : ''}`;
    } else if (sourceType === 'WEBSITE') {
      apa = `${cleanAuthors} (${cleanYear}). ${cleanTitle}. ${cleanPub}.${cleanPages ? ` Retrieved from ${cleanPages}` : ''}`;
    } else {
      apa = `${cleanAuthors} (${cleanYear}). ${cleanTitle} [Lecture slides]. ${cleanPub}.${cleanPages ? ` ${cleanPages}` : ''}`;
    }

    // MLA 9th
    let mla = '';
    if (sourceType === 'JOURNAL') {
      mla = `${cleanAuthors}. "${cleanTitle}." ${cleanPub}${cleanVol ? `, vol. ${cleanVol}` : ''}${cleanYear ? `, ${cleanYear}` : ''}${cleanPages ? `, pp. ${cleanPages}` : ''}.${cleanDoi ? ` DOI: ${cleanDoi}` : ''}`;
    } else if (sourceType === 'BOOK') {
      mla = `${cleanAuthors}. ${cleanTitle}.${cleanVol ? ` ${cleanVol},` : ''} ${cleanPub}, ${cleanYear}.`;
    } else {
      mla = `${cleanAuthors}. "${cleanTitle}." ${cleanPub}, ${cleanYear}${cleanPages ? `, ${cleanPages}` : ''}.`;
    }

    // Harvard
    const harvard = `${cleanAuthors} (${cleanYear}) '${cleanTitle}', ${cleanPub}${cleanVol ? `, ${cleanVol}` : ''}${cleanPages ? `, pp. ${cleanPages}` : ''}.`;

    // Chicago 17th
    const chicago = `${cleanAuthors}. "${cleanTitle}." ${cleanPub}${cleanVol ? ` ${cleanVol}` : ''} (${cleanYear})${cleanPages ? `: ${cleanPages}` : ''}.${cleanDoi ? ` https://doi.org/${cleanDoi}` : ''}`;

    // IEEE
    const ieee = `[1] ${cleanAuthors}, "${cleanTitle}," ${cleanPub}${cleanVol ? `, vol. ${cleanVol}` : ''}${cleanPages ? `, pp. ${cleanPages}` : ''}, ${cleanYear}.`;

    // BibTeX
    const firstAuthorLastName = cleanAuthors.split(',')[0].split(' ').pop()?.toLowerCase() || 'cite';
    const bibKey = `${firstAuthorLastName}${cleanYear}${cleanTitle.split(' ')[0].toLowerCase()}`;
    const bibType = sourceType === 'BOOK' ? 'book' : sourceType === 'JOURNAL' ? 'article' : 'misc';
    const bibtex = `@${bibType}{${bibKey},\n  author = {${cleanAuthors}},\n  title = {${cleanTitle}},\n  year = {${cleanYear}},\n  ${sourceType === 'BOOK' ? 'publisher' : 'journal'} = {${cleanPub}},\n  ${cleanVol ? `volume = {${cleanVol}},\n  ` : ''}${cleanPages ? `pages = {${cleanPages}},\n  ` : ''}${cleanDoi ? `doi = {${cleanDoi}}\n` : ''}}`;

    return { apa, mla, harvard, chicago, ieee, bibtex };
  }, [sourceType, title, authors, year, publisherOrJournal, volumeOrEdition, pagesOrUrl, doiOrIsbn]);

  const activeFormattedText = useMemo(() => {
    switch (activeStyle) {
      case 'MLA':
        return computedCitations.mla;
      case 'HARVARD':
        return computedCitations.harvard;
      case 'CHICAGO':
        return computedCitations.chicago;
      case 'IEEE':
        return computedCitations.ieee;
      default:
        return computedCitations.apa;
    }
  }, [activeStyle, computedCitations]);

  // Copy active citation
  const handleCopyCitation = () => {
    navigator.clipboard.writeText(activeFormattedText);
    onNotify(`Copied ${activeStyle} citation to clipboard!`);
  };

  // Copy BibTeX
  const handleCopyBibtex = () => {
    navigator.clipboard.writeText(computedCitations.bibtex);
    onNotify('Copied BibTeX citation to clipboard!');
  };

  // Save to Bibliography Vault
  const handleSaveToVault = () => {
    if (!title.trim()) {
      onNotify('Please enter a source title.');
      return;
    }
    const newCit: WebCitation = {
      id: uidGen('cit'),
      sourceType,
      title: title.trim(),
      authors: authors.trim() || 'Unknown Author',
      year: year.trim() || '2024',
      publicationOrPublisher: publisherOrJournal.trim(),
      volumeOrEdition: volumeOrEdition.trim(),
      pagesOrUrl: pagesOrUrl.trim(),
      doiOrIsbn: doiOrIsbn.trim(),
      formattedApa: computedCitations.apa,
      formattedMla: computedCitations.mla,
      formattedHarvard: computedCitations.harvard,
      formattedChicago: computedCitations.chicago,
      formattedIeee: computedCitations.ieee,
      bibtexCode: computedCitations.bibtex,
      createdAt: Date.now()
    };
    onUpdateVault((prev) => ({
      ...prev,
      citations: [newCit, ...(prev.citations || [])]
    }));
    onNotify('Saved reference to your Academic Bibliography Vault!');
  };

  // Delete citation
  const handleDeleteCitation = (id: string) => {
    onUpdateVault((prev) => ({
      ...prev,
      citations: (prev.citations || []).filter((c) => c.id !== id)
    }));
    onNotify('Removed citation.');
  };

  // Export full bibliography
  const handleExportAllBibtex = () => {
    const list = vault.citations || [];
    if (list.length === 0) return;
    const bibStr = list.map((c) => c.bibtexCode).join('\n\n');
    navigator.clipboard.writeText(bibStr);
    onNotify(`Exported ${list.length} citations as BibTeX to clipboard!`);
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="aura-hero-card rounded-3xl p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-sky-500/20 text-sky-300 flex items-center justify-center border border-sky-400/30 shrink-0">
            <Quote className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold text-white">
                Academic Citation &amp; Bibliography Generator
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-400/30 text-[10px] font-extrabold text-sky-300 uppercase tracking-wider">
                APA • MLA • IEEE • Harvard
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Format peer-reviewed journal papers, textbooks, web sources &amp; lecture slides with instant BibTeX export.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Form Inputs */}
        <div className="lg:col-span-7 space-y-4">
          <div className="aura-glass rounded-3xl p-4 sm:p-5 space-y-4">
            {/* Source Type Selector */}
            <div>
              <label className="text-xs font-bold text-slate-300 uppercase">Source Type</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1.5">
                {[
                  { id: 'JOURNAL', label: 'Journal Paper', icon: <FileText className="w-3.5 h-3.5" /> },
                  { id: 'BOOK', label: 'Textbook / Book', icon: <BookOpen className="w-3.5 h-3.5" /> },
                  { id: 'WEBSITE', label: 'Website / Doc', icon: <Globe className="w-3.5 h-3.5" /> },
                  { id: 'SLIDES', label: 'Lecture Slides', icon: <GraduationCap className="w-3.5 h-3.5" /> }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSourceType(item.id as any)}
                    className={`p-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition border ${
                      sourceType === item.id
                        ? 'bg-sky-500/20 border-sky-400 text-sky-300 shadow-sm'
                        : 'aura-subtle-surface text-slate-400 hover:text-white'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Inputs Grid */}
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-300 uppercase">Title of Work</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    sourceType === 'JOURNAL'
                      ? 'e.g. Attention Is All You Need'
                      : sourceType === 'BOOK'
                      ? 'e.g. Deep Learning'
                      : 'e.g. Distributed Consensus in Distributed Systems'
                  }
                  className="aura-input w-full px-4 py-2.5 rounded-2xl text-xs sm:text-sm mt-1"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-300 uppercase">Authors (Last, First M.)</label>
                  <input
                    type="text"
                    value={authors}
                    onChange={(e) => setAuthors(e.target.value)}
                    placeholder="e.g. Vaswani, A., Shazeer, N., &amp; Parmar, N."
                    className="aura-input w-full px-3.5 py-2 rounded-xl mt-1"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 uppercase">Year of Publication</label>
                  <input
                    type="text"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="2024"
                    className="aura-input w-full px-3.5 py-2 rounded-xl mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-300 uppercase">
                    {sourceType === 'JOURNAL'
                      ? 'Journal / Conference'
                      : sourceType === 'BOOK'
                      ? 'Publisher'
                      : sourceType === 'WEBSITE'
                      ? 'Website Name'
                      : 'University / Lecturer'}
                  </label>
                  <input
                    type="text"
                    value={publisherOrJournal}
                    onChange={(e) => setPublisherOrJournal(e.target.value)}
                    placeholder={
                      sourceType === 'JOURNAL'
                        ? 'e.g. NeurIPS Proceedings'
                        : sourceType === 'BOOK'
                        ? 'e.g. MIT Press'
                        : 'e.g. Stanford CS224N'
                    }
                    className="aura-input w-full px-3.5 py-2 rounded-xl mt-1"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 uppercase">
                    {sourceType === 'BOOK' ? 'Edition (e.g. 3rd ed.)' : 'Volume / Issue'}
                  </label>
                  <input
                    type="text"
                    value={volumeOrEdition}
                    onChange={(e) => setVolumeOrEdition(e.target.value)}
                    placeholder="e.g. Vol. 30, Issue 2"
                    className="aura-input w-full px-3.5 py-2 rounded-xl mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-300 uppercase">
                    {sourceType === 'WEBSITE' ? 'Full URL' : 'Page Range (pp. 45–60)'}
                  </label>
                  <input
                    type="text"
                    value={pagesOrUrl}
                    onChange={(e) => setPagesOrUrl(e.target.value)}
                    placeholder="pp. 120–145 or https://..."
                    className="aura-input w-full px-3.5 py-2 rounded-xl mt-1"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 uppercase">DOI or ISBN</label>
                  <input
                    type="text"
                    value={doiOrIsbn}
                    onChange={(e) => setDoiOrIsbn(e.target.value)}
                    placeholder="10.1145/3372278.3390670"
                    className="aura-input w-full px-3.5 py-2 rounded-xl mt-1"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={handleSaveToVault}
                className="aura-pill-btn px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-md transition"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Save to Bibliography
              </button>
            </div>
          </div>
        </div>

        {/* Live Formatted Preview & Style Tabs */}
        <div className="lg:col-span-5 space-y-4">
          <div className="aura-glass rounded-3xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <span className="text-xs font-extrabold text-white uppercase tracking-wider">
                Style Preview
              </span>
              <div className="flex items-center gap-1">
                {(['APA', 'MLA', 'HARVARD', 'CHICAGO', 'IEEE'] as CitationStyle[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setActiveStyle(st)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-extrabold transition ${
                      activeStyle === st
                        ? 'bg-sky-400 text-slate-950'
                        : 'aura-subtle-surface text-slate-300 hover:text-white'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Formatted Citation Block */}
            <div className="p-3.5 rounded-2xl bg-black/40 border border-sky-400/30 space-y-2">
              <div className="text-[10px] font-bold text-sky-400 uppercase">
                {activeStyle} 7th/9th Format
              </div>
              <p className="text-xs sm:text-sm text-slate-100 font-serif leading-relaxed italic select-all">
                {activeFormattedText}
              </p>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={handleCopyCitation}
                  className="px-3 py-1.5 rounded-xl aura-subtle-surface text-xs font-bold text-sky-300 hover:border-sky-400/50 flex items-center gap-1.5 transition"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy Citation
                </button>
                <button
                  type="button"
                  onClick={handleCopyBibtex}
                  className="px-3 py-1.5 rounded-xl aura-subtle-surface text-xs font-bold text-emerald-300 hover:border-emerald-400/50 flex items-center gap-1.5 transition"
                >
                  <FileCode className="w-3.5 h-3.5" />
                  Copy BibTeX
                </button>
              </div>
            </div>

            {/* BibTeX Code Preview */}
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Raw BibTeX</div>
              <pre className="p-3 rounded-2xl bg-slate-950 border border-white/10 text-[11px] font-mono text-emerald-300 overflow-x-auto select-all">
                {computedCitations.bibtex}
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* Saved Bibliography Section */}
      <div className="aura-glass rounded-3xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-white/10 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-extrabold text-white">
              My Academic Bibliography ({vault.citations?.length || 0})
            </h3>
            <span className="text-xs text-slate-400">Stored locally in your vault</span>
          </div>

          {(vault.citations?.length || 0) > 0 && (
            <button
              type="button"
              onClick={handleExportAllBibtex}
              className="aura-pill-btn px-3 py-1.5 aura-subtle-surface text-xs font-bold text-slate-300 hover:text-white flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              Export All BibTeX
            </button>
          )}
        </div>

        {(!vault.citations || vault.citations.length === 0) ? (
          <div className="text-center py-6 text-xs text-slate-400">
            No citations saved yet. Generate and save citations above to build your paper bibliography.
          </div>
        ) : (
          <div className="space-y-3">
            {vault.citations.map((c) => (
              <div
                key={c.id}
                className="p-3.5 rounded-2xl aura-subtle-surface flex items-start justify-between gap-3"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 text-[10px] font-bold uppercase">
                      {c.sourceType}
                    </span>
                    <span className="text-xs text-slate-400 font-semibold">{c.year}</span>
                  </div>
                  <p className="text-xs sm:text-sm font-serif italic text-slate-100 select-all">
                    {c.formattedApa}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(c.formattedApa);
                      onNotify('Copied APA citation!');
                    }}
                    title="Copy APA"
                    className="w-8 h-8 rounded-xl aura-subtle-surface flex items-center justify-center text-slate-300 hover:text-white"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(c.bibtexCode);
                      onNotify('Copied BibTeX!');
                    }}
                    title="Copy BibTeX"
                    className="w-8 h-8 rounded-xl aura-subtle-surface flex items-center justify-center text-emerald-400 hover:text-emerald-300"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCitation(c.id)}
                    title="Delete"
                    className="w-8 h-8 rounded-xl aura-subtle-surface flex items-center justify-center text-rose-400 hover:text-rose-300"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
