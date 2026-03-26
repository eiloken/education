import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    X, Heart, Film, Layers, LogOut, Shield, User as UserIcon,
    ChevronLeft, ChevronRight, RefreshCw, Crown, Users, Clock, Trash2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { favoritesAPI, authAPI, generalAPI, historyAPI } from '../../api/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

// ── Mini card for a favorited item ────────────────────────────────────────────
function FavCard({ item, onClose }) {
    const navigate = useNavigate();
    const thumbSrc = item.thumbnailPath ? generalAPI.thumbnailUrl(item.thumbnailPath) : null;
    const isVideo  = item._type === 'video';

    return (
        <div
            className="group bg-slate-800 border border-slate-700 rounded-xl overflow-hidden hover:border-slate-600 transition cursor-pointer"
            onClick={() => { navigate(isVideo ? `/video/${item._id}` : `/series/${item._id}`); onClose(); }}
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

// ── Mini card for a history entry ─────────────────────────────────────────────
function HistoryCard({ item, onClose, onRemove }) {
    const navigate = useNavigate();
    const thumbSrc = item.thumbnailPath ? generalAPI.thumbnailUrl(item.thumbnailPath) : null;
    const pct      = item.progressPct ?? (item.duration > 0 ? Math.min(item.progress / item.duration, 1) : 0);

    const handleClick = () => {
        const url = item.seriesId ? `/series/${item.seriesId}?ep=${item.videoId}` : `/video/${item.videoId}`;
        navigate(url);
        onClose();
    };

    return (
        <div className="group relative bg-slate-800 border border-slate-700 rounded-xl overflow-hidden hover:border-slate-600 transition cursor-pointer"
             onClick={handleClick}>
            {/* Thumbnail */}
            <div className="aspect-video bg-slate-900 relative">
                {thumbSrc
                    ? <img src={thumbSrc} alt={item.title} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-8 h-8 text-slate-700" />
                      </div>
                }
                {/* Progress bar */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                    <div className="h-full bg-red-500 transition-none" style={{ width: `${pct * 100}%` }} />
                </div>
            </div>

            {/* Info */}
            <div className="p-2">
                <p className="text-white text-xs font-medium truncate">{item.title}</p>
                <p className="text-slate-500 text-xs mt-0.5">
                    {item.watchedAt ? new Date(item.watchedAt).toLocaleDateString() : ''}
                </p>
            </div>

            {/* Remove button — visible on hover */}
            <button
                onClick={e => { e.stopPropagation(); onRemove(item.videoId); }}
                className="absolute top-1.5 right-1.5 p-1 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition"
                title="Remove from history"
            >
                <Trash2 className="w-3 h-3 text-white" />
            </button>
        </div>
    );
}

// ── Admin user management row ─────────────────────────────────────────────────
function UserRow({ u, currentUserId, onRoleChange }) {
    const [saving, setSaving] = useState(false);
    const toggle = async () => {
        setSaving(true);
        try {
            const newRole = u.role === 'admin' ? 'user' : 'admin';
            await authAPI.setUserRole(u._id, newRole);
            onRoleChange(u._id, newRole);
            toast.success(`${u.name} is now ${newRole}`);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition">
            {u.avatar
                ? <img src={u.avatar} alt={u.name} className="w-8 h-8 rounded-full shrink-0" />
                : <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                    <UserIcon className="w-4 h-4 text-slate-400" />
                  </div>
            }
            <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{u.name}</p>
                <p className="text-slate-500 text-xs truncate">{u.email}</p>
            </div>
            {u._id === currentUserId
                ? <span className="text-xs text-slate-500 shrink-0">You</span>
                : <button
                    onClick={toggle}
                    disabled={saving}
                    className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg font-medium transition ${
                        u.role === 'admin'
                            ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    }`}
                  >
                    {u.role === 'admin' ? <Crown className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                    {saving ? '…' : u.role === 'admin' ? 'Admin' : 'User'}
                  </button>
            }
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function UserProfile({ isOpen, onClose }) {
    const { user, logout, isAdmin } = useAuth();
    const navigate = useNavigate();

    const [tab,         setTab]         = useState('favorites');
    const [favorites,   setFavorites]   = useState([]);
    const [favLoading,  setFavLoading]  = useState(false);
    const [favPage,     setFavPage]     = useState(1);
    const [favTotal,    setFavTotal]    = useState(0);
    const [favPages,    setFavPages]    = useState(1);
    const [favType,     setFavType]     = useState('all');
    const [users,       setUsers]       = useState([]);
    const [usersLoading,setUsersLoading]= useState(false);

    // ── History state ──────────────────────────────────────────────────────────
    const [history,        setHistory]       = useState([]);
    const [histLoading,    setHistLoading]   = useState(false);
    const [histPage,       setHistPage]      = useState(1);
    const [histTotal,      setHistTotal]     = useState(0);
    const [histHasMore,    setHistHasMore]   = useState(false);
    const histScrollRef = useRef(null);

    const loadFavorites = useCallback(async () => {
        setFavLoading(true);
        try {
            const data = await favoritesAPI.getMyFavorites({
                page:     favPage,
                limit:    20,
                itemType: favType === 'all' ? undefined : favType,
            });
            setFavorites(data.items);
            setFavTotal(data.total);
            setFavPages(data.totalPages);
        } catch { toast.error('Failed to load favorites'); }
        finally  { setFavLoading(false); }
    }, [favPage, favType]);

    const loadUsers = useCallback(async () => {
        if (!isAdmin) return;
        setUsersLoading(true);
        try { const data = await authAPI.getUsers(); setUsers(data.users); }
        catch { toast.error('Failed to load users'); }
        finally { setUsersLoading(false); }
    }, [isAdmin]);

    // ── History helpers ────────────────────────────────────────────────────────
    const loadHistory = useCallback(async (page = 1, append = false) => {
        setHistLoading(true);
        try {
            const data = await historyAPI.getHistory({ page, limit: 20 });
            setHistory(prev => append ? [...prev, ...data.items] : data.items);
            setHistTotal(data.total);
            setHistHasMore(page < data.totalPages);
            setHistPage(page);
        } catch { toast.error('Failed to load history'); }
        finally { setHistLoading(false); }
    }, []);

    const handleRemoveHistory = useCallback(async (videoId) => {
        try {
            await historyAPI.removeEntry(videoId);
            setHistory(prev => prev.filter(h => h.videoId.toString() !== videoId.toString()));
            setHistTotal(prev => Math.max(0, prev - 1));
        } catch { toast.error('Failed to remove history entry'); }
    }, []);

    // Infinite-scroll: load next page when user reaches bottom of history list
    useEffect(() => {
        const el = histScrollRef.current;
        if (!el) return;
        const onScroll = () => {
            if (histLoading || !histHasMore) return;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
                loadHistory(histPage + 1, true);
            }
        };
        el.addEventListener('scroll', onScroll);
        return () => el.removeEventListener('scroll', onScroll);
    }, [histLoading, histHasMore, histPage, loadHistory]);

    useEffect(() => { if (isOpen && tab === 'favorites') loadFavorites(); }, [isOpen, tab, loadFavorites]);
    useEffect(() => { if (isOpen && tab === 'history')   loadHistory(1);   }, [isOpen, tab, loadHistory]);
    useEffect(() => { if (isOpen && tab === 'users' && isAdmin) loadUsers(); }, [isOpen, tab, isAdmin, loadUsers]);

    if (!isOpen || !user) return null;

    const allTabs = [
        { id: 'favorites', label: 'Favorites', icon: Heart    },
        { id: 'history',   label: 'History',   icon: Clock    },
        { id: 'account',   label: 'Account',   icon: UserIcon },
        ...(isAdmin ? [{ id: 'users', label: 'Users', icon: Users }] : []),
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-end" onClick={onClose}>
            <div
                className="h-full w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center gap-3 p-4 border-b border-slate-800 shrink-0">
                    {user.avatar
                        ? <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full" />
                        : <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
                            <UserIcon className="w-5 h-5 text-slate-400" />
                          </div>
                    }
                    <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold truncate">{user.name}</p>
                        <div className="flex items-center gap-2">
                            <p className="text-slate-400 text-xs truncate">{user.email}</p>
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

                {/* Tabs */}
                <div className="flex border-b border-slate-800 shrink-0">
                    {allTabs.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition border-b-2 ${
                                tab === t.id ? 'text-red-400 border-red-500' : 'text-slate-500 border-transparent hover:text-slate-300'
                            }`}
                        >
                            <t.icon className="w-4 h-4" />
                            <span className="hidden sm:inline">{t.label}</span>
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4">

                    {/* ── Favorites ── */}
                    {tab === 'favorites' && (
                        <div>
                            <div className="flex gap-2 mb-4">
                                {[['all','All'],['video','Videos'],['series','Series']].map(([v, l]) => (
                                    <button
                                        key={v}
                                        onClick={() => { setFavType(v); setFavPage(1); }}
                                        className={`px-3 py-1 rounded-lg text-sm font-medium transition ${
                                            favType === v ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                                        }`}
                                    >
                                        {l}
                                    </button>
                                ))}
                                <button onClick={loadFavorites} className="ml-auto p-1.5 text-slate-500 hover:text-slate-300 transition">
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                            </div>

                            {favLoading ? (
                                <div className="flex justify-center py-12">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" />
                                </div>
                            ) : favorites.length === 0 ? (
                                <div className="text-center py-12">
                                    <Heart className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                                    <p className="text-slate-500 text-sm">No favorites yet</p>
                                    <p className="text-slate-600 text-xs mt-1">Heart a video or series to save it here</p>
                                </div>
                            ) : (
                                <>
                                    <p className="text-slate-500 text-xs mb-3">{favTotal} item{favTotal !== 1 ? 's' : ''}</p>
                                    <div className="grid grid-cols-2 gap-3">
                                        {favorites.map(item => (
                                            <FavCard key={`${item._type}-${item._id}`} item={item} onClose={onClose} />
                                        ))}
                                    </div>
                                    {favPages > 1 && (
                                        <div className="flex items-center justify-center gap-3 mt-4">
                                            <button disabled={favPage <= 1} onClick={() => setFavPage(p => p - 1)}
                                                className="p-2 rounded-lg bg-slate-800 text-slate-400 disabled:opacity-40 hover:bg-slate-700 transition">
                                                <ChevronLeft className="w-4 h-4" />
                                            </button>
                                            <span className="text-slate-400 text-sm">{favPage} / {favPages}</span>
                                            <button disabled={favPage >= favPages} onClick={() => setFavPage(p => p + 1)}
                                                className="p-2 rounded-lg bg-slate-800 text-slate-400 disabled:opacity-40 hover:bg-slate-700 transition">
                                                <ChevronRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* ── History ── */}
                    {tab === 'history' && (
                        <div className="flex flex-col h-full">
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
                                    <p className="text-slate-600 text-xs mt-1">Videos you watch will appear here</p>
                                </div>
                            ) : (
                                <div
                                    ref={histScrollRef}
                                    className="overflow-y-auto flex-1"
                                    style={{ maxHeight: '100%' }}
                                >
                                    <div className="grid grid-cols-2 gap-3">
                                        {history.map((item, i) => (
                                            <HistoryCard
                                                key={i}
                                                item={item}
                                                onClose={onClose}
                                                onRemove={handleRemoveHistory}
                                            />
                                        ))}
                                    </div>
                                    {/* Infinite scroll sentinel */}
                                    {histHasMore && (
                                        <div className="flex justify-center py-4">
                                            {histLoading
                                                ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-500" />
                                                : <p className="text-slate-600 text-xs">Scroll for more</p>
                                            }
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Account ── */}
                    {tab === 'account' && (
                        <div className="space-y-4">
                            <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
                                <h3 className="text-white font-medium text-sm">Account details</h3>
                                {[
                                    ['Name',         user.name],
                                    ['Email',        user.email],
                                    ['Role',         user.role === 'admin' ? '👑 Admin' : 'User'],
                                    ['Sign-in',      'Google'],
                                    ['Member since', user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'],
                                ].map(([label, value]) => (
                                    <div key={label} className="flex justify-between text-sm">
                                        <span className="text-slate-400">{label}</span>
                                        <span className="text-white font-medium">{value}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="bg-slate-800/30 rounded-xl p-4 flex items-start gap-3">
                                <Shield className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                                <p className="text-slate-500 text-xs">
                                    Your account uses Google Sign-In — no password is stored by Vibeflix.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ── Users (admin) ── */}
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
                                        <UserRow key={u._id} u={u} currentUserId={user._id} onRoleChange={(id, role) =>
                                            setUsers(prev => prev.map(p => p._id === id ? { ...p, role } : p))
                                        } />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
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