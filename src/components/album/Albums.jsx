import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    Images, Heart, Tag, Plus, Search, SlidersHorizontal,
    X, Eye, ChevronLeft, ChevronRight, LayoutGrid, RefreshCw,
    Pencil, Trash2, Upload,
} from "lucide-react";
import toast from "react-hot-toast";
import { albumAPI } from "../../api/api";
import { useAuth } from "../../context/AuthContext";
import { TagsContainer } from "../series/SeriesCard";
import AlbumFormModal from "./AlbumFormModal";

// ─── Album Card ───────────────────────────────────────────────────────────────
function AlbumCard({ album, onToggleFavorite }) {
    const { title, sampleImages = [], imageCount = 0, totalViews = 0, tags, isFavorite } = album;

    return (
        <a
            href={`/albums/${album._id}`}
            className="relative bg-slate-900 rounded-xl overflow-hidden border border-slate-800 hover:border-slate-600 transition cursor-pointer group flex flex-col h-full"
        >
            {/* Cover mosaic */}
            <div className="relative aspect-video bg-slate-800 overflow-hidden flex-none">
                {sampleImages.length === 0 ? (
                    <div className="w-full h-full flex items-center justify-center">
                        <Images className="w-10 h-10 text-slate-600" />
                    </div>
                ) : sampleImages.length === 1 ? (
                    <img
                        src={albumAPI.imageUrl(sampleImages[0])}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                    />
                ) : (
                    // 2×2 mosaic
                    <div className={`w-full h-full grid gap-0.5 ${sampleImages.length >= 4 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-2'}`}>
                        {sampleImages.slice(0, 4).map((img, i) => (
                            <img
                                key={i}
                                src={albumAPI.imageUrl(img)}
                                alt=""
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                style={{ transitionDelay: `${i * 40}ms` }}
                                loading="lazy"
                            />
                        ))}
                    </div>
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                    <div className="bg-pink-500 rounded-full px-4 py-2 flex items-center gap-2 shadow-lg">
                        <Images className="w-4 h-4 text-white" />
                        <span className="text-white text-sm font-semibold">View Album</span>
                    </div>
                </div>

                {/* Badges */}
                <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-pink-600 text-white text-xs font-bold rounded uppercase">
                    Album
                </div>
                <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 bg-black/80 text-white text-xs rounded font-medium">
                    <Images className="w-2.5 h-2.5" />
                    {imageCount} img{imageCount !== 1 ? 's' : ''}
                </div>

                {/* Favorite */}
                <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavorite?.(); }}
                    className="absolute top-1.5 right-1.5 p-1.5 bg-black/60 rounded-full hover:bg-black/80 transition"
                >
                    <Heart
                        className={`w-3.5 h-3.5 transition ${isFavorite ? 'text-red-500' : 'text-white'}`}
                        fill={isFavorite ? 'currentColor' : 'none'}
                    />
                </button>
            </div>

            {/* Info */}
            <div className="p-2.5 sm:p-3 flex-1 flex flex-col">
                <h3 className="font-bold text-white text-xs sm:text-sm leading-tight mb-1 line-clamp-2 group-hover:text-pink-400 transition uppercase">
                    {title}
                </h3>
                {totalViews > 0 && (
                    <div className="flex items-center gap-1 text-xs text-slate-500 mb-1.5">
                        <Eye className="w-2.5 h-2.5" />
                        {totalViews.toLocaleString()} views
                    </div>
                )}
                {tags?.length > 0 && (
                    <div className="mt-auto">
                        <TagsContainer tags={tags} color="pink" limit={3} />
                    </div>
                )}
            </div>
        </a>
    );
}

// ─── Sort options ─────────────────────────────────────────────────────────────
const SORT_OPTIONS = [
    { value: 'updatedAt_desc', label: 'Recently Updated' },
    { value: 'createdAt_desc', label: 'Newest' },
    { value: 'createdAt_asc',  label: 'Oldest' },
    { value: 'title_asc',      label: 'Title A–Z' },
    { value: 'views_desc',     label: 'Most Viewed' },
];

