import React, { useMemo, useState } from 'react';
import {
  BookOpen,
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

  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [year, setYear] = useState('2024');
  const [publisherOrJournal, setPublisherOrJournal] = useState('');
  const [volumeOrEdition, setVolumeOrEdition] = useState('');
  const [pagesOrUrl, setPagesOrUrl] = useState('');
  const [doiOrIsbn, setDoiOrIsbn] = useState('');

  const computedCitations = useMemo(() => {
    const cleanTitle = title.trim() || 'Untitled Academic Work';
    const cleanAuthors = authors.trim() || 'Author, A. A.';
    const cleanYear = year.trim() || 'n.d.';
    const cleanPub = publisherOrJournal.trim() || 'Academic Publisher';
    const cleanVol = volumeOrEdition.trim();
    const cleanPages = pagesOrUrl.trim();
    const cleanDoi = doiOrIsbn.trim();

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

    let mla = '';
    if (sourceType === 'JOURNAL') {
      mla = `${cleanAuthors}. "${cleanTitle}." ${cleanPub}${cleanVol ? `, vol. ${cleanVol}` : ''}${cleanYear ? `, ${cleanYear}` : ''}${cleanPages ? `, pp. ${cleanPages}` : ''}.${cleanDoi ? ` DOI: ${cleanDoi}` : ''}`;
    } else if (sourceType === 'BOOK') {
      mla = `${cleanAuthors}. ${cleanTitle}.${cleanVol ? ` ${cleanVol},` : ''} ${cleanPub}, ${cleanYear}.`;
    } else {
      mla = `${cleanAuthors}. "${cleanTitle}." ${cleanPub}, ${cleanYear}${cleanPages ? `, ${cleanPages}` : ''}.`;
    }

    const harvard = `${cleanAuthors} (${cleanYear}) '${cleanTitle}', ${cleanPub}${cleanVol ? `, ${cleanVol}` : ''}${cleanPages ? `, pp. ${cleanPages}` : ''}.`;
    const chicago = `${cleanAuthors}. "${cleanTitle}." ${cleanPub}${cleanVol ? ` ${cleanVol}` : ''} (${cleanYear})${cleanPages ? `: ${cleanPages}` : ''}.${cleanDoi ? ` https://doi.org/${cleanDoi}` : ''}`;
    const ieee = `[1] ${cleanAuthors}, "${cleanTitle}," ${cleanPub}${cleanVol ? `, vol. ${cleanVol}` : ''}${cleanPages ? `, pp. ${cleanPages}` : ''}, ${cleanYear}.`;

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

  const handleCopyCitation = () => {
    navigator.clipboard.writeText(activeFormattedText);
    onNotify(`Copied ${activeStyle} citation to clipboard.`);
  };

  const handleCopyBibtex = () => {
    navigator.clipboard.writeText(computedCitations.bibtex);
    onNotify('Copied BibTeX entry to clipboard.');
  };

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
    onNotify('Saved reference to Bibliography.');
  };

  const handleDeleteCitation = (id: string) => {
    onUpdateVault((prev) => ({
      ...prev,
      citations: (prev.citations || []).filter((c) => c.id !== id)
    }));
    onNotify('Removed citation.');
  };

  const handleExportAllBibtex = () => {
    const list = vault.citations || [];
    if (list.length === 0) return;
    const bibStr = list.map((c) => c.bibtexCode).join('\n\n');
    navigator.clipboard.writeText(bibStr);
    onNotify(`Exported ${list.length} citations as BibTeX.`);
  };

  return (
    <div className="space-y-4">
      {/* Editorial Header */}
      <div className="aura-hero-card rounded-xl p-4 sm:p-5 flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-lg bg-[#EEF2FA] text-[#1D3B8B] flex items-center justify-center border border-[#C7D4F0] shrink-0">
          <Quote className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-serif text-xl sm:text-2xl text-[#141923]">
              Citation &amp; Bibliography Engine
            </h2>
            <span className="px-2 py-0.5 rounded bg-[#EFECE6] border border-[#E4E0D8] font-mono text-[10px] font-semibold text-[#4B5563] uppercase">
              APA · MLA · IEEE · Harvard · BibTeX
            </span>
          </div>
          <p className="text-xs text-[#646B78] mt-0.5">
            Format scholarly references and export clean BibTeX blocks for papers and theses.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Form Inputs */}
        <div className="lg:col-span-7 aura-glass rounded-lg p-4 space-y-4">
          <div>
            <label className="font-mono text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
              Source Classification
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1.5">
              {[
                { id: 'JOURNAL', label: 'Journal', icon: <FileText className="w-3.5 h-3.5" /> },
                { id: 'BOOK', label: 'Textbook', icon: <BookOpen className="w-3.5 h-3.5" /> },
                { id: 'WEBSITE', label: 'Web Source', icon: <Globe className="w-3.5 h-3.5" /> },
                { id: 'SLIDES', label: 'Slides', icon: <GraduationCap className="w-3.5 h-3.5" /> }
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSourceType(item.id as any)}
                  className={`p-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors duration-150 ${
                    sourceType === item.id
                      ? 'bg-[#EFF6FF] border-[#1E3A8A] text-[#1E3A8A]'
                      : 'bg-[#FFFFFF] border-[#E5E7EB] text-[#6B7280] hover:border-[#9CA3AF] hover:text-[#111827]'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="font-mono text-[10px] font-bold text-[#6B7280] uppercase">Title of Work</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  sourceType === 'JOURNAL'
                    ? 'e.g. Attention Is All You Need'
                    : sourceType === 'BOOK'
                    ? 'e.g. Introduction to Algorithms'
                    : 'e.g. Distributed Consensus Notes'
                }
                className="aura-input w-full px-3 py-2 rounded-md text-xs mt-1"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-mono text-[10px] font-bold text-[#6B7280] uppercase">Authors (Last, First M.)</label>
                <input
                  type="text"
                  value={authors}
                  onChange={(e) => setAuthors(e.target.value)}
                  placeholder="Vaswani, A., Shazeer, N."
                  className="aura-input w-full px-3 py-2 rounded-md mt-1"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] font-bold text-[#6B7280] uppercase">Year</label>
                <input
                  type="text"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2024"
                  className="aura-input w-full px-3 py-2 rounded-md font-mono mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-mono text-[10px] font-bold text-[#6B7280] uppercase">
                  {sourceType === 'JOURNAL'
                    ? 'Journal / Conference'
                    : sourceType === 'BOOK'
                    ? 'Publisher'
                    : sourceType === 'WEBSITE'
                    ? 'Website Name'
                    : 'Institution / Lecturer'}
                </label>
                <input
                  type="text"
                  value={publisherOrJournal}
                  onChange={(e) => setPublisherOrJournal(e.target.value)}
                  placeholder={sourceType === 'BOOK' ? 'MIT Press' : 'NeurIPS Proceedings'}
                  className="aura-input w-full px-3 py-2 rounded-md mt-1"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] font-bold text-[#6B7280] uppercase">
                  {sourceType === 'BOOK' ? 'Edition' : 'Volume / Issue'}
                </label>
                <input
                  type="text"
                  value={volumeOrEdition}
                  onChange={(e) => setVolumeOrEdition(e.target.value)}
                  placeholder="Vol. 30, No. 2"
                  className="aura-input w-full px-3 py-2 rounded-md mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-mono text-[10px] font-bold text-[#6B7280] uppercase">
                  {sourceType === 'WEBSITE' ? 'Full URL' : 'Page Range'}
                </label>
                <input
                  type="text"
                  value={pagesOrUrl}
                  onChange={(e) => setPagesOrUrl(e.target.value)}
                  placeholder="pp. 120–145 or https://..."
                  className="aura-input w-full px-3 py-2 rounded-md mt-1"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] font-bold text-[#6B7280] uppercase">DOI or ISBN</label>
                <input
                  type="text"
                  value={doiOrIsbn}
                  onChange={(e) => setDoiOrIsbn(e.target.value)}
                  placeholder="10.1145/3372278"
                  className="aura-input w-full px-3 py-2 rounded-md font-mono mt-1"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end pt-2 border-t border-[#E5E7EB]">
            <button
              type="button"
              onClick={handleSaveToVault}
              className="aura-pill-btn px-4 py-2 bg-[#1E3A8A] hover:bg-[#1E40AF] text-[#FFFFFF] text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Save to Bibliography
            </button>
          </div>
        </div>

        {/* Live Formatted Preview */}
        <div className="lg:col-span-5 aura-glass rounded-lg p-4 space-y-4 h-fit">
          <div className="flex items-center justify-between pb-2 border-b border-[#E5E7EB]">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#111827]">
              Preview
            </span>
            <div className="flex items-center justify-end gap-1 flex-wrap">
              {(['APA', 'MLA', 'HARVARD', 'CHICAGO', 'IEEE'] as CitationStyle[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setActiveStyle(st)}
                  className={`px-2 py-1 rounded font-mono text-[10px] font-bold transition-colors duration-150 ${
                    activeStyle === st
                      ? 'bg-[#1E3A8A] text-[#FFFFFF]'
                      : 'bg-[#F3F4F6] text-[#4B5563] hover:text-[#111827]'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3.5 rounded-md bg-[#F9FAFB] border border-[#E5E7EB] space-y-2.5">
            <div className="font-mono text-[10px] font-bold text-[#1E3A8A] uppercase">
              {activeStyle} Format
            </div>
            <p className="text-xs sm:text-sm text-[#111827] font-serif leading-relaxed italic select-all">
              {activeFormattedText}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
              <button
                type="button"
                onClick={handleCopyCitation}
                className="px-3 py-1.5 rounded-md bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#1E3A8A] text-xs font-semibold text-[#1E3A8A] flex items-center gap-1.5 transition-colors duration-150"
              >
                <Copy className="w-3.5 h-3.5" /> Copy
              </button>
              <button
                type="button"
                onClick={handleCopyBibtex}
                className="px-3 py-1.5 rounded-md bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#9CA3AF] text-xs font-semibold text-[#111827] flex items-center gap-1.5 transition-colors duration-150"
              >
                <FileCode className="w-3.5 h-3.5" /> BibTeX
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <div className="font-mono text-[10px] font-bold text-[#6B7280] uppercase">BibTeX Output</div>
            <pre className="p-3 rounded-md bg-[#F9FAFB] border border-[#E5E7EB] text-[11px] font-mono text-[#111827] overflow-x-auto select-all">
              {computedCitations.bibtex}
            </pre>
          </div>
        </div>
      </div>

      {/* Saved Bibliography Table */}
      <div className="aura-glass rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between pb-2.5 border-b border-[#E5E7EB] flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[#111827]">
              Saved Bibliography
            </h3>
            <span className="font-mono text-xs text-[#6B7280]">({vault.citations?.length || 0})</span>
          </div>

          {(vault.citations?.length || 0) > 0 && (
            <button
              type="button"
              onClick={handleExportAllBibtex}
              className="px-3 py-1.5 rounded-md bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#1E3A8A] text-xs font-semibold text-[#1E3A8A] flex items-center gap-1.5 transition-colors duration-150"
            >
              <Download className="w-3.5 h-3.5" /> Export All BibTeX
            </button>
          )}
        </div>

        {!vault.citations || vault.citations.length === 0 ? (
          <div className="text-center py-6 text-xs text-[#6B7280]">
            No citations saved yet.
          </div>
        ) : (
          <div className="border border-[#E5E7EB] rounded-md divide-y divide-[#E5E7EB]">
            {vault.citations.map((c) => (
              <div
                key={c.id}
                className="p-3.5 flex items-start justify-between gap-3 hover:bg-[#F9FAFB] transition-colors duration-150"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-mono">
                    <span className="px-2 py-0.5 rounded bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E3A8A] text-[10px] font-bold uppercase">
                      {c.sourceType}
                    </span>
                    <span className="text-xs text-[#6B7280] font-semibold">{c.year}</span>
                  </div>
                  <p className="text-xs sm:text-sm font-serif italic text-[#111827] select-all">
                    {c.formattedApa}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(c.formattedApa);
                      onNotify('Copied APA citation.');
                    }}
                    title="Copy APA"
                    className="w-8 h-8 rounded-md bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#9CA3AF] flex items-center justify-center text-[#4B5563] hover:text-[#111827] transition-colors duration-150"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(c.bibtexCode);
                      onNotify('Copied BibTeX.');
                    }}
                    title="Copy BibTeX"
                    className="w-8 h-8 rounded-md bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#1E3A8A] flex items-center justify-center text-[#1E3A8A] transition-colors duration-150"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCitation(c.id)}
                    title="Delete"
                    className="w-8 h-8 rounded-md bg-[#FFFFFF] border border-[#E5E7EB] hover:border-[#FECACA] hover:bg-[#FEF2F2] flex items-center justify-center text-[#6B7280] hover:text-[#DC2626] transition-colors duration-150"
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
