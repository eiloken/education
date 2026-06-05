import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    ArrowLeft, Heart, Images, Upload, Trash2, Download,
    Play, Pause, X, RotateCcw, CheckSquare, Eye,
    Maximize2, Minimize2, ChevronUp, ChevronDown,
    Pencil, Lock, Unlock, ZoomIn, RefreshCw,
    LayoutGrid, AlignJustify, SlidersHorizontal,
    ArrowUpDown, Calendar, Star,
    ScanSearch,
    SquareCheck,
    SquareDashed,
    SquareCheckBig,
} from "lucide-react";
import toast from "react-hot-toast";
import { albumAPI } from "../../api/api";
import { useAuth } from "../../context/AuthContext";
import AlbumFormModal from "./AlbumFormModal";
import { AppHeader } from "../Home";

// ── Slide animations ──────────────────────────────────────────────────────────
;(function () {
    if (typeof document === 'undefined' || document.getElementById('vf-anim')) return;
    const s = document.createElement('style');
    s.id = 'vf-anim';
    s.textContent = `
      @keyframes vf-in-down { from{transform:translateY(100%)} to{transform:translateY(0)} }
      @keyframes vf-in-up { from{transform:translateY(-100%)} to{transform:translateY(0)} }
    `;
    document.head.appendChild(s);
})();

