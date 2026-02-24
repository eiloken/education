import React, { useCallback, useEffect, useRef, useState } from "react";
import { seriesAPI, videoAPI } from "../api/api";
import toast from "react-hot-toast";
import { Film, Filter, Grid, Layers, List, Plus, Search } from "lucide-react";
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

// Content-type display modes
const DISPLAY_MODES = [
    { value: 'all', label: 'All', icon: null },
    { value: 'series', label: 'Series', icon: Layers },
    { value: 'videos', label: 'Videos', icon: Film },
];

function Home() {
    const navigate = useNavigate();

    const [seriesList, setSeriesList] = useState([]);
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [viewMode, setViewMode] = useMyStorage("vibeflix_view", "grid");
    const [displayMode, setDisplayMode] = useMyStorage("vibeflix_display", "all"); // all | series | videos
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [filters, setFilters] = useState(DEFAULT_FILTERS);

    const [searchTerm, setSearchTerm] = useState('');
    const [showQuickSearch, setShowQuickSearch] = useState(false);
    const quickSearchRef = useRef(null);

    const buildParams = useCallback((extra = {}) => ({
        page: currentPage,
        limit: 20,
        exceptSeries: displayMode !== 'videos',
        ...filters,
        tags: filters.tags.join(","),
        studios: filters.studios.join(","),
        actors: filters.actors.join(","),
        characters: filters.characters.join(","),
        ...extra
    }), [currentPage, filters, displayMode]);

    const fetchContent = useCallback(async () => {
        setLoading(true);
        try {
            const params = buildParams();
            const [seriesData, videoData] = await Promise.all([
                displayMode !== 'videos' ? seriesAPI.getSeries(params) : Promise.resolve({ series: [] }),
                displayMode !== 'series' ? videoAPI.getVideos(params) : Promise.resolve({ videos: [], totalPages: 1 }),
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
    }, [buildParams, displayMode]);

    useEffect(() => { fetchContent(); }, [fetchContent]);
    useEffect(() => { setCurrentPage(1); }, [displayMode]);

    useEffect(() => {
        const debounce = setTimeout(() => {
            setFilters(f => ({ ...f, search: searchTerm }));
            setCurrentPage(1);
        }, 500);

        return () => clearTimeout(debounce);
    }, [searchTerm]);

    const handleToggleFavoriteVideo = async (videoId) => {
        toast.promise(videoAPI.toggleFavorite(videoId).then((res) => {
            if (res?.success) {
                setVideos(prev => prev.map(v => v._id === videoId ? { ...v, isFavorite: !v.isFavorite } : v));
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

    const handleToggleFavoriteSeries = async (seriesId) => {
        toast.promise(seriesAPI.toggleFavorite(seriesId).then((res) => {
            if (res?.success) {
                setSeriesList(prev => prev.map(s => s._id === seriesId ? { ...s, isFavorite: !s.isFavorite } : s));
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

    const handleFilterChange = (newFilters) => {
        setFilters(newFilters);
        setCurrentPage(1);
    };

    const handleTagClick = (tag, e) => {
        if (!filters.tags.includes(tag)) { 
            setFilters(f => ({ ...f, tags: [...f.tags, tag] })); 
            setCurrentPage(1); 
        }
    };

    const handleStudioClick = (studio) => {
        if (!filters.studios.includes(studio)) { 
            setFilters(f => ({ ...f, studios: [...f.studios, studio] })); 
            setCurrentPage(1); 
        }
    };

    const handleActorClick = (actor) => {
        if (!filters.actors.includes(actor)) { 
            setFilters(f => ({ ...f, actors: [...f.actors, actor] })); 
            setCurrentPage(1); 
        }
    };

    const handleCharacterClick = (character) => {
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

    const handleShowQuickSearch = () => {
        setShowQuickSearch(true);
        setTimeout(() => quickSearchRef.current?.focus(), 0);
    };

    const hasFilters = filters.tags.length > 0 || filters.studios.length > 0 ||
        filters.actors.length > 0 || filters.characters.length > 0 ||
        filters.year || filters.favorite;

    const totalContent = seriesList.length + videos.length;
    const showSeries = displayMode !== 'videos';
    const showVideos = displayMode !== 'series';

    const filterCount = filters.tags.length + filters.studios.length + filters.actors.length +
        filters.characters.length + (filters.year ? 1 : 0) + (filters.favorite ? 1 : 0);

    return (
        <div className="min-h-screen bg-slate-950">
            {/* Header */}
            <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
                <div className="container mx-auto px-3 sm:px-4 pt-3 sm:pt-4 pb-2 sm:pb-3">
                    {/* Top row */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                        <h1
                            className="text-2xl sm:text-3xl font-bold text-red-500 cursor-pointer hover:text-red-400 transition shrink-0"
                            onClick={() => navigate('/')}
                        >
                            VIBEFLIX
                        </h1>

                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
                            {/* View mode toggle */}
                            <button
                                onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
                                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition"
                                title={`Switch to ${viewMode === 'grid' ? 'list' : 'grid'} view`}
                            >
                                {viewMode === 'grid'
                                    ? <List className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                                    : <Grid className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                                }
                            </button>

                            {/* Filter button */}
                            <button
                                onClick={() => setShowFilters(true)}
                                className={`flex items-center gap-1.5 px-2 py-2 sm:px-3 rounded-lg transition ${
                                    hasFilters ? 'bg-red-500 text-white' : 'bg-slate-800 text-white hover:bg-slate-700'
                                }`}
                            >
                                <Filter className="w-4 h-4 sm:w-5 sm:h-5" />
                                <span className="hidden sm:inline text-sm">
                                    Filters{filterCount > 0 ? ` (${filterCount})` : ''}
                                </span>
                            </button>

                            {/* Create series */}
                            <button
                                onClick={() => navigate('/series/create')}
                                className="flex items-center gap-1.5 px-2 py-2 sm:px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition"
                                title="Create new series"
                            >
                                <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
                                <span className="hidden sm:inline text-sm">New Series</span>
                            </button>

                            {/* Upload video */}
                            <button
                                onClick={() => navigate('/upload')}
                                className="flex items-center gap-1.5 px-2 py-2 sm:px-3 bg-red-500 hover:bg-red-600 text-white rounded-lg transition"
                            >
                                <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                                <span className="hidden sm:inline text-sm">Upload</span>
                            </button>
                        </div>
                    </div>

                    {/* Display mode tabs + search row */}
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between mb-2">
                        <div className="flex gap-2 items-center justify-between">
                            {/* Display mode tabs */}
                            <div className="flex gap-1 bg-slate-900 p-1 rounded-lg shrink-0">
                                {DISPLAY_MODES.map(({ value, label, icon: Icon }) => (
                                    <button
                                        key={value}
                                        onClick={() => setDisplayMode(value)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                                            displayMode === value
                                                ? 'bg-red-500 text-white shadow-sm'
                                                : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                        }`}
                                    >
                                        {Icon && <Icon className="w-3.5 h-3.5" />}
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {!showQuickSearch && (
                                <button 
                                    onClick={handleShowQuickSearch}
                                    className="px-3 py-2.5 rounded-md transition text-slate-400 hover:text-white hover:bg-slate-800 block sm:hidden"
                                >
                                    <Search className="w-4.5 h-4.5" />
                                </button>
                            )}
                        </div>

                        {/* Quick search */}
                        <div className={`relative text-sm ${showQuickSearch ? 'flex flex-1' : 'hidden sm:flex sm:w-auto'}`}>
                            <Search className="w-3.5 h-3.5 absolute top-1/2 left-2 -translate-y-1/2 text-slate-400" />
                            <input 
                                ref={quickSearchRef}
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onBlur={() => setShowQuickSearch(false)}
                                placeholder="Quick search…"
                                className="px-8 py-2.5 bg-slate-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 w-full sm:w-auto"
                            />
                        </div>
                    </div>

                    {/* Active filter pills */}
                    {hasFilters && (
                        <div className="flex flex-wrap gap-1.5 pb-1">
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
            <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mb-4" />
                        <p className="text-white text-lg">Loading…</p>
                    </div>
                ) : totalContent === 0 ? (
                    <EmptyState hasFilters={hasFilters || !!filters.search} navigate={navigate} />
                ) : (
                    <>
                        {/* ── Series section ── */}
                        {showSeries && seriesList.length > 0 && (
                            <section className="mb-8 sm:mb-10">
                                <div className="flex items-center gap-3 mb-4">
                                    <Layers className="w-5 h-5 text-red-500" />
                                    <h2 className="text-lg sm:text-xl font-bold text-white">Series</h2>
                                    <span className="text-slate-500 text-sm">({seriesList.length})</span>
                                </div>
                                <div className={
                                    viewMode === 'grid'
                                        ? 'grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6'
                                        : 'space-y-3'
                                }>
                                    {seriesList.map(series => (
                                        <SeriesCard
                                            key={series._id}
                                            series={series}
                                            viewMode={viewMode} 
                                            onToggleFavorite={() => handleToggleFavoriteSeries(series._id)}
                                            onActorClick={handleActorClick}
                                            onCharacterClick={handleCharacterClick}
                                            onStudioClick={handleStudioClick}
                                            onTagClick={handleTagClick}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Divider between sections when both are shown */}
                        {showSeries && showVideos && seriesList.length > 0 && videos.length > 0 && (
                            <div className="border-t border-slate-800 mb-8 sm:mb-10" />
                        )}

                        {/* ── Videos section ── */}
                        {showVideos && videos.length > 0 && (
                            <section>
                                {(displayMode === 'all' && seriesList.length > 0) || displayMode === 'videos' ? (
                                    <div className="flex items-center gap-3 mb-4">
                                        <Film className="w-5 h-5 text-red-500" />
                                        <h2 className="text-lg sm:text-xl font-bold text-white">Videos</h2>
                                        <span className="text-slate-500 text-sm">({videos.length})</span>
                                    </div>
                                ) : null}
                                <div className={
                                    viewMode === 'grid'
                                        ? 'grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6'
                                        : 'space-y-3'
                                }>
                                    {videos.map(video => (
                                        <VideoCard
                                            key={video._id}
                                            video={video}
                                            viewMode={viewMode}
                                            onToggleFavorite={() => handleToggleFavoriteVideo(video._id)}
                                            onTagClick={handleTagClick}
                                            onStudioClick={handleStudioClick}
                                            onCharacterClick={handleCharacterClick}
                                            onActorClick={handleActorClick}
                                        />
                                    ))}
                                </div>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="flex justify-center items-center gap-2 mt-8">
                                        <button
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                            className="px-3 sm:px-4 py-2 bg-slate-800 text-white rounded-lg disabled:opacity-50 hover:bg-slate-700 transition text-sm"
                                        >
                                            Prev
                                        </button>
                                        <div className="flex gap-1.5">
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
                                                        className={`w-9 h-9 rounded-lg text-sm transition ${
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
                                            className="px-3 sm:px-4 py-2 bg-slate-800 text-white rounded-lg disabled:opacity-50 hover:bg-slate-700 transition text-sm"
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
            className={`group px-2.5 py-1 text-xs sm:text-sm rounded-full transition flex items-center gap-1 ${colorMap[color]}`}
        >
            {label}
            <span className="opacity-60 group-hover:opacity-100 text-base leading-none">×</span>
        </button>
    );
}

function EmptyState({ hasFilters, navigate }) {
    return (
        <div className="flex flex-col items-center justify-center h-64 text-center px-4">
            <Film className="w-20 h-20 text-slate-700 mb-4" />
            <p className="text-slate-400 text-lg sm:text-xl mb-2">
                {hasFilters ? 'No results found' : 'Nothing here yet'}
            </p>
            <p className="text-slate-500 mb-6 text-sm">
                {hasFilters ? 'Try adjusting your filters' : 'Start by creating a series or uploading a video'}
            </p>
            {!hasFilters && (
                <div className="flex gap-3 flex-wrap justify-center">
                    <button
                        onClick={() => navigate('/series/create')}
                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition font-medium text-sm"
                    >
                        <Layers className="w-4 h-4" />
                        Create Series
                    </button>
                    <button
                        onClick={() => navigate('/upload')}
                        className="flex items-center gap-2 px-5 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-medium text-sm"
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