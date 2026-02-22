import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { generalAPI, seriesAPI, videoAPI } from "../api/api";
import toast, { Toaster } from "react-hot-toast";
import VideoPlayer from "./VideoPlayer";
import {
    ArrowLeft, Building, Calendar, ChevronLeft, ChevronRight,
    Clock, Edit, Eye, Film, Heart, Layers, Play, Plus, Tag, Trash2, Users, UserCircle
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// SeriesDetail — shown when navigating to /series/:id
// ─────────────────────────────────────────────────────────────────────────────
export function SeriesDetail() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [series, setSeries] = useState(null);
    const [episodes, setEpisodes] = useState([]);
    const [currentEpisode, setCurrentEpisode] = useState(null);
    const [selectedSeason, setSelectedSeason] = useState(1);
    const [loading, setLoading] = useState(true);

    const fetch = useCallback(async () => {
        try {
            setLoading(true);
            const data = await seriesAPI.getSeriesWithEpisodes(id);
            setSeries(data.series);
            setEpisodes(data.episodes || []);

            // Auto-select first episode
            if (data.episodes && data.episodes.length > 0) {
                setCurrentEpisode(data.episodes[0]);
                setSelectedSeason(data.episodes[0].seasonNumber || 1);
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to load series");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { fetch(); }, [fetch]);

    const handleToggleFavorite = async () => {
        try {
            await seriesAPI.toggleFavorite(id);
            setSeries(prev => ({ ...prev, isFavorite: !prev.isFavorite }));
            toast.success("Favorite updated");
        } catch (_) { toast.error("Failed to update favorite"); }
    };

    const handleDeleteSeries = async () => {
        if (!window.confirm(`Delete "${series.title}" and ALL its episodes? This cannot be undone.`)) return;
        try {
            await seriesAPI.deleteSeries(id);
            toast.success("Series deleted");
            navigate('/');
        } catch (_) { toast.error("Failed to delete series"); }
    };

    const handleDeleteEpisode = async (episodeId, e) => {
        e.stopPropagation();
        if (!window.confirm("Delete this episode?")) return;
        try {
            await videoAPI.deleteVideo(episodeId);
            setEpisodes(prev => {
                const updated = prev.filter(ep => ep._id !== episodeId);
                if (currentEpisode?._id === episodeId) {
                    setCurrentEpisode(updated[0] || null);
                }
                return updated;
            });
            toast.success("Episode deleted");
        } catch (_) { toast.error("Failed to delete episode"); }
    };

    const handleEpisodeSelect = (ep) => setCurrentEpisode(ep);

    const handlePrevEpisode = () => {
        const allEps = episodes;
        const idx = allEps.findIndex(e => e._id === currentEpisode?._id);
        if (idx > 0) setCurrentEpisode(allEps[idx - 1]);
    };

    const handleNextEpisode = () => {
        const allEps = episodes;
        const idx = allEps.findIndex(e => e._id === currentEpisode?._id);
        if (idx < allEps.length - 1) setCurrentEpisode(allEps[idx + 1]);
    };

    const episodesBySeason = episodes.reduce((acc, ep) => {
        const s = ep.seasonNumber || 1;
        if (!acc[s]) acc[s] = [];
        acc[s].push(ep);
        return acc;
    }, {});
    const seasons = Object.keys(episodesBySeason).map(Number).sort((a, b) => a - b);
    const currentIdx = episodes.findIndex(e => e._id === currentEpisode?._id);

    if (loading) return <LoadingScreen />;
    if (!series) return <NotFoundScreen message="Series not found" />;

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <Toaster position="top-right" />

            <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
                <div className="container mx-auto p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/')} className="p-2 hover:bg-slate-800 rounded-lg transition">
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <div className="flex items-center gap-2">
                            <Layers className="w-5 h-5 text-red-500" />
                            <h1 className="text-xl font-bold text-white truncate">{series.title}</h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => navigate(`/series/${id}/add-episode`)}
                            className="flex items-center gap-2 p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition text-sm font-medium"
                        >
                            <Plus className="w-5 h-5" />
                            <span className="hidden sm:inline">Add Episode</span>
                        </button>
                        <button
                            onClick={() => navigate(`/series/edit/${id}`)}
                            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition"
                            title="Edit series"
                        >
                            <Edit className="w-5 h-5" />
                        </button>
                        <button
                            onClick={handleToggleFavorite}
                            className={`p-2 rounded-lg transition ${series.isFavorite ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                        >
                            <Heart className="w-5 h-5" fill={series.isFavorite ? 'currentColor' : 'none'} />
                        </button>
                        <button
                            onClick={handleDeleteSeries}
                            className="p-2 bg-slate-800 hover:bg-red-900/60 text-slate-400 hover:text-red-400 rounded-lg transition"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main column */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Video Player */}
                        <div className="relative aspect-video bg-slate-900 rounded-lg overflow-hidden">
                            {currentEpisode ? (
                                <VideoPlayer
                                    isEmbedded
                                    videoUrl={videoAPI.getStreamUrl(currentEpisode._id)}
                                    availableQualities={currentEpisode.resolutions?.map(r => r.quality) || []}
                                    onPrevious={currentIdx > 0 ? handlePrevEpisode : null}
                                    onNext={currentIdx < episodes.length - 1 ? handleNextEpisode : null}
                                    hasPrevious={currentIdx > 0}
                                    hasNext={currentIdx < episodes.length - 1}
                                />
                            ) : series.thumbnailPath ? (
                                <img
                                    src={generalAPI.thumbnailUrl(series.thumbnailPath)}
                                    alt={series.title}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-slate-700">
                                    <Layers className="w-20 h-20 mb-3" />
                                    <p className="text-slate-500">No episodes yet</p>
                                </div>
                            )}
                        </div>

                        {/* Now playing info */}
                        {currentEpisode && (
                            <div className="bg-slate-900 rounded-lg p-5 border border-slate-800">
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <div>
                                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                                            Season {currentEpisode.seasonNumber || 1} · Episode {currentEpisode.episodeNumber || '?'}
                                        </p>
                                        <h2 className="text-2xl font-bold uppercase">{currentEpisode.title}</h2>
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
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-4 text-sm text-slate-400 mb-3">
                                    {currentEpisode.duration && (
                                        <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{formatDuration(currentEpisode.duration)}</span>
                                    )}
                                    {currentEpisode.views !== undefined && (
                                        <span className="flex items-center gap-1"><Eye className="w-4 h-4" />{currentEpisode.views} views</span>
                                    )}
                                    {currentEpisode.year && (
                                        <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{currentEpisode.year}</span>
                                    )}
                                </div>
                                {currentEpisode.description && (
                                    <p className="text-slate-300 text-sm leading-relaxed">{currentEpisode.description}</p>
                                )}
                            </div>
                        )}

                        {/* Episode list */}
                        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-semibold">
                                    Episodes
                                    <span className="text-slate-500 text-base font-normal ml-2">({episodes.length})</span>
                                </h3>
                                {episodes.length === 0 && (
                                    <button
                                        onClick={() => navigate(`/series/${id}/add-episode`)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm transition"
                                    >
                                        <Plus className="w-4 h-4" /> Add First Episode
                                    </button>
                                )}
                            </div>

                            {episodes.length === 0 ? (
                                <div className="text-center py-10 text-slate-500">
                                    <Film className="w-12 h-12 mx-auto mb-3 text-slate-700" />
                                    <p>No episodes yet. Add the first one!</p>
                                </div>
                            ) : (
                                <>
                                    {/* Season tabs */}
                                    {seasons.length > 1 && (
                                        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                                            {seasons.map(s => (
                                                <button
                                                    key={s}
                                                    onClick={() => setSelectedSeason(s)}
                                                    className={`px-4 py-2 rounded-lg transition whitespace-nowrap text-sm font-medium ${
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

                                    <div className="space-y-2">
                                        {(episodesBySeason[selectedSeason] || []).map(ep => (
                                            <EpisodeRow
                                                key={ep._id}
                                                episode={ep}
                                                isActive={currentEpisode?._id === ep._id}
                                                onSelect={() => handleEpisodeSelect(ep)}
                                                onEdit={() => navigate(`/edit/${ep._id}`)}
                                                onDelete={(e) => handleDeleteEpisode(ep._id, e)}
                                            />
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        {/* Series Info */}
                        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
                            <h3 className="text-xl font-semibold mb-4">Series Info</h3>
                            {series.description && (
                                <p className="text-slate-300 text-sm leading-relaxed mb-4">{series.description}</p>
                            )}
                            <div className="space-y-3 text-sm">
                                <InfoRow label="Episodes" value={episodes.length} />
                                <InfoRow label="Seasons" value={seasons.length || 1} />
                                {series.year && <InfoRow label="Year" value={series.year} />}
                            </div>
                        </div>

                        {/* Metadata */}
                        <MetadataPanel item={series} />
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
        try {
            await videoAPI.toggleFavorite(id);
            setVideo(prev => ({ ...prev, isFavorite: !prev.isFavorite }));
            toast.success("Favorite updated");
        } catch (_) { toast.error("Failed to update favorite"); }
    };

    const handleDelete = async () => {
        if (!window.confirm("Delete this video?")) return;
        try {
            await videoAPI.deleteVideo(id);
            toast.success("Video deleted");
            navigate('/');
        } catch (_) { toast.error("Failed to delete"); }
    };

    if (loading) return <LoadingScreen />;
    if (!video) return <NotFoundScreen message="Video not found" />;

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <Toaster position="top-right" />

            <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
                <div className="container mx-auto p-4 flex items-center gap-4">
                    <button onClick={() => navigate('/')} className="p-2 hover:bg-slate-800 rounded-lg transition">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <h1 className="text-xl font-bold text-white truncate">{video.title}</h1>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main column */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Video Player */}
                        <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden">
                            <VideoPlayer
                                isEmbedded
                                videoUrl={videoAPI.getStreamUrl(id)}
                                availableQualities={video.resolutions?.map(r => r.quality) || []}
                            />
                        </div>

                        {/* Video Info */}
                        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
                            <div className="flex items-start justify-between gap-3 mb-4">
                                <h2 className="text-3xl font-bold uppercase">{video.title}</h2>
                                <div className="flex gap-1 shrink-0">
                                    <button
                                        onClick={() => navigate(`/edit/${id}`)}
                                        className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition"
                                        title="Edit video"
                                    >
                                        <Edit className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={handleDelete}
                                        className="p-2 bg-slate-800 hover:bg-red-900/60 text-slate-400 hover:text-red-400 rounded-lg transition"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={handleToggleFavorite}
                                        className={`p-2 rounded-lg transition ${video.isFavorite ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                                    >
                                        <Heart className="w-5 h-5" fill={video.isFavorite ? 'currentColor' : 'none'} />
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-4 mb-4 text-sm text-slate-400">
                                {video.views !== undefined && (
                                    <span className="flex items-center gap-1"><Eye className="w-4 h-4" />{video.views} views</span>
                                )}
                                {video.duration && (
                                    <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{formatDuration(video.duration)}</span>
                                )}
                                {video.uploadDate && (
                                    <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{new Date(video.uploadDate).toLocaleDateString()}</span>
                                )}
                                {video.year && (
                                    <span className="flex items-center gap-1"><Film className="w-4 h-4" />{video.year}</span>
                                )}
                            </div>

                            {video.description && (
                                <p className="text-slate-300 leading-relaxed">{video.description}</p>
                            )}
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
                            <h3 className="text-xl font-semibold mb-4">Details</h3>
                            <div className="text-sm space-y-2">
                                {video.fileSize && (
                                    <InfoRow label="File Size" value={formatFileSize(video.fileSize)} />
                                )}
                            </div>
                        </div>
                        <MetadataPanel item={video} />
                    </div>
                </div>
            </main>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────────────────
function EpisodeRow({ episode, isActive, onSelect, onEdit, onDelete }) {
    return (
        <div
            onClick={onSelect}
            className={`flex gap-3 p-3 rounded-lg cursor-pointer transition group ${
                isActive ? 'bg-red-500/20 border border-red-500/50' : 'bg-slate-800 hover:bg-slate-700'
            }`}
        >
            {/* Thumbnail */}
            <div className="w-28 h-16 shrink-0 bg-slate-900 rounded overflow-hidden relative">
                {episode.thumbnailPath ? (
                    <img
                        src={generalAPI.thumbnailUrl(episode.thumbnailPath)}
                        alt={episode.title}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-6 h-6 text-slate-700" />
                    </div>
                )}
                {isActive && (
                    <div className="absolute inset-0 bg-red-500/30 flex items-center justify-center">
                        <Play className="w-5 h-5 text-white" fill="currentColor" />
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-xs text-slate-500 mb-0.5">
                            S{episode.seasonNumber || 1} E{episode.episodeNumber || '?'}
                        </p>
                        <h4 className="font-semibold text-sm truncate">{episode.title}</h4>
                    </div>
                    {/* Action buttons shown on hover */}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                        <button
                            onClick={(e) => { e.stopPropagation(); onEdit(); }}
                            className="p-1 bg-slate-700 hover:bg-slate-600 rounded transition"
                            title="Edit"
                        >
                            <Edit className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(e); }}
                            className="p-1 bg-slate-700 hover:bg-red-900/60 rounded transition"
                            title="Delete"
                        >
                            <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-400" />
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    {episode.duration && <span>{formatDuration(episode.duration)}</span>}
                    {episode.views !== undefined && <span>{episode.views} views</span>}
                </div>
            </div>
        </div>
    );
}

function MetadataPanel({ item }) {
    if (!item) return null;
    const hasContent = (item.studios?.length > 0) || (item.actors?.length > 0) ||
        (item.characters?.length > 0) || (item.tags?.length > 0);
    if (!hasContent) return null;

    return (
        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800 space-y-4">
            <h3 className="text-xl font-semibold">Metadata</h3>

            {item.studios?.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
                        <Building className="w-4 h-4" /> Studios
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {item.studios.map((s, i) => (
                            <span key={i} className="px-2.5 py-1 bg-slate-800 rounded-full text-sm">{s}</span>
                        ))}
                    </div>
                </div>
            )}

            {item.actors?.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
                        <Users className="w-4 h-4" /> Actors
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {item.actors.map((a, i) => (
                            <span key={i} className="px-2.5 py-1 bg-slate-800 rounded-full text-sm">{a}</span>
                        ))}
                    </div>
                </div>
            )}

            {item.characters?.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
                        <UserCircle className="w-4 h-4" /> Characters
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {item.characters.map((c, i) => (
                            <span key={i} className="px-2.5 py-1 bg-slate-800 rounded-full text-sm">{c}</span>
                        ))}
                    </div>
                </div>
            )}

            {item.tags?.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
                        <Tag className="w-4 h-4" /> Tags
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {item.tags.map((t, i) => (
                            <span key={i} className="px-2.5 py-1 bg-slate-800 rounded-full text-sm">{t}</span>
                        ))}
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