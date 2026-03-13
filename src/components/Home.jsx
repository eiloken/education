import React, { forwardRef, Fragment, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { seriesAPI, videoAPI, activityAPI } from "../api/api";
import toast from "react-hot-toast";
import {
    ChevronLeft, ChevronRight, ChevronUp,
    Film, Filter, Layers, List, Plus, Search,
    ArrowLeft, TrendingUp, Clock, Flame,
    Heart, LayoutDashboard, User as UserIcon, Crown, Users,
} from "lucide-react";
import VideoCard from "./VideoCard";
import SeriesCard from "./SeriesCard";
import FilterSidebar, { DEFAULT_FILTERS, cycleItem } from "./FilterSidebar";
import Pagination from "./Pagination";
import { useNavigate, useSearchParams } from "react-router-dom";
import useMyStorage from "../utils/localStorage";
import Dashboard from "./Dashboard";
import AdminRequests from "./AdminRequests";
import UserProfile from "./UserProfile";
import { useAuth } from "../context/AuthContext.jsx";

// ─── Util ─────────────────────────────────────────────────────────────────────
const daysAgoISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };

const SECTIONS = [
    { id: 'trending_week', title: 'Trending This Week', icon: TrendingUp, getParams: () => ({ sortBy: 'views', order: 'desc', dateFrom: daysAgoISO(7) }) },
    { id: 'mostViewed',    title: 'Most Viewed',         icon: Flame,       getParams: () => ({ sortBy: 'views', order: 'desc' }) },
    { id: 'newest',        title: 'New Arrivals',        icon: Clock,       getParams: () => ({ sortBy: 'createdAt', order: 'desc' }) },
];

const DISPLAY_MODES = [
    { value: 'all',       label: 'All',       icon: List,          adminOnly: false },
    { value: 'series',    label: 'Series',    icon: Layers,        adminOnly: false },
    { value: 'videos',    label: 'Videos',    icon: Film,          adminOnly: false },
    { value: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: true },
    { value: 'requests',  label: 'Requests',  icon: Users,         adminOnly: true  },
];

// ─── Activity ping — debounced, every ~2 min on user interaction ──────────────
function useActivityPing() {
    const lastPing = useRef(0);
    useEffect(() => {
        const fire = () => {
            const now = Date.now();
            if (now - lastPing.current > 2 * 60 * 1000) {
                lastPing.current = now;
                activityAPI.ping();
            }
        };
        window.addEventListener('mousemove', fire, { passive: true });
        window.addEventListener('keydown',   fire, { passive: true });
        return () => {
            window.removeEventListener('mousemove', fire);
            window.removeEventListener('keydown',   fire);
        };
    }, []);
}

// ─── HomeSection ──────────────────────────────────────────────────────────────
function HomeSection({ section, items, cardProps, handleShowAll, handleToggleFavoriteSeries, handleToggleFavoriteVideo }) {
    const rowRef = useRef(null);
    const [canLeft,  setCanLeft]  = useState(false);
    const [canRight, setCanRight] = useState(false);
    if (items.length === 0) return null;
    const Icon = section.icon;
    return (
        <section key={section.id}>
            <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
                <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 shrink-0" />
                    <h2 className="text-base sm:text-lg font-bold text-white truncate">{section.title}</h2>
                </div>
                <div className="flex items-center gap-2">
                    <button disabled={!canLeft} onClick={() => rowRef.current?.scrollLeft()}
                        className={`px-3 py-2 rounded-lg transition hidden sm:flex ${canLeft ? 'text-slate-400 hover:text-slate-300 hover:bg-red-800/30' : 'text-slate-600 cursor-not-allowed'}`}>
                        <ChevronLeft className="w-3 h-3" />
                    </button>
                    <button onClick={() => handleShowAll(section)}
                        className="px-3 py-2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-300 hover:bg-red-800/30 transition">
                        Show all
                    </button>
                    <button disabled={!canRight} onClick={() => rowRef.current?.scrollRight()}
                        className={`px-3 py-2 rounded-lg transition hidden sm:flex ${canRight ? 'text-slate-400 hover:text-slate-300 hover:bg-red-800/30' : 'text-slate-600 cursor-not-allowed'}`}>
                        <ChevronRight className="w-3 h-3" />
                    </button>
                </div>
            </div>
            <HScrollRow ref={rowRef} itemCount={items.length} onArrowChange={({ canLeft, canRight }) => { setCanLeft(canLeft); setCanRight(canRight); }}>
                {items.map(item => (
                    <div key={item._id} className="shrink-0 w-44 sm:w-52 snap-start [&>a]:border-x-0 [&>a]:rounded-none">
                        {item._type === 'series' ? (
                            <SeriesCard series={item} onToggleFavorite={() => handleToggleFavoriteSeries(item._id)} {...cardProps} />
                        ) : (
                            <VideoCard video={item} onToggleFavorite={() => handleToggleFavoriteVideo(item._id)} {...cardProps} />
                        )}
                    </div>
                ))}
            </HScrollRow>
        </section>
    );
}

