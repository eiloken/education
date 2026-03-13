import React, { forwardRef, Fragment, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { seriesAPI, videoAPI, activityAPI } from "../api/api";
import toast from "react-hot-toast";
import {
    ChevronLeft, ChevronRight, ChevronUp,
    Film, Filter, Layers, Plus, Search,
    ArrowLeft, TrendingUp, Clock, Flame,
    Heart, LayoutDashboard, User as UserIcon, Crown, Users, X,
} from "lucide-react";
import VideoCard from "./videos/VideoCard.jsx";
import SeriesCard from "./series/SeriesCard.jsx";
import FilterSidebar, { DEFAULT_FILTERS, cycleItem, filtersToParams, paramsToFilters } from "./FilterSidebar";
import Pagination from "./Pagination";
import { useNavigate, useSearchParams } from "react-router-dom";
import Dashboard from "./Dashboard";
import AdminRequests from "./auth/AdminRequests.jsx";
import UserProfile from "./auth/UserProfile.jsx";
import { useAuth } from "../context/AuthContext.jsx";

// ─── Util ─────────────────────────────────────────────────────────────────────
const daysAgoISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };

const SECTIONS = [
    { id: 'trending_week', title: 'Trending This Week', icon: TrendingUp, getParams: () => ({ sortBy: 'views', order: 'desc', dateFrom: daysAgoISO(7) }) },
    { id: 'mostViewed',    title: 'Most Viewed',         icon: Flame,       getParams: () => ({ sortBy: 'views', order: 'desc' }) },
    { id: 'newest',        title: 'New Arrivals',        icon: Clock,       getParams: () => ({ sortBy: 'createdAt', order: 'desc' }) },
];

const DISPLAY_MODES = [
    { value: 'series',    label: 'Series',    icon: Layers,          adminOnly: false },
    { value: 'videos',    label: 'Videos',    icon: Film,            adminOnly: false },
    { value: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: true  },
    { value: 'requests',  label: 'Requests',  icon: Users,           adminOnly: true  },
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
                    <div key={item._id} className="shrink-0 w-44 sm:w-52 self-stretch snap-start">
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
            <div ref={rowRef} className="flex items-stretch gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scroll-smooth -mx-3 px-3 sm:-mx-4 sm:px-4"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {children}
            </div>
        </div>
    );
});

