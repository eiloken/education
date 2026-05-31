import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    ArrowLeft, Heart, Images, Upload, Trash2, Download,
    Play, Pause, X, RotateCcw, CheckSquare, Eye,
    Maximize2, Minimize2, ChevronUp, ChevronDown,
    Pencil, User as UserIcon, Lock, Unlock, ZoomIn,
} from "lucide-react";
import toast from "react-hot-toast";
import { albumAPI } from "../../api/api";
import { useAuth } from "../../context/AuthContext";
import AlbumFormModal from "./AlbumFormModal";
import UserProfile from "../auth/UserProfile";

// ── Slide animations ──────────────────────────────────────────────────────────
;(function () {
    if (typeof document === 'undefined' || document.getElementById('vf-anim')) return;
    const s = document.createElement('style');
    s.id = 'vf-anim';
    s.textContent = `
      @keyframes vf-in-down { from{transform:translateY(100%)} to{transform:translateY(0)} }
      @keyframes vf-in-up   { from{transform:translateY(-100%)} to{transform:translateY(0)} }
    `;
    document.head.appendChild(s);
})();

function getTouchDist(t) {
    const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

// ─────────────────────────────────────────────────────────────────────────────
// FILMSTRIP — vertical strip on the left
// ─────────────────────────────────────────────────────────────────────────────
function FilmStrip({ images, activeIdx, onSelect, visible }) {
    const stripRef = useRef(null);
    useEffect(() => {
        stripRef.current?.children?.[activeIdx]
            ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [activeIdx]);

    return (
        <div className={`absolute left-0 top-0 bottom-0 z-20 overflow-y-auto transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            style={{ width: 52, background: 'linear-gradient(to right,rgba(0,0,0,.75),transparent)', scrollbarWidth: 'none' }}>
            <div ref={stripRef} className="flex flex-col items-center gap-1 py-2 px-1">
                {images.map((img, i) => (
                    <button key={img._id} onClick={() => onSelect(i)}
                        className={`shrink-0 w-9 h-9 rounded overflow-hidden border-2 transition-all ${i === activeIdx ? 'border-pink-500 opacity-100' : 'border-transparent opacity-40 hover:opacity-70'}`}>
                        <img src={albumAPI.imageUrl(img.imagePath)} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </button>
                ))}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TIMER PICKER
// ─────────────────────────────────────────────────────────────────────────────
const TIMERS = [0, 3, 5, 10, 15, 30];
function TimerPicker({ currentTimer, onPick, onClose }) {
    return (
        <div className="absolute bottom-full mb-2 right-0 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 w-44"
            onClick={e => e.stopPropagation()}>
            <p className="text-slate-400 text-xs font-semibold mb-2 uppercase tracking-wider">Timer</p>
            {TIMERS.map(s => (
                <button key={s} onClick={() => { onPick(s); onClose(); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition mb-0.5 ${currentTimer === s ? 'bg-pink-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
                    {s === 0 ? 'Manual (no auto-advance)' : `${s}s`} 
                </button>
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE VIEWER
// ─────────────────────────────────────────────────────────────────────────────
function ImageViewer({ images: initImages, initialIndex, onClose, onToggleImageFavorite }) {
    const [images,    setImages]    = useState(initImages);
    const [idx,       setIdx]       = useState(initialIndex);
    const [slideDir,  setSlideDir]  = useState(1);
    const [animKey,   setAnimKey]   = useState(0);
    const [zoom,      setZoom]      = useState(1);
    // pan is ONLY used to feed the img style on re-render;
    // during drag we write directly to imgRef.current.style
    const [pan,       setPan]       = useState({ x: 0, y: 0 });

    const [ctrlsOn,    setCtrlsOn]    = useState(true);
    const [locked,     setLocked]     = useState(false);
    const [zoomLocked, setZoomLocked] = useState(false);
    const [ssPlaying,  setSsPlaying]  = useState(false);
    const [ssTimer,    setSsTimer]    = useState(10);
    const [showTimer,  setShowTimer]  = useState(false);
    const [isFS,       setIsFS]       = useState(false);

    const viewerRef = useRef(null);
    const hitRef    = useRef(null);
    // Direct ref to the <img> so we can mutate transform without setState
    const imgRef    = useRef(null);

    // All gesture state as refs — never cause re-renders during a gesture
    const zoomR   = useRef(1);
    const panR    = useRef({ x: 0, y: 0 });
    const hideT   = useRef(null);
    const gestRef = useRef(null);   // null | 'pan' | 'swipe' | 'pinch'
    const tStart  = useRef(null);
    const tLast   = useRef({ x: 0, y: 0 });
    const tDist   = useRef(null);
    const mDown   = useRef(false);
    const mLast   = useRef({ x: 0, y: 0 });

    const imgCount = images.length;

    // Keep zoom ref in sync (pan ref is updated directly during gestures)
    useEffect(() => { zoomR.current = zoom; }, [zoom]);

    // ── Apply transform directly to DOM element (zero React overhead) ──────────
    const applyTransform = useCallback((px, py, z) => {
        if (imgRef.current) {
            imgRef.current.style.transform = `translate(${px}px,${py}px) scale(${z ?? zoomR.current})`;
        }
    }, []);

    // ── Fullscreen ─────────────────────────────────────────────────────────────
    useEffect(() => {
        const h = () => setIsFS(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', h);
        return () => document.removeEventListener('fullscreenchange', h);
    }, []);
    const toggleFS = useCallback(async () => {
        if (!document.fullscreenElement) await viewerRef.current?.requestFullscreen?.();
        else await document.exitFullscreen?.();
    }, []);

    // ── Controls: only auto-hide when slideshow is playing ────────────────────
    const stopHide = useCallback(() => clearTimeout(hideT.current), []);
    const startHide = useCallback(() => {
        clearTimeout(hideT.current);
        hideT.current = setTimeout(() => setCtrlsOn(false), 3000);
    }, []);

    // When slideshow starts → begin auto-hide cycle; when stops → always show
    useEffect(() => {
        if (ssPlaying) {
            startHide();
        } else {
            stopHide();
            setCtrlsOn(true);
        }
        return () => stopHide();
    }, [ssPlaying, startHide, stopHide]);

    // In slideshow mode, any interaction resets the hide timer
    const onActivity = useCallback(() => {
        if (locked) return;
        setCtrlsOn(true);
        if (ssPlaying) startHide();
    }, [locked, ssPlaying, startHide]);

    // ── Reset view ─────────────────────────────────────────────────────────────
    const resetView = useCallback(() => {
        panR.current = { x: 0, y: 0 };
        setZoom(1); setPan({ x: 0, y: 0 });
        zoomR.current = 1;
        applyTransform(0, 0, 1);
    }, [applyTransform]);

    // ── Navigate ───────────────────────────────────────────────────────────────
    const go = useCallback((d) => {
        setSlideDir(d);
        setIdx(i => (i + d + imgCount) % imgCount);
        setAnimKey(k => k + 1);
        resetView();
    }, [imgCount, resetView]);

    useEffect(() => {
        if (images[idx]?._id) albumAPI.recordView(images[idx]._id).catch(() => {});
    }, [idx, images]);

    // ── Slideshow ──────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!ssPlaying || ssTimer === 0) return;
        const id = setInterval(() => go(1), ssTimer * 1000);
        return () => clearInterval(id);
    }, [ssPlaying, ssTimer, go]);

    useEffect(() => {
        if (ssPlaying && ssTimer > 0) setZoomLocked(true);
    }, [ssPlaying, ssTimer]);

    // ── Image favorite ─────────────────────────────────────────────────────────
    const toggleFav = useCallback(async () => {
        const img = images[idx]; if (!img?._id) return;
        try {
            const res = await albumAPI.toggleImageFavorite(img._id);
            setImages(prev => prev.map((im, i) => i === idx ? { ...im, isFavorite: res.isFavorite } : im));
            onToggleImageFavorite?.(img._id, res.isFavorite);
        } catch { toast.error('Failed to update favorite'); }
    }, [images, idx, onToggleImageFavorite]);

    // ── Keyboard ───────────────────────────────────────────────────────────────
    useEffect(() => {
        const fn = (e) => {
            onActivity();
            if (e.key === 'Escape') {
                if (locked)     { setLocked(false); return; }
                if (showTimer)  { setShowTimer(false); return; }
                if (isFS)       { document.exitFullscreen(); return; }
                onClose();
            }
            if (e.key === 'ArrowDown')  go(1);
            if (e.key === 'ArrowUp')    go(-1);
            if (e.key === ' ')  { e.preventDefault(); setSsPlaying(p => !p); }
            if (e.key === '0')  resetView();
            if (e.key === 'f')  toggleFS();
            if (e.key === 'l')  setLocked(l => !l);
        };
        window.addEventListener('keydown', fn);
        return () => window.removeEventListener('keydown', fn);
    }, [go, onClose, showTimer, isFS, resetView, toggleFS, locked, onActivity]);

    // ── Mouse wheel zoom ───────────────────────────────────────────────────────
    useEffect(() => {
        const el = hitRef.current; if (!el) return;
        const fn = (e) => {
            e.preventDefault();
            if (zoomLocked) return;
            onActivity();
            const f  = e.deltaY < 0 ? 1.12 : 1 / 1.12;
            const nz = Math.min(Math.max(zoomR.current * f, 0.2), 15);
            const rect = el.getBoundingClientRect();
            const cx = e.clientX - rect.left - rect.width  / 2;
            const cy = e.clientY - rect.top  - rect.height / 2;
            const r  = nz / zoomR.current;
            const np = { x: cx + (panR.current.x - cx) * r, y: cy + (panR.current.y - cy) * r };
            zoomR.current = nz; panR.current = np;
            // Apply directly + sync React state for next render
            applyTransform(np.x, np.y, nz);
            setZoom(nz); setPan({ ...np });
        };
        el.addEventListener('wheel', fn, { passive: false });
        return () => el.removeEventListener('wheel', fn);
    }, [zoomLocked, onActivity, applyTransform]);

    // ── Mouse drag — direct DOM mutation, no setState during drag ─────────────
    useEffect(() => {
        const el = hitRef.current; if (!el) return;
        const down = (e) => {
            if (e.button !== 0) return;
            mDown.current = true;
            mLast.current = { x: e.clientX, y: e.clientY };
        };
        const move = (e) => {
            onActivity();
            if (!mDown.current || zoomLocked || zoomR.current <= 1) return;
            const dx = e.clientX - mLast.current.x;
            const dy = e.clientY - mLast.current.y;
            mLast.current = { x: e.clientX, y: e.clientY };
            panR.current = { x: panR.current.x + dx, y: panR.current.y + dy };
            // Direct DOM update — no React re-render
            applyTransform(panR.current.x, panR.current.y);
        };
        const up = () => {
            if (!mDown.current) return;
            mDown.current = false;
            // Sync final pan position to React state once
            setPan({ ...panR.current });
        };
        el.addEventListener('mousedown', down);
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup',   up);
        return () => {
            el.removeEventListener('mousedown', down);
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup',   up);
        };
    }, [zoomLocked, onActivity, applyTransform]);

    // ── Touch — passive:false on touchstart so preventDefault works in move ────
    useEffect(() => {
        const el = hitRef.current; if (!el) return;

        const start = (e) => {
            if (e.touches.length === 2) {
                gestRef.current = 'pinch';
                tDist.current   = getTouchDist(e.touches);
            } else if (e.touches.length === 1) {
                gestRef.current = null;
                tStart.current  = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
                tLast.current   = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
        };

        const move = (e) => {
            // Pinch
            if (gestRef.current === 'pinch' && e.touches.length === 2) {
                e.preventDefault();
                if (zoomLocked) return;
                const nd = getTouchDist(e.touches);
                const nz = Math.min(Math.max(zoomR.current * (nd / tDist.current), 0.2), 15);
                zoomR.current = nz; tDist.current = nd;
                applyTransform(panR.current.x, panR.current.y, nz);
                setZoom(nz);
                return;
            }
            if (e.touches.length !== 1 || gestRef.current === 'pinch') return;

            const cx = e.touches[0].clientX, cy = e.touches[0].clientY;
            const dx = cx - tLast.current.x,  dy = cy - tLast.current.y;

            // Commit gesture type on first significant movement
            if (gestRef.current === null && tStart.current) {
                const adx = Math.abs(cx - tStart.current.x);
                const ady = Math.abs(cy - tStart.current.y);
                if (adx > 8 || ady > 8) {
                    gestRef.current = (zoomR.current > 1 && !zoomLocked) ? 'pan' : 'swipe';
                }
            }

            tLast.current = { x: cx, y: cy };

            if (gestRef.current === 'pan') {
                e.preventDefault();
                panR.current = { x: panR.current.x + dx, y: panR.current.y + dy };
                applyTransform(panR.current.x, panR.current.y);
            } else if (gestRef.current === 'swipe') {
                e.preventDefault();
            }
        };

        const end = (e) => {
            if (gestRef.current === 'pinch') {
                // Sync zoom to React state
                setZoom(zoomR.current);
                gestRef.current = null; tDist.current = null;
                return;
            }
            if (gestRef.current === 'pan') {
                // Sync final pan to React state
                setPan({ ...panR.current });
                gestRef.current = null; tStart.current = null;
                return;
            }
            const ts = tStart.current; if (!ts) return;
            const ch = e.changedTouches[0];
            const dx = ch.clientX - ts.x, dy = ch.clientY - ts.y;
            const dt = Date.now() - ts.t;

            if (gestRef.current === 'swipe' &&
                Math.abs(dy) > 50 &&
                Math.abs(dy) > Math.abs(dx) * 1.4 &&
                dt < 500) {
                go(dy < 0 ? 1 : -1);
            } else if (gestRef.current === null) {
                // Tap — show controls
                onActivity();
            }
            gestRef.current = null; tStart.current = null;
        };

        // passive:false on touchstart is the fix for the cancelable warning:
        // the browser sees we might call preventDefault, so it doesn't lock the
        // scroll chain before our touchmove fires
        el.addEventListener('touchstart', start, { passive: false });
        el.addEventListener('touchmove',  move,  { passive: false });
        el.addEventListener('touchend',   end,   { passive: true  });
        return () => {
            el.removeEventListener('touchstart', start);
            el.removeEventListener('touchmove',  move);
            el.removeEventListener('touchend',   end);
        };
    }, [zoomLocked, go, onActivity, applyTransform]);

    const img  = images[idx];
    const show = ctrlsOn && !locked;
    const anim = slideDir > 0 ? 'vf-in-down' : 'vf-in-up';

    // ── IBtn helper ───────────────────────────────────────────────────────────
    const IBtn = ({ onClick, active, title, children }) => (
        <button onClick={e => { e.stopPropagation(); onClick(); }}
            className={`p-2.5 rounded-full transition ${active ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
            title={title}>
            {children}
        </button>
    );

    return (
        <div ref={viewerRef} className="fixed inset-0 z-50 bg-black select-none overflow-hidden">

            {/* ── Display layer — image only, no events ─────────────────────── */}
            <div className="absolute inset-0 overflow-hidden" style={{ isolation: 'isolate' }}>
                {img && (
                    <div key={animKey} className="absolute inset-0 flex items-center justify-center"
                        style={{ animation: `${anim} 0.26s cubic-bezier(0.25,0.46,0.45,0.94) both`, willChange: 'transform' }}>
                        <img
                            ref={imgRef}
                            src={albumAPI.imageUrl(img.imagePath)}
                            alt={img.title || ''}
                            draggable={false}
                            style={{
                                // Initial transform from React state; updated directly by applyTransform during gestures
                                transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
                                transformOrigin: '50% 50%',
                                maxWidth: '100%', maxHeight: '100%',
                                objectFit: 'contain',
                                pointerEvents: 'none', userSelect: 'none',
                                // No CSS transition during any gesture — avoids lag/flash
                                transition: (mDown.current || gestRef.current) ? 'none' : undefined,
                            }}
                        />
                    </div>
                )}
            </div>

            {/* ── Hit-test layer ────────────────────────────────────────────── */}
            <div ref={hitRef} className="absolute inset-0 z-10"
                style={{ cursor: mDown.current ? 'grabbing' : zoom > 1 ? 'grab' : 'default' }}>
                {/* Up nav zone */}
                <div onClick={e => { e.stopPropagation(); go(-1); }}
                    className="absolute top-0 left-0 w-full h-[10%] min-h-[44px] z-20 cursor-pointer flex items-start justify-center pt-2">
                    <div className={`p-1.5 rounded-full bg-black/40 transition-opacity duration-200 ${show ? 'opacity-60 hover:opacity-100' : 'opacity-0'}`}>
                        <ChevronUp className="w-6 h-6 text-white" />
                    </div>
                </div>
                {/* Down nav zone */}
                <div onClick={e => { e.stopPropagation(); go(1); }}
                    className="absolute bottom-0 left-0 w-full h-[10%] min-h-[44px] z-20 cursor-pointer flex items-end justify-center pb-2">
                    <div className={`p-1.5 rounded-full bg-black/40 transition-opacity duration-200 ${show ? 'opacity-60 hover:opacity-100' : 'opacity-0'}`}>
                        <ChevronDown className="w-6 h-6 text-white" />
                    </div>
                </div>
            </div>

            {/* ── Filmstrip — vertical left strip ──────────────────────────── */}
            <FilmStrip images={images} activeIdx={idx} visible={show}
                onSelect={(i) => { setSlideDir(i > idx ? 1 : -1); setIdx(i); setAnimKey(k => k + 1); resetView(); }} />

            {/* ── TikTok-style right sidebar ─────────────────────────────────── */}
            <div className={`absolute right-0 top-0 bottom-0 z-30 transition-opacity duration-300 ${show ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="flex flex-col items-center justify-between h-full py-3 px-1.5"
                    style={{ background: 'linear-gradient(to left,rgba(0,0,0,.55),transparent)' }}>

                    {/* Top: close + counter */}
                    <div className="flex flex-col items-center gap-1.5">
                        <button onClick={onClose} className="p-2.5 text-white/70 hover:text-white rounded-full transition">
                            <X className="w-5 h-5" />
                        </button>
                        <span className="text-white/40 text-[10px] font-mono text-center leading-snug">
                            {idx + 1}<br/><span className="text-white/25">/</span><br/>{imgCount}
                        </span>
                    </div>

                    {/* Middle: action buttons */}
                    <div className="flex flex-col items-center gap-1">
                        {/* Favorite */}
                        <div className="flex flex-col items-center">
                            <button onClick={toggleFav}
                                className={`p-2.5 rounded-full transition ${img?.isFavorite ? 'text-red-500' : 'text-white/70 hover:text-white'}`}>
                                <Heart className="w-6 h-6" fill={img?.isFavorite ? 'currentColor' : 'none'} />
                            </button>
                            {img?.views > 0 && <span className="text-white/30 text-[9px] -mt-1">{img.views}</span>}
                        </div>

                        {/* Play / slideshow */}
                        <div className="relative">
                            {showTimer && (
                                <TimerPicker currentTimer={ssTimer}
                                    onPick={(s) => { setSsTimer(s); setSsPlaying(true); setShowTimer(false); }}
                                    onClose={() => setShowTimer(false)} />
                            )}
                            <button onClick={e => { e.stopPropagation(); ssPlaying ? setSsPlaying(false) : setShowTimer(s => !s); }}
                                className={`p-2.5 rounded-full transition ${ssPlaying ? 'bg-pink-600 text-white' : showTimer ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                                title={ssPlaying ? 'Pause slideshow' : 'Start slideshow'}>
                                {ssPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" fill="currentColor" />}
                            </button>
                        </div>

                        {/* Zoom lock */}
                        <IBtn onClick={() => setZoomLocked(z => !z)} active={zoomLocked} title={zoomLocked ? 'Unlock zoom' : 'Lock zoom'}>
                            <ZoomIn className={`w-5 h-5 ${zoomLocked ? 'opacity-50' : ''}`} />
                        </IBtn>

                        {/* Reset zoom — only if zoomed */}
                        {zoom !== 1 && (
                            <IBtn onClick={resetView} title="Reset zoom (0)">
                                <RotateCcw className="w-5 h-5" />
                            </IBtn>
                        )}

                        {/* Lock controls */}
                        <IBtn onClick={() => setLocked(true)} title="Lock controls (L)">
                            <Lock className="w-5 h-5" />
                        </IBtn>

                        {/* Fullscreen */}
                        <IBtn onClick={toggleFS} title="Fullscreen (F)">
                            {isFS ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                        </IBtn>
                    </div>

                    {/* Bottom: title */}
                    {img?.title && (
                        <p className="text-white/30 text-[9px] text-center max-w-[36px] break-words leading-tight">
                            {img.title}
                        </p>
                    )}
                </div>
            </div>

            {/* ── Locked — only unlock button visible ──────────────────────── */}
            {locked && (
                <button onClick={() => { setLocked(false); onActivity(); }}
                    className="absolute top-3 right-3 z-50 p-2.5 bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/40 text-amber-400 rounded-xl transition"
                    title="Unlock (Esc / L)">
                    <Unlock className="w-5 h-5" />
                </button>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ALBUM DETAIL PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function AlbumDetail() {
    const { id }   = useParams();
    const navigate = useNavigate();
    const { isAdmin, user } = useAuth();

    const [album,   setAlbum]   = useState(null);
    const [images,  setImages]  = useState([]);
    const [loading, setLoading] = useState(true);

    const [selectMode, setSelectMode] = useState(false);
    const [selected,   setSelected]   = useState(new Set());
    const [viewerOpen,   setViewerOpen]   = useState(false);
    const [viewerImages, setViewerImages] = useState([]);
    const [viewerIndex,  setViewerIndex]  = useState(0);

    const [uploading,   setUploading]   = useState(false);
    const [showEdit,    setShowEdit]    = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const [deleting,    setDeleting]    = useState(false);
    const uploadRef = useRef(null);

    // Long-press state
    const longPressRef = useRef(null);
    const longPressIdx = useRef(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await albumAPI.getAlbum(id);
            setAlbum(data.album);
            setImages(data.images || []);
        } catch { toast.error('Failed to load album'); }
        finally  { setLoading(false); }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    // ── Long-press to enter select mode ───────────────────────────────────────
    const startLongPress = (i) => {
        longPressIdx.current = i;
        longPressRef.current = setTimeout(() => {
            if (!selectMode) setSelectMode(true);
            setSelected(new Set([images[i]._id]));
        }, 500);
    };
    const cancelLongPress = () => clearTimeout(longPressRef.current);

    // ── Select helpers ─────────────────────────────────────────────────────────
    const toggleSelect  = (imgId) => setSelected(prev => { const n = new Set(prev); n.has(imgId) ? n.delete(imgId) : n.add(imgId); return n; });
    const selectAll     = () => setSelected(new Set(images.map(i => i._id)));
    const deselectAll   = () => setSelected(new Set());
    const exitSelect    = () => { setSelectMode(false); setSelected(new Set()); };

    // ── Open viewer ────────────────────────────────────────────────────────────
    const openViewerFiltered = (startAt = 0) => {
        if (selected.size > 0) {
            setViewerImages(images.filter(img => selected.has(img._id)));
            setViewerIndex(0);
        } else {
            setViewerImages(images);
            setViewerIndex(startAt);
        }
        setViewerOpen(true);
        if (selectMode) exitSelect();
    };

    const openViewer = (i) => {
        if (selectMode) { toggleSelect(images[i]._id); return; }
        setViewerImages(images);
        setViewerIndex(i);
        setViewerOpen(true);
    };

    const handleImageFavToggle = useCallback((imageId, isFavorite) => {
        setImages(prev => prev.map(img => img._id === imageId ? { ...img, isFavorite } : img));
        setViewerImages(prev => prev.map(img => img._id === imageId ? { ...img, isFavorite } : img));
    }, []);

    // ── Upload ─────────────────────────────────────────────────────────────────
    const handleUpload = async (files) => {
        if (!files?.length) return;
        setUploading(true);
        try {
            const fd = new FormData();
            for (const f of files) fd.append('images', f);
            const res = await albumAPI.uploadImages(id, fd);
            toast.success(`Uploaded ${res.count} image${res.count !== 1 ? 's' : ''}`);
            load();
        } catch (e) { toast.error(e?.response?.data?.error || 'Upload failed'); }
        finally     { setUploading(false); }
    };

    const handleDeleteSelected = async () => {
        if (!selected.size || !window.confirm(`Delete ${selected.size} image${selected.size !== 1 ? 's' : ''}?`)) return;
        try { await albumAPI.deleteImages(id, [...selected]); toast.success('Deleted'); exitSelect(); load(); }
        catch { toast.error('Failed to delete'); }
    };

    // ── Delete whole album ─────────────────────────────────────────────────────
    const handleDeleteAlbum = async () => {
        if (!window.confirm(`Delete the album "${album?.title}" and ALL its images? This cannot be undone.`)) return;
        setDeleting(true);
        try {
            await albumAPI.deleteAlbum(id);
            toast.success('Album deleted');
            navigate('/albums');
        } catch { toast.error('Failed to delete album'); setDeleting(false); }
    };

    const handleToggleAlbumFav = async () => {
        try {
            const res = await albumAPI.toggleFavorite(id);
            setAlbum(a => ({ ...a, isFavorite: res.isFavorite }));
        } catch { toast.error('Failed to update favorite'); }
    };

    if (loading) return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-pink-500" />
        </div>
    );

    const hasImages = images.length > 0;

    return (
        <div className="min-h-screen bg-slate-950">
            {/* ── Top Bar ───────────────────────────────────────────────────── */}
            <header className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
                <div className="flex items-center gap-2 px-4 py-3">
                    <a href="/" className="text-xl font-bold text-red-500 hover:text-red-400 transition shrink-0">VIBEFLIX</a>
                    <button onClick={() => navigate(-1)} className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition shrink-0">
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-white font-bold text-sm sm:text-base truncate">{album?.title}</h1>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {isAdmin && (
                            <>
                                <button onClick={() => setShowEdit(true)} className="p-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg transition" title="Edit album">
                                    <Pencil className="w-4 h-4" />
                                </button>
                                <button onClick={() => uploadRef.current?.click()} disabled={uploading}
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition">
                                    {uploading ? <><div className="w-3 h-3 border-b border-white rounded-full animate-spin" /> Adding…</> : <><Upload className="w-3.5 h-3.5" /> Add</>}
                                </button>
                                <button onClick={handleDeleteAlbum} disabled={deleting}
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition" title="Delete entire album">
                                    {deleting ? <div className="w-3 h-3 border-b border-white rounded-full animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    <span className="hidden sm:inline">Delete Album</span>
                                </button>
                                <input ref={uploadRef} type="file" multiple accept="image/*" className="hidden" onChange={e => handleUpload(e.target.files)} />
                            </>
                        )}
                        {user && (
                            <button onClick={() => setShowProfile(true)}
                                className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center hover:bg-slate-600 ring-2 ring-transparent hover:ring-pink-500 transition text-white font-semibold text-xs uppercase">
                                {user.username?.[0] ?? <UserIcon className="w-4 h-4 text-slate-400" />}
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <div className="px-4 sm:px-6 pb-10 pt-4 max-w-7xl mx-auto space-y-5">
                {/* Album info */}
                <div className="flex items-start gap-4">
                    {(album?.coverPath || !hasImages) && (
                        <div className="shrink-0 w-24 h-24 sm:w-32 sm:h-32 rounded-xl overflow-hidden bg-slate-800 border border-slate-700">
                            {album?.coverPath
                                ? <img src={albumAPI.imageUrl(album.coverPath)} alt={album?.title} className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center"><Images className="w-8 h-8 text-slate-600" /></div>}
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <span className="px-2 py-0.5 bg-pink-600/20 text-pink-400 text-xs font-bold rounded uppercase">Album</span>
                            {album?.year && <span className="text-slate-500 text-sm">{album.year}</span>}
                        </div>
                        {album?.description && <p className="text-slate-400 text-sm mb-2">{album.description}</p>}
                        <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
                            <span className="flex items-center gap-1"><Images className="w-3 h-3" />{images.length} images</span>
                            {album?.totalViews > 0 && <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{album.totalViews.toLocaleString()} views</span>}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {album?.studios?.map(s    => <Tag key={s} label={s} color="blue" />)}
                            {album?.actors?.map(a     => <Tag key={a} label={a} color="green" />)}
                            {album?.characters?.map(c => <Tag key={c} label={c} color="purple" />)}
                            {album?.tags?.map(t       => <Tag key={t} label={t} color="slate" />)}
                        </div>
                    </div>
                    <button onClick={handleToggleAlbumFav}
                        className={`shrink-0 p-2.5 rounded-xl border transition ${album?.isFavorite ? 'bg-red-500/15 border-red-500/40 text-red-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}>
                        <Heart className="w-5 h-5" fill={album?.isFavorite ? 'currentColor' : 'none'} />
                    </button>
                </div>

                {/* Empty state */}
                {!hasImages && (
                    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                        {album?.coverPath
                            ? <img src={albumAPI.imageUrl(album.coverPath)} alt={album?.title} className="max-h-80 rounded-2xl object-contain shadow-2xl" />
                            : <div className="w-32 h-32 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center"><Images className="w-12 h-12 text-slate-600" /></div>}
                        <p className="text-slate-500 text-sm">No images yet</p>
                        {isAdmin && (
                            <button onClick={() => uploadRef.current?.click()}
                                className="flex items-center gap-1.5 px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg text-sm transition">
                                <Upload className="w-4 h-4" /> Upload Images
                            </button>
                        )}
                    </div>
                )}

                {/* Toolbar */}
                {hasImages && (
                    selectMode ? (
                        <div className="flex items-center gap-2 flex-wrap p-3 bg-slate-800/70 border border-slate-700 rounded-xl">
                            <span className="text-white text-sm font-medium">{selected.size} selected</span>
                            <button onClick={selectAll}   className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg transition">All ({images.length})</button>
                            <button onClick={deselectAll} className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg transition">None</button>
                            <div className="flex-1" />
                            <button onClick={() => openViewerFiltered()}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-600 hover:bg-pink-500 text-white text-xs rounded-lg font-medium transition">
                                <Play className="w-3 h-3" fill="currentColor" />
                                {selected.size > 0 ? `View (${selected.size})` : 'View All'}
                            </button>
                            <button onClick={() => albumAPI.downloadAlbum(id, selected.size ? [...selected] : null)} disabled={!selected.size}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs rounded-lg font-medium transition">
                                <Download className="w-3 h-3" />{selected.size > 1 ? `ZIP (${selected.size})` : 'Download'}
                            </button>
                            {isAdmin && (
                                <button onClick={handleDeleteSelected} disabled={!selected.size}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-xs rounded-lg font-medium transition">
                                    <Trash2 className="w-3 h-3" /> Delete
                                </button>
                            )}
                            <button onClick={exitSelect} className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"><X className="w-4 h-4" /></button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                            <button onClick={() => setSelectMode(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-sm rounded-lg transition">
                                <CheckSquare className="w-4 h-4" /> Select
                            </button>
                            <button onClick={() => albumAPI.downloadAlbum(id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-sm rounded-lg transition">
                                <Download className="w-4 h-4" /> Download All
                            </button>
                            <button onClick={() => openViewerFiltered(0)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-600 hover:bg-pink-500 text-white text-sm rounded-lg font-medium transition">
                                <Play className="w-4 h-4" fill="currentColor" /> View All
                            </button>
                        </div>
                    )
                )}

                {/* Image Grid */}
                {hasImages && (
                    <>
                        {selectMode && <p className="text-slate-500 text-xs">Long-press any image to enter select mode · tap to toggle</p>}
                        {!selectMode && <p className="text-slate-500 text-xs">Long-press to select · tap to view</p>}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
                            {images.map((img, i) => {
                                const isSel = selected.has(img._id);
                                return (
                                    <div key={img._id}
                                        onClick={() => openViewer(i)}
                                        onMouseDown={() => startLongPress(i)}
                                        onMouseUp={cancelLongPress}
                                        onMouseLeave={cancelLongPress}
                                        onTouchStart={() => startLongPress(i)}
                                        onTouchEnd={cancelLongPress}
                                        onTouchMove={cancelLongPress}
                                        className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer group border-2 transition-all ${isSel ? 'border-pink-500 ring-2 ring-pink-500/30' : 'border-transparent hover:border-slate-600'}`}>
                                        <img src={albumAPI.imageUrl(img.imagePath)} alt={img.title || ''} loading="lazy"
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                        <div className={`absolute inset-0 transition-opacity duration-150 ${selectMode ? 'bg-black/20' : 'bg-black/30 opacity-0 group-hover:opacity-100'}`} />
                                        {selectMode && (
                                            <div className={`absolute top-1.5 left-1.5 w-5 h-5 rounded border-2 flex items-center justify-center transition ${isSel ? 'bg-pink-500 border-pink-500' : 'bg-black/50 border-white'}`}>
                                                {isSel && <span className="text-white text-xs font-bold leading-none">✓</span>}
                                            </div>
                                        )}
                                        {img.isFavorite && !selectMode && (
                                            <div className="absolute top-1.5 right-1.5">
                                                <Heart className="w-3.5 h-3.5 text-red-500 drop-shadow" fill="currentColor" />
                                            </div>
                                        )}
                                        {img.views > 0 && !selectMode && (
                                            <div className="absolute bottom-1 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 bg-black/60 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition">
                                                <Eye className="w-2.5 h-2.5" /> {img.views}
                                            </div>
                                        )}
                                        {!selectMode && (
                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                                <Maximize2 className="w-6 h-6 text-white drop-shadow-lg" />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {viewerOpen && (
                <ImageViewer images={viewerImages} initialIndex={viewerIndex}
                    onClose={() => setViewerOpen(false)}
                    onToggleImageFavorite={handleImageFavToggle} />
            )}
            {showEdit && (
                <AlbumFormModal album={album} onSaved={() => { setShowEdit(false); load(); }} onClose={() => setShowEdit(false)} />
            )}
            <UserProfile isOpen={showProfile} onClose={() => setShowProfile(false)} />
        </div>
    );
}

function Tag({ label, color = 'slate' }) {
    const m = { slate: 'bg-slate-700 text-slate-300', blue: 'bg-blue-500/20 text-blue-300', green: 'bg-green-500/20 text-green-300', purple: 'bg-purple-500/20 text-purple-300' };
    return <span className={`px-2 py-0.5 text-xs rounded-full ${m[color] || m.slate}`}>{label}</span>;
}