import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    X, Heart, Film, Layers, LogOut, Shield, User as UserIcon,
    ChevronLeft, ChevronRight, RefreshCw, Crown, Users, Clock,
    Trash2, Images, Eye, Key, Check,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { favoritesAPI, authAPI, generalAPI, historyAPI, albumAPI } from '../../api/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

// ── FavCard: video / series ───────────────────────────────────────────────────
function FavCard({ item, onClose }) {
    const navigate = useNavigate();
    const thumbSrc = item.thumbnailPath ? generalAPI.thumbnailUrl(item.thumbnailPath) : null;
    const isVideo  = item._type === 'video';
    return (
        <div
            onClick={() => { navigate(isVideo ? `/video/${item._id}` : `/series/${item._id}`); onClose(); }}
            className="group bg-slate-800 border border-slate-700 rounded-xl overflow-hidden hover:border-slate-600 transition cursor-pointer"
        >
            <div className="aspect-video bg-slate-900 relative">
                {thumbSrc
                    ? <img src={thumbSrc} alt={item.title} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center">
                        {isVideo ? <Film className="w-8 h-8 text-slate-700" /> : <Layers className="w-8 h-8 text-slate-700" />}
                      </div>
                }
                <span className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 text-xs rounded font-medium ${
                    isVideo ? 'bg-red-500/90 text-white' : 'bg-purple-500/90 text-white'
                }`}>
                    {isVideo ? 'Video' : 'Series'}
                </span>
            </div>
            <div className="p-2">
                <p className="text-white text-xs font-medium truncate">{item.title}</p>
                {item.favoritedAt && (
                    <p className="text-slate-500 text-xs mt-0.5">{new Date(item.favoritedAt).toLocaleDateString()}</p>
                )}
            </div>
        </div>
    );
}

// ── AlbumFavCard ──────────────────────────────────────────────────────────────
function AlbumFavCard({ item, onClose }) {
    const navigate = useNavigate();
    const samples  = item.sampleImages || [];

    return (
        <div
            onClick={() => { navigate(`/albums/${item._id}`); onClose(); }}
            className="group bg-slate-800 border border-slate-700 rounded-xl overflow-hidden hover:border-slate-600 transition cursor-pointer"
        >
            <div className="aspect-video bg-slate-900 relative">
                {samples.length === 0 ? (
                    <div className="w-full h-full flex items-center justify-center">
                        <Images className="w-8 h-8 text-slate-700" />
                    </div>
                ) : samples.length === 1 ? (
                    <img src={albumAPI.imageUrl(samples[0])} alt={item.title} className="w-full h-full object-cover" />
                ) : (
                    <div className={`w-full h-full grid gap-px ${samples.length >= 4 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-2'}`}>
                        {samples.slice(0, 4).map((img, i) => (
                            <img key={i} src={albumAPI.imageUrl(img)} alt="" className="w-full h-full object-cover" />
                        ))}
                    </div>
                )}
                <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 text-xs rounded font-medium bg-pink-600/90 text-white">
                    Album
                </span>
                {item.imageCount > 0 && (
                    <span className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 bg-black/70 text-white text-[10px] rounded">
                        <Images className="w-2.5 h-2.5" /> {item.imageCount}
                    </span>
                )}
            </div>
            <div className="p-2">
                <p className="text-white text-xs font-medium truncate">{item.title}</p>
                <div className="flex items-center justify-between mt-0.5">
                    {item.favoritedAt && (
                        <p className="text-slate-500 text-xs">{new Date(item.favoritedAt).toLocaleDateString()}</p>
                    )}
                    {item.totalViews > 0 && (
                        <span className="flex items-center gap-0.5 text-slate-500 text-[10px]">
                            <Eye className="w-2.5 h-2.5" /> {item.totalViews}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── ImageFavCard ──────────────────────────────────────────────────────────────
function ImageFavCard({ item, onClose }) {
    const navigate = useNavigate();
    return (
        <div
            onClick={() => { navigate(`/albums/${item.albumId}`); onClose(); }}
            className="group bg-slate-800 border border-slate-700 rounded-xl overflow-hidden hover:border-slate-600 transition cursor-pointer"
        >
            <div className="aspect-square bg-slate-900 relative">
                <img src={albumAPI.imageUrl(item.imagePath)} alt={item.title || ''}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 text-[10px] rounded font-medium bg-red-600/90 text-white flex items-center gap-0.5">
                    <Heart className="w-2.5 h-2.5" fill="currentColor" /> Photo
                </span>
                {item.views > 0 && (
                    <span className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 bg-black/70 text-white text-[10px] rounded">
                        <Eye className="w-2.5 h-2.5" /> {item.views}
                    </span>
                )}
            </div>
            <div className="p-1.5">
                {item.title && <p className="text-white text-xs font-medium truncate">{item.title}</p>}
                {item.favoritedAt && (
                    <p className="text-slate-500 text-[10px] mt-0.5">{new Date(item.favoritedAt).toLocaleDateString()}</p>
                )}
            </div>
        </div>
    );
}

// ── HistoryCard ───────────────────────────────────────────────────────────────
function HistoryCard({ item, onClose, onRemove }) {
    const navigate = useNavigate();
    const thumbSrc = item.thumbnailPath ? generalAPI.thumbnailUrl(item.thumbnailPath) : null;
    const pct      = item.progressPct ?? (item.duration > 0 ? Math.min(item.progress / item.duration, 1) : 0);
    const handleClick = () => {
        const url = item.seriesId ? `/series/${item.seriesId}?ep=${item.videoId}` : `/video/${item.videoId}`;
        navigate(url); onClose();
    };
    return (
        <div className="group relative bg-slate-800 border border-slate-700 rounded-xl overflow-hidden hover:border-slate-600 transition cursor-pointer"
             onClick={handleClick}>
            <div className="aspect-video bg-slate-900 relative">
                {thumbSrc
                    ? <img src={thumbSrc} alt={item.title} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-8 h-8 text-slate-700" />
                      </div>
                }
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                    <div className="h-full bg-red-500" style={{ width: `${pct * 100}%` }} />
                </div>
            </div>
            <div className="p-2">
                <p className="text-white text-xs font-medium truncate">{item.title}</p>
                <p className="text-slate-500 text-xs mt-0.5">
                    {item.watchedAt ? new Date(item.watchedAt).toLocaleDateString() : ''}
                </p>
            </div>
            <button onClick={e => { e.stopPropagation(); onRemove(item.videoId); }}
                className="absolute top-1.5 right-1.5 p-1 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition"
                title="Remove from history">
                <Trash2 className="w-3 h-3 text-white" />
            </button>
        </div>
    );
}

// ── UserRow (admin) ───────────────────────────────────────────────────────────
function UserRow({ u, currentUserId, onRoleChange }) {
    const [saving, setSaving] = useState(false);
    const toggle = async () => {
        setSaving(true);
        try {
            const newRole = u.role === 'admin' ? 'user' : 'admin';
            await authAPI.setUserRole(u._id, newRole);
            onRoleChange(u._id, newRole);
            toast.success(`${u.username || u.name} is now ${newRole}`);
        } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
        finally { setSaving(false); }
    };
    return (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0 text-white text-sm font-bold uppercase">
                {u.username?.[0] || u.name?.[0] || <UserIcon className="w-4 h-4 text-slate-400" />}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{u.username || u.name}</p>
                {u.email && <p className="text-slate-500 text-xs truncate">{u.email}</p>}
            </div>
            {u._id === currentUserId
                ? <span className="text-xs text-slate-500 shrink-0">You</span>
                : <button onClick={toggle} disabled={saving}
                    className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg font-medium transition ${
                        u.role === 'admin'
                            ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    }`}>
                    {u.role === 'admin' ? <Crown className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                    {saving ? '…' : u.role === 'admin' ? 'Admin' : 'User'}
                  </button>
            }
        </div>
    );
}

// ── Change password form ───────────────────────────────────────────────────────
function ChangePasswordForm() {
    const [current, setCurrent]   = useState('');
    const [next,    setNext]      = useState('');
    const [confirm, setConfirm]   = useState('');
    const [saving,  setSaving]    = useState(false);
    const [done,    setDone]      = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (next !== confirm)  { toast.error('Passwords do not match'); return; }
        if (next.length < 6)   { toast.error('Password must be at least 6 characters'); return; }
        setSaving(true);
        try {
            await authAPI.changePassword(current, next);
            toast.success('Password changed');
            setDone(true); setCurrent(''); setNext(''); setConfirm('');
            setTimeout(() => setDone(false), 3000);
        } catch (e) { toast.error(e?.response?.data?.error || 'Failed to change password'); }
        finally { setSaving(false); }
    };

    return (
        <form onSubmit={handleSubmit} className="bg-slate-800/50 rounded-xl p-4 space-y-3">
            <h3 className="text-white font-medium text-sm flex items-center gap-2">
                <Key className="w-4 h-4 text-slate-400" /> Change Password
            </h3>
            {[
                { label: 'Current password', value: current, set: setCurrent },
                { label: 'New password',     value: next,    set: setNext    },
                { label: 'Confirm new',      value: confirm, set: setConfirm },
            ].map(({ label, value, set }) => (
                <div key={label}>
                    <label className="block text-xs text-slate-500 mb-1">{label}</label>
                    <input type="password" value={value} onChange={e => set(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-red-500 transition"
                        required />
                </div>
            ))}
            <button type="submit" disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                {done ? <><Check className="w-4 h-4" /> Changed!</> : saving ? 'Saving…' : 'Update Password'}
            </button>
        </form>
    );
}

// ── Pagination ────────────────────────────────────────────────────────────────
function MiniPager({ page, pages, onPage }) {
    if (pages <= 1) return null;
    return (
        <div className="flex items-center justify-center gap-3 mt-4">
            <button disabled={page <= 1} onClick={() => onPage(page - 1)}
                className="p-2 rounded-lg bg-slate-800 text-slate-400 disabled:opacity-40 hover:bg-slate-700 transition">
                <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-slate-400 text-sm">{page} / {pages}</span>
            <button disabled={page >= pages} onClick={() => onPage(page + 1)}
                className="p-2 rounded-lg bg-slate-800 text-slate-400 disabled:opacity-40 hover:bg-slate-700 transition">
                <ChevronRight className="w-4 h-4" />
            </button>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function UserProfile({ isOpen, onClose }) {
    const { user, logout, isAdmin } = useAuth();
    const navigate = useNavigate();

    const [tab,         setTab]         = useState('favorites');

    // Favorites
    const [favorites,   setFavorites]   = useState([]);
    const [favLoading,  setFavLoading]  = useState(false);
    const [favPage,     setFavPage]     = useState(1);
    const [favTotal,    setFavTotal]    = useState(0);
    const [favPages,    setFavPages]    = useState(1);
    const [favType,     setFavType]     = useState('all');  // 'all'|'video'|'series'|'album'

    // Album favorites (separate fetch)
    const [albumFavs,      setAlbumFavs]      = useState([]);
    const [albumFavLoad,   setAlbumFavLoad]   = useState(false);
    const [albumFavPage,   setAlbumFavPage]   = useState(1);
    const [albumFavTotal,  setAlbumFavTotal]  = useState(0);
    const [albumFavPages,  setAlbumFavPages]  = useState(1);

    // Image favorites (albumImage type)
    const [imageFavs,      setImageFavs]      = useState([]);
    const [imageFavLoad,   setImageFavLoad]   = useState(false);
    const [imageFavPage,   setImageFavPage]   = useState(1);
    const [imageFavTotal,  setImageFavTotal]  = useState(0);
    const [imageFavPages,  setImageFavPages]  = useState(1);

    // History
    const [history,     setHistory]     = useState([]);
    const [histLoading, setHistLoading] = useState(false);
    const [histPage,    setHistPage]    = useState(1);
    const [histTotal,   setHistTotal]   = useState(0);
    const [histHasMore, setHistHasMore] = useState(false);
    const histScrollRef = useRef(null);

    // Users (admin)
    const [users,        setUsers]        = useState([]);
    const [usersLoading, setUsersLoading] = useState(false);

    // ── Loaders ────────────────────────────────────────────────────────────────
    const loadFavorites = useCallback(async () => {
        setFavLoading(true);
        try {
            const data = await favoritesAPI.getMyFavorites({
                page:     favPage,
                limit:    20,
                itemType: favType === 'all' || favType === 'album' ? undefined : favType,
            });
            // If filtering to albums only, show nothing in the main grid
            // (albums are shown separately); otherwise filter out albums
            const items = favType === 'album'
                ? []
                : (data.items || []).filter(i => i._type !== 'album');
            setFavorites(items);
            setFavTotal(favType === 'album' ? 0 : data.total);
            setFavPages(favType === 'album' ? 1  : data.totalPages);
        } catch { toast.error('Failed to load favorites'); }
        finally  { setFavLoading(false); }
    }, [favPage, favType]);

    const loadAlbumFavorites = useCallback(async () => {
        setAlbumFavLoad(true);
        try {
            const data = await favoritesAPI.getMyFavorites({
                page:     albumFavPage,
                limit:    20,
                itemType: 'album',
            });
            setAlbumFavs(data.items || []);
            setAlbumFavTotal(data.total);
            setAlbumFavPages(data.totalPages);
        } catch { toast.error('Failed to load album favorites'); }
        finally  { setAlbumFavLoad(false); }
    }, [albumFavPage]);

    const loadImageFavorites = useCallback(async () => {
        setImageFavLoad(true);
        try {
            const data = await favoritesAPI.getMyFavorites({
                page:     imageFavPage,
                limit:    24,
                itemType: 'albumImage',
            });
            setImageFavs(data.items || []);
            setImageFavTotal(data.total);
            setImageFavPages(data.totalPages);
        } catch { toast.error('Failed to load image favorites'); }
        finally  { setImageFavLoad(false); }
    }, [imageFavPage]);

    const loadHistory = useCallback(async (page = 1, append = false) => {
        setHistLoading(true);
        try {
            const data = await historyAPI.getHistory({ page, limit: 20 });
            setHistory(prev => append ? [...prev, ...data.items] : data.items);
            setHistTotal(data.total);
            setHistHasMore(page < data.totalPages);
            setHistPage(page);
        } catch { toast.error('Failed to load history'); }
        finally  { setHistLoading(false); }
    }, []);

    const handleRemoveHistory = useCallback(async (videoId) => {
        try {
            await historyAPI.removeEntry(videoId);
            setHistory(prev => prev.filter(h => h.videoId?.toString() !== videoId?.toString()));
            setHistTotal(prev => Math.max(0, prev - 1));
        } catch { toast.error('Failed to remove history entry'); }
    }, []);

    const loadUsers = useCallback(async () => {
        if (!isAdmin) return;
        setUsersLoading(true);
        try { const data = await authAPI.getUsers(); setUsers(data.users || []); }
        catch { toast.error('Failed to load users'); }
        finally { setUsersLoading(false); }
    }, [isAdmin]);

    // Infinite scroll for history
    useEffect(() => {
        const el = histScrollRef.current;
        if (!el) return;
        const onScroll = () => {
            if (histLoading || !histHasMore) return;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) loadHistory(histPage + 1, true);
        };
        el.addEventListener('scroll', onScroll);
        return () => el.removeEventListener('scroll', onScroll);
    }, [histLoading, histHasMore, histPage, loadHistory]);

    useEffect(() => { if (isOpen && tab === 'favorites') { loadFavorites(); loadAlbumFavorites(); loadImageFavorites(); } }, [isOpen, tab, loadFavorites, loadAlbumFavorites, loadImageFavorites]);
    useEffect(() => { if (isOpen && tab === 'history')   loadHistory(1); },                         [isOpen, tab, loadHistory]);
    useEffect(() => { if (isOpen && tab === 'users' && isAdmin) loadUsers(); },                     [isOpen, tab, isAdmin, loadUsers]);

    if (!isOpen || !user) return null;

    const allTabs = [
        { id: 'favorites', label: 'Favorites', icon: Heart    },
        { id: 'history',   label: 'History',   icon: Clock    },
        { id: 'account',   label: 'Account',   icon: UserIcon },
        ...(isAdmin ? [{ id: 'users', label: 'Users', icon: Users }] : []),
    ];

    // Determine which fav sub-tabs to render
    const FAV_TYPES = [
        { value: 'all',    label: 'All'    },
        { value: 'video',  label: 'Videos' },
        { value: 'series', label: 'Series' },
        { value: 'album',  label: 'Albums', icon: Images },
        { value: 'images', label: 'Photos', icon: Heart  },
    ];

    const showAlbumSection  = favType === 'all' || favType === 'album';
    const showImagesSection = favType === 'all' || favType === 'images';
    const showMediaSection  = favType !== 'album' && favType !== 'images';

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-end" onClick={onClose}>
            <div
                className="h-full w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* ── Header ─────────────────────────────────────────────────── */}
                <div className="flex items-center gap-3 p-4 border-b border-slate-800 shrink-0">
                    <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-white uppercase text-sm shrink-0">
                        {user.username?.[0] || user.name?.[0] || <UserIcon className="w-5 h-5 text-slate-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold truncate">{user.username || user.name}</p>
                        <div className="flex items-center gap-2">
                            {user.email && <p className="text-slate-400 text-xs truncate">{user.email}</p>}
                            {isAdmin && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded font-medium shrink-0">
                                    <Crown className="w-3 h-3" /> Admin
                                </span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* ── Tabs ───────────────────────────────────────────────────── */}
                <div className="flex border-b border-slate-800 shrink-0">
                    {allTabs.map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition border-b-2 ${
                                tab === t.id ? 'text-red-400 border-red-500' : 'text-slate-500 border-transparent hover:text-slate-300'
                            }`}>
                            <t.icon className="w-4 h-4" />
                            <span className="hidden sm:inline">{t.label}</span>
                        </button>
                    ))}
                </div>

                {/* ── Body ───────────────────────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto p-4" ref={tab === 'history' ? histScrollRef : undefined}>

                    {/* ── Favorites ─────────────────────────────────────────── */}
                    {tab === 'favorites' && (
                        <div>
                            {/* Sub-type filter */}
                            <div className="flex gap-2 mb-4 flex-wrap">
                                {FAV_TYPES.map(({ value, label, icon: Icon }) => (
                                    <button key={value}
                                        onClick={() => { setFavType(value); setFavPage(1); setAlbumFavPage(1); setImageFavPage(1); }}
                                        className={`flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium transition ${
                                            favType === value ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                                        }`}>
                                        {Icon && <Icon className="w-3.5 h-3.5" />}
                                        {label}
                                    </button>
                                ))}
                                <button onClick={() => { loadFavorites(); loadAlbumFavorites(); loadImageFavorites(); }}
                                    className="ml-auto p-1.5 text-slate-500 hover:text-slate-300 transition">
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Videos + Series grid */}
                            {showMediaSection && (
                                favLoading ? (
                                    <div className="flex justify-center py-8">
                                        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-red-500" />
                                    </div>
                                ) : favorites.length > 0 ? (
                                    <>
                                        <p className="text-slate-500 text-xs mb-3">{favTotal} item{favTotal !== 1 ? 's' : ''}</p>
                                        <div className="grid grid-cols-2 gap-3 mb-4">
                                            {favorites.map(item => (
                                                <FavCard key={`${item._type}-${item._id}`} item={item} onClose={onClose} />
                                            ))}
                                        </div>
                                        <MiniPager page={favPage} pages={favPages} onPage={setFavPage} />
                                    </>
                                ) : favType !== 'album' && favType !== 'images' ? (
                                    <div className="text-center py-8">
                                        <Heart className="w-10 h-10 text-slate-700 mx-auto mb-2" />
                                        <p className="text-slate-500 text-sm">No video or series favorites yet</p>
                                    </div>
                                ) : null
                            )}

                            {/* Albums section */}
                            {showAlbumSection && (
                                <div className={showMediaSection && favorites.length > 0 ? 'mt-6 pt-6 border-t border-slate-800' : ''}>
                                    {favType === 'all' && (
                                        <div className="flex items-center gap-2 mb-3">
                                            <Images className="w-4 h-4 text-pink-400" />
                                            <h3 className="text-white text-sm font-semibold">Favorite Albums</h3>
                                            {albumFavTotal > 0 && <span className="text-slate-500 text-xs">({albumFavTotal})</span>}
                                        </div>
                                    )}

                                    {albumFavLoad ? (
                                        <div className="flex justify-center py-8">
                                            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-pink-500" />
                                        </div>
                                    ) : albumFavs.length > 0 ? (
                                        <>
                                            {favType === 'album' && (
                                                <p className="text-slate-500 text-xs mb-3">{albumFavTotal} album{albumFavTotal !== 1 ? 's' : ''}</p>
                                            )}
                                            <div className="grid grid-cols-2 gap-3">
                                                {albumFavs.map(item => (
                                                    <AlbumFavCard key={item._id} item={item} onClose={onClose} />
                                                ))}
                                            </div>
                                            <MiniPager page={albumFavPage} pages={albumFavPages} onPage={setAlbumFavPage} />
                                        </>
                                    ) : (
                                        <div className="text-center py-8">
                                            <Images className="w-10 h-10 text-slate-700 mx-auto mb-2" />
                                            <p className="text-slate-500 text-sm">No favorite albums yet</p>
                                            <p className="text-slate-600 text-xs mt-1">Heart an album to save it here</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Favorite Images section */}
                            {showImagesSection && (
                                <div className={(showMediaSection && favorites.length > 0) || (showAlbumSection && albumFavs.length > 0) ? 'mt-6 pt-6 border-t border-slate-800' : ''}>
                                    {favType === 'all' && (
                                        <div className="flex items-center gap-2 mb-3">
                                            <Heart className="w-4 h-4 text-red-400" fill="currentColor" />
                                            <h3 className="text-white text-sm font-semibold">Favorite Photos</h3>
                                            {imageFavTotal > 0 && <span className="text-slate-500 text-xs">({imageFavTotal})</span>}
                                        </div>
                                    )}

                                    {imageFavLoad ? (
                                        <div className="flex justify-center py-8">
                                            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-red-500" />
                                        </div>
                                    ) : imageFavs.length > 0 ? (
                                        <>
                                            {favType === 'images' && (
                                                <p className="text-slate-500 text-xs mb-3">{imageFavTotal} photo{imageFavTotal !== 1 ? 's' : ''}</p>
                                            )}
                                            <div className="grid grid-cols-3 gap-1.5">
                                                {imageFavs.map(item => (
                                                    <ImageFavCard key={item._id} item={item} onClose={onClose} />
                                                ))}
                                            </div>
                                            <MiniPager page={imageFavPage} pages={imageFavPages} onPage={setImageFavPage} />
                                        </>
                                    ) : (
                                        <div className="text-center py-8">
                                            <Heart className="w-10 h-10 text-slate-700 mx-auto mb-2" />
                                            <p className="text-slate-500 text-sm">No favorite photos yet</p>
                                            <p className="text-slate-600 text-xs mt-1">Heart individual images while viewing an album</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── History ───────────────────────────────────────────── */}
                    {tab === 'history' && (
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-slate-500 text-xs">{histTotal} item{histTotal !== 1 ? 's' : ''} watched</p>
                                <button onClick={() => loadHistory(1)} className="p-1.5 text-slate-500 hover:text-slate-300 transition">
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                            </div>

                            {histLoading && history.length === 0 ? (
                                <div className="flex justify-center py-12">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" />
                                </div>
                            ) : history.length === 0 ? (
                                <div className="text-center py-12">
                                    <Clock className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                                    <p className="text-slate-500 text-sm">No watch history yet</p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 gap-3">
                                        {history.map((item, i) => (
                                            <HistoryCard key={i} item={item} onClose={onClose} onRemove={handleRemoveHistory} />
                                        ))}
                                    </div>
                                    {histHasMore && (
                                        <div className="flex justify-center py-4">
                                            {histLoading
                                                ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-500" />
                                                : <p className="text-slate-600 text-xs">Scroll for more</p>
                                            }
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* ── Account ───────────────────────────────────────────── */}
                    {tab === 'account' && (
                        <div className="space-y-4">
                            <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
                                <h3 className="text-white font-medium text-sm">Account details</h3>
                                {[
                                    ['Username',     user.username || user.name],
                                    ['Role',         user.role === 'admin' ? '👑 Admin' : 'User'],
                                    ['Member since', user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'],
                                ].map(([label, value]) => (
                                    <div key={label} className="flex justify-between text-sm">
                                        <span className="text-slate-400">{label}</span>
                                        <span className="text-white font-medium">{value}</span>
                                    </div>
                                ))}
                            </div>
                            <ChangePasswordForm />
                            <div className="bg-slate-800/30 rounded-xl p-4 flex items-start gap-3">
                                <Shield className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                                <p className="text-slate-500 text-xs">
                                    Your password is hashed and never stored in plain text.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ── Users (admin) ─────────────────────────────────────── */}
                    {tab === 'users' && isAdmin && (
                        <div>
                            <p className="text-slate-500 text-xs mb-4">Click a role badge to promote or demote a user.</p>
                            {usersLoading ? (
                                <div className="flex justify-center py-12">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" />
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {users.map(u => (
                                        <UserRow key={u._id} u={u} currentUserId={user._id}
                                            onRoleChange={(id, role) => setUsers(prev => prev.map(p => p._id === id ? { ...p, role } : p))} />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Footer ─────────────────────────────────────────────────── */}
                <div className="p-4 border-t border-slate-800 shrink-0">
                    <button
                        onClick={async () => { await logout(); onClose(); navigate('/login'); }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition text-sm font-medium"
                    >
                        <LogOut className="w-4 h-4" /> Sign out
                    </button>
                </div>
            </div>
        </div>
    );
}