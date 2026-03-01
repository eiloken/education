import React, { forwardRef, Fragment, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { seriesAPI, videoAPI } from "../api/api";
import toast from "react-hot-toast";
import {
    ChevronLeft, ChevronRight, ChevronUp,
    Film, Filter, Grid, Layers, List, Plus, Search,
    ArrowLeft, TrendingUp, Star, Clock, Flame, Zap,
    View,
    Heart,
    CalendarDays
} from "lucide-react";
import VideoCard from "./VideoCard";
import SeriesCard from "./SeriesCard";
import FilterSidebar, { DEFAULT_FILTERS, cycleItem } from "./FilterSidebar";
import Pagination from "./Pagination";
import { useNavigate, useSearchParams } from "react-router-dom";
import useMyStorage from "../utils/localStorage";

// ─── Util: ISO string for N days ago ─────────────────────────────────────────
const daysAgoISO = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
};

// ─── Section configs ──────────────────────────────────────────────────────────
// "trending" uses dateFrom so it's built at render time; others are static params.
const SECTIONS = [
    {
        id: 'trending_week',
        title: 'Trending This Week',
        icon: TrendingUp,
        getParams: () => ({ sortBy: 'views', order: 'desc', dateFrom: daysAgoISO(7) }),
    },
    {
        id: 'mostViewed',
        title: 'Most Viewed',
        icon: Flame,
        getParams: () => ({ sortBy: 'views', order: 'desc' }),
    },
    {
        id: 'newest',
        title: 'New Arrivals',
        icon: Clock,
        getParams: () => ({ sortBy: 'createdAt', order: 'desc' }),
    }
];

const DISPLAY_MODES = [
    { value: 'all',    label: 'All',    icon: null   },
    { value: 'series', label: 'Series', icon: Layers },
    { value: 'videos', label: 'Videos', icon: Film   },
];

function HomeSection({ section, items, cardProps, handleShowAll, handleToggleFavoriteSeries, handleToggleFavoriteVideo }) {
    const rowRef = useRef(null);

    const [canLeft,  setCanLeft]  = useState(false);
    const [canRight, setCanRight] = useState(false);

    if (items.length === 0) return null;
    const Icon  = section.icon;

    return (
        <section key={section.id}>
            {/* ── Section header: [← ] Title · Show all [ →] ── */}
            <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
                <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 shrink-0" />
                    <h2 className="text-base sm:text-lg font-bold text-white truncate">{section.title}</h2>
                </div>
                
                <div className="flex items-center gap-2">
                    <button 
                        disabled={!canLeft}
                        onClick={() => rowRef.current?.scrollLeft()} 
                        className={`px-3 py-2 rounded-lg transition hidden sm:flex ${
                            canLeft ? 'text-slate-400 hover:text-slate-300 hover:bg-red-800/30' : 'text-slate-600 cursor-not-allowed'
                        }`}
                    >
                        <ChevronLeft className="w-3 h-3" />
                    </button>
                    <button
                        onClick={() => handleShowAll(section)}
                        className="px-3 py-2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-300 hover:bg-red-800/30 transition"
                    >
                        Show all
                    </button>
                    <button 
                        disabled={!canRight}
                        onClick={() => rowRef.current?.scrollRight()} 
                        className={`px-3 py-2 rounded-lg transition hidden sm:flex ${
                            canRight ? 'text-slate-400 hover:text-slate-300 hover:bg-red-800/30' : 'text-slate-600 cursor-not-allowed'
                        }`}
                    >
                        <ChevronRight className="w-3 h-3" />
                    </button>
                </div>
            </div>

            {/* ── Scroll row with arrow buttons ── */}
            <HScrollRow 
                ref={rowRef} 
                itemCount={items.length} 
                onArrowChange={({ canLeft, canRight }) => { setCanLeft(canLeft); setCanRight(canRight); }}
            >
                {items.map(item => (
                    <div key={item._id} className="shrink-0 w-44 sm:w-52 snap-start [&>a]:border-x-0 [&>a]:rounded-x-none">
                        {item._type === 'series' ? (
                            <SeriesCard
                                series={item}
                                onToggleFavorite={() => handleToggleFavoriteSeries(item._id)}
                                {...cardProps}
                            />
                        ) : (
                            <VideoCard
                                video={item}
                                onToggleFavorite={() => handleToggleFavoriteVideo(item._id)}
                                {...cardProps}
                            />
                        )}
                    </div>
                ))}
            </HScrollRow>
        </section>
    );
}

