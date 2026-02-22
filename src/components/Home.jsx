import React, { useCallback, useEffect, useState } from "react";
import { seriesAPI, videoAPI } from "../api/api";
import toast, { Toaster } from "react-hot-toast";
import { Film, Filter, Grid, Layers, List, Plus } from "lucide-react";
import VideoCard from "./VideoCard";
import SeriesCard from "./SeriesCard";
import FilterSidebar from "./FilterSidebar";
import { useNavigate } from "react-router-dom";
import useMyStorage from "../utils/localStorage";

const DEFAULT_FILTERS = {
    search: "",
    tags: [],
    studios: [],
    actors: [],
    characters: [],
    year: "",
    favorite: false,
    sortBy: "uploadDate",
    order: "desc"
};

function Home() {
    const navigate = useNavigate();

    const [seriesList, setSeriesList] = useState([]);
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [viewMode, setViewMode] = useMyStorage("vibeflix_view", "grid");
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [filters, setFilters] = useState(DEFAULT_FILTERS);

    const buildParams = useCallback((extra = {}) => ({
        page: currentPage,
        limit: 20,
        ...filters,
        tags: filters.tags.join(","),
        studios: filters.studios.join(","),
        actors: filters.actors.join(","),
        characters: filters.characters.join(","),
        ...extra
    }), [currentPage, filters]);

    const fetchContent = useCallback(async () => {
        setLoading(true);
        try {
            const params = buildParams();
            const [seriesData, videoData] = await Promise.all([
                seriesAPI.getSeries(params),
                videoAPI.getVideos(params)
            ]);

            setSeriesList(seriesData.series || []);
            setVideos(videoData.videos || []);
            setTotalPages(videoData.totalPages || 1);
        } catch (error) {
            console.error("Fetch error:", error);
            toast.error("Failed to load content");
        } finally {
            setLoading(false);
        }
    }, [buildParams]);

    useEffect(() => { fetchContent(); }, [fetchContent]);

    const handleSeriesClick = (series) => navigate(`/series/${series._id}`);
    const handleVideoClick = (video) => navigate(`/video/${video._id}`);

    const handleToggleFavoriteVideo = async (videoId, e) => {
        if (e) e.stopPropagation();
        try {
            await videoAPI.toggleFavorite(videoId);
            setVideos(prev => prev.map(v => v._id === videoId ? { ...v, isFavorite: !v.isFavorite } : v));
            toast.success("Favorite updated");
        } catch (_) { toast.error("Failed to update favorite"); }
    };

    const handleToggleFavoriteSeries = async (seriesId, e) => {
        if (e) e.stopPropagation();
        try {
            await seriesAPI.toggleFavorite(seriesId);
            setSeriesList(prev => prev.map(s => s._id === seriesId ? { ...s, isFavorite: !s.isFavorite } : s));
            toast.success("Favorite updated");
        } catch (_) { toast.error("Failed to update favorite"); }
    };

    const handleFilterChange = (newFilters) => {
        setFilters(newFilters);
        setCurrentPage(1);
    };

    const handleQuickSearch = (e) => {
        setFilters(f => ({ ...f, search: e.target.value }));
        setCurrentPage(1);
    };

    const handleTagClick = (tag, e) => {
        if (e) e.stopPropagation();
        if (!filters.tags.includes(tag)) {
            setFilters(f => ({ ...f, tags: [...f.tags, tag] }));
            setCurrentPage(1);
        }
    };

    const handleStudioClick = (studio, e) => {
        if (e) e.stopPropagation();
        if (!filters.studios.includes(studio)) {
            setFilters(f => ({ ...f, studios: [...f.studios, studio] }));
            setCurrentPage(1);
        }
    };

    const handleActorClick = (actor, e) => {
        if (e) e.stopPropagation();
        if (!filters.actors.includes(actor)) {
            setFilters(f => ({ ...f, actors: [...f.actors, actor] }));
            setCurrentPage(1);
        }
    };

    const handleCharacterClick = (character, e) => {
        if (e) e.stopPropagation();
        if (!filters.characters.includes(character)) {
            setFilters(f => ({ ...f, characters: [...f.characters, character] }));
            setCurrentPage(1);
        }
    };

    const handleRemoveFilter = (type, value) => {
        setFilters(f => {
            switch (type) {
                case 'tag': return { ...f, tags: f.tags.filter(t => t !== value) };
                case 'studio': return { ...f, studios: f.studios.filter(s => s !== value) };
                case 'actor': return { ...f, actors: f.actors.filter(a => a !== value) };
                case 'character': return { ...f, characters: f.characters.filter(c => c !== value) };
                case 'year': return { ...f, year: '' };
                case 'favorite': return { ...f, favorite: false };
                default: return f;
            }
        });
        setCurrentPage(1);
    };

    const hasFilters = filters.tags.length > 0 || filters.studios.length > 0 ||
        filters.actors.length > 0 || filters.characters.length > 0 ||
        filters.year || filters.favorite;

    const totalContent = seriesList.length + videos.length;

    return (
        <div className="min-h-screen bg-slate-950">
            <Toaster position="top-right" />

            {/* Header */}
            <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
                <div className="container mx-auto p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h1
                            className="text-3xl font-bold text-red-500 cursor-pointer hover:text-red-400 transition"
                            onClick={() => navigate('/')}
                        >
                            VIBEFLIX
                        </h1>

                        <div className="flex items-center gap-2">
                            {/* View mode toggle */}
                            <button
                                onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
                                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition"
                                title={`Switch to ${viewMode === 'grid' ? 'list' : 'grid'} view`}
                            >
                                {viewMode === 'grid' ? <List className="w-5 h-5 text-white" /> : <Grid className="w-5 h-5 text-white" />}
                            </button>

                            {/* Filter button */}
                            <button
                                onClick={() => setShowFilters(true)}
                                className={`flex items-center gap-2 p-2 rounded-lg transition ${
                                    hasFilters ? 'bg-red-500 text-white' : 'bg-slate-800 text-white hover:bg-slate-700'
                                }`}
                            >
                                <Filter className="w-5 h-5" />
                                <span className="hidden sm:inline">
                                    Filters {hasFilters && `(${
                                        filters.tags.length + filters.studios.length + filters.actors.length +
                                        filters.characters.length + (filters.year ? 1 : 0) + (filters.favorite ? 1 : 0)
                                    })`}
                                </span>
                            </button>

                            {/* Create series */}
                            <button
                                onClick={() => navigate('/series/create')}
                                className="flex items-center gap-2 p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition"
                                title="Create new series"
                            >
                                <Layers className="w-5 h-5" />
                                <span className="hidden sm:inline">New Series</span>
                            </button>

                            {/* Upload video */}
                            <button
                                onClick={() => navigate('/upload')}
                                className="flex items-center gap-2 p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition"
                            >
                                <Plus className="w-5 h-5" />
                                <span className="hidden sm:inline">Upload</span>
                            </button>
                        </div>
                    </div>

                    {/* Quick search */}
                    <input
                        type="text"
                        value={filters.search}
                        onChange={handleQuickSearch}
                        placeholder="Quick search..."
                        className="w-full px-4 py-2 bg-slate-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 mb-3"
                    />

                    {/* Active filter pills */}
                    {hasFilters && (
                        <div className="flex flex-wrap gap-2">
                            {filters.favorite && (
                                <FilterPill label="Favorites" onRemove={() => handleRemoveFilter('favorite')} color="red" />
                            )}
                            {filters.studios.map((s, i) => (
                                <FilterPill key={i} label={`Studio: ${s}`} onRemove={() => handleRemoveFilter('studio', s)} />
                            ))}
                            {filters.actors.map((a, i) => (
                                <FilterPill key={i} label={`Actor: ${a}`} onRemove={() => handleRemoveFilter('actor', a)} color="blue" />
                            ))}
                            {filters.characters.map((c, i) => (
                                <FilterPill key={i} label={`Character: ${c}`} onRemove={() => handleRemoveFilter('character', c)} color="purple" />
                            ))}
                            {filters.year && (
                                <FilterPill label={`Year: ${filters.year}`} onRemove={() => handleRemoveFilter('year')} color="green" />
                            )}
                            {filters.tags.map((t, i) => (
                                <FilterPill key={i} label={t} onRemove={() => handleRemoveFilter('tag', t)} />
                            ))}
                        </div>
                    )}
                </div>
            </header>

            {/* Main content */}
            <main className="container mx-auto px-4 py-8">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mb-4" />
                        <p className="text-white text-xl">Loading...</p>
                    </div>
                ) : totalContent === 0 ? (
                    <EmptyState hasFilters={hasFilters || !!filters.search} navigate={navigate} />
                ) : (
                    <>
                        {/* ── Series section ── */}
                        {seriesList.length > 0 && (
                            <section className="mb-10">
                                <div className="flex items-center gap-3 mb-4">
                                    <Layers className="w-5 h-5 text-red-500" />
                                    <h2 className="text-xl font-bold text-white">Series</h2>
                                    <span className="text-slate-500 text-sm">({seriesList.length})</span>
                                </div>
                                <div className={
                                    viewMode === 'grid'
                                        ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
                                        : 'space-y-3'
                                }>
                                    {seriesList.map(series => (
                                        <SeriesCard
                                            key={series._id}
                                            series={series}
                                            viewMode={viewMode}
                                            onClick={() => handleSeriesClick(series)}
                                            onToggleFavorite={(e) => handleToggleFavoriteSeries(series._id, e)}
                                            onActorClick={handleActorClick}
                                            onCharacterClick={handleCharacterClick}
                                            onStudioClick={handleStudioClick}
                                            onTagClick={handleTagClick}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* ── Standalone Videos section ── */}
                        {videos.length > 0 && (
                            <section>
                                {seriesList.length > 0 && (
                                    <div className="flex items-center gap-3 mb-4">
                                        <Film className="w-5 h-5 text-red-500" />
                                        <h2 className="text-xl font-bold text-white">Videos</h2>
                                        <span className="text-slate-500 text-sm">({videos.length})</span>
                                    </div>
                                )}
                                <div className={
                                    viewMode === 'grid'
                                        ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
                                        : 'space-y-3'
                                }>
                                    {videos.map(video => (
                                        <VideoCard
                                            key={video._id}
                                            video={video}
                                            viewMode={viewMode}
                                            onClick={() => handleVideoClick(video)}
                                            onToggleFavorite={(e) => handleToggleFavoriteVideo(video._id, e)}
                                            onTagClick={handleTagClick}
                                            onStudioClick={handleStudioClick}
                                            onCharacterClick={handleCharacterClick}
                                            onActorClick={handleActorClick}
                                        />
                                    ))}
                                </div>

                                {/* Pagination for videos */}
                                {totalPages > 1 && (
                                    <div className="flex justify-center items-center gap-2 mt-8">
                                        <button
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                            className="px-4 py-2 bg-slate-800 text-white rounded-lg disabled:opacity-50 hover:bg-slate-700 transition"
                                        >
                                            Previous
                                        </button>
                                        <div className="flex gap-2">
                                            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                                const pageNum = currentPage <= 3
                                                    ? i + 1
                                                    : currentPage >= totalPages - 2
                                                        ? totalPages - 4 + i
                                                        : currentPage - 2 + i;
                                                if (pageNum < 1 || pageNum > totalPages) return null;
                                                return (
                                                    <button
                                                        key={pageNum}
                                                        onClick={() => setCurrentPage(pageNum)}
                                                        className={`px-4 py-2 rounded-lg transition ${
                                                            currentPage === pageNum ? 'bg-red-500 text-white' : 'bg-slate-800 text-white hover:bg-slate-700'
                                                        }`}
                                                    >
                                                        {pageNum}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <button
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            disabled={currentPage === totalPages}
                                            className="px-4 py-2 bg-slate-800 text-white rounded-lg disabled:opacity-50 hover:bg-slate-700 transition"
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}
                            </section>
                        )}
                    </>
                )}
            </main>

            <FilterSidebar
                isOpen={showFilters}
                onClose={() => setShowFilters(false)}
                onFilterChange={handleFilterChange}
                currentFilters={filters}
            />
        </div>
    );
}

function FilterPill({ label, onRemove, color = "slate" }) {
    const colorMap = {
        red: 'bg-red-500/20 text-red-300 hover:bg-red-500/30',
        blue: 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30',
        purple: 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30',
        green: 'bg-green-500/20 text-green-300 hover:bg-green-500/30',
        slate: 'bg-slate-700 text-slate-300 hover:bg-slate-600'
    };
    return (
        <button
            onClick={onRemove}
            className={`group px-3 py-1 text-sm rounded-full transition flex items-center gap-1.5 ${colorMap[color]}`}
        >
            {label}
            <span className="opacity-60 group-hover:opacity-100 text-base leading-none">×</span>
        </button>
    );
}

function EmptyState({ hasFilters, navigate }) {
    return (
        <div className="flex flex-col items-center justify-center h-64 text-center">
            <Film className="w-24 h-24 text-slate-700 mb-4" />
            <p className="text-slate-400 text-xl mb-2">
                {hasFilters ? 'No results found' : 'Nothing here yet'}
            </p>
            <p className="text-slate-500 mb-6 text-sm">
                {hasFilters ? 'Try adjusting your filters' : 'Start by creating a series or uploading a video'}
            </p>
            {!hasFilters && (
                <div className="flex gap-3">
                    <button
                        onClick={() => navigate('/series/create')}
                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition font-medium"
                    >
                        <Layers className="w-4 h-4" />
                        Create Series
                    </button>
                    <button
                        onClick={() => navigate('/upload')}
                        className="flex items-center gap-2 px-5 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-medium"
                    >
                        <Plus className="w-4 h-4" />
                        Upload Video
                    </button>
                </div>
            )}
        </div>
    );
}

export default Home;