function getTouchDist(t) {
    const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

// ─────────────────────────────────────────────────────────────────────────────
// FILMSTRIP — virtual rendering: only ±20 items around activeIdx
// ─────────────────────────────────────────────────────────────────────────────
const STRIP_WINDOW = 20;
function FilmStrip({ images, activeIdx, onSelect, visible }) {
    const stripRef = useRef(null);

    // Scroll active item into view
    useEffect(() => {
        const container = stripRef.current;
        if (!container) return;
        // The active item's rendered index within the window
        const start = Math.max(0, activeIdx - STRIP_WINDOW);
        const localIdx = activeIdx - start;
        const child = container.children[localIdx];
        child?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [activeIdx]);

    // Only render a window around the active index
    const start = Math.max(0, activeIdx - STRIP_WINDOW);
    const end   = Math.min(images.length, activeIdx + STRIP_WINDOW + 1);
    const slice = images.slice(start, end);

    // Pad top/bottom with spacers so scroll position stays stable
    const topPad    = start * 40; // approx 36px + 4px gap per item
    const bottomPad = (images.length - end) * 40;

    return (
        <div className={`absolute left-0 top-0 bottom-0 z-20 overflow-y-auto transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            style={{ width: 52, background: 'linear-gradient(to right,rgba(0,0,0,.75),transparent)', scrollbarWidth: 'none' }}>
            <div ref={stripRef} className="flex flex-col items-center gap-1 py-2 px-1">
                {topPad > 0 && <div style={{ height: topPad, minHeight: topPad, flexShrink: 0 }} />}
                {slice.map((img, li) => {
                    const i = start + li;
                    return (
                        <button key={img._id} onClick={() => onSelect(i)}
                            className={`shrink-0 w-9 h-9 rounded overflow-hidden border-2 transition-all ${i === activeIdx ? 'border-pink-500 opacity-100' : 'border-transparent opacity-40 hover:opacity-70'}`}>
                            <img src={albumAPI.thumbUrl(img.imagePath)} alt=""
                                loading="lazy" decoding="async"
                                className="w-full h-full object-cover" />
                        </button>
                    );
                })}
                {bottomPad > 0 && <div style={{ height: bottomPad, minHeight: bottomPad, flexShrink: 0 }} />}
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

function IBtn({ onClick, active = true, title, children, disabled }) {
    if (disabled) return null;
    return (
        <button 
            onClick={e => { e.stopPropagation(); onClick(); }}
            className={`p-2.5 rounded-full transition ${active ? 'text-white' : 'text-white/50 hover:bg-white/10'}`}
            title={title}
        >
            {children}
        </button>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE VIEWER
// ─────────────────────────────────────────────────────────────────────────────
function ImageViewer({ images: initImages, initialIndex, onClose, onToggleImageFavorite }) {
    const [images, setImages] = useState(initImages);
    const [idx, setIdx] = useState(initialIndex);
    const [slideDir, setSlideDir] = useState(1);
    const [animKey, setAnimKey] = useState(0);
    const [zoom, setZoom] = useState(1);

    const [ctrlsOn, setCtrlsOn] = useState(true);
    const [locked, setLocked] = useState(false);
    const [ssPlaying, setSsPlaying] = useState(false);
    const [ssTimer, setSsTimer] = useState(10);
    const [showTimer, setShowTimer] = useState(false);
    const [isFS, setIsFS] = useState(false);

    const viewerRef = useRef(null);
    const hitRef = useRef(null);
    const imgRef = useRef(null);

    // Gesture refs — never cause re-renders
    const zoomR = useRef(1);
    const panR = useRef({ x: 0, y: 0 });
    const hideT = useRef(null);
    const gestRef = useRef(null);
    const tStart = useRef(null);
    const tLast = useRef({ x: 0, y: 0 });
    const tDist = useRef(null);
    const mDown = useRef(false);
    const mLast = useRef({ x: 0, y: 0 });
    const wheelSyncRef = useRef(null);
    // ① One-scroll = one image: lock navigation until the scroll gesture ends
    const wheelNavLockRef = useRef(false);
    const wheelNavTimer   = useRef(null);

    const imgCount = images.length;

    useEffect(() => { zoomR.current = zoom; }, [zoom]);

    const applyTransform = useCallback((px, py, z) => {
        if (imgRef.current)
            imgRef.current.style.transform = `translate(${px}px,${py}px) scale(${z ?? zoomR.current})`;
    }, []);

    useLayoutEffect(() => {
        applyTransform(panR.current.x, panR.current.y, zoomR.current);
    }, [animKey, applyTransform]);

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

    // ── Controls auto-hide ─────────────────────────────────────────────────────
    const stopHide  = useCallback(() => clearTimeout(hideT.current), []);
    const startHide = useCallback(() => {
        clearTimeout(hideT.current);
        hideT.current = setTimeout(() => setCtrlsOn(false), 3000);
    }, []);

    useEffect(() => {
        if (ssPlaying) { startHide(); } else { stopHide(); setCtrlsOn(true); }
        return () => stopHide();
    }, [ssPlaying, startHide, stopHide]);

    const onActivity = useCallback(() => {
        if (locked) return;
        setCtrlsOn(true);
        if (ssPlaying) startHide();
    }, [locked, ssPlaying, startHide]);

    // ── Reset / navigate ───────────────────────────────────────────────────────
    const resetView = useCallback(() => {
        panR.current = { x: 0, y: 0 }; zoomR.current = 1;
        setZoom(1);
        applyTransform(0, 0, 1);
    }, [applyTransform]);

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

    const zoomLocked = useMemo(() => ssPlaying && ssTimer > 0, [ssPlaying, ssTimer]);

    // ── Favorite ───────────────────────────────────────────────────────────────
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
                if (locked) { setLocked(false); return; }
                if (showTimer) { setShowTimer(false); return; }
                if (isFS) { document.exitFullscreen(); return; }
                onClose();
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') go(1);
            if (e.key === 'ArrowUp'   || e.key === 'ArrowLeft')  go(-1);
            if (e.key === ' ')  { e.preventDefault(); setSsPlaying(p => !p); }
            if (e.key === '0')  resetView();
            if (e.key === 'f')  toggleFS();
            if (e.key === 'l')  setLocked(l => !l);
        };
        window.addEventListener('keydown', fn);
        return () => window.removeEventListener('keydown', fn);
    }, [go, onClose, showTimer, isFS, resetView, toggleFS, locked, onActivity]);

    // ── Mouse wheel: Ctrl+wheel = zoom, plain wheel = ONE image per gesture ────
    useEffect(() => {
        const el = hitRef.current; if (!el) return;
        const fn = (e) => {
            e.preventDefault();
            onActivity();

            if (!e.ctrlKey) {
                // ① Lock: only fire once per scroll gesture
                if (wheelNavLockRef.current) return;
                wheelNavLockRef.current = true;
                go(e.deltaY > 0 ? 1 : -1);
                // Unlock after the physical scroll wheel slows down (~600ms)
                clearTimeout(wheelNavTimer.current);
                wheelNavTimer.current = setTimeout(() => {
                    wheelNavLockRef.current = false;
                }, 600);
                return;
            }

            // Ctrl held → zoom around cursor
            if (zoomLocked) return;
            const f  = e.deltaY < 0 ? 1.12 : 1 / 1.12;
            const nz = Math.min(Math.max(zoomR.current * f, 0.2), 15);
            const rect = el.getBoundingClientRect();
            const cx = e.clientX - rect.left  - rect.width  / 2;
            const cy = e.clientY - rect.top   - rect.height / 2;
            const r  = nz / zoomR.current;
            const np = { x: cx + (panR.current.x - cx) * r, y: cy + (panR.current.y - cy) * r };
            zoomR.current = nz; panR.current = np;
            applyTransform(np.x, np.y, nz);
            el.style.cursor = nz > 1 ? 'grab' : 'default';
            clearTimeout(wheelSyncRef.current);
            wheelSyncRef.current = setTimeout(() => { setZoom(nz); }, 150);
        };
        el.addEventListener('wheel', fn, { passive: false });
        return () => {
            el.removeEventListener('wheel', fn);
            clearTimeout(wheelSyncRef.current);
            clearTimeout(wheelNavTimer.current);
        };
    }, [zoomLocked, onActivity, applyTransform, go]);

    // ── Mouse drag ─────────────────────────────────────────────────────────────
    useEffect(() => {
        const el = hitRef.current; if (!el) return;
        const down = (e) => {
            if (e.button !== 0) return;
            mDown.current = true;
            mLast.current = { x: e.clientX, y: e.clientY };
            el.style.cursor = 'grabbing';
        };
        const move = (e) => {
            onActivity();
            if (!mDown.current || zoomLocked || zoomR.current <= 1) return;
            const dx = e.clientX - mLast.current.x;
            const dy = e.clientY - mLast.current.y;
            mLast.current = { x: e.clientX, y: e.clientY };
            panR.current = { x: panR.current.x + dx, y: panR.current.y + dy };
            applyTransform(panR.current.x, panR.current.y);
        };
        const up = () => {
            if (!mDown.current) return;
            mDown.current = false;
            el.style.cursor = zoomR.current > 1 ? 'grab' : 'default';
        };
        el.addEventListener('mousedown', down);
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return () => {
            el.removeEventListener('mousedown', down);
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', up);
        };
    }, [zoomLocked, onActivity, applyTransform]);

    // ── Touch ──────────────────────────────────────────────────────────────────
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
            if (gestRef.current === 'pinch' && e.touches.length === 2) {
                e.preventDefault();
                if (zoomLocked) return;
                const nd = getTouchDist(e.touches);
                const nz = Math.min(Math.max(zoomR.current * (nd / tDist.current), 0.2), 15);
                zoomR.current = nz; tDist.current = nd;
                applyTransform(panR.current.x, panR.current.y, nz);
                return;
            }
            if (e.touches.length !== 1 || gestRef.current === 'pinch') return;
            const cx = e.touches[0].clientX, cy = e.touches[0].clientY;
            const dx = cx - tLast.current.x,  dy = cy - tLast.current.y;
            if (gestRef.current === null && tStart.current) {
                const adx = Math.abs(cx - tStart.current.x);
                const ady = Math.abs(cy - tStart.current.y);
                if (adx > 8 || ady > 8)
                    gestRef.current = (zoomR.current > 1 && !zoomLocked) ? 'pan' : 'swipe';
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
                setZoom(zoomR.current);
                gestRef.current = null; tDist.current = null;
                return;
            }
            if (gestRef.current === 'pan') {
                gestRef.current = null; tStart.current = null;
                return;
            }
            const ts = tStart.current; if (!ts) return;
            const ch = e.changedTouches[0];
            const dx = ch.clientX - ts.x, dy = ch.clientY - ts.y;
            const dt = Date.now() - ts.t;
            if (gestRef.current === 'swipe' &&
                Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx) * 1.4 && dt < 500) {
                go(dy < 0 ? 1 : -1);
            } else if (gestRef.current === null) {
                onActivity();
            }
            gestRef.current = null; tStart.current = null;
        };
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

    return (
        <div ref={viewerRef} className="fixed inset-0 z-50 bg-black select-none overflow-hidden">
            {/* ── Image display ────────────────────────────────────────────── */}
            <div className="absolute inset-0 overflow-hidden" style={{ isolation: 'isolate' }}>
                {img && (
                    <div key={animKey} className="absolute inset-0 flex items-center justify-center"
                        style={{ animation: `${slideDir > 0 ? 'vf-in-down' : 'vf-in-up'} 0.26s cubic-bezier(0.25,0.46,0.45,0.94) both`, willChange: 'transform' }}>
                        <img ref={imgRef} src={albumAPI.imageUrl(img.imagePath)} alt={img.title || ''}
                            draggable={false}
                            style={{
                                transformOrigin: '50% 50%',
                                maxWidth: '100%', maxHeight: '100%',
                                objectFit: 'contain',
                                pointerEvents: 'none', userSelect: 'none',
                                willChange: 'transform',
                            }} />
                    </div>
                )}
            </div>

            {/* ── Hit layer ────────────────────────────────────────────────── */}
            <div ref={hitRef} className="absolute inset-0 z-10" style={{ cursor: 'default' }}>
                <div 
                    onClick={e => { e.stopPropagation(); go(-1); }}
                    className="absolute top-0 left-0 w-full h-[10%] min-h-11 z-20 cursor-pointer flex items-start justify-center pt-2"
                ></div>
                <div 
                    onClick={e => { e.stopPropagation(); go(1); }}
                    className="absolute bottom-0 left-0 w-full h-[10%] min-h-11 z-20 cursor-pointer flex items-end justify-center pb-2"
                ></div>
            </div>

            {/* ── Filmstrip ────────────────────────────────────────────────── */}
            {/*}
            <FilmStrip images={images} activeIdx={idx} visible={show}
                onSelect={(i) => { setSlideDir(i > idx ? 1 : -1); setIdx(i); setAnimKey(k => k + 1); resetView(); }} />
            {*/}

            {/* ── Right sidebar ────────────────────────────────────────────── */}
            <div className={`absolute right-0 top-0 bottom-0 z-30 transition-opacity duration-300 ${ctrlsOn ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="flex flex-col items-center justify-between h-full py-3 px-1.5 bg-linear-to-l from-black/50 to-transparent">
                    <IBtn
                        onClick={onClose}
                        disabled={locked}
                    >
                        <X className="w-5 h-5" />
                    </IBtn>
                    <div className="flex flex-col items-center gap-1">
                        <IBtn
                            onClick={toggleFav}
                            disabled={locked}
                            title={img?.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        >
                            <div className={`flex flex-col items-center ${img?.isFavorite ? 'text-red-500' : ''}`}>
                                <Heart className="w-6 h-6" fill={img?.isFavorite ? 'currentColor' : 'none'} />
                                {img?.views > 0 && <span className="text-white/70 text-[10px] mt-1">{img.views}</span>}
                            </div>
                        </IBtn>
                        <div className="relative">
                            {showTimer && (
                                <TimerPicker 
                                    currentTimer={ssTimer}
                                    onPick={(s) => { setSsTimer(s); setSsPlaying(true); setShowTimer(false); }}
                                    onClose={() => setShowTimer(false)} 
                                />
                            )}
                            <IBtn
                                onClick={() => ssPlaying ? setSsPlaying(false): setShowTimer(s => !s)}
                                disabled={locked}
                                title={ssPlaying ? 'Pause slideshow' : 'Start slideshow'}
                            >
                                {ssPlaying ? <Pause className="w-5 h-5 text-pink-600" /> : <Play className="w-5 h-5" fill="currentColor" />}
                            </IBtn>
                        </div>
                        {zoom !== 1 && (
                            <IBtn 
                                onClick={resetView} 
                                title="Reset zoom (0)"
                            >
                                <RotateCcw className="w-5 h-5" />
                            </IBtn>
                        )}
                        <IBtn 
                            onClick={() => setLocked(l => !l)} 
                            title={locked ? 'Unlock' : 'Lock'}
                        >
                            {locked ? <Lock className="w-5 h-5 text-amber-600" /> : <Unlock className="w-5 h-5" />}
                        </IBtn>
                        <IBtn 
                            onClick={toggleFS} 
                            disabled={locked}
                            title="Fullscreen (F)"
                        >
                            {isFS ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                        </IBtn>
                    </div>
                    {img?.title && (
                        <p className="text-white/30 text-[9px] text-center max-w-9 wrap-break-word leading-tight">
                            {img.title}
                        </p>
                    )}
                </div>
            </div>

            <div className="absolute bottom-2 left-2 text-white/70 text-xs font-mono text-center">
                {idx + 1}/{imgCount}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// LAZY IMAGE — renders a placeholder until entering the viewport
// ─────────────────────────────────────────────────────────────────────────────
function LazyThumb({ src, alt, className, style }) {
    const ref   = useRef(null);
    const [vis, setVis] = useState(false);
    useEffect(() => {
        const el = ref.current; if (!el) return;
        const ob = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); ob.disconnect(); } },
            { rootMargin: '200px' });
        ob.observe(el);
        return () => ob.disconnect();
    }, []);
    return (
        <div ref={ref} className={className} style={style}>
            {vis
                ? <img src={src} alt={alt} loading="lazy" decoding="async"
                    className="w-full h-full object-cover transition-opacity duration-300"
                    style={{ opacity: 1 }} />
                : <div className="w-full h-full bg-slate-800 animate-pulse" />}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// GRID SIZE CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const GRID_SIZES = [
    { id: 'xl', label: 'XL', cols: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3' },
    { id: 'lg', label: 'L', cols: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4' },
    { id: 'md', label: 'M', cols: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5' },
    { id: 'sm', label: 'S', cols: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7' },
    { id: 'xs', label: 'XS', cols: 'grid-cols-4 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-8 xl:grid-cols-10' },
];

// ─────────────────────────────────────────────────────────────────────────────
// SORT OPTIONS
// ─────────────────────────────────────────────────────────────────────────────
const SORT_OPTS = [
    { id: 'order', label: 'Default order' },
    { id: 'date_desc', label: 'Newest first' },
    { id: 'date_asc', label: 'Oldest first' },
    { id: 'views', label: 'Most viewed' },
    { id: 'fav', label: 'Favorites first' },
    { id: 'name', label: 'Name A→Z' },
];

// ─────────────────────────────────────────────────────────────────────────────
// VIRTUAL RENDERING PAGE SIZE
// ─────────────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 60;

function sortImages(imgs, sortBy) {
    const a = [...imgs];
    switch (sortBy) {
        case 'date_desc': return a.sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
        case 'date_asc': return a.sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt));
        case 'views': return a.sort((x, y) => (y.views || 0) - (x.views || 0));
        case 'fav': return a.sort((x, y) => (y.isFavorite ? 1 : 0) - (x.isFavorite ? 1 : 0));
        case 'name': return a.sort((x, y) => (x.title || '').localeCompare(y.title || ''));
        default: return a;
    }
}

function groupByDate(imgs) {
    const groups = {};
    for (const img of imgs) {
        const d = img.createdAt ? new Date(img.createdAt) : null;
        const key = d ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Unknown date';
        if (!groups[key]) groups[key] = [];
        groups[key].push(img);
    }
    // Sort groups newest first
    return Object.entries(groups).sort(([a], [b]) => new Date(b) - new Date(a));
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE GRID ITEM  (memoised to avoid re-render of all siblings on selection)
// ─────────────────────────────────────────────────────────────────────────────
const GridItem = React.memo(function GridItem({ img, isSel, selectMode, onClick, onMouseDown, onMouseUp, onMouseLeave, onTouchStart, onTouchEnd, onTouchMove }) {
    return (
        <div
            onClick={onClick}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onTouchMove={onTouchMove}
            className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer group border-2 transition-all select-none ${isSel ? 'border-pink-500 ring-2 ring-pink-500/30' : 'border-transparent hover:border-slate-600'}`}
            style={{ contentVisibility: 'auto', containIntrinsicSize: '0 160px' }}>
            <LazyThumb src={albumAPI.thumbUrl(img.imagePath)} alt={img.title || ''}
                className="absolute inset-0 group-hover:scale-105 transition-transform duration-300 overflow-hidden" />
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
});

// ─────────────────────────────────────────────────────────────────────────────
// DROP CONFIRM MODAL
// ─────────────────────────────────────────────────────────────────────────────
function DropConfirmModal({ files, onConfirm, onCancel }) {
    const previews = files.slice(0, 6);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
                <h2 className="text-white font-bold text-base">Upload {files.length} image{files.length !== 1 ? 's' : ''}?</h2>

                {/* Preview grid */}
                <div className="grid grid-cols-3 gap-1.5">
                    {previews.map((f, i) => (
                        <div key={i} className="aspect-square rounded-lg overflow-hidden bg-slate-800">
                            <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                        </div>
                    ))}
                    {files.length > 6 && (
                        <div className="aspect-square rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 text-xs font-semibold">
                            +{files.length - 6} more
                        </div>
                    )}
                </div>

                <div className="flex gap-2 justify-end">
                    <button onClick={onCancel}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition">
                        Cancel
                    </button>
                    <button onClick={onConfirm}
                        className="flex items-center gap-1.5 px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg text-sm font-semibold transition">
                        <Upload className="w-3.5 h-3.5" /> Upload
                    </button>
                </div>
            </div>
        </div>
    );
}

function RenderGrid({ imgs = [], selected = new Set(), selectMode = false, colsCls, handleImgClick, onMouseDown, onMouseUp, onMouseLeave, onTouchStart, onTouchEnd, onTouchMove }) {
    return (
        <div className={`grid ${colsCls} gap-1.5`}>
            {imgs.map((img) => (
                <GridItem 
                    key={img._id} 
                    img={img}
                    isSel={selected.has(img._id)} 
                    selectMode={selectMode}
                    onClick={(e) => handleImgClick(img._id, e.shiftKey)}
                    onMouseDown={() => onMouseDown(img._id)}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseLeave}
                    onTouchStart={() => onTouchStart(img._id)}
                    onTouchEnd={onTouchEnd}
                    onTouchMove={onTouchMove} 
                />
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ALBUM DETAIL PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function AlbumDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { isAdmin } = useAuth();

    const [album, setAlbum] = useState(null);
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(true);

    const [selectMode, setSelectMode] = useState(false);
    const [selected, setSelected] = useState(new Set());
    const lastClickIdx = useRef(null);   // for shift-range select

    // Virtual rendering
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const sentinelRef = useRef(null);

    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerImages, setViewerImages] = useState([]);
    const [viewerIndex, setViewerIndex] = useState(0);

    const [uploading, setUploading] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const uploadRef = useRef(null);

    // ── Drag-and-drop ──────────────────────────────────────────────────────────
    const [dragging, setDragging] = useState(false);
    const [dropFiles, setDropFiles] = useState(null);   // File[] pending confirm
    const dragCountRef = useRef(0);     // track nested drag events

    const previousScrollPosRef = useRef(0);

    const isImageFiles = (dt) => [...(dt?.items || [])].some(i => i.kind === 'file' && i.type.startsWith('image/'));

    const onDragEnter = useCallback((e) => {
        e.preventDefault();
        if (!isAdmin) return;
        if (isImageFiles(e.dataTransfer)) { dragCountRef.current++; setDragging(true); }
    }, [isAdmin]);

    const onDragLeave = useCallback((e) => {
        e.preventDefault();
        dragCountRef.current--;
        if (dragCountRef.current <= 0) { dragCountRef.current = 0; setDragging(false); }
    }, []);

    const onDragOver = useCallback((e) => { e.preventDefault(); }, []);

    const onDrop = useCallback((e) => {
        e.preventDefault();
        dragCountRef.current = 0;
        setDragging(false);
        if (!isAdmin) return;
        const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
        if (files.length) setDropFiles(files);
    }, [isAdmin]);

    // ── View options ───────────────────────────────────────────────────────────
    const [gridSize, setGridSize] = useState('md');   // xl lg md sm xs
    const [viewMode, setViewMode] = useState('normal'); // normal | grouped | sorted
    const [sortBy, setSortBy] = useState('order');
    const [showOpts, setShowOpts] = useState(false);
    const optsRef = useRef(null);

    useEffect(() => {
        if (album?.title) document.title = album.title;
    }, [album]);

    // Close options panel on outside click
    useEffect(() => {
        if (!showOpts) return;
        const fn = (e) => { if (!optsRef.current?.contains(e.target)) setShowOpts(false); };
        document.addEventListener('mousedown', fn);
        return () => document.removeEventListener('mousedown', fn);
    }, [showOpts]);

    // Long-press
    const longPressRef = useRef(null);

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

    // ── Derived sorted/grouped images ──────────────────────────────────────────
    const displayImages = useMemo(() => sortImages(images, viewMode === 'sorted' ? sortBy : 'order'), [images, viewMode, sortBy]);

    // ── id → absolute-index map (fixes grouped-mode range select) ─────────────
    const displayIndexMap = useMemo(() => {
        const m = new Map();
        displayImages.forEach((img, i) => m.set(img._id, i));
        return m;
    }, [displayImages]);

    // ── Virtual rendering: only render visible slice ────────────────────────────
    useEffect(() => { setVisibleCount(PAGE_SIZE); }, [displayImages]);

    const visibleImages = useMemo(
        () => displayImages.slice(0, visibleCount),
        [displayImages, visibleCount]
    );
    const visibleGrouped = useMemo(
        () => viewMode === 'grouped' ? groupByDate(visibleImages) : [],
        [viewMode, visibleImages]
    );

    // Sentinel observer — loads next page of items when bottom is reached
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || visibleCount >= displayImages.length) return;
        const ob = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting)
                setVisibleCount(c => Math.min(c + PAGE_SIZE, displayImages.length));
        }, { rootMargin: '300px' });
        ob.observe(el);
        return () => ob.disconnect();
    }, [visibleCount, displayImages.length]);

    // ── Long-press ─────────────────────────────────────────────────────────────
    const startLongPress = useCallback((imgId) => {
        longPressRef.current = setTimeout(() => {
            const i = displayIndexMap.get(imgId) ?? -1;
            if (i === -1) return;
            if (!selectMode) setSelectMode(true);
            setSelected(new Set([imgId]));
            lastClickIdx.current = i;
        }, 500);
    }, [selectMode, displayIndexMap]);
    const cancelLongPress = () => clearTimeout(longPressRef.current);

    // ── Select helpers ─────────────────────────────────────────────────────────
    const toggleSelect = useCallback((imgId, idx, shiftHeld) => {
        if (shiftHeld && lastClickIdx.current !== null) {
            // Range select: pre-compute ids outside setState (avoids stale closure)
            const lo = Math.min(lastClickIdx.current, idx);
            const hi = Math.max(lastClickIdx.current, idx);
            const rangeIds = displayImages.slice(lo, hi + 1).map(img => img._id);
            setSelected(prev => {
                const n = new Set(prev);
                rangeIds.forEach(id => n.add(id));
                return n;
            });
            // Keep anchor fixed — don't update lastClickIdx on range select
            return;
        }
        setSelected(prev => {
            const n = new Set(prev);
            n.has(imgId) ? n.delete(imgId) : n.add(imgId);
            return n;
        });
        lastClickIdx.current = idx;
    }, [displayImages]);

    const selectAll = () => { setSelected(new Set(displayImages.map(i => i._id))); lastClickIdx.current = null; };
    const deselectAll = () => { setSelected(new Set()); lastClickIdx.current = null; };
    const exitSelect = () => { setSelectMode(false); setSelected(new Set()); lastClickIdx.current = null; };

    // ── Open viewer ────────────────────────────────────────────────────────────
    const openViewerFiltered = (startAt = 0) => {
        if (selected.size > 0) {
            setViewerImages(displayImages.filter(img => selected.has(img._id)));
            setViewerIndex(0);
        } else {
            setViewerImages(displayImages);
            setViewerIndex(startAt);
        }
        previousScrollPosRef.current = window.scrollY;
        setViewerOpen(true);
    };

    const handleImgClick = useCallback((imgId, shiftHeld = false) => {
        const i = displayIndexMap.get(imgId) ?? -1;
        if (i === -1) return;
        if (selectMode) { toggleSelect(imgId, i, shiftHeld); return; }
        setViewerImages(displayImages);
        setViewerIndex(i);
        previousScrollPosRef.current = window.scrollY;
        setViewerOpen(true);
    }, [selectMode, displayImages, displayIndexMap, toggleSelect]);

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
        finally { setUploading(false); }
    };

    const handleDeleteSelected = async () => {
        if (!selected.size || !window.confirm(`Delete ${selected.size} image${selected.size !== 1 ? 's' : ''}?`)) return;
        try { await albumAPI.deleteImages(id, [...selected]); toast.success('Deleted'); exitSelect(); load(); }
        catch { toast.error('Failed to delete'); }
    };

    const handleDeleteAlbum = async () => {
        if (!window.confirm(`Delete the album "${album?.title}" and ALL its images? This cannot be undone.`)) return;
        setDeleting(true);
        try { await albumAPI.deleteAlbum(id); toast.success('Album deleted'); navigate('/'); }
        catch { toast.error('Failed to delete album'); setDeleting(false); }
    };

    const handleToggleAlbumFav = async () => {
        try {
            const res = await albumAPI.toggleFavorite(id);
            setAlbum(a => ({ ...a, isFavorite: res.isFavorite }));
        } catch { toast.error('Failed to update favorite'); }
    };

    // ── Grid column class ──────────────────────────────────────────────────────
    const colsCls = GRID_SIZES.find(g => g.id === gridSize)?.cols ?? GRID_SIZES[2].cols;

    if (loading) return (
        <div className="min-h-dvh bg-slate-950 flex items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-pink-500" />
        </div>
    );

    const hasImages = images.length > 0;

    if (viewerOpen) {
        return (
            <ImageViewer 
                images={viewerImages} 
                initialIndex={viewerIndex}
                onClose={() => setViewerOpen(false)}
                onToggleImageFavorite={handleImageFavToggle} 
            />
        );
    }

    return (
        <div
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
            className="h-dvh bg-slate-950 relative overflow-auto"
        >
            {/* Drop overlay */}
            {dragging && (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-pink-900/60 backdrop-blur-sm border-4 border-dashed border-pink-400 pointer-events-none">
                    <Upload className="w-16 h-16 text-pink-300 mb-3" />
                    <p className="text-white text-xl font-bold">Drop images to upload</p>
                </div>
            )}
            
            {/* ── Top Bar ───────────────────────────────────────────────────── */}
            <AppHeader
                actions={isAdmin && (
                    <div className="flex items-center gap-1.5">
                        <button onClick={() => setShowEdit(true)}
                            className="p-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg transition" title="Edit album">
                            <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => uploadRef.current?.click()} disabled={uploading}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition">
                            {uploading
                                ? <><div className="w-3 h-3 border-b border-white rounded-full animate-spin" /> Adding…</>
                                : <><Upload className="w-3.5 h-3.5" /> Add</>}
                        </button>
                        <button onClick={handleDeleteAlbum} disabled={deleting}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition">
                            {deleting ? <div className="w-3 h-3 border-b border-white rounded-full animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">Delete Album</span>
                        </button>
                        <input ref={uploadRef} type="file" multiple accept="image/*" className="hidden"
                            onChange={e => handleUpload(e.target.files)} />
                    </div>
                )}
            />

            <div className="px-4 sm:px-6 pb-10 pt-4 max-w-7xl mx-auto space-y-5">
                {/* Album info */}
                <div className="flex items-start gap-4">
                    {(album?.coverPath || !hasImages) && (
                        <div className="shrink-0 w-24 h-24 sm:w-32 sm:h-32 rounded-xl overflow-hidden bg-slate-800 border border-slate-700">
                            {album?.coverPath
                                ? <img src={albumAPI.imageUrl(album.coverPath)} alt={album?.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center"><Images className="w-8 h-8 text-slate-600" /></div>}
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <span className="text-pink-400 text-lg font-bold rounded uppercase">{album?.title || 'Untitled'}</span>
                            {album?.year && <span className="text-slate-500 text-sm">{album.year}</span>}
                        </div>
                        {album?.description && <p className="text-slate-400 text-sm mb-2">{album.description}</p>}
                        <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
                            <span className="flex items-center gap-1"><Images className="w-3 h-3" />{images.length} images</span>
                            {album?.totalViews > 0 && <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{album.totalViews.toLocaleString()} views</span>}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {album?.studios?.map(s => <Tag key={s} label={s} color="blue" />)}
                            {album?.actors?.map(a => <Tag key={a} label={a} color="green" />)}
                            {album?.characters?.map(c => <Tag key={c} label={c} color="purple" />)}
                            {album?.tags?.map(t => <Tag key={t} label={t} color="slate" />)}
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

                {/* Hint */}
                {hasImages && (
                    <p className="text-slate-600 text-xs">
                        {selectMode
                            ? 'Tap to toggle · Shift+click to range-select · Long-press on mobile'
                            : 'Tap to view · Long-press or click Select to multi-select'}
                    </p>
                )}

                {/* Image Grid — normal or sorted */}
                {hasImages && viewMode !== 'grouped' && (
                    <RenderGrid 
                        imgs={visibleImages}
                        colsCls={colsCls}
                        handleImgClick={handleImgClick}
                        onMouseDown={startLongPress}
                        onMouseLeave={cancelLongPress}
                        onMouseUp={cancelLongPress}
                        onTouchStart={startLongPress}
                        onTouchEnd={cancelLongPress}
                        onTouchMove={cancelLongPress}
                        selectMode={selectMode}
                        selected={selected}
                    />
                )}

                {/* Image Grid — grouped by date */}
                {hasImages && viewMode === 'grouped' && visibleGrouped.map(([dateLabel, imgs]) => (
                    <div key={dateLabel} className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            <span className="text-slate-400 text-sm font-medium">{dateLabel}</span>
                            <span className="text-slate-600 text-xs">({imgs.length})</span>
                            <div className="flex-1 h-px bg-slate-800" />
                        </div>
                        <RenderGrid 
                            imgs={imgs}
                            colsCls={colsCls}
                            handleImgClick={handleImgClick}
                            onMouseDown={startLongPress}
                            onMouseLeave={cancelLongPress}
                            onMouseUp={cancelLongPress}
                            onTouchStart={startLongPress}
                            onTouchEnd={cancelLongPress}
                            onTouchMove={cancelLongPress}
                            selectMode={selectMode}
                            selected={selected}
                        />
                    </div>
                ))}

                {/* Load-more sentinel + progress */}
                {hasImages && (
                    <div ref={sentinelRef} className="flex flex-col items-center gap-1.5 py-4">
                        {visibleCount < displayImages.length ? (
                            <>
                                <div className="w-5 h-5 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                                <p className="text-slate-600 text-xs">
                                    Showing {visibleCount} of {displayImages.length} images
                                </p>
                            </>
                        ) : displayImages.length > PAGE_SIZE && (
                            <p className="text-slate-700 text-xs">All {displayImages.length} images loaded</p>
                        )}
                    </div>
                )}
            </div>

            {/* Toolbar */}
            {hasImages && (
                <div className="sticky bottom-4 left-8 w-[calc(100dvw-4rem)] flex items-center gap-1 p-2 sm:gap-2 sm:p-3 bg-slate-800/70 border border-slate-700 rounded-xl z-50 @container">
                    {selectMode ? (
                        <>
                            <span className="text-white text-sm font-medium">{selected.size} selected</span>
                            <button 
                                onClick={() => selected.size > 0 ? deselectAll() : selectAll()}
                                className="flex items-center gap-1.5 p-1.5 @xl:px-2.5 @xl:py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-xs rounded-lg transition whitespace-nowrap"
                            >
                                {selected.size > 0 ? <SquareDashed className="w-3 h-3" /> : <SquareCheckBig className="w-3 h-3"/>}
                                <span className="hidden @xl:inline whitespace-nowrap">
                                    {selected.size > 0 ? 'None' : `Select All (${displayImages.length})`}
                                </span>
                            </button>
                            <div className="flex-1" />
                            <button 
                                onClick={() => openViewerFiltered()}
                                className="flex items-center gap-1.5 p-1.5 @xl:px-2.5 @xl:py-1.5 bg-pink-600 hover:bg-pink-500 text-white text-xs rounded-lg font-medium transition"
                            >
                                <Play className="w-3 h-3" fill="currentColor" />
                                <span className="hidden @xl:inline whitespace-nowrap">
                                    {selected.size > 0 ? `View (${selected.size})` : 'View All'}
                                </span>
                            </button>
                            <button 
                                onClick={() => albumAPI.downloadAlbum(id, selected.size ? [...selected] : null)} 
                                disabled={!selected.size}
                                className="flex items-center gap-1.5 p-1.5 @xl:px-2.5 @xl:py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs rounded-lg font-medium transition"
                            >
                                <Download className="w-3 h-3" />
                                <span className="hidden @xl:inline whitespace-nowrap">
                                    {selected.size > 1 ? `ZIP (${selected.size})` : 'Download'}
                                </span>
                            </button>
                            {isAdmin && (
                                <button onClick={handleDeleteSelected} disabled={!selected.size}
                                    className="flex items-center p-1.5 @xl:px-2.5 @xl:py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-xs rounded-lg font-medium transition">
                                    <Trash2 className="w-3 h-3" />
                                    <span className="hidden @xl:inline">
                                        Delete
                                    </span>
                                </button>
                            )}
                            <button onClick={exitSelect} className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"><X className="w-4 h-4" /></button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => setSelectMode(true)}
                                className="flex items-center p-1.5 @xl:px-2.5 @xl:py-1.5 bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-sm rounded-lg transition">
                                <CheckSquare className="w-4 h-4" />
                                <span className="hidden @xl:inline">
                                    Select
                                </span>
                            </button>
                            <button onClick={() => albumAPI.downloadAlbum(id)}
                                className="flex items-center p-1.5 @xl:px-2.5 @xl:py-1.5 bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-sm rounded-lg transition">
                                <Download className="w-4 h-4" />
                                <span className="hidden @xl:inline">
                                    Download All
                                </span>
                            </button>
                            <button onClick={() => openViewerFiltered(0)}
                                className="flex items-center p-1.5 @xl:px-2.5 @xl:py-1.5 bg-pink-600 hover:bg-pink-500 text-white text-sm rounded-lg font-medium transition">
                                <Play className="w-4 h-4" fill="currentColor" />
                                <span className="hidden @xl:inline">
                                    View All
                                </span>
                            </button>

                            <div className="flex-1" />

                            {/* ── View options panel ──────────────────────── */}
                            <div className="relative" ref={optsRef}>
                                <button onClick={() => setShowOpts(o => !o)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 border text-sm rounded-lg transition ${showOpts ? 'bg-slate-700 border-slate-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'}`}>
                                    <SlidersHorizontal className="w-4 h-4" />
                                    <span className="hidden @xl:inline">
                                        Options
                                    </span>
                                </button>

                                {showOpts && (
                                    <div className="absolute right-0 bottom-[calc(100%+1rem)] mt-2 z-40 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4 w-72 space-y-4">
                                        {/* Grid size */}
                                        <div>
                                            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <LayoutGrid className="w-3.5 h-3.5" /> Layout size
                                            </p>
                                            <div className="flex gap-1.5">
                                                {GRID_SIZES.map(g => (
                                                    <button key={g.id} onClick={() => setGridSize(g.id)}
                                                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${gridSize === g.id ? 'bg-pink-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'}`}>
                                                        {g.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* View mode */}
                                        <div>
                                            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                <AlignJustify className="w-3.5 h-3.5" /> View mode
                                            </p>
                                            <div className="flex flex-col gap-1">
                                                {[
                                                    { id: 'normal',  label: 'Normal',          icon: <LayoutGrid className="w-3.5 h-3.5" /> },
                                                    { id: 'grouped', label: 'Grouped by date',  icon: <Calendar className="w-3.5 h-3.5" /> },
                                                    { id: 'sorted',  label: 'Sorted',           icon: <ArrowUpDown className="w-3.5 h-3.5" /> },
                                                ].map(m => (
                                                    <button key={m.id} onClick={() => setViewMode(m.id)}
                                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition ${viewMode === m.id ? 'bg-pink-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                                                        {m.icon} {m.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Sort options — only visible in sorted mode */}
                                        {viewMode === 'sorted' && (
                                            <div>
                                                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                    <Star className="w-3.5 h-3.5" /> Sort by
                                                </p>
                                                <div className="flex flex-col gap-1">
                                                    {SORT_OPTS.map(o => (
                                                        <button key={o.id} onClick={() => setSortBy(o.id)}
                                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition ${sortBy === o.id ? 'bg-slate-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                                                            {sortBy === o.id && <span className="text-pink-400">✓</span>}
                                                            {o.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}

            {showEdit && (
                <AlbumFormModal 
                    album={album} 
                    onSaved={() => { setShowEdit(false); load(); }} 
                    onClose={() => setShowEdit(false)} 
                />
            )}

            {dropFiles && (
                <DropConfirmModal
                    files={dropFiles}
                    onConfirm={() => { handleUpload(dropFiles); setDropFiles(null); }}
                    onCancel={() => setDropFiles(null)} 
                />
            )}
        </div>
    );
}

function Tag({ label, color = 'slate' }) {
    const m = { slate: 'bg-slate-700 text-slate-300', blue: 'bg-blue-500/20 text-blue-300', green: 'bg-green-500/20 text-green-300', purple: 'bg-purple-500/20 text-purple-300' };
    return <span className={`px-2 py-0.5 text-xs rounded-full ${m[color] || m.slate}`}>{label}</span>;
}