// ─── Albums Page ──────────────────────────────────────────────────────────────
export default function Albums() {
    const { isAdmin } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();

    const [albums,      setAlbums]      = useState([]);
    const [totalPages,  setTotalPages]  = useState(1);
    const [totalCount,  setTotalCount]  = useState(0);
    const [loading,     setLoading]     = useState(true);
    const [search,      setSearch]      = useState(searchParams.get('search') || '');
    const [searchInput, setSearchInput] = useState(search);
    const [sort,        setSort]        = useState('updatedAt_desc');
    const [page,        setPage]        = useState(parseInt(searchParams.get('page') || '1'));
    const [showForm,    setShowForm]    = useState(false);
    const [editAlbum,   setEditAlbum]   = useState(null);
    const [favorite,    setFavorite]    = useState(searchParams.get('favorite') === 'true');

    const searchRef = useRef(null);
    const debounceRef = useRef(null);

    const [sortBy, sortOrder] = sort.split('_');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = { page, limit: 40, sortBy, order: sortOrder };
            if (search) params.search = search;
            if (favorite) params.favorite = 'true';
            const data = await albumAPI.getAlbums(params);
            setAlbums(data.albums || []);
            setTotalPages(data.totalPages || 1);
            setTotalCount(data.total || 0);
        } catch (e) {
            toast.error('Failed to load albums');
        } finally {
            setLoading(false);
        }
    }, [page, sortBy, sortOrder, search, favorite]);

    useEffect(() => { load(); }, [load]);

    const handleSearch = (val) => {
        setSearchInput(val);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setSearch(val);
            setPage(1);
        }, 350);
    };

    const handleToggleFavorite = async (albumId) => {
        try {
            const res = await albumAPI.toggleFavorite(albumId);
            setAlbums(prev => prev.map(a => a._id === albumId ? { ...a, isFavorite: res.isFavorite } : a));
        } catch (e) {
            toast.error('Failed to update favorite');
        }
    };

    const handleFormSaved = () => {
        setShowForm(false);
        setEditAlbum(null);
        load();
    };

    const handleDelete = async (album) => {
        if (!window.confirm(`Delete album "${album.title}" and all its images?`)) return;
        try {
            await albumAPI.deleteAlbum(album._id);
            toast.success('Album deleted');
            load();
        } catch (e) {
            toast.error('Failed to delete album');
        }
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Images className="w-5 h-5 text-pink-400" />
                    <h2 className="text-lg font-bold text-white">Image Albums</h2>
                    {!loading && <span className="text-slate-500 text-sm">({totalCount.toLocaleString()})</span>}
                </div>
                <div className="flex items-center gap-2">
                    {isAdmin && (
                        <button
                            onClick={() => setShowForm(true)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg text-sm font-medium transition"
                        >
                            <Plus className="w-4 h-4" /> New Album
                        </button>
                    )}
                </div>
            </div>

            {/* Controls bar */}
            <div className="flex flex-wrap items-center gap-2">
                {/* Search */}
                <div className="relative flex-1 min-w-48">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input
                        ref={searchRef}
                        value={searchInput}
                        onChange={e => handleSearch(e.target.value)}
                        placeholder="Search albums…"
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-8 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-pink-500 transition"
                    />
                    {searchInput && (
                        <button onClick={() => handleSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* Favorite toggle */}
                <button
                    onClick={() => { setFavorite(f => !f); setPage(1); }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition ${
                        favorite ? 'bg-red-500/15 border-red-500/40 text-red-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                >
                    <Heart className="w-3.5 h-3.5" fill={favorite ? 'currentColor' : 'none'} />
                    Favorites
                </button>

                {/* Sort */}
                <select
                    value={sort}
                    onChange={e => { setSort(e.target.value); setPage(1); }}
                    className="bg-slate-800 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-pink-500 transition"
                >
                    {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>

                <button onClick={load} className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white transition">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Grid */}
            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" />
                </div>
            ) : albums.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3 text-slate-500">
                    <Images className="w-10 h-10 text-slate-700" />
                    <p>No albums found</p>
                    {isAdmin && (
                        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg text-sm transition">
                            Create first album
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {albums.map(album => (
                        <div key={album._id} className="relative group/card">
                            <AlbumCard
                                album={album}
                                onToggleFavorite={() => handleToggleFavorite(album._id)}
                            />
                            {isAdmin && (
                                <div className="absolute top-8 right-1.5 hidden group-hover/card:flex flex-col gap-1 z-10">
                                    <button
                                        onClick={(e) => { e.preventDefault(); setEditAlbum(album); setShowForm(true); }}
                                        className="p-1.5 bg-black/70 hover:bg-slate-700 text-white rounded-lg transition"
                                        title="Edit"
                                    >
                                        <Pencil className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={(e) => { e.preventDefault(); handleDelete(album); }}
                                        className="p-1.5 bg-black/70 hover:bg-red-600 text-white rounded-lg transition"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                        disabled={page <= 1}
                        onClick={() => setPage(p => p - 1)}
                        className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg transition"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-slate-400 text-sm px-2">
                        Page {page} of {totalPages}
                    </span>
                    <button
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => p + 1)}
                        className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg transition"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Create/Edit modal */}
            {showForm && (
                <AlbumFormModal
                    album={editAlbum}
                    onSaved={handleFormSaved}
                    onClose={() => { setShowForm(false); setEditAlbum(null); }}
                />
            )}
        </div>
    );
}
