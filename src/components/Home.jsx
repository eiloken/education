import React, { forwardRef, Fragment, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { seriesAPI, videoAPI, albumAPI, activityAPI } from "../api/api";
import toast from "react-hot-toast";
import {
    ArrowLeft, ChevronLeft, ChevronRight, ChevronUp,
    Film, Filter, Layers, Plus, Search,
    TrendingUp, Clock, Flame, Images,
    LayoutDashboard, User as UserIcon, Crown, Users, X, Heart, Eye,
} from "lucide-react";
import SeriesCard from "./series/SeriesCard.jsx";
import FilterSidebar, { cycleItem, filtersToParams, paramsToFilters } from "./FilterSidebar";
import Pagination from "./Pagination";
import { useNavigate, useSearchParams } from "react-router-dom";
import Dashboard from "./Dashboard";
import AdminRequests from "./auth/AdminRequests.jsx";
import UserProfile from "./auth/UserProfile.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import VideoCard from "./videos/VideoCard.jsx";
import AlbumFormModal from "./album/AlbumFormModal.jsx";

// ─── Util ─────────────────────────────────────────────────────────────────────
const daysAgoISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };

const SECTIONS = [
    { id: 'newest',       title: 'New Arrivals',        icon: Clock,       getParams: () => ({ sortBy: 'lastEpisodeAt', order: 'desc' }) },
    { id: 'trending_week',title: 'Trending This Week',  icon: TrendingUp,  getParams: () => ({ sortBy: 'views', order: 'desc', dateFrom: daysAgoISO(7) }) },
    { id: 'mostViewed',   title: 'Most Viewed',         icon: Flame,       getParams: () => ({ sortBy: 'views', order: 'desc' }) },
];

const ALBUM_SECTIONS = [
    { id: 'albums_new',   title: 'New Albums',          icon: Images,      getParams: () => ({ sortBy: 'updatedAt', order: 'desc' }) },
    { id: 'albums_top',   title: 'Most Viewed Albums',  icon: Eye,         getParams: () => ({ sortBy: 'views',     order: 'desc' }) },
];

const ADMIN_MODES = [
    { value: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { value: 'requests',  label: 'Requests',  icon: Users },
];

// ─── Activity ping ────────────────────────────────────────────────────────────
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

// ─── Album cover — single pre-composited mosaic image ────────────────────────
function AlbumCoverMosaic({ coverPath, title }) {
    const ref = useRef(null);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const el = ref.current; if (!el) return;
        const ob = new IntersectionObserver(
            ([e]) => { if (e.isIntersecting) { setVisible(true); ob.disconnect(); } },
            { rootMargin: '300px' }
        );
        ob.observe(el);
        return () => ob.disconnect();
    }, []);
    return (
        <div ref={ref} className="w-full h-full">
            {!visible ? (
                <div className="w-full h-full bg-slate-800 animate-pulse" />
            ) : coverPath ? (
                <img src={albumAPI.imageUrl(coverPath)} alt={title}
                    loading="lazy" decoding="async"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-800">
                    <Images className="w-10 h-10 text-slate-600" />
                </div>
            )}
        </div>
    );
}

// ─── Inline AlbumCard (for home row) ─────────────────────────────────────────
function HomeAlbumCard({ album, onToggleFavorite }) {
    const { title, imageCount = 0, isFavorite, mosaicPath, coverPath } = album;
    const cover = mosaicPath || coverPath;
    return (
        <a href={`/albums/${album._id}`}
            className="relative bg-slate-900 rounded-xl overflow-hidden border border-slate-800 hover:border-slate-600 transition cursor-pointer group flex flex-col h-full">
            <div className="relative aspect-video bg-slate-800 overflow-hidden flex-none">
                <AlbumCoverMosaic coverPath={cover} title={title} />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-pink-600 text-white text-xs font-bold rounded uppercase">Album</div>
                <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 bg-black/80 text-white text-xs rounded font-medium">
                    <Images className="w-2.5 h-2.5" />{imageCount} img{imageCount !== 1 ? 's' : ''}
                </div>
                <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavorite?.(); }}
                    className="absolute top-1.5 right-1.5 p-1.5 bg-black/60 rounded-full hover:bg-black/80 transition"
                >
                    <Heart className={`w-3.5 h-3.5 transition ${isFavorite ? 'text-red-500' : 'text-white'}`}
                        fill={isFavorite ? 'currentColor' : 'none'} />
                </button>
            </div>
            <div className="p-2.5 sm:p-3 flex-1 flex flex-col">
                <h3 className="font-bold text-white text-xs sm:text-sm leading-tight mb-1 line-clamp-2 group-hover:text-pink-400 transition uppercase">
                    {title}
                </h3>
            </div>
        </a>
    );
}