// ─── HScrollRow — horizontal scrollable row with arrow nav ───────────────────
const HScrollRow = forwardRef(({ children, itemCount, onArrowChange }, ref) => {
    const rowRef = useRef(null);

    const SCROLL_AMT = 800; // px per arrow click (≈ 3–4 cards)

    const updateArrows = useCallback(() => {
        const el = rowRef.current;
        if (!el) return;

        const newCanLeft = el.scrollLeft > 4;
        const newCanRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;

        onArrowChange?.({ canLeft: newCanLeft, canRight: newCanRight });
    }, [onArrowChange]);

    useEffect(() => {
        const el = rowRef.current;
        if (!el) return;
        updateArrows();
        el.addEventListener('scroll', updateArrows, { passive: true });
        const ro = new ResizeObserver(updateArrows);
        ro.observe(el);
        return () => { el.removeEventListener('scroll', updateArrows); ro.disconnect(); };
    }, [updateArrows, itemCount]);

    const scroll = (dir) => rowRef.current?.scrollBy({ left: dir * SCROLL_AMT, behavior: 'smooth' });
    
    useImperativeHandle(ref, () => ({
        scrollLeft: () => scroll(-1),
        scrollRight: () => scroll(1),
    }));

    return (
        <div className="relative">
            <div
                ref={rowRef}
                className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scroll-smooth -mx-3 px-3 sm:-mx-4 sm:px-4"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                <style>{`.hscroll-hide::-webkit-scrollbar{display:none}`}</style>
                {children}
            </div>
        </div>
    );
});

const SearchBox = forwardRef(({ searchTerm, setSearchTerm, onBlur }, ref) => {
    const searchBoxRef = useRef(null);
    
    useImperativeHandle(ref, () => searchBoxRef.current);

    return (
        <div className="relative text-sm p-0.5">
            <Search className="w-3.5 h-3.5 absolute top-1/2 left-2 -translate-y-1/2 text-slate-400" />
            <input
                ref={searchBoxRef}
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onBlur={onBlur}
                placeholder="Quick search…"
                className="px-8 py-2.5 bg-slate-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 w-full sm:w-auto"
            />
        </div>
    );
});

