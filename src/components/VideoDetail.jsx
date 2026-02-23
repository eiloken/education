import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { generalAPI, seriesAPI, videoAPI } from "../api/api";
import toast from "react-hot-toast";
import VideoPlayer from "./VideoPlayer";
import {
    ArrowLeft, Building, Calendar, ChevronDown, ChevronUp,
    Clock, Edit, Eye, Film, Heart, Layers, Play, Plus, Tag, Trash2, Users, UserCircle
} from "lucide-react";
import { MetaChip } from "./SeriesCard";

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
    const [episodeListOpen, setEpisodeListOpen] = useState(true);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const data = await seriesAPI.getSeriesWithEpisodes(id);
            setSeries(data.series);
            const eps = data.episodes || [];
            setEpisodes(eps);

            if (eps.length > 0) {
                // Try to restore episode from URL param
                const epFromUrl = searchParams.get('ep');
                const found = epFromUrl ? eps.find(e => e._id === epFromUrl) : null;
                const initial = found || eps[0];
                setCurrentEpisode(initial);
                setSelectedSeason(initial.seasonNumber || 1);
                // Ensure URL param is set
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

    const handleEpisodeSelect = (ep) => {
        setCurrentEpisode(ep);
        setSelectedSeason(ep.seasonNumber || 1);
        setSearchParams({ ep: ep._id });
        // On mobile, scroll player into view
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleToggleFavorite = async () => {
        toast.promise(seriesAPI.toggleFavorite(id).then((res) => {
            if (res?.success) {
                setSeries(prev => ({ ...prev, isFavorite: !prev.isFavorite }));
                return "Favorite updated";
            } else {
                throw new Error("Failed to update favorite");
            }
        }), {
            loading: "Updating favorite...",
            success: "Favorite updated",
            error: "Failed to update favorite"
        });
    };

    const handleToggleFavoriteVideo = async (e) => {
        if (e) e.stopPropagation();

        toast.promise(videoAPI.toggleFavorite(currentEpisode._id).then((res) => {
            if (res?.success) {
                setEpisodes(prev => prev.map(ep => ep._id === currentEpisode._id ? { ...ep, isFavorite: !ep.isFavorite } : ep));
                setCurrentEpisode(prev => ({ ...prev, isFavorite: !prev.isFavorite }));
                return "Favorite updated";
            } else {
                throw new Error("Failed to update favorite");
            }
        }), {
            loading: "Updating favorite...",
            success: "Favorite updated",
            error: "Failed to update favorite"
        });
    };

    const handleDeleteSeries = async () => {
        if (!window.confirm(`Delete "${series.title}" and ALL its episodes? This cannot be undone.`)) return;

        toast.promise(seriesAPI.deleteSeries(id).then((res) => {
            if (res?.success) {
                navigate('/');
                return "Series deleted";
            } else {
                throw new Error("Failed to delete series");
            }
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
                return "Episode deleted";
            } else {
                throw new Error("Failed to delete episode");
            }
        }), {
            loading: "Deleting episode...",
            success: "Episode deleted",
            error: "Failed to delete episode"
        });
    };

    const episodesBySeason = episodes.reduce((acc, ep) => {
        const s = ep.seasonNumber || 1;
        if (!acc[s]) acc[s] = [];
        acc[s].push(ep);
        return acc;
    }, {});
    const seasons = Object.keys(episodesBySeason).map(Number).sort((a, b) => a - b);
    const currentIdx = episodes.findIndex(e => e._id === currentEpisode?._id);

    const handlePrevEpisode = () => {
        if (currentIdx > 0) handleEpisodeSelect(episodes[currentIdx - 1]);
    };
    const handleNextEpisode = () => {
        if (currentIdx < episodes.length - 1) handleEpisodeSelect(episodes[currentIdx + 1]);
    };

    // Metadata to display: episode metadata merged with series (episode takes priority)
    const displayMetadata = currentEpisode ? {
        studios: [...new Set([...(currentEpisode.studios || []), ...(series?.studios || [])])],
        actors: [...new Set([...(currentEpisode.actors || []), ...(series?.actors || [])])],
        characters: [...new Set([...(currentEpisode.characters || []), ...(series?.characters || [])])],
        tags: [...new Set([...(currentEpisode.tags || []), ...(series?.tags || [])])],
    } : series;

    if (loading) return <LoadingScreen />;
    if (!series) return <NotFoundScreen message="Series not found" />;

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            {/* Header */}
            <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
                <div className="container mx-auto px-3 py-3 sm:p-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                        <button onClick={() => navigate('/')} className="p-2 hover:bg-slate-800 rounded-lg transition shrink-0">
                            <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                        </button>
                        <div className="flex items-center gap-2 min-w-0">
                            <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 shrink-0" />
                            <h1 className="text-base sm:text-xl font-bold text-white truncate">{series.title}</h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                        <button
                            onClick={() => navigate(`/series/${id}/add-episode`)}
                            className="flex items-center gap-1.5 px-2 py-2 sm:px-3 bg-red-500 hover:bg-red-600 text-white rounded-lg transition text-sm font-medium"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="hidden sm:inline">Add Episode</span>
                        </button>
                        <button
                            onClick={() => navigate(`/series/edit/${id}`)}
                            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition"
                            title="Edit series"
                        >
                            <Edit className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                        <button
                            onClick={handleToggleFavorite}
                            className={`p-2 rounded-lg transition ${series.isFavorite ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                        >
                            <Heart className="w-4 h-4 sm:w-5 sm:h-5" fill={series.isFavorite ? 'currentColor' : 'none'} />
                        </button>
                        <button
                            onClick={handleDeleteSeries}
                            className="p-2 bg-slate-800 hover:bg-red-900/60 text-slate-400 hover:text-red-400 rounded-lg transition"
                        >
                            <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
                {/* Two-column on desktop, stacked on mobile */}
                <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4 sm:gap-8">

                    {/* ── Left / Main column ───────────────────────────────── */}
                    <div className="lg:col-span-2 space-y-4 sm:space-y-6">

                        {/* Video Player */}
                        <div className="relative aspect-video bg-slate-900 rounded-xl overflow-hidden shadow-2xl">
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
                                />
                            ) : series.thumbnailPath ? (
                                <img src={generalAPI.thumbnailUrl(series.thumbnailPath)} alt={series.title} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-slate-700">
                                    <Layers className="w-16 h-16 mb-3" />
                                    <p className="text-slate-500">No episodes yet</p>
                                </div>
                            )}
                        </div>

                        {/* Now playing info */}
                        {currentEpisode && (
                            <div className="bg-slate-900 rounded-xl p-4 sm:p-5 border border-slate-800">
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <div className="min-w-0">
                                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                                            Season {currentEpisode.seasonNumber || 1} · Episode {currentEpisode.episodeNumber || '?'}
                                        </p>
                                        <h2 className="text-lg sm:text-2xl font-bold uppercase truncate">{currentEpisode.title}</h2>
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        <button
                                            onClick={() => navigate(`/edit/${currentEpisode._id}`)}
                                            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition"
                                            title="Edit episode"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => handleDeleteEpisode(currentEpisode._id, e)}
                                            className="p-2 bg-slate-800 hover:bg-red-900/60 text-slate-400 hover:text-red-400 rounded-lg transition"
                                            title="Delete episode"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => handleToggleFavoriteVideo(e)}
                                            className={`p-2 rounded-lg transition ${currentEpisode.isFavorite ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                                            title="Toggle favorite"
                                        >
                                            <Heart className="w-4 h-4" fill={currentEpisode.isFavorite ? 'currentColor' : 'none'} />
                                        </button>
                                    </div>
                                </div>

                                {/* Stats */}
                                <div className="flex flex-wrap gap-3 text-sm text-slate-400 mb-3">
                                    {currentEpisode.views !== undefined && (
                                        <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{currentEpisode.views} views</span>
                                    )}
                                    {currentEpisode.duration && (
                                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatDuration(currentEpisode.duration)}</span>
                                    )}
                                    {currentEpisode.year && (
                                        <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{currentEpisode.year}</span>
                                    )}
                                </div>

                                {currentEpisode.description && (
                                    <p className="text-slate-300 text-sm leading-relaxed">{currentEpisode.description}</p>
                                )}

                                {/* Episode-level metadata inline */}
                                <EpisodeMetadataInline episode={currentEpisode} />
                            </div>
                        )}

                        {/* Episode list (collapsible on mobile) */}
                        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                            <button
                                className="w-full flex items-center justify-between px-4 sm:px-6 py-4 sm:py-5 hover:bg-slate-800/50 transition"
                                onClick={() => setEpisodeListOpen(v => !v)}
                            >
                                <h3 className="text-base sm:text-xl font-semibold flex items-center gap-2">
                                    Episodes
                                    <span className="text-slate-500 text-sm font-normal">({episodes.length})</span>
                                </h3>
                                {episodeListOpen
                                    ? <ChevronUp className="w-5 h-5 text-slate-400" />
                                    : <ChevronDown className="w-5 h-5 text-slate-400" />
                                }
                            </button>

                            {episodeListOpen && (
                                <div className="border-t border-slate-800">
                                    {episodes.length === 0 ? (
                                        <div className="text-center py-10 text-slate-500">
                                            <Film className="w-10 h-10 mx-auto mb-3 text-slate-700" />
                                            <p className="text-sm">No episodes yet.</p>
                                            <button
                                                onClick={() => navigate(`/series/${id}/add-episode`)}
                                                className="mt-3 flex items-center gap-1.5 mx-auto px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm transition"
                                            >
                                                <Plus className="w-4 h-4" /> Add First Episode
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="p-3 sm:p-4">
                                            {/* Season tabs */}
                                            {seasons.length > 1 && (
                                                <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none">
                                                    {seasons.map(s => (
                                                        <button
                                                            key={s}
                                                            onClick={() => setSelectedSeason(s)}
                                                            className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap text-sm font-medium ${
                                                                selectedSeason === s
                                                                    ? 'bg-red-500 text-white'
                                                                    : 'bg-slate-800 text-slate-400 hover:text-white'
                                                            }`}
                                                        >
                                                            Season {s}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="space-y-1.5 max-h-96 overflow-y-auto">
                                                {(episodesBySeason[selectedSeason] || []).map(ep => (
                                                    <EpisodeRow
                                                        key={ep._id}
                                                        episode={ep}
                                                        isActive={currentEpisode?._id === ep._id}
                                                        onSelect={() => handleEpisodeSelect(ep)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Right / Sidebar ──────────────────────────────────── */}
                    <div className="space-y-4 sm:space-y-6">
                        {/* Series info card */}
                        <div className="bg-slate-900 rounded-xl p-4 sm:p-6 border border-slate-800">
                            {series.thumbnailPath && (
                                <img
                                    src={generalAPI.thumbnailUrl(series.thumbnailPath)}
                                    alt={series.title}
                                    className="w-full aspect-video object-cover rounded-lg mb-4"
                                />
                            )}
                            <h3 className="text-base sm:text-xl font-semibold mb-3">Series Info</h3>
                            {series.description && (
                                <p className="text-slate-300 text-sm leading-relaxed mb-4">{series.description}</p>
                            )}
                            <div className="space-y-2 text-sm">
                                <InfoRow label="Episodes" value={episodes.length} />
                                <InfoRow label="Seasons" value={seasons.length || 1} />
                                {series.year && <InfoRow label="Year" value={series.year} />}
                            </div>
                        </div>

                        {/* Combined metadata: episode + series */}
                        <MetadataPanel item={displayMetadata} title={currentEpisode ? "Series Metadata" : "Video Metadata"} />
                    </div>
                </div>
            </main>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// VideoDetail — shown when navigating to /video/:id (standalone video)
// ─────────────────────────────────────────────────────────────────────────────
function VideoDetail() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [video, setVideo] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchVideo = useCallback(async () => {
        try {
            setLoading(true);
            const data = await videoAPI.getVideo(id);
            setVideo(data.video || data);
        } catch (err) {
            console.error(err);
            toast.error("Failed to load video");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { fetchVideo(); }, [fetchVideo]);

    const handleToggleFavorite = async () => {
        toast.promise(videoAPI.toggleFavorite(id).then((res) => {
            if (res?.success) {
                setVideo(prev => ({ ...prev, isFavorite: !prev.isFavorite }));
                return "Favorite updated";
            } else {
                throw new Error("Failed to update favorite");
            }
        }), {
            loading: "Updating favorite...",
            success: "Favorite updated",
            error: "Failed to update favorite"
        })
    };

    const handleDelete = async () => {
        if (!window.confirm("Delete this video?")) return;

        toast.promise(videoAPI.deleteVideo(id).then((res) => {
            if (res?.success) {
                navigate('/');
                return "Video deleted";
            } else {
                throw new Error("Failed to delete");
            }
        }), {
            loading: "Deleting video...",
            success: "Video deleted",
            error: "Failed to delete"
        });
    };

    if (loading) return <LoadingScreen />;
    if (!video) return <NotFoundScreen message="Video not found" />;

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
                <div className="container mx-auto px-3 py-3 sm:p-4 flex items-center gap-3">
                    <button onClick={() => navigate('/')} className="p-2 hover:bg-slate-800 rounded-lg transition shrink-0">
                        <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                    <h1 className="text-base sm:text-xl font-bold text-white truncate">{video.title}</h1>
                </div>
            </header>

            <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
                <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4 sm:gap-8">
                    {/* Main */}
                    <div className="lg:col-span-2 space-y-4 sm:space-y-6">
                        <div className="aspect-video bg-slate-900 rounded-xl overflow-hidden shadow-2xl">
                            <VideoPlayer
                                isEmbedded 
                                videoId={id}
                                videoUrl={videoAPI.getStreamUrl(id)}
                                availableQualities={video.resolutions?.map(r => r.quality) || []}
                            />
                        </div>

                        <div className="bg-slate-900 rounded-xl p-4 sm:p-6 border border-slate-800">
                            <div className="flex items-start justify-between gap-3 mb-4">
                                <h2 className="text-lg sm:text-2xl font-bold uppercase truncate">{video.title}</h2>

                                <div className="flex gap-1 shrink-0">
                                    <button
                                        onClick={() => navigate(`/edit/${id}`)}
                                        className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition"
                                        title="Edit"
                                    >
                                        <Edit className="w-4 h-4 sm:w-5 sm:h-5" />
                                    </button>
                                    <button
                                        onClick={handleDelete}
                                        className="p-2 bg-slate-800 hover:bg-red-900/60 text-slate-400 hover:text-red-400 rounded-lg transition"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                                    </button>
                                    <button
                                        onClick={handleToggleFavorite}
                                        className={`p-2 rounded-lg transition ${video.isFavorite ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                                        title="Toggle favorite"
                                    >
                                        <Heart className="w-4 h-4 sm:w-5 sm:h-5" fill={video.isFavorite ? 'currentColor' : 'none'} />
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-3 mb-4 text-sm text-slate-400">
                                {video.views !== undefined && <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{video.views} views</span>}
                                {video.duration && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatDuration(video.duration)}</span>}
                                {video.year && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{video.year}</span>}
                            </div>

                            {video.description && <p className="text-slate-300 leading-relaxed text-sm sm:text-base">{video.description}</p>}
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-4 sm:space-y-6">
                        <div className="bg-slate-900 rounded-xl p-4 sm:p-6 border border-slate-800">
                            <h3 className="text-base sm:text-xl font-semibold mb-3">Details</h3>
                            <div className="text-sm space-y-2">
                                {video.fileSize && <InfoRow label="File Size" value={formatFileSize(video.fileSize)} />}
                            </div>
                        </div>
                        <MetadataPanel item={video} title="Video Metadata" />
                    </div>
                </div>
            </main>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────────────────

function EpisodeRow({ episode, isActive, onSelect }) {
    return (
        <div
            onClick={onSelect}
            className={`flex gap-3 p-2.5 sm:p-3 rounded-lg cursor-pointer transition group ${
                isActive ? 'bg-red-500/20 border border-red-500/40' : 'bg-slate-800/50 hover:bg-slate-700/50'
            }`}
        >
            {/* Thumbnail */}
            <div className="w-24 sm:w-28 h-14 sm:h-16 shrink-0 bg-slate-900 rounded overflow-hidden relative">
                {episode.thumbnailPath ? (
                    <img src={generalAPI.thumbnailUrl(episode.thumbnailPath)} alt={episode.title} className="w-full h-full object-cover" />
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
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-xs text-slate-500 mb-0.5">S{episode.seasonNumber || 1} E{episode.episodeNumber || '?'}</p>
                        <h4 className="font-semibold text-xs sm:text-sm truncate">{episode.title}</h4>
                    </div>
                </div>

                <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                    {episode.views !== undefined && <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{episode.views} views</span>}
                    {episode.duration && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatDuration(episode.duration)}</span>}
                </div>
            </div>
        </div>
    );
}

/** Inline episode-specific metadata tags shown below the now-playing info */
function EpisodeMetadataInline({ episode }) {
    if (!episode) return null;
    const hasEpMeta = (episode.studios?.length > 0) || (episode.actors?.length > 0) ||
        (episode.characters?.length > 0) || (episode.tags?.length > 0);
    if (!hasEpMeta) return null;

    return (
        <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap gap-1.5">
            {episode.studios?.map((s, i) => <MetaChip key={`s${i}`} label={s} color="blue" />)}
            {episode.actors?.map((a, i) => <MetaChip key={`a${i}`} label={a} color="green" />)}
            {episode.characters?.map((c, i) => <MetaChip key={`c${i}`} label={c} color="purple" />)}
            {episode.tags?.map((t, i) => <MetaChip key={`t${i}`} label={t} color="slate" />)}
        </div>
    );
}

function MetadataPanel({ item, title = "Metadata" }) {
    if (!item) return null;
    const hasContent = (item.studios?.length > 0) || (item.actors?.length > 0) ||
        (item.characters?.length > 0) || (item.tags?.length > 0);
    if (!hasContent) return null;

    return (
        <div className="bg-slate-900 rounded-xl p-4 sm:p-6 border border-slate-800 space-y-4">
            <h3 className="text-base sm:text-xl font-semibold">{title}</h3>

            {item.studios?.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400 mb-2">
                        <Building className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Studios
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {item.studios.map((s, i) => <MetaChip key={i} label={s} color="blue" />)}
                    </div>
                </div>
            )}

            {item.actors?.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400 mb-2">
                        <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Actors
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {item.actors.map((a, i) => <MetaChip key={i} label={a} color="green" />)}
                    </div>
                </div>
            )}

            {item.characters?.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400 mb-2">
                        <UserCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Characters
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {item.characters.map((c, i) => <MetaChip key={i} label={c} color="purple" />)}
                    </div>
                </div>
            )}

            {item.tags?.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400 mb-2">
                        <Tag className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Tags
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {item.tags.map((t, i) => <MetaChip key={i} label={t} color="slate" />)}
                    </div>
                </div>
            )}
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatDuration(seconds) {
    if (!seconds) return 'Unknown';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
}

function formatFileSize(bytes) {
    if (!bytes) return "Unknown";
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
}

export default VideoDetail;