const HScrollRow = forwardRef(({ children, itemCount, onArrowChange }, ref) => {
    const rowRef = useRef(null);
    const SCROLL_AMT = 800;
    const updateArrows = useCallback(() => {
        const el = rowRef.current;
        if (!el) return;
        onArrowChange?.({ canLeft: el.scrollLeft > 4, canRight: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
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
    useImperativeHandle(ref, () => ({ scrollLeft: () => scroll(-1), scrollRight: () => scroll(1) }));
    return (
        <div className="relative">
            <div ref={rowRef} className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scroll-smooth -mx-3 px-3 sm:-mx-4 sm:px-4"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
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
            <input ref={searchBoxRef} type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                onBlur={onBlur} placeholder="Quick search…"
                className="px-8 py-2.5 bg-slate-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 w-full sm:w-auto" />
        </div>
    );
});

// ─── UserAvatar button ────────────────────────────────────────────────────────
function UserAvatarButton({ user, isAdmin, onClick }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800 transition group"
        >
            <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center ring-2 ring-transparent group-hover:ring-red-500 transition text-white font-semibold text-xs uppercase">
                {user.username?.[0] ?? <UserIcon className="w-4 h-4 text-slate-400" />}
            </div>
            {isAdmin && <Crown className="w-3.5 h-3.5 text-amber-400 hidden sm:block" />}
        </button>
    );
}

// ─── Home ─────────────────────────────────────────────────────────────────────
function Home() {
    const navigate = useNavigate();
    const { user, loading: authLoading, isAdmin } = useAuth();
    useActivityPing();

    const [displayMode, setDisplayMode] = useMyStorage("vibeflix_display", "all");
    const [showProfile, setShowProfile] = useState(false);

    const [sectionsData,    setSectionsData]    = useState({});
    const [sectionsLoading, setSectionsLoading] = useState(true);

    const [searchParams, setSearchParams] = useSearchParams();
    const homeMode        = searchParams.get('mode') || 'home';
    const detailSectionId = searchParams.get('section');
    const detailSection   = SECTIONS.find(s => s.id === detailSectionId) || null;
    const seriesPage      = parseInt(searchParams.get('seriesPage') || '1', 10);
    const videosPage      = parseInt(searchParams.get('videosPage') || '1', 10);

    const updateParams = useCallback((updates) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            Object.entries(updates).forEach(([k, v]) => v == null ? next.delete(k) : next.set(k, String(v)));
            return next;
        }, { replace: false });
    }, [setSearchParams]);

    const [videos,          setVideos]          = useState([]);
    const [seriesList,      setSeriesList]       = useState([]);
    const [seriesLoading,   setSeriesLoading]    = useState(false);
    const [videosLoading,   setVideosLoading]    = useState(false);
    const [seriesTotalPages,setSeriesTotalPages] = useState(1);
    const [videosTotalPages,setVideosTotalPages] = useState(1);

    const [filters,         setFilters]         = useState(DEFAULT_FILTERS);
    const [showFilters,     setShowFilters]      = useState(false);
    const [searchTerm,      setSearchTerm]       = useState('');
    const [showQuickSearch, setShowQuickSearch]  = useState(false);
    const quickSearchRef = useRef(null);
    const [showScrollTop,   setShowScrollTop]    = useState(false);

    const hasActiveFilters = useCallback((f) =>
        f.tags?.length > 0 || f.tagsExclude?.length > 0 ||
        f.studios?.length > 0 || f.studiosExclude?.length > 0 ||
        f.actors?.length > 0 || f.actorsExclude?.length > 0 ||
        f.characters?.length > 0 || f.charactersExclude?.length > 0 ||
        f.year || f.favorite || f.search,
    []);

    const buildApiParams = useCallback((extra = {}) => ({
        limit: 20,
        search:          filters.search         || undefined,
        tags:            filters.tags?.join(',')           || undefined,
        tagsExclude:     filters.tagsExclude?.join(',')    || undefined,
        studios:         filters.studios?.join(',')        || undefined,
        studiosExclude:  filters.studiosExclude?.join(',') || undefined,
        actors:          filters.actors?.join(',')         || undefined,
        actorsExclude:   filters.actorsExclude?.join(',')  || undefined,
        characters:      filters.characters?.join(',')     || undefined,
        charactersExclude: filters.charactersExclude?.join(',') || undefined,
        year:            filters.year     || undefined,
        favorite:        filters.favorite || undefined,
        filterMode:      filters.filterMode,
        sortBy:          filters.sortBy,
        order:           filters.order,
        ...extra,
    }), [filters]);

    const fetchSections = useCallback(async () => {
        setSectionsLoading(true);
        try {
            const results = await Promise.all(
                SECTIONS.map(async s => {
                    const p = s.getParams();
                    const [sd, vd] = await Promise.all([
                        displayMode !== 'videos' ? seriesAPI.getSeries({ ...p, limit: 20 }) : Promise.resolve({ series: [] }),
                        displayMode !== 'series' ? videoAPI.getVideos({ ...p, limit: 20, exceptSeries: displayMode === 'all' ? 'true' : 'false' }) : Promise.resolve({ videos: [] }),
                    ]);
                    return { id: s.id, videos: vd.videos || [], series: sd.series || [] };
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
        } catch (err) { toast.error('Failed to load series'); }
        finally { setSeriesLoading(false); }
    }, [homeMode, detailSection, seriesPage, buildApiParams, displayMode]);

    const fetchVideosContent = useCallback(async () => {
        if (displayMode === 'series') { setVideos([]); setVideosTotalPages(1); return; }
        setVideosLoading(true);
        try {
            const base = homeMode === 'detail' && detailSection
                ? { ...detailSection.getParams(), page: videosPage, limit: 20 }
                : buildApiParams({ page: videosPage });
            const data = await videoAPI.getVideos({ ...base, exceptSeries: displayMode === 'all' ? 'true' : undefined });
            setVideos(data.videos || []);
            setVideosTotalPages(data.totalPages || 1);
        } catch (err) { toast.error('Failed to load videos'); }
        finally { setVideosLoading(false); }
    }, [homeMode, detailSection, videosPage, buildApiParams, displayMode]);

    useEffect(() => { if (homeMode === 'home') fetchSections(); }, [homeMode, fetchSections]);
    useEffect(() => { if (homeMode !== 'home') fetchSeriesContent(); }, [homeMode, fetchSeriesContent]);
    useEffect(() => { if (homeMode !== 'home') fetchVideosContent(); }, [homeMode, fetchVideosContent]);

    useEffect(() => {
        const t = setTimeout(() => {
            const nf = { ...filters, search: searchTerm };
            setFilters(nf);
            const nextMode = hasActiveFilters(nf) ? 'filtered' : 'home';
            setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                next.set('mode', nextMode); next.set('seriesPage', '1'); next.set('videosPage', '1');
                if (nextMode !== 'detail') next.delete('section');
                return next;
            }, { replace: true });
        }, 500);
        return () => clearTimeout(t);
    }, [searchTerm]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const handler = () => setShowScrollTop(window.scrollY > 300);
        window.addEventListener('scroll', handler, { passive: true });
        return () => window.removeEventListener('scroll', handler);
    }, []);

    // ── Toggle favorites — uses returned isFavorite from server ───────────────
    const applyFavToggle = (id, isFavorite, listSetter, sectionKey) => {
        listSetter(prev => prev.map(v => v._id === id ? { ...v, isFavorite } : v));
        setSectionsData(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(sId => {
                next[sId] = { ...next[sId], [sectionKey]: (next[sId][sectionKey] || []).map(v => v._id === id ? { ...v, isFavorite } : v) };
            });
            return next;
        });
    };

    const handleToggleFavoriteVideo = (videoId) => {
        if (!user) { toast.error('Sign in to add favorites'); return; }
        toast.promise(
            videoAPI.toggleFavorite(videoId).then(res => {
                if (!res?.success) throw new Error();
                applyFavToggle(videoId, res.isFavorite, setVideos, 'videos');
            }),
            { loading: 'Updating…', success: 'Favorite updated', error: 'Failed' }
        );
    };

    const handleToggleFavoriteSeries = (seriesId) => {
        if (!user) { toast.error('Sign in to add favorites'); return; }
        toast.promise(
            seriesAPI.toggleFavorite(seriesId).then(res => {
                if (!res?.success) throw new Error();
                applyFavToggle(seriesId, res.isFavorite, setSeriesList, 'series');
            }),
            { loading: 'Updating…', success: 'Favorite updated', error: 'Failed' }
        );
    };

    const handleFilterChange = (newFilters) => {
        setFilters(newFilters);
        updateParams({ mode: hasActiveFilters(newFilters) ? 'filtered' : 'home', section: null, seriesPage: '1', videosPage: '1' });
    };

    const handleChipClick = (field, value) => {
        const nf = cycleItem(filters, field, value);
        setFilters(nf);
        updateParams({ mode: hasActiveFilters(nf) ? 'filtered' : 'home', section: null, seriesPage: '1', videosPage: '1' });
    };

    const handleRemoveFilter = (field, value) => {
        setFilters(prev => {
            const updated = {
                ...prev,
                [field]: (prev[field] || []).filter?.(x => x !== value) ?? prev[field],
                [`${field}Exclude`]: (prev[`${field}Exclude`] || []).filter?.(x => x !== value),
            };
            if (field === 'year')     { updated.year     = ''; }
            if (field === 'favorite') { updated.favorite = false; }
            if (field === 'search')   { updated.search   = ''; setSearchTerm(''); }
            updateParams({ mode: hasActiveFilters(updated) ? 'filtered' : 'home', section: null, seriesPage: '1', videosPage: '1' });
            return updated;
        });
    };

    const handleShowAll    = (section) => { updateParams({ mode: 'detail', section: section.id, seriesPage: '1', videosPage: '1' }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    const handleBackToHome = () => updateParams({ mode: hasActiveFilters(filters) ? 'filtered' : 'home', section: null, seriesPage: '1', videosPage: '1' });

    const filterCount = (filters.tags?.length || 0) + (filters.tagsExclude?.length || 0) +
        (filters.studios?.length || 0) + (filters.studiosExclude?.length || 0) +
        (filters.actors?.length || 0) + (filters.actorsExclude?.length || 0) +
        (filters.characters?.length || 0) + (filters.charactersExclude?.length || 0) +
        (filters.year ? 1 : 0) + (filters.favorite ? 1 : 0);

    const hasFilters = filterCount > 0 || !!filters.search;
    const showSeries = displayMode !== 'videos';
    const showVideos = displayMode !== 'series';

    const cardProps = {
        onActorClick:     v => handleChipClick('actors',     v),
        onCharacterClick: v => handleChipClick('characters', v),
        onStudioClick:    v => handleChipClick('studios',    v),
        onTagClick:       v => handleChipClick('tags',       v),
    };

    if (authLoading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950">
            {/* ══ HEADER ═══════════════════════════════════════════════════════ */}
            <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
                <div className="container mx-auto px-3 sm:px-4 pt-3 pb-2">
                    <div className="flex items-center justify-between gap-2">
                        <h1
                            className="text-2xl sm:text-3xl font-bold text-red-500 cursor-pointer hover:text-red-400 transition shrink-0"
                            onClick={() => { updateParams({ mode: 'home', section: null, seriesPage: '1', videosPage: '1' }); setFilters(DEFAULT_FILTERS); setSearchTerm(''); }}
                        >
                            VIBEFLIX
                        </h1>

                        <div className="flex items-center gap-1.5 sm:gap-2 justify-end">
                            {displayMode !== 'dashboard' && displayMode !== 'requests' && (
                                <>
                                    <div className="hidden sm:block">
                                        <SearchBox searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
                                    </div>
                                    <button
                                        onClick={() => setShowFilters(true)}
                                        className={`flex items-center px-2 py-2 sm:px-3 rounded-lg text-white transition ${hasFilters ? 'bg-red-500 text-white' : 'hover:bg-slate-700'}`}
                                    >
                                        <Filter className="w-4 h-4 sm:w-5 sm:h-5" />
                                        <span className="hidden sm:inline text-sm">{filterCount > 0 ? ` (${filterCount})` : ''}</span>
                                    </button>
                                    <button
                                        onClick={() => { setShowQuickSearch(true); setTimeout(() => quickSearchRef.current?.focus(), 0); }}
                                        className="px-2 py-2 sm:px-3 rounded-md text-white hover:bg-slate-700 transition block sm:hidden"
                                    >
                                        <Search className="w-4 h-4" />
                                    </button>
                                </>
                            )}

                            {/* User area */}
                            {user && (
                                <UserAvatarButton user={user} isAdmin={isAdmin} onClick={() => setShowProfile(true)} />
                            )}
                        </div>
                    </div>

                    {displayMode !== 'dashboard' && (
                        showQuickSearch ? (
                            <div className="mt-2">
                                <SearchBox ref={quickSearchRef} searchTerm={searchTerm} setSearchTerm={setSearchTerm} onBlur={() => setShowQuickSearch(false)} />
                            </div>
                        ) : (
                            hasFilters && (
                                <div className="flex flex-wrap gap-1 mt-1 max-h-20 overflow-y-auto">
                                    {filters.search   && <FilterPill label={`"${filters.search}"`}    onRemove={() => handleRemoveFilter('search')}   color="slate" />}
                                    {filters.favorite && <FilterPill label="❤ Favorites"              onRemove={() => handleRemoveFilter('favorite')} color="red"   />}
                                    {filters.year     && <FilterPill label={`Year: ${filters.year}`}  onRemove={() => handleRemoveFilter('year')}     color="green" />}
                                    {['studios','actors','characters','tags'].map(field => (
                                        <Fragment key={field}>
                                            {(filters[field] || []).map(v => <FilterPill key={`inc-${v}`} label={`✓ ${v}`} onRemove={() => handleRemoveFilter(field, v)} color="green" />)}
                                            {(filters[`${field}Exclude`] || []).map(v => <FilterPill key={`exc-${v}`} label={`✗ ${v}`} onRemove={() => handleRemoveFilter(`${field}Exclude`, v)} color="red" />)}
                                        </Fragment>
                                    ))}
                                </div>
                            )
                        )
                    )}
                </div>
            </header>

            {/* ══ MAIN ═════════════════════════════════════════════════════════ */}
            <main className="container mx-auto p-3 sm:p-4">
                <div className="flex-1 flex gap-2 items-center justify-between mb-4">
                    {/* Display mode tabs */}
                    <div className="flex gap-1 bg-slate-900 p-1 rounded-lg shrink-0">
                        {DISPLAY_MODES
                            .filter(m => !m.adminOnly || isAdmin)
                            .map(({ value, label, icon: Icon }) => (
                                <button
                                    key={value}
                                    onClick={() => setDisplayMode(value)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                                        displayMode === value ? 'bg-red-500 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                    }`}
                                >
                                    {Icon && <Icon className="w-3.5 h-3.5" />}
                                    <span className="hidden sm:block">{label}</span>
                                </button>
                            ))}
                    </div>

                    {/* Admin-only upload buttons */}
                    {displayMode !== 'dashboard' && displayMode !== 'requests' && isAdmin && (
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
                    )}
                </div>

                {displayMode === 'dashboard' ? (
                    <Dashboard />
                ) : displayMode === 'requests' ? (
                    <AdminRequests currentUserId={user?._id} />
                ) : (
                    <>
                        {(homeMode === 'detail' || homeMode === 'filtered') && (
                            <div className="flex items-center gap-3 mb-6">
                                <button onClick={handleBackToHome} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition text-white">
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

                        {homeMode === 'home' && (
                            sectionsLoading ? <LoadingSpinner /> : (
                                <div className="space-y-10">
                                    {SECTIONS.map(section => (
                                        <HomeSection
                                            key={section.id}
                                            items={buildMixedItems(sectionsData[section.id] || { videos: [], series: [] }, displayMode)}
                                            handleShowAll={handleShowAll}
                                            handleToggleFavoriteSeries={handleToggleFavoriteSeries}
                                            handleToggleFavoriteVideo={handleToggleFavoriteVideo}
                                            section={section}
                                            cardProps={cardProps}
                                        />
                                    ))}
                                </div>
                            )
                        )}

                        {(homeMode === 'detail' || homeMode === 'filtered') && (
                            <>
                                {!seriesLoading && !videosLoading && seriesList.length === 0 && videos.length === 0 ? (
                                    <EmptyState hasFilters={hasFilters} navigate={navigate} isAdmin={isAdmin} />
                                ) : (
                                    <>
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
                                                                <SeriesCard key={series._id} series={series} onToggleFavorite={() => handleToggleFavoriteSeries(series._id)} {...cardProps} />
                                                            ))}
                                                        </ContentGrid>
                                                        <Pagination currentPage={seriesPage} totalPages={seriesTotalPages}
                                                            onPageChange={p => { updateParams({ seriesPage: String(p) }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                                                    </>
                                                )}
                                            </section>
                                        )}

                                        {showSeries && showVideos && !seriesLoading && !videosLoading && seriesList.length > 0 && videos.length > 0 && (
                                            <div className="border-t border-slate-800 mb-8" />
                                        )}

                                        {showVideos && (
                                            <section>
                                                {displayMode === 'all' && !videosLoading && videos.length > 0 && (
                                                    <div className="flex items-center gap-2 mb-4">
                                                        <Film className="w-5 h-5 text-red-500" />
                                                        <h3 className="text-lg font-bold text-white">Videos</h3>
                                                        <span className="text-slate-500 text-sm">({videos.length})</span>
                                                    </div>
                                                )}
                                                {videosLoading ? <LoadingSpinner /> : (
                                                    <>
                                                        <ContentGrid>
                                                            {videos.map(video => (
                                                                <VideoCard key={video._id} video={video} onToggleFavorite={() => handleToggleFavoriteVideo(video._id)} {...cardProps} />
                                                            ))}
                                                        </ContentGrid>
                                                        <Pagination currentPage={videosPage} totalPages={videosTotalPages}
                                                            onPageChange={p => { updateParams({ videosPage: String(p) }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                                                    </>
                                                )}
                                            </section>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </>
                )}
            </main>

            <FilterSidebar isOpen={showFilters} onClose={() => setShowFilters(false)} onFilterChange={handleFilterChange} currentFilters={filters} />

            {showScrollTop && (
                <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="fixed bottom-6 right-6 z-50 p-3 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition">
                    <ChevronUp className="w-5 h-5" />
                </button>
            )}

            <UserProfile isOpen={showProfile} onClose={() => setShowProfile(false)} />
        </div>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildMixedItems({ videos = [], series = [] }, displayMode) {
    const s = displayMode !== 'videos' ? series.map(x => ({ ...x, _type: 'series' })) : [];
    const v = displayMode !== 'series' ? videos.map(x => ({ ...x, _type: 'video'  })) : [];
    return [...s, ...v].slice(0, 20);
}
function ContentGrid({ children }) {
    return <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">{children}</div>;
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
    const map = { red: 'bg-red-500/20 text-red-300 hover:bg-red-500/30', green: 'bg-green-500/20 text-green-300 hover:bg-green-500/30', slate: 'bg-slate-700 text-slate-300 hover:bg-slate-600' };
    return (
        <button onClick={onRemove} className={`group px-2.5 py-1 text-xs rounded-full transition flex items-center gap-1 ${map[color] || map.slate}`}>
            {label}<span className="opacity-60 group-hover:opacity-100 text-base leading-none">×</span>
        </button>
    );
}
function EmptyState({ hasFilters, navigate, isAdmin }) {
    return (
        <div className="flex flex-col items-center justify-center h-64 text-center px-4">
            <Film className="w-20 h-20 text-slate-700 mb-4" />
            <p className="text-slate-400 text-lg mb-2">{hasFilters ? 'No results found' : 'Nothing here yet'}</p>
            <p className="text-slate-500 mb-6 text-sm">{hasFilters ? 'Try adjusting your filters' : isAdmin ? 'Start by creating a series or uploading a video' : 'Check back later for new content'}</p>
            {!hasFilters && isAdmin && (
                <div className="flex gap-3 flex-wrap justify-center">
                    <button onClick={() => navigate('/series/create')} className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition text-sm">
                        <Layers className="w-4 h-4" /> Create Series
                    </button>
                    <button onClick={() => navigate('/upload')} className="flex items-center gap-2 px-5 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-sm">
                        <Plus className="w-4 h-4" /> Upload Video
                    </button>
                </div>
            )}
        </div>
    );
}

export default Home;