// ─── Home ─────────────────────────────────────────────────────────────────────
function Home() {
    const navigate = useNavigate();

    const [displayMode, setDisplayMode] = useMyStorage("vibeflix_display", "all");

    // ── Section state ─────────────────────────────────────────────────────────
    const [sectionsData, setSectionsData] = useState({});
    const [sectionsLoading, setSectionsLoading] = useState(true);

    // ── URL-driven navigation state ───────────────────────────────────────────
    const [searchParams, setSearchParams] = useSearchParams();
    const homeMode      = searchParams.get('mode') || 'home';
    const detailSectionId = searchParams.get('section');
    const detailSection   = SECTIONS.find(s => s.id === detailSectionId) || null;
    const seriesPage    = parseInt(searchParams.get('seriesPage') || '1', 10);
    const videosPage    = parseInt(searchParams.get('videosPage') || '1', 10);

    /** Merge updates into current search params */
    const updateParams = useCallback((updates) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            Object.entries(updates).forEach(([k, v]) => {
                if (v == null) next.delete(k);
                else next.set(k, String(v));
            });
            return next;
        }, { replace: false });
    }, [setSearchParams]);

    const [videos, setVideos] = useState([]);
    const [seriesList, setSeriesList] = useState([]);
    const [seriesLoading, setSeriesLoading] = useState(false);
    const [videosLoading, setVideosLoading] = useState(false);
    const [seriesTotalPages, setSeriesTotalPages] = useState(1);
    const [videosTotalPages, setVideosTotalPages] = useState(1);

    // ── Filters ───────────────────────────────────────────────────────────────
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [showFilters, setShowFilters] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showQuickSearch, setShowQuickSearch] = useState(false);
    const quickSearchRef = useRef(null);

    const [showScrollTop, setShowScrollTop] = useState(false);

    // ── Helpers ───────────────────────────────────────────────────────────────
    const hasActiveFilters = useCallback((f) =>
        f.tags?.length > 0 || f.tagsExclude?.length > 0 ||
        f.studios?.length > 0 || f.studiosExclude?.length > 0 ||
        f.actors?.length > 0 || f.actorsExclude?.length > 0 ||
        f.characters?.length > 0 || f.charactersExclude?.length > 0 ||
        f.year || f.favorite || f.search,
    []);

    // Build API params for filtered/detail mode (no page – passed per-section)
    const buildApiParams = useCallback((extra = {}) => ({
        limit: 20,
        search: filters.search || undefined,
        tags: filters.tags?.join(',') || undefined,
        tagsExclude: filters.tagsExclude?.join(',') || undefined,
        studios: filters.studios?.join(',') || undefined,
        studiosExclude: filters.studiosExclude?.join(',') || undefined,
        actors: filters.actors?.join(',') || undefined,
        actorsExclude: filters.actorsExclude?.join(',') || undefined,
        characters: filters.characters?.join(',') || undefined,
        charactersExclude: filters.charactersExclude?.join(',') || undefined,
        year: filters.year || undefined,
        favorite: filters.favorite || undefined,
        filterMode: filters.filterMode,
        sortBy: filters.sortBy,
        order: filters.order,
        ...extra,
    }), [filters]);

    // ── Fetch section data (home mode) ────────────────────────────────────────
    const fetchSections = useCallback(async () => {
        setSectionsLoading(true);
        try {
            const results = await Promise.all(
                SECTIONS.map(async s => {
                    const p = s.getParams();
                    const [sd, vd] = await Promise.all([
                        // Series: only when displayMode !== 'videos'
                        displayMode !== 'videos'
                            ? seriesAPI.getSeries({ ...p, limit: 20 })
                            : Promise.resolve({ series: [] }),
                        // Videos: for 'videos' mode fetch ALL (including episodes), else standalone only
                        displayMode !== 'series'
                            ? videoAPI.getVideos({
                                ...p,
                                limit: 20,
                                exceptSeries: displayMode === 'all' ? 'true' : 'false',
                            })
                            : Promise.resolve({ videos: [] }),
                    ]);
                    return ({
                        id: s.id,
                        videos: vd.videos || [],
                        series: sd.series || [],
                    });
                })
            );
            const data = {};
            results.forEach(r => { data[r.id] = { videos: r.videos, series: r.series }; });
            setSectionsData(data);
        } catch (err) {
            console.error('Fetch sections error:', err);
            toast.error('Failed to load content');
        } finally {
            setSectionsLoading(false);
        }
    }, [displayMode]);

    // ── Fetch detail / filtered results — series ──────────────────────────────
    const fetchSeriesContent = useCallback(async () => {
        if (displayMode === 'videos') { setSeriesList([]); setSeriesTotalPages(1); return; }
        setSeriesLoading(true);
        try {
            const base = homeMode === 'detail' && detailSection
                ? { ...detailSection.getParams(), page: seriesPage, limit: 20 }
                : buildApiParams({ page: seriesPage });
            const data = await seriesAPI.getSeries(base);
            setSeriesList(data.series || []);
            setSeriesTotalPages(data.totalPages || 1);
        } catch (err) {
            console.error('Fetch series error:', err);
            toast.error('Failed to load series');
        } finally {
            setSeriesLoading(false);
        }
    }, [homeMode, detailSection, seriesPage, buildApiParams, displayMode]);

    // ── Fetch detail / filtered results — videos ──────────────────────────────
    const fetchVideosContent = useCallback(async () => {
        if (displayMode === 'series') { setVideos([]); setVideosTotalPages(1); return; }
        setVideosLoading(true);
        try {
            const base = homeMode === 'detail' && detailSection
                ? { ...detailSection.getParams(), page: videosPage, limit: 20 }
                : buildApiParams({ page: videosPage });
            const data = await videoAPI.getVideos({
                ...base,
                exceptSeries: displayMode === 'all' ? 'true' : undefined,
            });
            setVideos(data.videos || []);
            setVideosTotalPages(data.totalPages || 1);
        } catch (err) {
            console.error('Fetch videos error:', err);
            toast.error('Failed to load videos');
        } finally {
            setVideosLoading(false);
        }
    }, [homeMode, detailSection, videosPage, buildApiParams, displayMode]);

    // ── Effects ───────────────────────────────────────────────────────────────
    useEffect(() => {
        if (homeMode === 'home') fetchSections();
    }, [homeMode, fetchSections]);

    useEffect(() => {
        if (homeMode !== 'home') fetchSeriesContent();
    }, [homeMode, fetchSeriesContent]);

    useEffect(() => {
        if (homeMode !== 'home') fetchVideosContent();
    }, [homeMode, fetchVideosContent]);

    // Search debounce
    useEffect(() => {
        const t = setTimeout(() => {
            const nf = { ...filters, search: searchTerm };
            setFilters(nf);
            const nextMode = hasActiveFilters(nf) ? 'filtered' : 'home';
            setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                next.set('mode', nextMode);
                next.set('seriesPage', '1');
                next.set('videosPage', '1');
                if (nextMode !== 'detail') next.delete('section');
                return next;
            }, { replace: true });
        }, 500);
        return () => clearTimeout(t);
    }, [searchTerm]); // eslint-disable-line react-hooks/exhaustive-deps

    // Scroll effects
    useEffect(() => {
        const handler = () => {
            const y = window.scrollY;
            setShowScrollTop(y > 300);
        };
        window.addEventListener('scroll', handler, { passive: true });
        return () => window.removeEventListener('scroll', handler);
    }, []);

    // ── Actions ───────────────────────────────────────────────────────────────
    const handleToggleFavoriteVideo = (videoId) => {
        toast.promise(
            videoAPI.toggleFavorite(videoId).then(res => {
                if (!res?.success) throw new Error();
                // Update detail/filtered list
                setVideos(prev => prev.map(v => v._id === videoId ? { ...v, isFavorite: !v.isFavorite } : v));
                // Fix 1: Also update home sections so heart icon reflects immediately
                setSectionsData(prev => {
                    const next = { ...prev };
                    Object.keys(next).forEach(sId => {
                        next[sId] = {
                            ...next[sId],
                            videos: (next[sId].videos || []).map(v =>
                                v._id === videoId ? { ...v, isFavorite: !v.isFavorite } : v
                            ),
                        };
                    });
                    return next;
                });
            }),
            { loading: 'Changing favorite...', success: 'Favorite updated', error: 'Failed' }
        );
    };

    const handleToggleFavoriteSeries = (seriesId) => {
        toast.promise(
            seriesAPI.toggleFavorite(seriesId).then(res => {
                if (!res?.success) throw new Error();
                setSeriesList(prev => prev.map(s => s._id === seriesId ? { ...s, isFavorite: !s.isFavorite } : s));
                // Fix 1: Also update home sections
                setSectionsData(prev => {
                    const next = { ...prev };
                    Object.keys(next).forEach(sId => {
                        next[sId] = {
                            ...next[sId],
                            series: (next[sId].series || []).map(s =>
                                s._id === seriesId ? { ...s, isFavorite: !s.isFavorite } : s
                            ),
                        };
                    });
                    return next;
                });
            }),
            { loading: 'Changing favorite...', success: 'Favorite updated', error: 'Failed' }
        );
    };

    const handleFilterChange = (newFilters) => {
        setFilters(newFilters);
        const nextMode = hasActiveFilters(newFilters) ? 'filtered' : 'home';
        updateParams({ mode: nextMode, section: null, seriesPage: '1', videosPage: '1' });
    };

    const handleChipClick = (field, value) => {
        const nf = cycleItem(filters, field, value);
        setFilters(nf);
        const nextMode = hasActiveFilters(nf) ? 'filtered' : 'home';
        updateParams({ mode: nextMode, section: null, seriesPage: '1', videosPage: '1' });
    };

    const handleRemoveFilter = (field, value) => {
        setFilters(prev => {
            const updated = {
                ...prev,
                [field]: (prev[field] || []).filter?.(x => x !== value) ?? prev[field],
                [`${field}Exclude`]: (prev[`${field}Exclude`] || []).filter?.(x => x !== value),
            };
            if (field === 'year') { updated.year = ''; }
            if (field === 'favorite') { updated.favorite = false; }
            if (field === 'search') { updated.search = ''; setSearchTerm(''); }
            const nextMode = hasActiveFilters(updated) ? 'filtered' : 'home';
            updateParams({ mode: nextMode, section: null, seriesPage: '1', videosPage: '1' });
            return updated;
        });
    };

    const handleShowAll = (section) => {
        updateParams({ mode: 'detail', section: section.id, seriesPage: '1', videosPage: '1' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleBackToHome = () => {
        const nextMode = hasActiveFilters(filters) ? 'filtered' : 'home';
        updateParams({ mode: nextMode, section: null, seriesPage: '1', videosPage: '1' });
    };

    // ── Computed ──────────────────────────────────────────────────────────────
    const filterCount =
        (filters.tags?.length || 0) + (filters.tagsExclude?.length || 0) +
        (filters.studios?.length || 0) + (filters.studiosExclude?.length || 0) +
        (filters.actors?.length || 0) + (filters.actorsExclude?.length || 0) +
        (filters.characters?.length || 0) + (filters.charactersExclude?.length || 0) +
        (filters.year ? 1 : 0) + (filters.favorite ? 1 : 0);

    const hasFilters  = filterCount > 0 || !!filters.search;
    const showSeries  = displayMode !== 'videos';
    const showVideos  = displayMode !== 'series';

    const cardProps = {
        onActorClick: v => handleChipClick('actors', v),
        onCharacterClick: v => handleChipClick('characters', v),
        onStudioClick: v => handleChipClick('studios', v),
        onTagClick: v => handleChipClick('tags', v),
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-slate-950">

            {/* ══ HEADER ═══════════════════════════════════════════════════════ */}
            <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
                <div className="container mx-auto px-3 sm:px-4 pt-3 pb-2">
                    {/* Top row */}
                    <div className="flex items-center justify-between gap-2">
                        <h1
                            className="text-2xl sm:text-3xl font-bold text-red-500 cursor-pointer hover:text-red-400 transition shrink-0"
                            onClick={() => { 
                                updateParams({ mode: 'home', section: null, seriesPage: '1', videosPage: '1' }); 
                                setFilters(DEFAULT_FILTERS); 
                                setSearchTerm(''); 
                            }}
                        >
                            VIBEFLIX
                        </h1>

                        <div className="flex items-center gap-1.5 sm:gap-2 justify-end">
                            <div className="hidden sm:block">
                                <SearchBox searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
                            </div>
                            <button
                                onClick={() => setShowFilters(true)}
                                className={`flex items-center px-2 py-2 sm:px-3 rounded-lg text-white transition ${
                                    hasFilters
                                        ? 'bg-red-500 text-white'
                                        : 'hover:bg-slate-700'
                                }`}
                            >
                                <Filter className="w-4 h-4 sm:w-5 sm:h-5" />
                                <span className="hidden sm:inline text-sm">
                                    {filterCount > 0 ? ` (${filterCount})` : ''}
                                </span>
                            </button>

                            <button
                                onClick={() => { 
                                    setShowQuickSearch(true); 
                                    setTimeout(() => quickSearchRef.current?.focus(), 0); 
                                }}
                                className="px-2 py-2 sm:px-3 rounded-md text-white hover:bg-slate-700 transition block sm:hidden"
                            >
                                <Search className="w-4 h-4 sm:w-5 sm:h-5" />
                            </button>
                        </div>
                    </div>

                    {showQuickSearch ? (
                        <div className="mt-2">
                            <SearchBox 
                                ref={quickSearchRef} 
                                searchTerm={searchTerm} 
                                setSearchTerm={setSearchTerm} 
                                onBlur={() => setShowQuickSearch(false)}
                            />
                        </div>
                    ) : (
                        hasFilters && (
                            <div className="flex flex-wrap gap-1 mt-1 max-h-20 overflow-y-auto">
                                {filters.search && (
                                    <FilterPill label={`"${filters.search}"`} onRemove={() => handleRemoveFilter('search')} color="slate" />
                                )}
                                {filters.favorite && (
                                    <FilterPill label="❤ Favorites" onRemove={() => handleRemoveFilter('favorite')} color="red" />
                                )}
                                {filters.year && (
                                    <FilterPill label={`Year: ${filters.year}`} onRemove={() => handleRemoveFilter('year')} color="green" />
                                )}
                                {['studios', 'actors', 'characters', 'tags'].map(field =>
                                    <Fragment key={field}>
                                        {(filters[field] || []).map(v => (
                                            <FilterPill key={`inc-${v}`} label={`✓ ${v}`} onRemove={() => handleRemoveFilter(field, v)} color="green" />
                                        ))}
                                        {(filters[`${field}Exclude`] || []).map(v => (
                                            <FilterPill key={`exc-${v}`} label={`✗ ${v}`} onRemove={() => handleRemoveFilter(`${field}Exclude`, v)} color="red" />
                                        ))}
                                    </Fragment>
                                )}
                            </div>
                        )
                    )}
                </div>
            </header>

            {/* ══ MAIN ═════════════════════════════════════════════════════════ */}
            <main className="container mx-auto p-3 sm:p-4">
                <div className="flex-1 flex gap-2 items-center justify-between mb-4">
                    {/* Display mode tabs */}
                    <div className="flex gap-1 bg-slate-900 p-1 rounded-lg shrink-0">
                        {DISPLAY_MODES.map(({ value, label, icon: Icon }) => (
                            <button
                                key={value}
                                onClick={() => setDisplayMode(value)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                                    displayMode === value
                                        ? 'bg-red-500 text-white'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                }`}
                            >
                                {Icon && <Icon className="w-3.5 h-3.5" />}
                                {label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <button
                            onClick={() => navigate('/series/create')}
                            className="flex items-center gap-1.5 px-2 py-2 sm:px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition"
                        >
                            <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
                            <span className="hidden sm:inline text-sm">New Series</span>
                        </button>

                        <button
                            onClick={() => navigate('/upload')}
                            className="flex items-center gap-1.5 px-2 py-2 sm:px-3 bg-red-500 hover:bg-red-600 text-white rounded-lg transition"
                        >
                            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                            <span className="hidden sm:inline text-sm">Upload</span>
                        </button>
                    </div>
                </div>

                {/* Detail / filtered header breadcrumb */}
                {(homeMode === 'detail' || homeMode === 'filtered') && (
                    <div className="flex items-center gap-3 mb-6">
                        <button
                            onClick={handleBackToHome}
                            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition text-white"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        {homeMode === 'detail' && detailSection && (
                            <div className="flex items-center gap-2">
                                <detailSection.icon className="w-5 h-5 text-red-500" />
                                <h2 className="text-xl font-bold text-white">{detailSection.title}</h2>
                            </div>
                        )}
                        {homeMode === 'filtered' && (
                            <div className="flex items-center gap-2">
                                <Filter className="w-5 h-5 text-red-500" />
                                <h2 className="text-xl font-bold text-white">Filtered Results</h2>
                            </div>
                        )}
                    </div>
                )}

                {/* ── HOME: section rows ──────────────────────────────────────── */}
                {homeMode === 'home' && (
                    sectionsLoading ? <LoadingSpinner /> : (
                        <div className="space-y-10">
                            {SECTIONS.map(section => (
                                <HomeSection 
                                    items={buildMixedItems(sectionsData[section.id] || { videos: [], series: [] }, displayMode)} 
                                    handleShowAll={handleShowAll} 
                                    handleToggleFavoriteSeries={handleToggleFavoriteSeries} 
                                    handleToggleFavoriteVideo={handleToggleFavoriteVideo} 
                                    section={section} 
                                    cardProps={cardProps}
                                    key={section.id}
                                />
                            ))}
                        </div>
                    )
                )}

                {/* ── DETAIL / FILTERED: paginated grid ───────────────────────── */}
                {(homeMode === 'detail' || homeMode === 'filtered') && (
                    <>
                        {!seriesLoading && !videosLoading && seriesList.length === 0 && videos.length === 0 ? (
                            <EmptyState hasFilters={hasFilters} navigate={navigate} />
                        ) : (
                            <>
                                {/* Series section */}
                                {showSeries && (
                                    <section className="mb-8">
                                        {displayMode === 'all' && (
                                            <div className="flex items-center gap-2 mb-4">
                                                <Layers className="w-5 h-5 text-red-500" />
                                                <h3 className="text-lg font-bold text-white">Series</h3>
                                                {!seriesLoading && <span className="text-slate-500 text-sm">({seriesList.length})</span>}
                                            </div>
                                        )}
                                        {seriesLoading ? <LoadingSpinner /> : (
                                            <>
                                                <ContentGrid>
                                                    {seriesList.map(series => (
                                                        <SeriesCard
                                                            key={series._id}
                                                            series={series}
                                                            onToggleFavorite={() => handleToggleFavoriteSeries(series._id)}
                                                            {...cardProps}
                                                        />
                                                    ))}
                                                </ContentGrid>
                                                {/* Fix 3: Pagination per section */}
                                                <Pagination
                                                    currentPage={seriesPage}
                                                    totalPages={seriesTotalPages}
                                                    onPageChange={p => {
                                                        updateParams({ seriesPage: String(p) });
                                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                                    }}
                                                />
                                            </>
                                        )}
                                    </section>
                                )}

                                {showSeries && showVideos && !seriesLoading && !videosLoading && seriesList.length > 0 && videos.length > 0 && (
                                    <div className="border-t border-slate-800 mb-8" />
                                )}

                                {/* Videos section */}
                                {showVideos && (
                                    <section>
                                        {displayMode === 'all' && !videosLoading && videos.length > 0 && (
                                            <div className="flex items-center gap-2 mb-4">
                                                <Film className="w-5 h-5 text-red-500" />
                                                <h3 className="text-lg font-bold text-white">Videos</h3>
                                                <span className="text-slate-500 text-sm">({videos.length})</span>
                                            </div>
                                        )}
                                        {displayMode === 'videos' && !videosLoading && (
                                            <div className="flex items-center gap-2 mb-4">
                                                <Film className="w-5 h-5 text-red-500" />
                                                <h3 className="text-lg font-bold text-white">All Videos</h3>
                                                <span className="text-slate-400 text-xs ml-1">(including series episodes)</span>
                                                <span className="text-slate-500 text-sm">({videos.length})</span>
                                            </div>
                                        )}
                                        {videosLoading ? <LoadingSpinner /> : (
                                            <>
                                                <ContentGrid>
                                                    {videos.map(video => (
                                                        <VideoCard
                                                            key={video._id}
                                                            video={video}
                                                            onToggleFavorite={() => handleToggleFavoriteVideo(video._id)}
                                                            {...cardProps}
                                                        />
                                                    ))}
                                                </ContentGrid>
                                                {/* Fix 3: Pagination per section */}
                                                <Pagination
                                                    currentPage={videosPage}
                                                    totalPages={videosTotalPages}
                                                    onPageChange={p => {
                                                        updateParams({ videosPage: String(p) });
                                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                                    }}
                                                />
                                            </>
                                        )}
                                    </section>
                                )}
                            </>
                        )}
                    </>
                )}
            </main>

            {/* Filter sidebar */}
            <FilterSidebar
                isOpen={showFilters}
                onClose={() => setShowFilters(false)}
                onFilterChange={handleFilterChange}
                currentFilters={filters}
            />

            {/* Scroll-to-top FAB */}
            {showScrollTop && (
                <button
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="fixed bottom-6 right-6 z-50 p-3 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition"
                >
                    <ChevronUp className="w-5 h-5" />
                </button>
            )}
        </div>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Merge series + videos into one list based on display mode, max 20 items. */
function buildMixedItems({ videos = [], series = [] }, displayMode) {
    const seriesItems = displayMode !== 'videos'
        ? series.map(s => ({ ...s, _type: 'series' }))
        : [];
    const videoItems  = displayMode !== 'series'
        ? videos.map(v => ({ ...v, _type: 'video' }))
        : [];
    // Interleave: series first then videos, limited to 20
    return [...seriesItems, ...videoItems].slice(0, 20);
}

function ContentGrid({ children }) {
    return (
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {children}
        </div>
    );
}

function LoadingSpinner() {
    return (
        <div className="flex flex-col items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mb-4" />
            <p className="text-white text-lg">Loading…</p>
        </div>
    );
}

function FilterPill({ label, onRemove, color = 'slate' }) {
    const map = {
        red:   'bg-red-500/20 text-red-300 hover:bg-red-500/30',
        green: 'bg-green-500/20 text-green-300 hover:bg-green-500/30',
        slate: 'bg-slate-700 text-slate-300 hover:bg-slate-600',
    };
    return (
        <button
            onClick={onRemove}
            className={`group px-2.5 py-1 text-xs rounded-full transition flex items-center gap-1 ${map[color] || map.slate}`}
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
            <p className="text-slate-400 text-lg mb-2">
                {hasFilters ? 'No results found' : 'Nothing here yet'}
            </p>
            <p className="text-slate-500 mb-6 text-sm">
                {hasFilters ? 'Try adjusting your filters' : 'Start by creating a series or uploading a video'}
            </p>
            {!hasFilters && (
                <div className="flex gap-3 flex-wrap justify-center">
                    <button
                        onClick={() => navigate('/series/create')}
                        className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition text-sm"
                    >
                        <Layers className="w-4 h-4" /> Create Series
                    </button>
                    <button
                        onClick={() => navigate('/upload')}
                        className="flex items-center gap-2 px-5 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-sm"
                    >
                        <Plus className="w-4 h-4" /> Upload Video
                    </button>
                </div>
            )}
        </div>
    );
}

export default Home;