// ─── HomeSection (series) ─────────────────────────────────────────────────────
function HomeSection({ section, items, cardProps, handleShowAll, handleToggleFavoriteSeries }) {
    const rowRef = useRef(null);
    const [canLeft,  setCanLeft]  = useState(false);
    const [canRight, setCanRight] = useState(false);
    if (items.length === 0) return null;
    const Icon = section.icon;

    return (
        <section>
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
                        <SeriesCard series={item} onToggleFavorite={() => handleToggleFavoriteSeries(item._id)} {...cardProps} />
                    </div>
                ))}
            </HScrollRow>
        </section>
    );
}

// ─── AlbumSection (horizontal scroll row) ────────────────────────────────────
function AlbumSection({ section, items, handleToggleFavoriteAlbum }) {
    const rowRef = useRef(null);
    const [canLeft,  setCanLeft]  = useState(false);
    const [canRight, setCanRight] = useState(false);
    if (items.length === 0) return null;
    const Icon = section.icon;

    return (
        <section>
            <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
                <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-pink-500 shrink-0" />
                    <h2 className="text-base sm:text-lg font-bold text-white truncate">{section.title}</h2>
                </div>
                <div className="flex items-center gap-2">
                    <button disabled={!canLeft} onClick={() => rowRef.current?.scrollLeft()}
                        className={`px-3 py-2 rounded-lg transition hidden sm:flex ${canLeft ? 'text-slate-400 hover:text-slate-300 hover:bg-pink-800/30' : 'text-slate-600 cursor-not-allowed'}`}>
                        <ChevronLeft className="w-3 h-3" />
                    </button>
                    <a href="/?ct=albums&mode=filtered" className="px-3 py-2 rounded-lg text-slate-400 hover:text-slate-300 hover:bg-pink-800/30 transition text-sm">
                        Show all
                    </a>
                    <button disabled={!canRight} onClick={() => rowRef.current?.scrollRight()}
                        className={`px-3 py-2 rounded-lg transition hidden sm:flex ${canRight ? 'text-slate-400 hover:text-slate-300 hover:bg-pink-800/30' : 'text-slate-600 cursor-not-allowed'}`}>
                        <ChevronRight className="w-3 h-3" />
                    </button>
                </div>
            </div>
            <HScrollRow ref={rowRef} itemCount={items.length} onArrowChange={({ canLeft, canRight }) => { setCanLeft(canLeft); setCanRight(canRight); }}>
                {items.map(item => (
                    <div key={item._id} className="shrink-0 w-44 sm:w-52 self-stretch snap-start">
                        <HomeAlbumCard album={item} onToggleFavorite={() => handleToggleFavoriteAlbum(item._id)} />
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

// ─── SearchBox ────────────────────────────────────────────────────────────────
const SearchBox = forwardRef(({ searchTerm, setSearchTerm, onCommit, onBlur }, ref) => {
    const searchBoxRef = useRef(null);
    useImperativeHandle(ref, () => searchBoxRef.current);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter')  { e.preventDefault(); onCommit?.(searchTerm); searchBoxRef.current?.blur(); }
        if (e.key === 'Escape') { setSearchTerm(''); onCommit?.(''); searchBoxRef.current?.blur(); }
    };
    const handleClear = () => { setSearchTerm(''); onCommit?.(''); searchBoxRef.current?.focus(); };

    return (
        <div className="relative text-sm p-0.5 group">
            <Search className="w-3.5 h-3.5 absolute top-1/2 left-2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input ref={searchBoxRef} type="text" value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown} onBlur={onBlur}
                placeholder="Search title, actor, tag…"
                className="pl-7 pr-16 py-2.5 bg-slate-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 w-full sm:w-64 transition-all" />
            <div className="absolute top-1/2 right-2 -translate-y-1/2 flex items-center gap-1">
                {searchTerm && (
                    <button onMouseDown={e => { e.preventDefault(); handleClear(); }}
                        className="text-slate-500 hover:text-slate-300 transition p-0.5" tabIndex={-1}>
                        <X className="w-3 h-3" />
                    </button>
                )}
                <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-slate-500 bg-slate-700 rounded border border-slate-600">↵</kbd>
            </div>
        </div>
    );
});

// ─── UserAvatarButton ─────────────────────────────────────────────────────────
export function UserAvatarButton({ user, isAdmin, onClick }) {
    return (
        <button onClick={onClick}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800 transition group">
            <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center ring-2 ring-transparent group-hover:ring-red-500 transition text-white font-semibold text-xs uppercase">
                {user.username?.[0] ?? <UserIcon className="w-4 h-4 text-slate-400" />}
            </div>
            {isAdmin && <Crown className="w-3.5 h-3.5 text-amber-400 hidden sm:block" />}
        </button>
    );
}

// ─── Content type tab labels ──────────────────────────────────────────────────
const CT_TABS = [
    { value: 'all',    label: 'All',    icon: Filter },
    { value: 'videos', label: 'Videos', icon: Film },
    { value: 'series', label: 'Series', icon: Layers },
    { value: 'albums', label: 'Albums', icon: Images },
];

// ─── Home ─────────────────────────────────────────────────────────────────────
function Home() {
    const navigate = useNavigate();
    const { user, loading: authLoading, isAdmin } = useAuth();
    useActivityPing();

    const [showProfile,    setShowProfile]    = useState(false);
    const [showAlbumForm,  setShowAlbumForm]  = useState(false);

    const [sectionsData,   setSectionsData]   = useState({});
    const [sectionsLoading,setSectionsLoading]= useState(true);
    const [albumSections,  setAlbumSections]  = useState({});
    const [albumSectLoading, setAlbumSectLoading] = useState(true);

    const [searchParams, setSearchParams] = useSearchParams();

    const homeMode       = searchParams.get('mode')    || 'home';
    const detailSectionId= searchParams.get('section');
    const detailSection  = SECTIONS.find(s => s.id === detailSectionId) || null;
    const seriesPage     = parseInt(searchParams.get('seriesPage') || '1', 10);
    const viewParam      = searchParams.get('view');
    const adminView      = isAdmin && ADMIN_MODES.some(m => m.value === viewParam) ? viewParam : null;

    const filtersKey = searchParams.toString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const filters = useMemo(() => paramsToFilters(searchParams), [filtersKey]);

    const contentType = filters.contentType || 'all';

    const updateParams = useCallback((updates) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            Object.entries(updates).forEach(([k, v]) => v == null ? next.delete(k) : next.set(k, String(v)));
            return next;
        }, { replace: false });
    }, [setSearchParams]);

    // ── Data states ────────────────────────────────────────────────────────────
    const [seriesList,      setSeriesList]      = useState([]);
    const [seriesLoading,   setSeriesLoading]   = useState(false);
    const [seriesTotalPages,setSeriesTotalPages] = useState(1);

    const [videoList,       setVideoList]       = useState([]);
    const [videoLoading,    setVideoLoading]    = useState(false);
    const [videoTotalPages, setVideoTotalPages] = useState(1);

    const [albumList,       setAlbumList]       = useState([]);
    const [albumLoading,    setAlbumLoading]    = useState(false);
    const [albumTotalPages, setAlbumTotalPages] = useState(1);

    const [filtSeriesList,      setFiltSeriesList]      = useState([]);
    const [filtSeriesLoading,   setFiltSeriesLoading]   = useState(false);
    const [filtSeriesTotalPages,setFiltSeriesTotalPages] = useState(1);

    const [showFilters,    setShowFilters]    = useState(false);
    const [searchTerm,     setSearchTerm]     = useState(filters.search || '');
    const [showQuickSearch,setShowQuickSearch]= useState(false);
    const quickSearchRef = useRef(null);
    const [showScrollTop,  setShowScrollTop]  = useState(false);

    // ── Active filter check ────────────────────────────────────────────────────
    const hasActiveFilters = useCallback((f) =>
        f.tags?.length > 0 || f.tagsExclude?.length > 0 ||
        f.studios?.length > 0 || f.studiosExclude?.length > 0 ||
        f.actors?.length > 0 || f.actorsExclude?.length > 0 ||
        f.characters?.length > 0 || f.charactersExclude?.length > 0 ||
        f.year || f.favorite || f.search || f.durationFilter || f.hlsFilter ||
        (f.contentType && f.contentType !== 'all'),
    []);

    const buildApiParams = useCallback((extra = {}) => ({
        limit: 20,
        search:           filters.search     || undefined,
        tags:             filters.tags?.join(',')           || undefined,
        tagsExclude:      filters.tagsExclude?.join(',')    || undefined,
        studios:          filters.studios?.join(',')        || undefined,
        studiosExclude:   filters.studiosExclude?.join(',') || undefined,
        actors:           filters.actors?.join(',')         || undefined,
        actorsExclude:    filters.actorsExclude?.join(',')  || undefined,
        characters:       filters.characters?.join(',')     || undefined,
        charactersExclude:filters.charactersExclude?.join(',') || undefined,
        year:             filters.year       || undefined,
        favorite:         filters.favorite   || undefined,
        filterMode:       filters.filterMode,
        sortBy:           filters.sortBy,
        order:            filters.order,
        durationFilter:   filters.durationFilter || undefined,
        hlsFilter:        filters.hlsFilter      || undefined,
        ...extra,
    }), [filters]);

    // ── Home sections (series) ────────────────────────────────────────────────
    const fetchSections = useCallback(async () => {
        setSectionsLoading(true);
        try {
            const results = await Promise.all(
                SECTIONS.map(async s => {
                    const p = s.getParams();
                    const sd = await seriesAPI.getSeries({ ...p, limit: 20 });
                    return { id: s.id, series: sd.series || [] };
                })
            );
            const data = {};
            results.forEach(r => { data[r.id] = r.series; });
            setSectionsData(data);
        } catch { toast.error('Failed to load content'); }
        finally { setSectionsLoading(false); }
    }, []);

    // ── Home sections (albums) ────────────────────────────────────────────────
    const fetchAlbumSections = useCallback(async () => {
        setAlbumSectLoading(true);
        try {
            const results = await Promise.all(
                ALBUM_SECTIONS.map(async s => {
                    const p = s.getParams();
                    const sd = await albumAPI.getAlbums({ ...p, limit: 12 });
                    return { id: s.id, albums: sd.albums || [] };
                })
            );
            const data = {};
            results.forEach(r => { data[r.id] = r.albums; });
            setAlbumSections(data);
        } catch { /* silently skip if albums not set up yet */ }
        finally { setAlbumSectLoading(false); }
    }, []);

    // ── Detail section (series show-all) ──────────────────────────────────────
    const fetchSeriesContent = useCallback(async () => {
        setSeriesLoading(true);
        try {
            const base = { ...detailSection.getParams(), page: seriesPage, limit: 20 };
            const data = await seriesAPI.getSeries(base);
            setSeriesList(data.series || []);
            setSeriesTotalPages(data.totalPages || 1);
        } catch { toast.error('Failed to load series'); }
        finally { setSeriesLoading(false); }
    }, [detailSection, seriesPage]);

    // ── Filtered: videos ──────────────────────────────────────────────────────
    const fetchVideoContent = useCallback(async () => {
        if (contentType === 'series' || contentType === 'albums') return;
        setVideoLoading(true);
        try {
            const data = await videoAPI.getVideos(buildApiParams({ page: seriesPage }));
            setVideoList(data.videos || []);
            setVideoTotalPages(data.totalPages || 1);
        } catch { toast.error('Failed to load videos'); }
        finally { setVideoLoading(false); }
    }, [seriesPage, buildApiParams, contentType]);

    // ── Filtered: series ──────────────────────────────────────────────────────
    const fetchFilteredSeries = useCallback(async () => {
        if (contentType === 'videos' || contentType === 'albums') return;
        setFiltSeriesLoading(true);
        try {
            const data = await seriesAPI.getSeries(buildApiParams({ page: seriesPage }));
            setFiltSeriesList(data.series || []);
            setFiltSeriesTotalPages(data.totalPages || 1);
        } catch { toast.error('Failed to load series'); }
        finally { setFiltSeriesLoading(false); }
    }, [seriesPage, buildApiParams, contentType]);

    // ── Filtered: albums ──────────────────────────────────────────────────────
    const fetchFilteredAlbums = useCallback(async () => {
        if (contentType === 'videos' || contentType === 'series') return;
        setAlbumLoading(true);
        try {
            const data = await albumAPI.getAlbums(buildApiParams({ page: seriesPage }));
            setAlbumList(data.albums || []);
            setAlbumTotalPages(data.totalPages || 1);
        } catch { toast.error('Failed to load albums'); }
        finally { setAlbumLoading(false); }
    }, [seriesPage, buildApiParams, contentType]);

    useEffect(() => { if (homeMode === 'home')     { fetchSections(); fetchAlbumSections(); } }, [homeMode, fetchSections, fetchAlbumSections]);
    useEffect(() => { if (homeMode === 'detail')   fetchSeriesContent(); },    [homeMode, fetchSeriesContent]);
    useEffect(() => { if (homeMode === 'filtered') fetchVideoContent(); },     [homeMode, fetchVideoContent]);
    useEffect(() => { if (homeMode === 'filtered') fetchFilteredSeries(); },   [homeMode, fetchFilteredSeries]);
    useEffect(() => { if (homeMode === 'filtered') fetchFilteredAlbums(); },   [homeMode, fetchFilteredAlbums]);

    useEffect(() => { setSearchTerm(filters.search || ''); }, [filters.search]);

    useEffect(() => {
        const handler = () => setShowScrollTop(window.scrollY > 300);
        window.addEventListener('scroll', handler, { passive: true });
        return () => window.removeEventListener('scroll', handler);
    }, []);

    // ── Commit search from header box ─────────────────────────────────────────
    const FILTER_KEYS = ['q','tags','txc','stu','sxc','act','axc','chr','cxc','yr','fav','fm','sort','ord','dur','hls','ct'];

    const commitSearch = useCallback((term) => {
        const nf = { ...filters, search: term };
        const fp = filtersToParams(nf);
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            FILTER_KEYS.forEach(k => next.delete(k));
            Object.entries(fp).forEach(([k, v]) => { if (v != null) next.set(k, v); });
            const nextMode = hasActiveFilters(nf) ? 'filtered' : 'home';
            next.set('mode', nextMode);
            next.set('seriesPage', '1');
            if (nextMode !== 'detail') next.delete('section');
            return next;
        }, { replace: false });
    }, [filters, setSearchParams, hasActiveFilters]);

    // ── Favorite toggles ──────────────────────────────────────────────────────
    const applyFavToggle = (id, isFavorite) => {
        setSeriesList(prev => prev.map(s => s._id === id ? { ...s, isFavorite } : s));
        setSectionsData(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(sId => {
                next[sId] = (next[sId] || []).map(s => s._id === id ? { ...s, isFavorite } : s);
            });
            return next;
        });
        setFiltSeriesList(prev => prev.map(s => s._id === id ? { ...s, isFavorite } : s));
    };

    const handleToggleFavoriteSeries = (seriesId) => {
        if (!user) { toast.error('Sign in to add favorites'); return; }
        toast.promise(
            seriesAPI.toggleFavorite(seriesId).then(res => {
                if (!res?.success) throw new Error();
                applyFavToggle(seriesId, res.isFavorite);
            }),
            { loading: 'Updating…', success: 'Favorite updated', error: 'Failed' }
        );
    };

    const handleToggleFavoriteVideo = (videoId) => {
        if (!user) { toast.error('Sign in to add favorites'); return; }
        toast.promise(
            videoAPI.toggleFavorite(videoId).then(res => {
                if (!res?.success) throw new Error();
                setVideoList(prev => prev.map(v => v._id === videoId ? { ...v, isFavorite: res.isFavorite } : v));
            }),
            { loading: 'Updating…', success: 'Favorite updated', error: 'Failed' }
        );
    };

    const handleToggleFavoriteAlbum = (albumId) => {
        if (!user) { toast.error('Sign in to add favorites'); return; }
        toast.promise(
            albumAPI.toggleFavorite(albumId).then(res => {
                if (!res?.success) throw new Error();
                setAlbumList(prev => prev.map(a => a._id === albumId ? { ...a, isFavorite: res.isFavorite } : a));
                setAlbumSections(prev => {
                    const next = { ...prev };
                    Object.keys(next).forEach(k => {
                        next[k] = (next[k] || []).map(a => a._id === albumId ? { ...a, isFavorite: res.isFavorite } : a);
                    });
                    return next;
                });
            }),
            { loading: 'Updating…', success: 'Favorite updated', error: 'Failed' }
        );
    };

    // ── Filter change ─────────────────────────────────────────────────────────
    const handleFilterChange = (newFilters) => {
        const fp = filtersToParams(newFilters);
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            FILTER_KEYS.forEach(k => next.delete(k));
            Object.entries(fp).forEach(([k, v]) => { if (v != null) next.set(k, v); });
            next.set('mode', hasActiveFilters(newFilters) ? 'filtered' : 'home');
            next.delete('section');
            next.set('seriesPage', '1');
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
        if (field === 'year')           { updated.year = ''; }
        if (field === 'favorite')       { updated.favorite = false; }
        if (field === 'search')         { updated.search = ''; setSearchTerm(''); }
        if (field === 'durationFilter') { updated.durationFilter = ''; }
        if (field === 'hlsFilter')      { updated.hlsFilter = ''; }
        if (field === 'contentType')    { updated.contentType = 'all'; }
        handleFilterChange(updated);
    };

    const handleShowAll = (section) => {
        updateParams({ mode: 'detail', section: section.id, seriesPage: '1' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const filterCount =
        (filters.tags?.length || 0) + (filters.tagsExclude?.length || 0) +
        (filters.studios?.length || 0) + (filters.studiosExclude?.length || 0) +
        (filters.actors?.length || 0) + (filters.actorsExclude?.length || 0) +
        (filters.characters?.length || 0) + (filters.charactersExclude?.length || 0) +
        (filters.year ? 1 : 0) + (filters.favorite ? 1 : 0) +
        (filters.durationFilter ? 1 : 0) + (filters.hlsFilter ? 1 : 0) +
        (filters.contentType && filters.contentType !== 'all' ? 1 : 0);

    const hasFilters = filterCount > 0 || !!filters.search;
    const hasPendingSearch = searchTerm !== (filters.search || '');

    const cardProps = {
        onActorClick:     v => handleChipClick('actors', v),
        onCharacterClick: v => handleChipClick('characters', v),
        onStudioClick:    v => handleChipClick('studios', v),
        onTagClick:       v => handleChipClick('tags', v),
    };

    // Filtered mode helpers
    const showVideos  = contentType === 'all' || contentType === 'videos';
    const showSeries  = contentType === 'all' || contentType === 'series';
    const showAlbums  = contentType === 'all' || contentType === 'albums';

    const filteredIsLoading = videoLoading || filtSeriesLoading || albumLoading;
    const filteredIsEmpty   =
        (!showVideos  || videoList.length === 0) &&
        (!showSeries  || filtSeriesList.length === 0) &&
        (!showAlbums  || albumList.length === 0);

    if (authLoading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500" />
            </div>
        );
    }

    const isAdminView = !!adminView;

    return (
        <div className="min-h-screen bg-slate-950 px-4 sm:px-6">
            {/* ══ HEADER ═══════════════════════════════════════════════════════ */}
            <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
                <div className="mx-auto px-3 sm:px-4 pt-3 pb-2">
                    <div className="flex items-center justify-between gap-2">
                        <a className="text-2xl sm:text-3xl font-bold text-red-500 cursor-pointer hover:text-red-400 transition shrink-0" href="/">
                            VIBEFLIX
                        </a>
                        <div className="flex items-center gap-1.5 sm:gap-2 justify-end">
                            {!isAdminView && (
                                <>
                                    <div className="hidden sm:block">
                                        <SearchBox searchTerm={searchTerm} setSearchTerm={setSearchTerm} onCommit={commitSearch} />
                                    </div>
                                    <button
                                        onClick={() => setShowFilters(true)}
                                        className={`flex items-center px-2 py-2 sm:px-3 rounded-lg text-white transition ${hasFilters ? 'bg-red-500 text-white' : 'hover:bg-slate-700'}`}>
                                        <Filter className="w-4 h-4 sm:w-5 sm:h-5" />
                                        <span className="hidden sm:inline text-sm">{filterCount > 0 ? ` (${filterCount})` : ''}</span>
                                    </button>
                                    <button
                                        onClick={() => { setShowQuickSearch(true); setTimeout(() => quickSearchRef.current?.focus(), 0); }}
                                        className="px-2 py-2 sm:px-3 rounded-md text-white hover:bg-slate-700 transition block sm:hidden">
                                        <Search className="w-4 h-4" />
                                    </button>
                                </>
                            )}
                            {user && <UserAvatarButton user={user} isAdmin={isAdmin} onClick={() => setShowProfile(true)} />}
                        </div>
                    </div>

                    {!isAdminView && (
                        showQuickSearch ? (
                            <div className="mt-2">
                                <SearchBox ref={quickSearchRef} searchTerm={searchTerm} setSearchTerm={setSearchTerm}
                                    onCommit={(term) => { commitSearch(term); setShowQuickSearch(false); }}
                                    onBlur={() => setShowQuickSearch(false)} />
                            </div>
                        ) : (
                            <>
                                {hasPendingSearch && searchTerm && (
                                    <div className="mt-1 text-xs text-slate-500 hidden sm:block">
                                        Press <kbd className="px-1 py-0.5 bg-slate-800 rounded border border-slate-700 font-mono">↵</kbd> to search for <span className="text-slate-300">"{searchTerm}"</span>
                                    </div>
                                )}
                                {hasFilters && (
                                    <div className="flex flex-wrap gap-1 mt-1 max-h-20 overflow-y-auto">
                                        {filters.search        && <FilterPill label={`"${filters.search}"`}    onRemove={() => handleRemoveFilter('search')}         color="slate" />}
                                        {filters.contentType && filters.contentType !== 'all' && <FilterPill label={`Type: ${filters.contentType}`} onRemove={() => handleRemoveFilter('contentType')} color="blue" />}
                                        {filters.favorite      && <FilterPill label="❤ Favorites"              onRemove={() => handleRemoveFilter('favorite')}       color="red"   />}
                                        {filters.year          && <FilterPill label={`Year: ${filters.year}`}  onRemove={() => handleRemoveFilter('year')}           color="green" />}
                                        {filters.durationFilter && <FilterPill label={`⏱ ${filters.durationFilter}`} onRemove={() => handleRemoveFilter('durationFilter')} color="green" />}
                                        {filters.hlsFilter      && <FilterPill label={filters.hlsFilter === 'transcoded' ? '✅ Transcoded' : '⚡ Not transcoded'} onRemove={() => handleRemoveFilter('hlsFilter')} color="green" />}
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
            <main className="mx-auto p-3 sm:p-4">
                {isAdmin && homeMode !== 'detail' && homeMode !== 'filtered' && (
                    <div className="flex-1 flex gap-2 items-center justify-between mb-4">
                        <div className="flex gap-1 bg-slate-900 p-1 rounded-lg shrink-0">
                            <button
                                onClick={() => updateParams({ view: null, mode: 'home', section: null, seriesPage: '1' })}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                                    !adminView ? 'bg-red-500 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                }`}
                            >
                                <Layers className="w-4 h-4" />
                                <span className="hidden md:block text-sm">Home</span>
                            </button>
                            {ADMIN_MODES.map(({ value, label, icon: Icon }) => (
                                <button key={value}
                                    onClick={() => updateParams({ view: value })}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                                        adminView === value ? 'bg-red-500 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                    }`}
                                >
                                    {Icon && <Icon className="w-4 h-4" />}
                                    <span className="hidden md:block text-sm">{label}</span>
                                </button>
                            ))}
                        </div>

                        {!isAdminView && (
                            <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-900">
                                <button
                                    onClick={() => navigate('/upload')}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span className="hidden md:inline text-sm">Upload Video</span>
                                </button>
                                <button
                                    onClick={() => setShowAlbumForm(true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-600 hover:bg-pink-500 text-white rounded-lg transition"
                                >
                                    <Images className="w-4 h-4" />
                                    <span className="hidden md:inline text-sm">New Album</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {adminView === 'dashboard' ? (
                    <Dashboard />
                ) : adminView === 'requests' ? (
                    <AdminRequests currentUserId={user?._id} />
                ) : (
                    <>
                        {(homeMode === 'detail' || homeMode === 'filtered') && (
                            <div className="flex items-center gap-3 mb-6">
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

                        {/* ── Home mode ──────────────────────────────────── */}
                        {homeMode === 'home' && (
                            sectionsLoading && albumSectLoading ? <LoadingSpinner /> : (
                                <div className="space-y-10">
                                    {SECTIONS.map(section => (
                                        <HomeSection
                                            key={section.id}
                                            section={section}
                                            items={sectionsData[section.id] || []}
                                            handleShowAll={handleShowAll}
                                            handleToggleFavoriteSeries={handleToggleFavoriteSeries}
                                            cardProps={cardProps}
                                        />
                                    ))}
                                    {/* ── Album sections ───────────────────── */}
                                    {ALBUM_SECTIONS.map(section => (
                                        <AlbumSection
                                            key={section.id}
                                            section={section}
                                            items={albumSections[section.id] || []}
                                            handleToggleFavoriteAlbum={handleToggleFavoriteAlbum}
                                        />
                                    ))}
                                </div>
                            )
                        )}

                        {/* ── Detail mode (series show-all) ───────────────── */}
                        {homeMode === 'detail' && (
                            <>
                                {!seriesLoading && seriesList.length === 0 ? (
                                    <EmptyState hasFilters={hasFilters} navigate={navigate} isAdmin={isAdmin} />
                                ) : (
                                    <>
                                        {seriesLoading ? <LoadingSpinner /> : (
                                            <>
                                                <ContentGrid>
                                                    {seriesList.map(series => (
                                                        <SeriesCard key={series._id} series={series}
                                                            onToggleFavorite={() => handleToggleFavoriteSeries(series._id)}
                                                            {...cardProps} />
                                                    ))}
                                                </ContentGrid>
                                                <Pagination currentPage={seriesPage} totalPages={seriesTotalPages}
                                                    onPageChange={p => { updateParams({ seriesPage: String(p) }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                                            </>
                                        )}
                                    </>
                                )}
                            </>
                        )}

                        {/* ── Filtered mode ──────────────────────────────── */}
                        {homeMode === 'filtered' && (
                            <>
                                {/* Content type tab strip */}
                                <div className="flex gap-1.5 mb-5 flex-wrap">
                                    {CT_TABS.map(({ value, label, icon: Icon }) => (
                                        <button
                                            key={value}
                                            onClick={() => handleFilterChange({ ...filters, contentType: value })}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                                                contentType === value
                                                    ? 'bg-red-500 border-red-500 text-white'
                                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                                            }`}
                                        >
                                            <Icon className="w-3.5 h-3.5" /> {label}
                                        </button>
                                    ))}
                                </div>

                                {filteredIsLoading ? <LoadingSpinner /> : filteredIsEmpty ? (
                                    <EmptyState hasFilters={hasFilters} navigate={navigate} isAdmin={isAdmin} />
                                ) : (
                                    <div className="space-y-10">
                                        {/* Videos */}
                                        {showVideos && videoList.length > 0 && (
                                            <div>
                                                {contentType === 'all' && (
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <Film className="w-4 h-4 text-red-400" />
                                                        <h3 className="text-base font-bold text-white">Videos</h3>
                                                        <span className="text-slate-500 text-xs">({videoList.length})</span>
                                                    </div>
                                                )}
                                                <ContentGrid>
                                                    {videoList.map(video => (
                                                        <VideoCard key={video._id} video={video}
                                                            onToggleFavorite={() => handleToggleFavoriteVideo(video._id)}
                                                            {...cardProps} />
                                                    ))}
                                                </ContentGrid>
                                                <Pagination currentPage={seriesPage} totalPages={videoTotalPages}
                                                    onPageChange={p => { updateParams({ seriesPage: String(p) }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                                            </div>
                                        )}

                                        {/* Series */}
                                        {showSeries && filtSeriesList.length > 0 && (
                                            <div>
                                                {contentType === 'all' && (
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <Layers className="w-4 h-4 text-red-400" />
                                                        <h3 className="text-base font-bold text-white">Series</h3>
                                                        <span className="text-slate-500 text-xs">({filtSeriesList.length})</span>
                                                    </div>
                                                )}
                                                <ContentGrid>
                                                    {filtSeriesList.map(series => (
                                                        <SeriesCard key={series._id} series={series}
                                                            onToggleFavorite={() => handleToggleFavoriteSeries(series._id)}
                                                            {...cardProps} />
                                                    ))}
                                                </ContentGrid>
                                                <Pagination currentPage={seriesPage} totalPages={filtSeriesTotalPages}
                                                    onPageChange={p => { updateParams({ seriesPage: String(p) }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                                            </div>
                                        )}

                                        {/* Albums */}
                                        {showAlbums && albumList.length > 0 && (
                                            <div>
                                                {contentType === 'all' && (
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <Images className="w-4 h-4 text-pink-400" />
                                                        <h3 className="text-base font-bold text-white">Albums</h3>
                                                        <span className="text-slate-500 text-xs">({albumList.length})</span>
                                                    </div>
                                                )}
                                                <ContentGrid>
                                                    {albumList.map(album => (
                                                        <HomeAlbumCard key={album._id} album={album}
                                                            onToggleFavorite={() => handleToggleFavoriteAlbum(album._id)} />
                                                    ))}
                                                </ContentGrid>
                                                <Pagination currentPage={seriesPage} totalPages={albumTotalPages}
                                                    onPageChange={p => { updateParams({ seriesPage: String(p) }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                                            </div>
                                        )}
                                    </div>
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

            {showAlbumForm && (
                <AlbumFormModal
                    album={null}
                    onSaved={() => { setShowAlbumForm(false); fetchAlbumSections(); toast.success('Album created — add images from the album detail page'); navigate('/?ct=albums&mode=filtered'); }}
                    onClose={() => setShowAlbumForm(false)}
                />
            )}
        </div>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
    const map = {
        red:   'bg-red-500/20 text-red-300 hover:bg-red-500/30',
        green: 'bg-green-500/20 text-green-300 hover:bg-green-500/30',
        blue:  'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30',
        slate: 'bg-slate-700 text-slate-300 hover:bg-slate-600',
    };
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
            <p className="text-slate-500 mb-6 text-sm">{hasFilters ? 'Try adjusting your filters' : isAdmin ? 'Start by uploading a video' : 'Check back later for new content'}</p>
            {!hasFilters && isAdmin && (
                <button onClick={() => navigate('/upload')}
                    className="flex items-center gap-2 px-5 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-sm">
                    <Plus className="w-4 h-4" /> Upload Video
                </button>
            )}
        </div>
    );
}

// ─── AppHeader — shared sticky header for all pages ──────────────────────────
export function AppHeader({ actions }) {
    const { user, isAdmin } = useAuth();
    const [showProfile, setShowProfile] = useState(false);
    return (
        <>
            <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
                <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-2.5">
                    <a href="/"
                        className="text-xl sm:text-2xl font-bold text-red-500 hover:text-red-400 transition shrink-0 tracking-tight">
                        VIBEFLIX
                    </a>
                    <div className="flex items-center gap-2">
                        {actions}
                        {user && <UserAvatarButton user={user} isAdmin={isAdmin} onClick={() => setShowProfile(true)} />}
                    </div>
                </div>
            </header>
            <UserProfile isOpen={showProfile} onClose={() => setShowProfile(false)} />
        </>
    );
}

export default Home;