import React, { useEffect, useState } from "react";
import { videoAPI } from "../../api/api";
import toast from "react-hot-toast";
import { Check, ChevronDown, Film, ImagePlay, Loader, RefreshCw, X } from "lucide-react";

const COUNT_OPTIONS = [4, 6, 8, 10, 12];

/**
 * ThumbnailPicker
 * Modal that generates N thumbnail candidates from evenly-spaced scenes of a
 * video and lets the admin pick one to set as the official thumbnail.
 *
 * Props
 *   videoId            — id of the video
 *   videoTitle         — shown in the modal header
 *   currentThumb       — current thumbnailPath (unused visually but passed through)
 *   seriesEpisodeCount — when <= 1 the series cover syncs automatically
 *   onApplied(path)    — called with the new thumbnailPath after a successful apply
 *   onClose()          — close the modal
 */
function ThumbnailPicker({
    videoId,
    videoTitle,
    currentThumb,
    seriesEpisodeCount = 1,
    onApplied,
    onClose,
}) {
    const [count,      setCount]      = useState(8);
    const [generating, setGenerating] = useState(false);
    const [applying,   setApplying]   = useState(false);
    const [thumbnails, setThumbnails] = useState([]);   // [{ filename, url, ts }]
    const [selected,   setSelected]   = useState(null); // filename string
    const [syncSeries, setSyncSeries] = useState(seriesEpisodeCount <= 1);
    const [showCount,  setShowCount]  = useState(false);

    const isSingleEpisode = seriesEpisodeCount <= 1;

    // Lock body scroll while open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    // Close on Escape
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape' && !applying) onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose, applying]);

    // ── Generate candidates ───────────────────────────────────────────────────
    const handleGenerate = async () => {
        setGenerating(true);
        setThumbnails([]);
        setSelected(null);
        try {
            const res = await videoAPI.generateThumbnails(videoId, count);
            if (!res.success || !res.thumbnails?.length) {
                toast.error('No thumbnails could be generated');
                return;
            }
            setThumbnails(res.thumbnails);
        } catch (err) {
            toast.error(err?.response?.data?.error || 'Failed to generate thumbnails');
        } finally {
            setGenerating(false);
        }
    };

    // ── Apply selected thumbnail ──────────────────────────────────────────────
    const handleApply = async () => {
        if (!selected) { toast.error('Pick a thumbnail first'); return; }
        setApplying(true);
        try {
            const res = await videoAPI.applyThumbnail(videoId, selected, syncSeries);
            if (!res.success) throw new Error('Apply failed');
            toast.success('Thumbnail updated!');
            onApplied?.(res.thumbnailPath);
            onClose();
        } catch (err) {
            toast.error(err?.response?.data?.error || 'Failed to apply thumbnail');
        } finally {
            setApplying(false);
        }
    };

    const formatTs = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    const selectedThumb = thumbnails.find(t => t.filename === selected);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget && !applying) onClose(); }}
        >
            <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">

                {/* ── Header ─────────────────────────────────────────────── */}
                <div className="flex-none flex items-center justify-between px-5 py-4 border-b border-slate-800">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-red-500/20 rounded-lg shrink-0">
                            <ImagePlay className="w-5 h-5 text-red-400" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-base sm:text-lg font-bold text-white leading-tight">
                                Regenerate Thumbnail
                            </h2>
                            <p className="text-xs text-slate-400 truncate mt-0.5">{videoTitle}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={applying}
                        className="shrink-0 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition disabled:opacity-40"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* ── Controls bar ───────────────────────────────────────── */}
                <div className="flex-none flex flex-wrap items-center gap-3 px-5 py-3 border-b border-slate-800 bg-slate-950/40">

                    {/* Scene count picker */}
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-400 text-xs shrink-0">Scenes:</span>
                        <div className="relative">
                            <button
                                onClick={() => setShowCount(v => !v)}
                                disabled={generating || applying}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition disabled:opacity-50 text-sm"
                            >
                                <span className="font-semibold text-white w-4 text-center">{count}</span>
                                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showCount ? 'rotate-180' : ''}`} />
                            </button>
                            {showCount && (
                                <div className="absolute top-full mt-1 left-0 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-20 min-w-36">
                                    {COUNT_OPTIONS.map(n => (
                                        <button
                                            key={n}
                                            onClick={() => { setCount(n); setShowCount(false); }}
                                            className={`w-full px-4 py-2 text-sm text-left transition hover:bg-slate-700 ${
                                                count === n ? 'text-red-400 font-semibold' : 'text-slate-200'
                                            }`}
                                        >
                                            {n} scenes
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Generate / Regenerate */}
                    <button
                        onClick={handleGenerate}
                        disabled={generating || applying}
                        className="flex items-center gap-2 px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                    >
                        {generating
                            ? <><Loader className="w-4 h-4 animate-spin" /> Generating…</>
                            : <><RefreshCw className="w-4 h-4" /> {thumbnails.length ? 'Regenerate' : 'Generate'}</>
                        }
                    </button>

                    {/* Series sync toggle */}
                    {!isSingleEpisode ? (
                        <label className="flex items-center gap-2 ml-auto cursor-pointer select-none text-xs text-slate-400">
                            <input
                                type="checkbox"
                                checked={syncSeries}
                                onChange={e => setSyncSeries(e.target.checked)}
                                disabled={generating || applying}
                                className="w-3.5 h-3.5 accent-red-500"
                            />
                            Also update series cover
                        </label>
                    ) : (
                        <span className="ml-auto text-xs text-slate-500 italic">Series cover will also update</span>
                    )}
                </div>

                {/* ── Thumbnail grid ─────────────────────────────────────── */}
                <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">

                    {/* Empty state */}
                    {!generating && thumbnails.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
                            <Film className="w-12 h-12 text-slate-700" />
                            <div>
                                <p className="text-sm font-medium text-slate-400">No thumbnails yet</p>
                                <p className="text-xs text-slate-500 mt-1">
                                    Click <span className="text-slate-300 font-medium">Generate</span> to sample {count} scenes from this video
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Loading skeletons */}
                    {generating && (
                        <div>
                            <div className="flex flex-col items-center gap-3 mb-5">
                                <Loader className="w-7 h-7 animate-spin text-red-500" />
                                <p className="text-sm text-slate-400">Extracting {count} scenes…</p>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                {Array.from({ length: count }).map((_, i) => (
                                    <div key={i} className="aspect-video bg-slate-800 rounded-xl animate-pulse" />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Scene grid */}
                    {!generating && thumbnails.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {thumbnails.map(thumb => {
                                const isSelected = selected === thumb.filename;
                                return (
                                    <button
                                        key={thumb.filename}
                                        onClick={() => setSelected(isSelected ? null : thumb.filename)}
                                        disabled={applying}
                                        className={`group relative rounded-xl overflow-hidden aspect-video border-2 transition-all focus:outline-none disabled:cursor-not-allowed ${
                                            isSelected
                                                ? 'border-red-500 ring-2 ring-red-500/40 scale-[1.03]'
                                                : 'border-slate-700 hover:border-slate-500 hover:scale-[1.01]'
                                        }`}
                                    >
                                        <img
                                            src={thumb.url}
                                            alt={`Scene at ${formatTs(thumb.ts)}`}
                                            className="w-full h-full object-cover"
                                            onError={e => { e.target.style.display = 'none'; }}
                                        />

                                        {/* Timestamp badge */}
                                        <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-black/75 text-white text-xs rounded font-mono leading-none">
                                            {formatTs(thumb.ts)}
                                        </div>

                                        {/* Selected overlay */}
                                        {isSelected && (
                                            <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                                                <div className="bg-red-500 rounded-full p-1.5 shadow-lg">
                                                    <Check className="w-4 h-4 text-white" strokeWidth={3} />
                                                </div>
                                            </div>
                                        )}

                                        {/* Hover tint */}
                                        {!isSelected && (
                                            <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── Footer ─────────────────────────────────────────────── */}
                <div className="flex-none flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-800 bg-slate-950/40">
                    <p className="text-xs text-slate-500 truncate">
                        {selected
                            ? `Scene at ${formatTs(selectedThumb?.ts ?? 0)} selected`
                            : thumbnails.length > 0
                                ? 'Click a scene to select it'
                                : ''}
                    </p>
                    <div className="flex gap-2 shrink-0">
                        <button
                            onClick={onClose}
                            disabled={applying}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleApply}
                            disabled={!selected || applying || generating}
                            className="flex items-center gap-2 px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {applying
                                ? <><Loader className="w-4 h-4 animate-spin" /> Applying…</>
                                : <><Check className="w-4 h-4" strokeWidth={3} /> Apply</>
                            }
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}

export default ThumbnailPicker;