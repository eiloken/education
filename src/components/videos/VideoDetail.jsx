import React, { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { generalAPI, seriesAPI, videoAPI } from "../../api/api";
import toast from "react-hot-toast";
import VideoPlayer from "./VideoPlayer";
import {
    ArrowLeft, Building, Calendar, ChevronDown, ChevronUp,
    Clock, Edit, Eye, Film, Heart, Layers, Play, Plus, Tag, Trash2, Users, UserCircle
} from "lucide-react";

import { MetaChip } from "../series/SeriesCard";
import { formatDuration, formatFileSize } from "../../utils/format";
import { useAuth } from "../../context/AuthContext";

// ─────────────────────────────────────────────────────────────────────────────
// SeriesDetail — shown when navigating to /series/:id
// Episode is persisted in URL search param ?ep=episodeId
// ─────────────────────────────────────────────────────────────────────────────
export function SeriesDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const [series, setSeries] = useState(null);
    const [episodes, setEpisodes] = useState([]);
    const [currentEpisode, setCurrentEpisode] = useState(null);
    const [selectedSeason, setSelectedSeason] = useState(1);
    const [loading, setLoading] = useState(true);

    // ── Collapsible episode list ──────────────────────────────────────────────
    const [episodesCollapsed, setEpisodesCollapsed] = useState(false);

    // ── Player height tracking for YouTube-style sidebar ─────────────────────
    const playerContainerRef = useRef(null);
    const [playerHeight, setPlayerHeight] = useState(null);
    const [isXl, setIsXl] = useState(window.innerWidth >= 1280);
    const activeEpisodeRef = useRef(null);
    const episodeListRef   = useRef(null);

    const { isAdmin } = useAuth();

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const data = await seriesAPI.getSeriesWithEpisodes(id);
            setSeries(data.series);
            const eps = data.episodes || [];
            setEpisodes(eps);

            if (eps.length > 0) {
                const epFromUrl = searchParams.get('ep');
                const found = epFromUrl ? eps.find(e => e._id === epFromUrl) : null;
                const initial = found || eps[0];
                setCurrentEpisode(initial);
                setSelectedSeason(initial.seasonNumber || 1);
                if (!epFromUrl || !found) {
                    setSearchParams({ ep: initial._id }, { replace: true });
                }
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to load series");
        } finally {
            setLoading(false);
        }
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { fetchData(); }, [fetchData]);

    // ── Measure player height with ResizeObserver ─────────────────────────────
    useEffect(() => {
        const el = playerContainerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                setPlayerHeight(Math.round(entry.contentRect.height));
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [loading]);

    useEffect(() => {
        const onResize = () => setIsXl(window.innerWidth >= 1280);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // ── Scroll active episode into view ──────────────────────────────────────
    useEffect(() => {
        if (!currentEpisode || !activeEpisodeRef.current || !episodeListRef.current) return;
        const t = setTimeout(() => {
            const container = episodeListRef.current;
            const row = activeEpisodeRef.current;
            if (!container || !row) return;
            container.scrollTop = row.offsetTop - container.offsetTop - (container.clientHeight / 2) + (row.clientHeight / 2);
        }, 150);
        return () => clearTimeout(t);
    }, [currentEpisode?._id]);

    const handleEpisodeSelect = (ep) => {
        setCurrentEpisode(ep);
        setSelectedSeason(ep.seasonNumber || 1);
        setSearchParams({ ep: ep._id });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        // Auto-collapse episodes list on mobile after selecting
        if (!isXl) setEpisodesCollapsed(true);
    };

    const handleToggleFavorite = async () => {
        toast.promise(seriesAPI.toggleFavorite(id).then((res) => {
            if (res?.success) {
                setSeries(prev => ({ ...prev, isFavorite: !prev.isFavorite }));
                return "Favorite updated";
            } else { throw new Error("Failed to update favorite"); }
        }), {
            loading: "Updating favorite...",
            success: "Favorite updated",
            error: "Failed to update favorite"
        });
    };

    const handleToggleFavoriteVideo = async () => {
        toast.promise(videoAPI.toggleFavorite(currentEpisode._id).then((res) => {
            if (res?.success) {
                setEpisodes(prev => prev.map(ep => ep._id === currentEpisode._id ? { ...ep, isFavorite: !ep.isFavorite } : ep));
                setCurrentEpisode(prev => ({ ...prev, isFavorite: !prev.isFavorite }));
                return "Favorite updated";
            } else { throw new Error("Failed to update favorite"); }
        }), {
            loading: "Updating favorite...",
            success: "Favorite updated",
            error: "Failed to update favorite"
        });
    };

    const handleDeleteSeries = async () => {
        if (!window.confirm(`Delete "${series.title}" and ALL its episodes? This cannot be undone.`)) return;
        toast.promise(seriesAPI.deleteSeries(id).then((res) => {
            if (res?.success) { navigate('/'); return "Series deleted"; }
            else { throw new Error("Failed to delete series"); }
        }), {
            loading: "Deleting series...",
            success: "Series deleted",
            error: "Failed to delete series"
        });
    };

    const handleDeleteEpisode = async (episodeId, e) => {
        e.stopPropagation();
        if (!window.confirm("Delete this episode?")) return;
        toast.promise(videoAPI.deleteVideo(episodeId).then((res) => {
            if (res?.success) {
                const updated = episodes.filter(ep => ep._id !== episodeId);
                if (currentEpisode?._id === episodeId) {
                    const next = updated[0] || null;
                    setCurrentEpisode(next);
                    if (next) setSearchParams({ ep: next._id });
                }
                setEpisodes(updated);
                if (updated.length === 0) setTimeout(() => navigate('/'), 800);
                return "Episode deleted";
            } else { throw new Error("Failed to delete episode"); }
        }), {
            loading: "Deleting episode...",
            success: "Episode deleted",
            error: "Failed to delete episode"
        });
    };

    const handleNavigateToFilter = useCallback((field, value) => {
        const paramMap = { studios: 'stu', actors: 'act', characters: 'chr', tags: 'tags' };
        const param = paramMap[field];
        if (param) navigate(`/?${param}=${encodeURIComponent(value)}&mode=filtered`);
    }, [navigate]);

    const episodesBySeason = episodes.reduce((acc, ep) => {
        const s = ep.seasonNumber || 1;
        if (!acc[s]) acc[s] = [];
        acc[s].push(ep);
        return acc;
    }, {});
    const seasons  = Object.keys(episodesBySeason).map(Number).sort((a, b) => a - b);
    const currentIdx = episodes.findIndex(e => e._id === currentEpisode?._id);

    const handlePrevEpisode = () => { if (currentIdx > 0) handleEpisodeSelect(episodes[currentIdx - 1]); };
    const handleNextEpisode = () => { if (currentIdx < episodes.length - 1) handleEpisodeSelect(episodes[currentIdx + 1]); };

    if (loading) return <LoadingScreen />;
    if (!series) return <NotFoundScreen message="Series not found" />;

    const playerBlock = (
        <div ref={playerContainerRef} className="relative aspect-video bg-black rounded-xl overflow-hidden shadow-2xl">
            {currentEpisode ? (
                <VideoPlayer
                    isEmbedded
                    videoId={currentEpisode._id}
                    videoUrl={videoAPI.getStreamUrl(currentEpisode._id)}
                    availableQualities={currentEpisode.resolutions?.map(r => r.quality) || []}
                    onPrevious={currentIdx > 0 ? handlePrevEpisode : null}
                    onNext={currentIdx < episodes.length - 1 ? handleNextEpisode : null}
                    hasPrevious={currentIdx > 0}
                    hasNext={currentIdx < episodes.length - 1}
                    autoPlayNext={false}
                    onView={() => videoAPI.trackView(currentEpisode._id)}
                />
            ) : series.thumbnailPath ? (
                <img src={generalAPI.thumbnailUrl(series.thumbnailPath)} alt={series.title} className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center">
                    <Film className="w-16 h-16 mb-3 text-slate-700" />
                    <p className="text-slate-500">No episodes yet</p>
                </div>
            )}
        </div>
    );

    const episodeListBlock = (
        <div
            className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden flex flex-col"
            style={isXl
                ? { maxHeight: playerHeight ? `${playerHeight}px` : '480px' }
                : { maxHeight: '480px' }}
        >
            {/* Header — clickable to collapse/expand */}
            <button
                type="button"
                onClick={() => setEpisodesCollapsed(v => !v)}
                className="flex-none w-full px-4 py-3 border-b border-slate-800 text-left hover:bg-slate-800/50 transition"
            >
                <div className="flex items-center justify-between">
                    <h3 className="text-sm sm:text-base font-semibold flex items-center gap-2">
                        Episodes
                        <span className="text-slate-500 text-xs font-normal">({episodes.length})</span>
                    </h3>
                    {episodesCollapsed
                        ? <ChevronDown className="w-4 h-4 text-slate-400" />
                        : <ChevronUp   className="w-4 h-4 text-slate-400" />
                    }
                </div>
                {/* Season tabs — only when expanded */}
                {!episodesCollapsed && seasons.length > 1 && (
                    <div
                        className="flex gap-1.5 mt-2 overflow-x-auto pb-0.5 scrollbar-none"
                        onClick={e => e.stopPropagation()} // prevent header toggle when clicking tabs
                    >
                        {seasons.map(s => (
                            <button
                                key={s}
                                onClick={e => { e.stopPropagation(); setSelectedSeason(s); }}
                                className={`px-2.5 py-1 rounded-md transition whitespace-nowrap text-xs font-medium ${
                                    selectedSeason === s ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}
                            >
                                S{s}
                            </button>
                        ))}
                    </div>
                )}
            </button>

            {/* Body — hidden when collapsed */}
            {!episodesCollapsed && (
                episodes.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-10 text-slate-500 gap-3">
                        <Film className="w-10 h-10 text-slate-700" />
                        <p className="text-sm">No episodes yet.</p>
                        {isAdmin && (
                            <button
                                onClick={() => navigate(`/series/${id}/add-episode`)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm transition"
                            >
                                <Plus className="w-4 h-4" /> Add First Episode
                            </button>
                        )}
                    </div>
                ) : (
                    <div ref={episodeListRef} className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
                        {(episodesBySeason[selectedSeason] || []).map(ep => (
                            <EpisodeRow
                                key={ep._id}
                                episode={ep}
                                isActive={currentEpisode?._id === ep._id}
                                onSelect={() => handleEpisodeSelect(ep)}
                                ref={currentEpisode?._id === ep._id ? activeEpisodeRef : null}
                                onDelete={isAdmin ? (e) => handleDeleteEpisode(ep._id, e) : null}
                                onEdit={isAdmin ? () => navigate(`/edit/${ep._id}`) : null}
                            />
                        ))}
                    </div>
                )
            )}
        </div>
    );

    const infoPanelBlock = currentEpisode && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            {/* Title row */}
            <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">
                        S{String(currentEpisode.seasonNumber || 1).padStart(2,'0')} · E{String(currentEpisode.episodeNumber || '?').padStart(2,'0')}
                    </p>
                    <h2 className="text-xl sm:text-2xl font-bold leading-tight">{currentEpisode.title}</h2>
                </div>
                <div className="flex gap-1 shrink-0 pt-0.5">
                    {isAdmin && (
                        <>
                            <button onClick={() => navigate(`/edit/${currentEpisode._id}`)}
                                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition" title="Edit episode">
                                <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={(e) => handleDeleteEpisode(currentEpisode._id, e)}
                                className="p-2 bg-slate-800 hover:bg-red-900/60 text-slate-400 hover:text-red-400 rounded-lg transition" title="Delete episode">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </>
                    )}
                    <button onClick={handleToggleFavoriteVideo}
                        className={`p-2 rounded-lg transition ${currentEpisode.isFavorite ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                        title="Toggle favorite">
                        <Heart className="w-4 h-4" fill={currentEpisode.isFavorite ? 'currentColor' : 'none'} />
                    </button>
                </div>
            </div>

            {/* Stats row */}
            <div className="px-4 sm:px-5 pb-3 flex flex-wrap gap-3 sm:gap-4 text-sm text-slate-400">
                {currentEpisode.views !== undefined && (
                    <span className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />{currentEpisode.views} views</span>
                )}
                {currentEpisode.duration && (
                    <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{formatDuration(currentEpisode.duration)}</span>
                )}
                {currentEpisode.year && (
                    <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{currentEpisode.year}</span>
                )}
            </div>

            {/* Description */}
            {currentEpisode.description && (
                <div className="px-4 sm:px-5 pb-4 border-b border-slate-800">
                    <ExpandableDescription text={currentEpisode.description} className="text-slate-300 text-sm leading-relaxed" />
                </div>
            )}

            {/* Metadata sections */}
            <MetaSections
                item={currentEpisode}
                onStudioClick={v => handleNavigateToFilter('studios', v)}
                onActorClick={v  => handleNavigateToFilter('actors',  v)}
                onCharacterClick={v => handleNavigateToFilter('characters', v)}
                onTagClick={v    => handleNavigateToFilter('tags',    v)}
            />
        </div>
    );

    const seriesInfoBlock = (
        <SeriesInfoCard
            series={series}
            episodeCount={episodes.length}
            seasonCount={seasons.length || 1}
            isAdmin={isAdmin}
            isFavorite={series.isFavorite}
            onToggleFavorite={handleToggleFavorite}
            seriesId={id}
            onDelete={handleDeleteSeries}
        />
    );

    return (
        <div className="min-h-screen bg-slate-950 text-white px-4 sm:px-6">

            {/* ── Header ──────────────────────────────────────────────────────── */}
            <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
                <div className="mx-auto px-3 py-3 sm:p-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <button onClick={() => navigate('/')} className="p-2 hover:bg-slate-800 rounded-lg transition shrink-0">
                            <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                        </button>
                        <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 shrink-0" />
                        <h1 className="text-base sm:text-xl font-bold truncate">{series.title}</h1>
                    </div>
                </div>
            </header>

            <main className="mx-auto px-3 sm:px-4 py-4 sm:py-6">

                {isXl ? (
                    /* ══ XL: two-column layout (unchanged) ══════════════════════ */
                    <div className="flex flex-row gap-5">
                        {/* LEFT: player + info panel */}
                        <div className="flex-1 min-w-0 space-y-4">
                            {playerBlock}
                            {infoPanelBlock}
                        </div>
                        {/* RIGHT: episode list + series info */}
                        <div className="w-1/4 flex-none flex flex-col gap-4">
                            {episodeListBlock}
                            {seriesInfoBlock}
                        </div>
                    </div>
                ) : (
                    /* ══ Below XL: single-column stack ══════════════════════════
                       order: player → episodes list → episode info → series info */
                    <div className="flex flex-col gap-3 sm:gap-4">
                        {playerBlock}
                        {episodeListBlock}
                        {infoPanelBlock}
                        {seriesInfoBlock}
                    </div>
                )}

            </main>
        </div>
    );
}

function VideoDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        videoAPI.getVideo(id)
            .then(data => {
                const video = data.video || data;
                const seriesId = video.seriesId?._id || video.seriesId;
                if (seriesId) {
                    navigate(`/series/${seriesId}?ep=${video._id}`, { replace: true });
                } else {
                    navigate('/', { replace: true });
                }
            })
            .catch(() => navigate('/', { replace: true }))
            .finally(() => setLoading(false));
    }, [id, navigate]);

    if (loading) return <LoadingScreen />;
    return null;
}

const EpisodeRow = forwardRef(function EpisodeRow({ episode, isActive, onSelect, onDelete, onEdit }, ref) {
    const progressPct = (() => {
        if (!episode._id || !episode.duration) return null;
        try {
            const map = JSON.parse(localStorage.getItem('vibeflix_progress') || '{}');
            const saved = map[episode._id];
            if (!saved || saved <= 5) return null;
            return Math.min(saved / episode.duration, 1);
        } catch { return null; }
    })();

    return (
        <div ref={ref} onClick={onSelect}
            className={`flex gap-2.5 sm:gap-3 p-2 sm:p-2.5 rounded-lg cursor-pointer transition group ${
                isActive ? 'bg-red-500/20 border border-red-500/40' : 'bg-slate-800/50 hover:bg-slate-700/50'
            }`}>
            {/* Thumbnail */}
            <div className="w-20 sm:w-24 h-12 sm:h-14 shrink-0 bg-slate-900 rounded overflow-hidden relative">
                {episode.thumbnailPath ? (
                    <img
                        src={generalAPI.thumbnailUrl(episode.thumbnailPath)}
                        alt={episode.title}
                        className="w-full h-full object-cover"
                        onError={(e) => e.target.style.display = 'none'}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-5 h-5 text-slate-700" />
                    </div>
                )}
                {isActive && (
                    <div className="absolute inset-0 bg-red-500/30 flex items-center justify-center">
                        <Play className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="currentColor" />
                    </div>
                )}
                {progressPct !== null && !isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                        <div className="h-full bg-red-500" style={{ width: `${progressPct * 100}%` }} />
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 mb-0.5">S{episode.seasonNumber || 1} E{episode.episodeNumber || '?'}</p>
                <h4 className="font-semibold text-xs sm:text-sm truncate leading-snug">{episode.title}</h4>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                    {episode.views !== undefined && (
                        <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{episode.views}</span>
                    )}
                    {episode.duration && (
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(episode.duration)}</span>
                    )}
                </div>
            </div>

            {/* Admin quick actions — visible on hover */}
            {(onEdit || onDelete) && (
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                    {onEdit && (
                        <button onClick={e => { e.stopPropagation(); onEdit(); }}
                            className="p-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-400 hover:text-white transition"
                            title="Edit episode">
                            <Edit className="w-3 h-3" />
                        </button>
                    )}
                    {onDelete && (
                        <button onClick={e => { e.stopPropagation(); onDelete(e); }}
                            className="p-1 bg-slate-700 hover:bg-red-900/60 rounded text-slate-400 hover:text-red-400 transition"
                            title="Delete episode">
                            <Trash2 className="w-3 h-3" />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
});

function MetaSections({ item, onStudioClick, onActorClick, onCharacterClick, onTagClick }) {
    if (!item) return null;
    const sections = [
        { key: 'studios',    label: 'Studios',    Icon: Building,    color: 'blue',   items: item.studios,    onClick: onStudioClick    },
        { key: 'actors',     label: 'Actors',     Icon: Users,       color: 'green',  items: item.actors,     onClick: onActorClick     },
        { key: 'characters', label: 'Characters', Icon: UserCircle,  color: 'purple', items: item.characters, onClick: onCharacterClick },
        { key: 'tags',       label: 'Tags',       Icon: Tag,         color: 'slate',  items: item.tags,       onClick: onTagClick       },
    ].filter(s => s.items?.length > 0);

    if (sections.length === 0) return null;

    return (
        <div className="divide-y divide-slate-800">
            {sections.map(({ key, label, Icon, color, items, onClick }) => (
                <div key={key} className="px-4 sm:px-5 py-3.5">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 uppercase tracking-wider mb-2.5">
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {[...items].sort().map((v, i) => (
                            <MetaChip key={i} label={v} color={color} onClick={() => onClick?.(v)} />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function ExpandableDescription({ text, className = '' }) {
    const [expanded, setExpanded] = useState(false);
    const [overflows, setOverflows] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.classList.remove('line-clamp-3');
        const full = el.scrollHeight;
        el.classList.add('line-clamp-3');
        setOverflows(full > el.clientHeight);
        setExpanded(false);
    }, [text]);

    return (
        <div>
            <p ref={ref} className={`${className} ${expanded ? '' : 'line-clamp-3'}`}>{text}</p>
            {(overflows || expanded) && (
                <button
                    onClick={() => setExpanded(v => !v)}
                    className="mt-1.5 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition"
                >
                    {expanded
                        ? <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
                        : <><ChevronDown className="w-3.5 h-3.5" /> Show more</>
                    }
                </button>
            )}
        </div>
    );
}

function SeriesInfoCard({ series, episodeCount, seasonCount, isAdmin, seriesId, isFavorite, onToggleFavorite, onDelete }) {
    const navigate = useNavigate();

    if (!series) return null;

    return (
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            {series.thumbnailPath && (
                <img
                    src={generalAPI.thumbnailUrl(series.thumbnailPath)}
                    alt={series.title}
                    className="w-full aspect-video object-cover"
                    onError={e => e.target.style.display = 'none'}
                />
            )}

            <div className="p-4 sm:p-5">
                <h3 className="text-base sm:text-lg font-semibold mb-3">Series Info</h3>
                <div className="space-y-2 text-sm mb-3">
                    <InfoRow label="Episodes" value={episodeCount} />
                    <InfoRow label="Seasons"  value={seasonCount} />
                    {series.year && <InfoRow label="Year" value={series.year} />}
                </div>
                {series.description && (
                    <ExpandableDescription text={series.description} className="text-slate-400 text-xs leading-relaxed" />
                )}
            </div>

            <div className="flex items-center justify-end gap-1 sm:gap-2 shrink-0 p-4">
                {isAdmin && (
                    <>
                        <button onClick={() => navigate(`/series/${seriesId}/add-episode`)}
                            className="flex items-center gap-1.5 px-2 py-2 sm:px-3 bg-red-500 hover:bg-red-600 text-white rounded-lg transition text-sm font-medium">
                            <Plus className="w-4 h-4" />
                            <span className="hidden sm:inline">Add Episode</span>
                        </button>
                        <button onClick={() => navigate(`/series/edit/${seriesId}`)}
                            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition" title="Edit series">
                            <Edit className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                        <button onClick={onDelete}
                            className="p-2 bg-slate-800 hover:bg-red-900/60 text-slate-400 hover:text-red-400 rounded-lg transition" title="Delete series">
                            <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                    </>
                )}
                <button onClick={onToggleFavorite}
                    className={`p-2 rounded-lg transition ${isFavorite ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                    <Heart className="w-4 h-4 sm:w-5 sm:h-5" fill={isFavorite ? 'currentColor' : 'none'} />
                </button>
            </div>
        </div>
    );
}

function InfoRow({ label, value }) {
    return (
        <div className="flex justify-between items-center">
            <span className="text-slate-400">{label}</span>
            <span className="text-white font-medium">{value}</span>
        </div>
    );
}

function LoadingScreen() {
    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500" />
        </div>
    );
}

function NotFoundScreen({ message }) {
    const navigate = useNavigate();
    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white gap-4">
            <Film className="w-16 h-16 text-slate-700" />
            <p className="text-xl text-slate-400">{message}</p>
            <button onClick={() => navigate('/')} className="px-4 py-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition">
                Go Home
            </button>
        </div>
    );
}

export default VideoDetail;