// ─── SearchBox — triggers search on Enter, not on every keystroke ─────────────
const SearchBox = forwardRef(({ searchTerm, setSearchTerm, onCommit, onBlur }, ref) => {
    const searchBoxRef = useRef(null);
    useImperativeHandle(ref, () => searchBoxRef.current);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onCommit?.(searchTerm);
            searchBoxRef.current?.blur();
        }
        if (e.key === 'Escape') {
            setSearchTerm('');
            onCommit?.('');
            searchBoxRef.current?.blur();
        }
    };

    const handleClear = () => {
        setSearchTerm('');
        onCommit?.('');
        searchBoxRef.current?.focus();
    };

    return (
        <div className="relative text-sm p-0.5 group">
            <Search className="w-3.5 h-3.5 absolute top-1/2 left-2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
                ref={searchBoxRef}
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={onBlur}
                placeholder="Search title, actor, tag…"
                className="pl-7 pr-16 py-2.5 bg-slate-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 w-full sm:w-64 transition-all"
            />
            <div className="absolute top-1/2 right-2 -translate-y-1/2 flex items-center gap-1">
                {searchTerm && (
                    <button
                        onMouseDown={e => { e.preventDefault(); handleClear(); }}
                        className="text-slate-500 hover:text-slate-300 transition p-0.5"
                        tabIndex={-1}
                    >
                        <X className="w-3 h-3" />
                    </button>
                )}
                <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-slate-500 bg-slate-700 rounded border border-slate-600">
                    ↵
                </kbd>
            </div>
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

    const [showProfile, setShowProfile] = useState(false);

    const [sectionsData,    setSectionsData]    = useState({});
    const [sectionsLoading, setSectionsLoading] = useState(true);

    const [searchParams, setSearchParams] = useSearchParams();

    // ── All persistent state lives in the URL ─────────────────────────────────
    const homeMode        = searchParams.get('mode') || 'home';
    const detailSectionId = searchParams.get('section');
    const detailSection   = SECTIONS.find(s => s.id === detailSectionId) || null;
    const seriesPage      = parseInt(searchParams.get('seriesPage') || '1', 10);
    const videosPage      = parseInt(searchParams.get('videosPage') || '1', 10);

    // displayMode from URL param 'view' (default: 'series')
    const displayModeParam = searchParams.get('view');
    const displayMode = (DISPLAY_MODES.some(m => m.value === displayModeParam)) ? displayModeParam : 'series';

    // filters derived from URL — memoized on the raw query string so the object
    // reference is stable between renders when nothing actually changed.
    const filtersKey = searchParams.toString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const filters = useMemo(() => paramsToFilters(searchParams), [filtersKey]);

    // ── URL mutation helpers ───────────────────────────────────────────────────
    const updateParams = useCallback((updates) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            Object.entries(updates).forEach(([k, v]) => v == null ? next.delete(k) : next.set(k, String(v)));
            return next;
        }, { replace: false });
    }, [setSearchParams]);

    const setDisplayMode = useCallback((value) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (value && value !== 'series') next.set('view', value); else next.delete('view');
            next.set('mode', 'home');
            next.delete('section');
            next.set('seriesPage', '1');
            next.set('videosPage', '1');
            return next;
        }, { replace: false });
    }, [setSearchParams]);

    const [videos,          setVideos]          = useState([]);
    const [seriesList,      setSeriesList]       = useState([]);
    const [seriesLoading,   setSeriesLoading]    = useState(false);
    const [videosLoading,   setVideosLoading]    = useState(false);
    const [seriesTotalPages,setSeriesTotalPages] = useState(1);
    const [videosTotalPages,setVideosTotalPages] = useState(1);

    const [showFilters,     setShowFilters]      = useState(false);
    // Local search term — only committed to URL on Enter; initialized from URL
    // but NOT synced back automatically (prevents refresh resetting mode=detail)
    const [searchTerm,      setSearchTerm]       = useState(filters.search || '');
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
                        displayMode !== 'series' ? videoAPI.getVideos({ ...p, limit: 20 }) : Promise.resolve({ videos: [] }),
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
            const data = await videoAPI.getVideos(base);
            setVideos(data.videos || []);
            setVideosTotalPages(data.totalPages || 1);
        } catch (err) { toast.error('Failed to load videos'); }
        finally { setVideosLoading(false); }
    }, [homeMode, detailSection, videosPage, buildApiParams, displayMode]);

    useEffect(() => { if (homeMode === 'home') fetchSections(); }, [homeMode, fetchSections]);
    useEffect(() => { if (homeMode !== 'home') fetchSeriesContent(); }, [homeMode, fetchSeriesContent]);
    useEffect(() => { if (homeMode !== 'home') fetchVideosContent(); }, [homeMode, fetchVideosContent]);

    // Sync searchTerm from URL only when the URL's search param changes externally
    // (e.g. user clears a filter pill). Does NOT write back to URL — that only
    // happens on Enter via commitSearch below.
    useEffect(() => {
        setSearchTerm(filters.search || '');
    }, [filters.search]);

    useEffect(() => {
        const handler = () => setShowScrollTop(window.scrollY > 300);
        window.addEventListener('scroll', handler, { passive: true });
        return () => window.removeEventListener('scroll', handler);
    }, []);

    // ── Commit search to URL (called on Enter) ────────────────────────────────
    const commitSearch = useCallback((term) => {
        const nf = { ...filters, search: term };
        const fp = filtersToParams(nf);
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            ['q','tags','txc','stu','sxc','act','axc','chr','cxc','yr','fav','fm','sort','ord'].forEach(k => next.delete(k));
            Object.entries(fp).forEach(([k, v]) => { if (v != null) next.set(k, v); });
            const nextMode = hasActiveFilters(nf) ? 'filtered' : 'home';
            next.set('mode', nextMode);
            next.set('seriesPage', '1');
            next.set('videosPage', '1');
            if (nextMode !== 'detail') next.delete('section');
            return next;
        }, { replace: false });
    }, [filters, setSearchParams, hasActiveFilters]);

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
        const fp = filtersToParams(newFilters);
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            ['q','tags','txc','stu','sxc','act','axc','chr','cxc','yr','fav','fm','sort','ord'].forEach(k => next.delete(k));
            Object.entries(fp).forEach(([k, v]) => { if (v != null) next.set(k, v); });
            next.set('mode', hasActiveFilters(newFilters) ? 'filtered' : 'home');
            next.delete('section');
            next.set('seriesPage', '1');
            next.set('videosPage', '1');
            return next;
        }, { replace: false });
        setSearchTerm(newFilters.search || '');
    };

    const handleChipClick = (field, value) => {
        const nf = cycleItem(filters, field, value);
        handleFilterChange(nf);
    };

    const handleRemoveFilter = (field, value) => {
        const updated = {
            ...filters,
            [field]: (filters[field] || []).filter?.((x) => x !== value) ?? filters[field],
            [`${field}Exclude`]: (filters[`${field}Exclude`] || []).filter?.((x) => x !== value),
        };
        if (field === 'year')     { updated.year     = ''; }
        if (field === 'favorite') { updated.favorite = false; }
        if (field === 'search')   { updated.search   = ''; setSearchTerm(''); }
        handleFilterChange(updated);
    };

    const handleShowAll    = (section) => { updateParams({ mode: 'detail', section: section.id, seriesPage: '1', videosPage: '1' }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    const handleBackToHome = () => {
        const nextMode = hasActiveFilters(filters) ? 'filtered' : 'home';
        updateParams({ mode: nextMode, section: null, seriesPage: '1', videosPage: '1' });
    };

    const filterCount = (filters.tags?.length || 0) + (filters.tagsExclude?.length || 0) +
        (filters.studios?.length || 0) + (filters.studiosExclude?.length || 0) +
        (filters.actors?.length || 0) + (filters.actorsExclude?.length || 0) +
        (filters.characters?.length || 0) + (filters.charactersExclude?.length || 0) +
        (filters.year ? 1 : 0) + (filters.favorite ? 1 : 0);

    const hasFilters = filterCount > 0 || !!filters.search;
    // Typed but not yet committed to URL
    const hasPendingSearch = searchTerm !== (filters.search || '');
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
                            onClick={() => {
                                setSearchTerm('');
                                setSearchParams(prev => {
                                    const next = new URLSearchParams(prev);
                                    ['q','tags','txc','stu','sxc','act','axc','chr','cxc','yr','fav','fm','sort','ord',
                                     'mode','section','seriesPage','videosPage'].forEach(k => next.delete(k));
                                    return next;
                                }, { replace: false });
                            }}
                        >
                            VIBEFLIX
                        </h1>

                        <div className="flex items-center gap-1.5 sm:gap-2 justify-end">
                            {displayMode !== 'dashboard' && displayMode !== 'requests' && (
                                <>
                                    <div className="hidden sm:block">
                                        <SearchBox
                                            searchTerm={searchTerm}
                                            setSearchTerm={setSearchTerm}
                                            onCommit={commitSearch}
                                        />
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
                                <SearchBox
                                    ref={quickSearchRef}
                                    searchTerm={searchTerm}
                                    setSearchTerm={setSearchTerm}
                                    onCommit={(term) => { commitSearch(term); setShowQuickSearch(false); }}
                                    onBlur={() => setShowQuickSearch(false)}
                                />
                            </div>
                        ) : (
                            <>
                                {/* Pending search hint */}
                                {hasPendingSearch && searchTerm && (
                                    <div className="mt-1 text-xs text-slate-500 hidden sm:block">
                                        Press <kbd className="px-1 py-0.5 bg-slate-800 rounded border border-slate-700 font-mono">↵</kbd> to search for <span className="text-slate-300">"{searchTerm}"</span>
                                    </div>
                                )}
                                {hasFilters && (
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
                                )}
                            </>
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
                                    onClick={() => {
                                        updateParams({ view: value !== 'series' ? value : null, mode: 'home', section: null, seriesPage: '1', videosPage: '1' });
                                    }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                                        displayMode === value ? 'bg-red-500 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                    }`}
                                >
                                    {Icon && <Icon className="w-4 h-4" />}
                                    <span className="hidden md:block text-sm">{label}</span>
                                </button>
                            ))}
                    </div>

                    {/* Admin-only upload buttons */}
                    {displayMode !== 'dashboard' && displayMode !== 'requests' && isAdmin && (
                        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-900">
                            <button
                                onClick={() => navigate('/series/create')}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition"
                            >
                                <Layers className="w-4 h-4" />
                                <span className="hidden md:inline text-sm whitespace-nowrap">New Series</span>
                            </button>
                            <button
                                onClick={() => navigate('/upload')}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition"
                            >
                                <Plus className="w-4 h-4" />
                                <span className="hidden md:inline text-sm">Upload</span>
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
                                                {displayMode === 'videos' && (
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

                                        {showVideos && (
                                            <section>
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
    return (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 items-stretch">
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