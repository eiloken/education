import React, { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { generalAPI, seriesAPI, videoAPI, historyAPI } from "../../api/api";
import toast from "react-hot-toast";
import VideoPlayer from "./VideoPlayer";
import {
    Building, Calendar, ChevronDown, ChevronUp,
    Clock, Cpu, Download, Edit, Eye, Film, Heart,
    Play, Plus, Tag, Trash2, Users, UserCircle,
    CircleCheck, Ban, List, SlidersHorizontal,
} from "lucide-react";

import { MetaChip } from "../series/SeriesCard";
import { formatDuration } from "../../utils/format";
import { useAuth } from "../../context/AuthContext";
import { UserAvatarButton } from "../Home";
import UserProfile from "../auth/UserProfile";
import useMyStorage from "../../utils/localStorage";

// ─────────────────────────────────────────────────────────────────────────────
// SeriesDetail — shown when navigating to /series/:id
// Episode is persisted in URL search param ?ep=episodeId
// ─────────────────────────────────────────────────────────────────────────────
export function SeriesDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const [series, setSeries]                 = useState(null);
    const [episodes, setEpisodes]             = useState([]);
    const [currentEpisode, setCurrentEpisode] = useState(null);
    const [selectedSeason, setSelectedSeason] = useState(1);
    const [loading, setLoading]               = useState(true);

    const [episodesCollapsed, setEpisodesCollapsed] = useState(false);
    const [showSortPanel, setShowSortPanel]         = useState(false);
    // Episode info panel: expanded by default on sm+ screens, collapsed on mobile
    const [infoExpanded, setInfoExpanded] = useState(() => window.innerWidth >= 640);

    const [epSortBy, setEpSortBy] = useMyStorage('vibeflix_ep_sort_by', 'default');
    const [epOrder, setEpOrder] = useMyStorage('vibeflix_ep_order', 'asc');
    const [epHlsFilter, setEpHlsFilter] = useMyStorage('vibeflix_ep_hls_filter', 'transcoded');
    const [autoPlay, setAutoPlay] = useMyStorage('vibeflix_ep_auto_play', true);

    const [episodeProgressMap, setEpisodeProgressMap] = useState({});
    const [showProfile, setShowProfile] = useState(false);

    // isXl only used for episode-list max-height — does NOT branch the VideoPlayer tree
    const [isXl, setIsXl] = useState(window.innerWidth >= 1280);

    const playerContainerRef = useRef(null);
    const [playerHeight, setPlayerHeight] = useState(null);
    const activeEpisodeRef = useRef(null);
    const episodeListRef   = useRef(null);

    const { user, isAdmin } = useAuth();

    // ── Data fetching ─────────────────────────────────────────────────────────
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

    // Fetch server-side watch progress for all episodes
    useEffect(() => {
        if (episodes.length === 0) return;
        Promise.all(
            episodes.map(ep =>
                historyAPI.getProgress(ep._id)
                    .then(({ progress }) => ({ id: ep._id, progress }))
                    .catch(() => ({ id: ep._id, progress: 0 }))
            )
        ).then(results => {
            const map = {};
            results.forEach(({ id, progress }) => { if (progress > 0) map[id] = progress; });
            setEpisodeProgressMap(map);
        });
    }, [episodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // Measure player height for episode-list max-height sync on XL
    useEffect(() => {
        const el = playerContainerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) setPlayerHeight(Math.round(entry.contentRect.height));
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [loading]);

    // Track xl breakpoint via matchMedia (no layout branching, sidebar sizing only)
    useEffect(() => {
        const mq = window.matchMedia('(min-width:1280px)');
        const handler = (e) => setIsXl(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    // Scroll active episode into view
    useEffect(() => {
        if (!currentEpisode || !activeEpisodeRef.current || !episodeListRef.current) return;
        const t = setTimeout(() => {
            const container = episodeListRef.current;
            const row = activeEpisodeRef.current;
            if (!container || !row) return;
            container.scrollTop =
                row.offsetTop - container.offsetTop - container.clientHeight / 2 + row.clientHeight / 2;
        }, 150);
        return () => clearTimeout(t);
    }, [currentEpisode?._id]);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleEpisodeSelect = (ep) => {
        setCurrentEpisode(ep);
        setSelectedSeason(ep.seasonNumber || 1);
        setSearchParams({ ep: ep._id });
        // Re-collapse info panel on mobile when switching episodes
        setInfoExpanded(window.innerWidth >= 640);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleToggleFavorite = async () => {
        toast.promise(
            seriesAPI.toggleFavorite(id).then(res => {
                if (res?.success) {
                    setSeries(prev => ({ ...prev, isFavorite: !prev.isFavorite }));
                    return "Favorite updated";
                }
                throw new Error("Failed");
            }),
            { loading: "Updating…", success: "Favorite updated", error: "Failed to update favorite" }
        );
    };

    const handleToggleFavoriteVideo = async () => {
        toast.promise(
            videoAPI.toggleFavorite(currentEpisode._id).then(res => {
                if (res?.success) {
                    setEpisodes(prev =>
                        prev.map(ep =>
                            ep._id === currentEpisode._id ? { ...ep, isFavorite: !ep.isFavorite } : ep
                        )
                    );
                    setCurrentEpisode(prev => ({ ...prev, isFavorite: !prev.isFavorite }));
                    return "Favorite updated";
                }
                throw new Error("Failed");
            }),
            { loading: "Updating…", success: "Favorite updated", error: "Failed to update favorite" }
        );
    };

    const handleTranscode = async (episodeId) => {
        try {
            await videoAPI.triggerTranscode(episodeId);
            toast.success('Transcoding queued — optimizing in the background');
            const update = ep => ep._id === episodeId ? { ...ep, hlsStatus: 'pending' } : ep;
            setEpisodes(prev => prev.map(update));
            setCurrentEpisode(prev => prev?._id === episodeId ? { ...prev, hlsStatus: 'pending' } : prev);
        } catch {
            toast.error('Failed to start transcoding');
        }
    };

    const handleRestore = async (episodeId) => {
        if (!window.confirm('Remove HLS transcoding and revert to the original file?')) return;
        try {
            await videoAPI.removeTranscode(episodeId);
            toast.success('Reverted to original video');
            const update = ep => ep._id === episodeId ? { ...ep, hlsStatus: 'none', resolutions: [] } : ep;
            setEpisodes(prev => prev.map(update));
            setCurrentEpisode(prev =>
                prev?._id === episodeId ? { ...prev, hlsStatus: 'none', resolutions: [] } : prev
            );
        } catch {
            toast.error('Failed to remove transcoding');
        }
    };

    // Auto-poll HLS status while pending / processing
    useEffect(() => {
        const ep = currentEpisode;
        if (!ep || (ep.hlsStatus !== 'pending' && ep.hlsStatus !== 'processing')) return;
        const interval = setInterval(async () => {
            try {
                const { hlsStatus, resolutions } = await videoAPI.getHlsStatus(ep._id);
                if (hlsStatus === ep.hlsStatus) return;
                const update = e => e._id === ep._id ? { ...e, hlsStatus, resolutions } : e;
                setEpisodes(prev => prev.map(update));
                setCurrentEpisode(prev =>
                    prev?._id === ep._id ? { ...prev, hlsStatus, resolutions } : prev
                );
                if (hlsStatus === 'ready')  toast.success('Streaming optimization complete!');
                if (hlsStatus === 'failed') toast.error('Transcoding failed — you can retry from the episode info panel');
            } catch { /* ignore network hiccup, retry next tick */ }
        }, 5000);
        return () => clearInterval(interval);
    }, [currentEpisode?._id, currentEpisode?.hlsStatus]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleDeleteSeries = async () => {
        if (!window.confirm(`Delete "${series.title}" and ALL its episodes? This cannot be undone.`)) return;
        toast.promise(
            seriesAPI.deleteSeries(id).then(res => {
                if (res?.success) { navigate('/'); return "Series deleted"; }
                throw new Error("Failed");
            }),
            { loading: "Deleting…", success: "Series deleted", error: "Failed to delete series" }
        );
    };

    const handleDeleteEpisode = async (episodeId, e) => {
        e.stopPropagation();
        if (!window.confirm("Delete this episode?")) return;
        toast.promise(
            videoAPI.deleteVideo(episodeId).then(res => {
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
                }
                throw new Error("Failed");
            }),
            { loading: "Deleting…", success: "Episode deleted", error: "Failed to delete episode" }
        );
    };

    const handleNavigateToFilter = useCallback((field, value) => {
        const paramMap = { studios: 'stu', actors: 'act', characters: 'chr', tags: 'tags' };
        const param = paramMap[field];
        if (param) navigate(`/?${param}=${encodeURIComponent(value)}&mode=filtered`);
    }, [navigate]);

    // ── Derived data ──────────────────────────────────────────────────────────
    const episodesBySeason = episodes.reduce((acc, ep) => {
        const s = ep.seasonNumber || 1;
        if (!acc[s]) acc[s] = [];
        acc[s].push(ep);
        return acc;
    }, {});
    const seasons = Object.keys(episodesBySeason).map(Number).sort((a, b) => a - b);

    // sortedSeasonEpisodes must be derived BEFORE the nav handlers so that
    // prev/next follow the current sort & filter order shown in the episode list.
    const sortedSeasonEpisodes = React.useMemo(() => {
        let list = [...(episodesBySeason[selectedSeason] || [])];
        if (epHlsFilter === 'transcoded')     list = list.filter(ep => ep.hlsStatus === 'ready');
        if (epHlsFilter === 'not_transcoded') list = list.filter(ep => ep.hlsStatus === 'none' || ep.hlsStatus === 'failed');
        if      (epSortBy === 'default')   list.sort((a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0));
        else if (epSortBy === 'title')     list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        else if (epSortBy === 'duration')  list.sort((a, b) => (a.duration || 0) - (b.duration || 0));
        else if (epSortBy === 'views')     list.sort((a, b) => (a.views || 0) - (b.views || 0));
        else if (epSortBy === 'favorites') list.sort((a, b) => (a.isFavorite ? 1 : 0) - (b.isFavorite ? 1 : 0));
        if (epOrder === 'desc') list.reverse();
        return list;
    }, [episodesBySeason, selectedSeason, epSortBy, epOrder, epHlsFilter]);

    // Navigation follows the sorted/filtered list visible to the user,
    // not the raw episode order from the server.
    const currentIdx = sortedSeasonEpisodes.findIndex(e => e._id === currentEpisode?._id);

    const handlePrevEpisode = () => { if (currentIdx > 0) handleEpisodeSelect(sortedSeasonEpisodes[currentIdx - 1]); };
    const handleNextEpisode = () => { if (currentIdx < sortedSeasonEpisodes.length - 1) handleEpisodeSelect(sortedSeasonEpisodes[currentIdx + 1]); };

    // ── Early returns ─────────────────────────────────────────────────────────
    if (loading) return <LoadingScreen />;
    if (!series)  return <NotFoundScreen message="Series not found" />;

    const episodeLabel = currentEpisode
        ? `S${String(currentEpisode.seasonNumber || 1).padStart(2, '0')} · E${String(currentEpisode.episodeNumber || '?').padStart(2, '0')}`
        : null;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-slate-950 text-white">

            {/* ── Header ──────────────────────────────────────────────────────── */}
            <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/60">
                <div className="flex items-center gap-3 px-4 sm:px-6 py-2.5">
                    <a
                        href="/"
                        className="text-xl sm:text-2xl font-bold text-red-500 hover:text-red-400 transition shrink-0 tracking-tight"
                    >
                        VIBEFLIX
                    </a>

                    <div className="ml-auto">
                        {user && (
                            <UserAvatarButton user={user} isAdmin={isAdmin} onClick={() => setShowProfile(true)} />
                        )}
                    </div>
                </div>
            </header>

            {/* ── Main content ─────────────────────────────────────────────────── */}
            <main className="px-3 sm:px-5 xl:px-6 py-4 sm:py-5">
                {/*
                    ── Layout strategy ───────────────────────────────────────────
                    Outer container is flex-col on mobile, CSS grid (2 col) on xl.
                    Source order = mobile visual order:
                      1. Player
                      2. Episode info panel
                      3. Series info card  ← always above episode list on mobile
                      4. Episode list

                    On xl, items get explicit grid placement:
                      col1/row1 → player
                      col1/row2 → episode info panel
                      col2/row1 → episode list  (height = player height, scrollable)
                      col2/row2 → series info card

                    VideoPlayer is always the first child, so React never
                    unmounts it when the viewport crosses the xl breakpoint.
                */}
                <div className="flex flex-col gap-3 sm:gap-4 xl:grid xl:grid-cols-[1fr_360px] xl:gap-5">

                    {/* ── 1. Player ──────────────────────────── col1/row1 on xl */}
                    <div
                        ref={playerContainerRef}
                        className="relative aspect-video bg-black rounded-xl overflow-hidden shadow-2xl
                                   xl:col-start-1 xl:row-start-1"
                    >
                        {currentEpisode ? (
                            <VideoPlayer
                                isEmbedded
                                videoId={currentEpisode._id}
                                title={currentEpisode.title}
                                seriesTitle={series?.title}
                                episodeLabel={episodeLabel}
                                videoUrl={videoAPI.getStreamUrl(currentEpisode._id)}
                                hlsUrl={
                                    currentEpisode.hlsStatus === 'ready'
                                        ? videoAPI.getHlsUrl(currentEpisode._id)
                                        : null
                                }
                                availableQualities={currentEpisode.resolutions?.map(r => r.quality) || []}
                                onPrevious={currentIdx > 0 ? handlePrevEpisode : null}
                                onNext={currentIdx < sortedSeasonEpisodes.length - 1 ? handleNextEpisode : null}
                                hasPrevious={currentIdx > 0}
                                hasNext={currentIdx < sortedSeasonEpisodes.length - 1}
                                autoPlayNext={autoPlay}
                                onView={() => videoAPI.trackView(currentEpisode._id)}
                            />
                        ) : series.thumbnailPath ? (
                            <img
                                src={generalAPI.thumbnailUrl(series.thumbnailPath)}
                                alt={series.title}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                                <Film className="w-14 h-14 text-slate-700" />
                                <p className="text-slate-500 text-sm">No episodes yet</p>
                            </div>
                        )}
                    </div>

                    {/* ── 2. Episode info panel ─────────────── col1/row2 on xl */}
                    {currentEpisode && (
                        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden
                                        xl:col-start-1 xl:row-start-2">

                            {/* Always-visible header: label + title + actions + toggle */}
                            <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 flex items-start justify-between gap-4">
                                <div className={`min-w-0 overflow-hidden`}>
                                    <h2 className="text-base sm:text-xl font-bold leading-tight mb-1 truncate">
                                        {currentEpisode.title}
                                    </h2>

                                    {/* Compact stats — always visible even when collapsed */}
                                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-slate-400">
                                        <p className="uppercase tracking-widest font-medium">
                                            {episodeLabel}
                                        </p>

                                        {currentEpisode.duration && (
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3 shrink-0" />
                                                {formatDuration(currentEpisode.duration)}
                                            </span>
                                        )}

                                        {currentEpisode.views !== undefined && (
                                            <span className="flex items-center gap-1">
                                                <Eye className="w-3 h-3 shrink-0" />
                                                {currentEpisode.views.toLocaleString()} views
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 pt-0.5 shrink-0">
                                    {(infoExpanded || isXl) && (
                                        <>
                                            {isAdmin && (
                                                <>
                                                    <IconBtn
                                                        onClick={() => navigate(`/edit/${currentEpisode._id}`)}
                                                        title="Edit episode"
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </IconBtn>
                                                    <IconBtn
                                                        onClick={(e) => handleDeleteEpisode(currentEpisode._id, e)}
                                                        title="Delete episode"
                                                        danger
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </IconBtn>
                                                </>
                                            )}
                                            <a
                                                href={videoAPI.getDownloadUrl(currentEpisode._id)}
                                                download
                                                onClick={e => e.stopPropagation()}
                                                title="Download episode"
                                                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400
                                                        hover:text-white transition"
                                            >
                                                <Download className="w-4 h-4" />
                                            </a>
                                            <button
                                                onClick={handleToggleFavoriteVideo}
                                                title={currentEpisode.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                                                className={`p-2 rounded-lg transition ${
                                                    currentEpisode.isFavorite
                                                        ? 'bg-red-500 text-white'
                                                        : 'bg-slate-800 text-slate-400 hover:text-white'
                                                }`}
                                            >
                                                <Heart className="w-4 h-4" fill={currentEpisode.isFavorite ? 'currentColor' : 'none'} />
                                            </button>
                                        </>
                                    )}

                                    {/* Expand / collapse toggle */}
                                    {!isXl && (
                                        <button
                                            onClick={() => setInfoExpanded(v => !v)}
                                            title={infoExpanded ? 'Show less' : 'Show more'}
                                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400
                                                    hover:text-white transition"
                                        >
                                            {infoExpanded
                                                ? <ChevronUp   className="w-4 h-4" />
                                                : <ChevronDown className="w-4 h-4" />}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Expanded content: HLS badge + description + meta chips */}
                            {(infoExpanded || isXl) && (
                                <>
                                    {/* Extra stats (year + HLS) only visible when expanded */}
                                    {(currentEpisode.year || true) && (
                                        <div className="px-4 sm:px-5 pb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-400 border-t border-slate-800/50 pt-2">
                                            {currentEpisode.year && (
                                                <span className="flex items-center gap-1.5">
                                                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                                                    {currentEpisode.year}
                                                </span>
                                            )}
                                            <HlsStatusBadge
                                                episode={currentEpisode}
                                                isAdmin={isAdmin}
                                                onTranscode={handleTranscode}
                                                onRestore={handleRestore}
                                            />
                                        </div>
                                    )}

                                    {/* Description */}
                                    {currentEpisode.description && (
                                        <div className="px-4 sm:px-5 pb-4 border-b border-slate-800/70">
                                            <ExpandableDescription
                                                text={currentEpisode.description}
                                                className="text-slate-300 text-sm leading-relaxed"
                                            />
                                        </div>
                                    )}

                                    {/* Meta chips */}
                                    <MetaSections
                                        item={currentEpisode}
                                        onStudioClick={v => handleNavigateToFilter('studios', v)}
                                        onActorClick={v => handleNavigateToFilter('actors', v)}
                                        onCharacterClick={v => handleNavigateToFilter('characters', v)}
                                        onTagClick={v => handleNavigateToFilter('tags', v)}
                                    />
                                </>
                            )}
                        </div>
                    )}

                    {/* ── 3. Series info card ─────────── col2/row2 on xl ──────
                        Source position 3 = on mobile this appears BEFORE the
                        episode list, so it is always immediately reachable.    */}
                    <SeriesInfoCard
                        series={series}
                        episodeCount={episodes.length}
                        seasonCount={seasons.length || 1}
                        isAdmin={isAdmin}
                        seriesId={id}
                        isFavorite={series.isFavorite}
                        onToggleFavorite={handleToggleFavorite}
                        onDelete={handleDeleteSeries}
                        className="xl:col-start-2 xl:row-start-2"
                    />

                    {/* ── 4. Episode list ────────────────── col2/row1 on xl ───
                        On xl: fills the player row height (aspect-video height),
                        internally scrollable.                                   */}
                    <div
                        className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden flex flex-col
                                   xl:col-start-2 xl:row-start-1"
                        style={isXl
                            ? { maxHeight: playerHeight ? `${playerHeight}px` : '480px' }
                            : { maxHeight: '420px' }}
                    >
                        {/* List header */}
                        <div className="flex-none border-b border-slate-800">

                            {/* Top row: icon / title / controls */}
                            <div className="flex items-center gap-2 px-3 sm:px-4 py-3">
                                <List className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                <span className="text-sm font-semibold flex-1">
                                    Episodes
                                    <span className="ml-1.5 text-slate-500 text-xs font-normal">
                                        ({sortedSeasonEpisodes.length})
                                    </span>
                                </span>

                                {/* Autoplay toggle */}
                                <button
                                    onClick={() => setAutoPlay(v => !v)}
                                    title="Auto-play next episode"
                                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition ${
                                        autoPlay
                                            ? 'bg-red-500/15 border-red-500/40 text-red-400'
                                            : 'border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                                    }`}
                                >
                                    <Play className="w-2.5 h-2.5" fill={autoPlay ? 'currentColor' : 'none'} />
                                    Auto
                                </button>

                                {/* Sort panel toggle */}
                                {(!episodesCollapsed || isXl) && (
                                    <button
                                        onClick={() => setShowSortPanel(v => !v)}
                                        title="Sort & filter"
                                        className={`p-1.5 rounded-md border transition ${
                                            showSortPanel
                                                ? 'bg-slate-700 border-slate-600 text-white'
                                                : 'border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                                        }`}
                                    >
                                        <SlidersHorizontal className="w-3.5 h-3.5" />
                                    </button>
                                )}

                                {/* Collapse */}
                                {!isXl && (
                                    <button
                                        onClick={() => setEpisodesCollapsed(v => !v)}
                                        className="p-1.5 rounded-md border border-slate-700 text-slate-500
                                                hover:text-slate-300 hover:border-slate-600 transition"
                                    >
                                        {episodesCollapsed
                                            ? <ChevronDown className="w-3.5 h-3.5" />
                                            : <ChevronUp   className="w-3.5 h-3.5" />}
                                    </button>
                                )}
                            </div>

                            {/* Season tabs — shown when list is expanded */}
                            {(!episodesCollapsed || isXl) && seasons.length > 1 && (
                                <div className="flex gap-1.5 px-3 sm:px-4 pb-2.5 overflow-x-auto scrollbar-none">
                                    {seasons.map(s => (
                                        <button
                                            key={s}
                                            onClick={() => setSelectedSeason(s)}
                                            className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition ${
                                                selectedSeason === s
                                                    ? 'bg-red-500 text-white'
                                                    : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                                            }`}
                                        >
                                            Season {s}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Sort / filter panel — hidden by default, toggled by gear icon */}
                            {(!episodesCollapsed || isXl) && showSortPanel && (
                                <div className="flex flex-wrap items-center gap-1.5 px-3 sm:px-4 py-2.5
                                                bg-slate-800/40 border-t border-slate-800/70">
                                    <select
                                        value={epSortBy}
                                        onChange={e => setEpSortBy(e.target.value)}
                                        className="text-xs bg-slate-700 text-slate-300 rounded px-2 py-1
                                                   border border-slate-600 focus:outline-none focus:ring-1 focus:ring-red-500"
                                    >
                                        <option value="default">Episode #</option>
                                        <option value="title">Title</option>
                                        <option value="duration">Duration</option>
                                        <option value="views">Views</option>
                                        <option value="favorites">Favorites</option>
                                    </select>

                                    <button
                                        onClick={() => setEpOrder(v => v === 'asc' ? 'desc' : 'asc')}
                                        className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded
                                                   border border-slate-600 hover:bg-slate-600 transition"
                                    >
                                        {epOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
                                    </button>

                                    {[
                                        { value: '',               label: 'All',   activeClass: 'bg-slate-600 border-slate-500 text-white' },
                                        { value: 'transcoded',     label: 'HLS ✓', activeClass: 'bg-green-500/20 border-green-500/40 text-green-400' },
                                        { value: 'not_transcoded', label: 'Raw',   activeClass: 'bg-amber-500/20 border-amber-500/40 text-amber-400' },
                                    ].map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => setEpHlsFilter(opt.value)}
                                            className={`text-xs px-2 py-1 rounded border transition ${
                                                epHlsFilter === opt.value
                                                    ? opt.activeClass
                                                    : 'border-slate-600 text-slate-400 hover:text-white hover:bg-slate-700'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* List body */}
                        {(!episodesCollapsed || isXl) && (
                            episodes.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center py-10 gap-3 text-slate-500">
                                    <Film className="w-10 h-10 text-slate-700" />
                                    <p className="text-sm">No episodes yet</p>
                                    {isAdmin && (
                                        <button
                                            onClick={() => navigate(`/series/${id}/add-episode`)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500
                                                       hover:bg-red-600 text-white rounded-lg text-sm transition"
                                        >
                                            <Plus className="w-4 h-4" /> Add First Episode
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div ref={episodeListRef} className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
                                    {sortedSeasonEpisodes.map(ep => (
                                        <EpisodeRow
                                            key={ep._id}
                                            ref={currentEpisode?._id === ep._id ? activeEpisodeRef : null}
                                            episode={ep}
                                            isActive={currentEpisode?._id === ep._id}
                                            onSelect={() => handleEpisodeSelect(ep)}
                                            onDelete={isAdmin ? (e) => handleDeleteEpisode(ep._id, e) : null}
                                            onEdit={isAdmin ? () => navigate(`/edit/${ep._id}`) : null}
                                            progressSeconds={episodeProgressMap[ep._id] || 0}
                                        />
                                    ))}
                                </div>
                            )
                        )}
                    </div>

                </div>
            </main>

            <UserProfile isOpen={showProfile} onClose={() => setShowProfile(false)} />
        </div>
    );
}

// ─── VideoDetail redirect ──────────────────────────────────────────────────────
function VideoDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        videoAPI.getVideo(id)
            .then(data => {
                const video = data.video || data;
                const seriesId = video.seriesId?._id || video.seriesId;
                navigate(seriesId ? `/series/${seriesId}?ep=${video._id}` : '/', { replace: true });
            })
            .catch(() => navigate('/', { replace: true }))
            .finally(() => setLoading(false));
    }, [id, navigate]);

    if (loading) return <LoadingScreen />;
    return null;
}

// ─── EpisodeRow ───────────────────────────────────────────────────────────────
const EpisodeRow = forwardRef(function EpisodeRow(
    { episode, isActive, onSelect, onDelete, onEdit, progressSeconds },
    ref
) {
    const progressPct = (() => {
        if (!episode.duration || !progressSeconds || progressSeconds <= 5) return null;
        return Math.min(progressSeconds / episode.duration, 1);
    })();
    const { hlsStatus } = episode;

    return (
        <div
            ref={ref}
            onClick={onSelect}
            className={`flex gap-2.5 p-2 rounded-lg cursor-pointer transition-colors group ${
                isActive
                    ? 'bg-red-500/15 ring-1 ring-red-500/30'
                    : 'hover:bg-slate-800/60'
            }`}
        >
            {/* Thumbnail */}
            <div className="w-22 h-13 shrink-0 bg-slate-800 rounded-md overflow-hidden relative">
                {episode.thumbnailPath ? (
                    <img
                        src={generalAPI.thumbnailUrl(episode.thumbnailPath)}
                        alt={episode.title}
                        className="w-full h-full object-cover"
                        onError={e => { e.target.style.display = 'none'; }}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-4 h-4 text-slate-600" />
                    </div>
                )}

                {/* Now-playing overlay */}
                {isActive && (
                    <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                        <div className="w-5 h-5 rounded-full bg-red-500/80 flex items-center justify-center">
                            <Play className="w-2.5 h-2.5 text-white" fill="currentColor" />
                        </div>
                    </div>
                )}

                {/* Watch progress bar */}
                {progressPct !== null && !isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.75 bg-black/40">
                        <div className="h-full bg-red-500" style={{ width: `${progressPct * 100}%` }} />
                    </div>
                )}

                {/* HLS status dot */}
                <div
                    className={`absolute top-1 left-1 w-2 h-2 rounded-full ring-1 ring-black/20 ${
                        hlsStatus === 'ready'   ? 'bg-green-400' :
                        hlsStatus === 'pending' ? 'bg-amber-400 animate-pulse' :
                        'bg-slate-600'
                    }`}
                    title={
                        hlsStatus === 'ready'   ? 'HLS ready' :
                        hlsStatus === 'pending' ? 'Transcoding queued' :
                        'No HLS'
                    }
                />
            </div>

            {/* Text info */}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
                <p className="text-[10px] text-slate-500 mb-0.5 font-medium leading-none">
                    S{episode.seasonNumber || 1} · E{episode.episodeNumber || '?'}
                </p>
                <p className={`text-xs font-semibold truncate leading-snug ${
                    isActive ? 'text-red-400' : 'text-slate-100'
                }`}>
                    {episode.title}
                </p>
                <div className="flex items-center gap-2.5 mt-0.5 text-[10px] text-slate-500">
                    {episode.duration && (
                        <span className="flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {formatDuration(episode.duration)}
                        </span>
                    )}
                    {episode.views !== undefined && (
                        <span className="flex items-center gap-0.5">
                            <Eye className="w-2.5 h-2.5" />
                            {episode.views.toLocaleString()}
                        </span>
                    )}
                </div>
            </div>

            {/* Admin hover actions */}
            {(onEdit || onDelete) && (
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity
                                shrink-0 justify-center">
                    {onEdit && (
                        <button
                            onClick={e => { e.stopPropagation(); onEdit(); }}
                            title="Edit episode"
                            className="p-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-400
                                       hover:text-white transition-colors"
                        >
                            <Edit className="w-3 h-3" />
                        </button>
                    )}
                    {onDelete && (
                        <button
                            onClick={e => { e.stopPropagation(); onDelete(e); }}
                            title="Delete episode"
                            className="p-1 bg-slate-700 hover:bg-red-900/60 rounded text-slate-400
                                       hover:text-red-400 transition-colors"
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
});

// ─── SeriesInfoCard ───────────────────────────────────────────────────────────
// Compact horizontal card — thumbnail beside title/stats/actions.
// On mobile: sits BEFORE the episode list (source order 3) so it's always reachable.
// On xl: bottom of sidebar (col2/row2).
function SeriesInfoCard({
    series, episodeCount, seasonCount, isAdmin, seriesId,
    isFavorite, onToggleFavorite, onDelete, className = ''
}) {
    const navigate = useNavigate();
    const [descExpanded, setDescExpanded] = useState(false);
    const [descOverflows, setDescOverflows] = useState(false);
    const descRef = useRef(null);

    // Measure whether the description text overflows 2 lines
    useEffect(() => {
        const el = descRef.current;
        if (!el) return;
        // Temporarily remove clamp to get the true height
        el.classList.remove('line-clamp-2');
        const fullHeight = el.scrollHeight;
        el.classList.add('line-clamp-2');
        setDescOverflows(fullHeight > el.clientHeight + 1); // +1 for rounding
        setDescExpanded(false);
    }, [series?.description]);

    if (!series) return null;

    return (
        <div className={`bg-slate-900 rounded-xl border border-slate-800 overflow-hidden flex flex-col ${className}`}>
            {/* Compact header row */}
            <div className="flex gap-3 p-3 sm:p-4">
                {/* Small thumbnail */}
                {series.thumbnailPath && (
                    <div className="w-20 h-11.5 sm:w-24 sm:h-14 shrink-0 rounded-md overflow-hidden bg-slate-800">
                        <img
                            src={generalAPI.thumbnailUrl(series.thumbnailPath)}
                            alt={series.title}
                            className="w-full h-full object-cover"
                            onError={e => { e.target.style.display = 'none'; }}
                        />
                    </div>
                )}

                {/* Title + quick stats */}
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-0.5 font-medium">Series</p>
                    <p className="text-sm font-bold truncate leading-snug">{series.title}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-slate-400">
                        <span>{episodeCount} episode{episodeCount !== 1 ? 's' : ''}</span>
                        {seasonCount > 1 && <span>{seasonCount} seasons</span>}
                        {series.year && <span>{series.year}</span>}
                    </div>
                </div>

                {/* Compact action column */}
                <div className="flex flex-col gap-1 shrink-0">
                    <button
                        onClick={onToggleFavorite}
                        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        className={`p-1.5 rounded-lg transition ${
                            isFavorite
                                ? 'bg-red-500 text-white'
                                : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                    >
                        <Heart className="w-3.5 h-3.5" fill={isFavorite ? 'currentColor' : 'none'} />
                    </button>
                    {isAdmin && (
                        <button
                            onClick={() => navigate(`/series/edit/${seriesId}`)}
                            title="Edit series"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400
                                       hover:text-white transition"
                        >
                            <Edit className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Optional description — toggle only rendered when text actually overflows */}
            <div className="flex-1 px-3 sm:px-4 pb-3 pt-2.5 border-t border-slate-800/60">
                {series.description && (
                    <>
                        <p
                            ref={descRef}
                            className={`text-xs text-slate-400 leading-relaxed ${
                                descExpanded ? '' : 'line-clamp-2'
                            }`}
                        >
                            {series.description}
                        </p>
                        {(descOverflows || descExpanded) && (
                            <button
                                onClick={() => setDescExpanded(v => !v)}
                                className="mt-1 text-[10px] text-slate-500 hover:text-slate-300 transition
                                        flex items-center gap-0.5"
                            >
                                {descExpanded
                                    ? <><ChevronUp className="w-3 h-3" /> Show less</>
                                    : <><ChevronDown className="w-3 h-3" /> Show more</>}
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* Admin actions footer */}
            {isAdmin && (
                <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5
                                border-t border-slate-800/60 bg-slate-800/25">
                    <button
                        onClick={() => navigate(`/series/${seriesId}/add-episode`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600
                                   text-white rounded-lg text-xs font-medium transition"
                    >
                        <Plus className="w-3.5 h-3.5" /> Add Episode
                    </button>
                    <button
                        onClick={onDelete}
                        title="Delete series"
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-900/60 text-slate-400
                                   hover:text-red-400 transition ml-auto"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── HLS Status Badge ─────────────────────────────────────────────────────────
function HlsStatusBadge({ episode, isAdmin, onTranscode, onRestore }) {
    if (!episode) return null;
    const { hlsStatus } = episode;

    if (hlsStatus === 'pending' || hlsStatus === 'processing') {
        return (
            <span className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                {hlsStatus === 'pending' ? 'Queued…' : 'Optimizing…'}
            </span>
        );
    }
    if (hlsStatus === 'ready') {
        return (
            <span className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                    HLS ready
                </span>
                {isAdmin && (
                    <button
                        onClick={() => onRestore(episode._id)}
                        className="text-xs text-slate-500 hover:text-slate-300 transition"
                    >
                        Restore original
                    </button>
                )}
            </span>
        );
    }
    if (isAdmin) {
        const isFailed = hlsStatus === 'failed';
        return (
            <button
                onClick={() => onTranscode(episode._id)}
                title={isFailed ? 'Transcoding failed — click to retry' : 'Transcode for adaptive streaming'}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800
                           hover:bg-slate-700 px-2 py-0.5 rounded-full transition"
            >
                <Cpu className="w-3 h-3 shrink-0" />
                {isFailed ? '⚠ Retry' : 'Transcode'}
            </button>
        );
    }
    return null;
}

// ─── MetaSections ─────────────────────────────────────────────────────────────
function MetaSections({ item, onStudioClick, onActorClick, onCharacterClick, onTagClick }) {
    if (!item) return null;
    const sections = [
        { key: 'studios',    label: 'Studios',    Icon: Building,   color: 'blue',   items: item.studios,    onClick: onStudioClick    },
        { key: 'actors',     label: 'Actors',     Icon: Users,      color: 'green',  items: item.actors,     onClick: onActorClick     },
        { key: 'characters', label: 'Characters', Icon: UserCircle, color: 'purple', items: item.characters, onClick: onCharacterClick },
        { key: 'tags',       label: 'Tags',       Icon: Tag,        color: 'slate',  items: item.tags,       onClick: onTagClick       },
    ].filter(s => s.items?.length > 0);
    if (sections.length === 0) return null;

    return (
        <div className="divide-y divide-slate-800/50">
            {sections.map(({ key, label, Icon, color, items, onClick }) => (
                <div key={key} className="px-4 sm:px-5 py-3">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-medium">
                        <Icon className="w-3 h-3" />
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

// ─── ExpandableDescription ────────────────────────────────────────────────────
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
            <p ref={ref} className={`${className} ${expanded ? '' : 'line-clamp-3'}`}>
                {text}
            </p>
            {(overflows || expanded) && (
                <button
                    onClick={() => setExpanded(v => !v)}
                    className="mt-1.5 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition"
                >
                    {expanded
                        ? <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
                        : <><ChevronDown className="w-3.5 h-3.5" /> Show more</>}
                </button>
            )}
        </div>
    );
}

// ─── IconBtn ──────────────────────────────────────────────────────────────────
function IconBtn({ onClick, title, danger = false, children }) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={`p-2 rounded-lg transition ${
                danger
                    ? 'bg-slate-800 hover:bg-red-900/60 text-slate-400 hover:text-red-400'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white'
            }`}
        >
            {children}
        </button>
    );
}

// ─── Screen helpers ───────────────────────────────────────────────────────────
function LoadingScreen() {
    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full border-2 border-slate-800 border-t-red-500 animate-spin" />
        </div>
    );
}

function NotFoundScreen({ message }) {
    const navigate = useNavigate();
    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white gap-4">
            <Film className="w-14 h-14 text-slate-800" />
            <p className="text-lg text-slate-400">{message}</p>
            <button
                onClick={() => navigate('/')}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition"
            >
                Go Home
            </button>
        </div>
    );
}

export default VideoDetail;