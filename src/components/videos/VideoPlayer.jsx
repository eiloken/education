import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Settings, SkipBack, SkipForward, RefreshCcw, RotateCcw, Volume1, RefreshCw } from 'lucide-react';
import useMyStorage from '../../utils/localStorage';

// ─── Component ────────────────────────────────────────────────────────────────
function VideoPlayer({
    videoId,
    videoUrl,
    availableQualities = [],
    onPrevious = null,
    onNext = null,
    hasPrevious = false,
    hasNext = false,
    autoPlayNext = false,
    isEmbedded = false,
    onView = null,          // Called once after 30 s of actual playback
}) {
    const videoRef = useRef(null);
    const containerRef = useRef(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    const [volume, setVolume]   = useMyStorage('vibeflix_volume', 1);
    const [isMuted, setIsMuted] = useMyStorage('vibeflix_muted', false);
    const [progressMap, setProgressMap] = useMyStorage('vibeflix_progress', {});
    const progressMapRef = useRef(progressMap);
    useEffect(() => { progressMapRef.current = progressMap; }, [progressMap]);
    const lastVolumeRef = useRef(volume > 0 ? volume : 1);

    const [showControls, setShowControls] = useState(true);
    const [selectedQuality, setSelectedQuality] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [skipIndicator, setSkipIndicator] = useState(null);
    const [volumeIndicator, setVolumeIndicator] = useState(null);
    const [resumePrompt, setResumePrompt] = useState(null);
    const [endedState, setEndedState] = useState(null);
    const [countdown, setCountdown] = useState(10);
    const countdownRef = useRef(null);

    // ── Seek bar state ─────────────────────────────────────────────────────────
    const seekBarRef           = useRef(null);
    const [isDragging, setIsDragging]   = useState(false);
    const [hoverPct, setHoverPct]       = useState(null); // 0-1, null = not hovering
    const [dragPct, setDragPct]         = useState(null); // 0-1 while dragging
    const isDraggingRef = useRef(false); // sync ref for pointer handlers

    const controlsTimeoutRef    = useRef(null);
    const lastTapRef            = useRef({ time: 0, x: 0 });
    const doubleTapTimerRef     = useRef(null);
    const suppressClickRef      = useRef(false);
    const shouldAutoPlayRef     = useRef(false);
    const skipAccumRef          = useRef({ side: null, total: 0, hideTimer: null });
    const volumeIndicatorTimer  = useRef(null);

    // ── View-count tracking ───────────────────────────────────────────────────
    const playedTimeRef  = useRef(0);
    const lastTimeRef    = useRef(0);
    const viewTrackedRef = useRef(false);

    useEffect(() => {
        playedTimeRef.current  = 0;
        lastTimeRef.current    = 0;
        viewTrackedRef.current = false;
    }, [videoId, videoUrl]);

    // ── Apply volume/muted ────────────────────────────────────────────────────
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        video.volume = isMuted ? 0 : volume;
        video.muted  = isMuted;
    }, [volume, isMuted]);

    // ── Reset + resume check when URL / id changes ────────────────────────────
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        video.pause();
        video.currentTime = 0;
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        setSelectedQuality('');
        setError(null);
        setIsLoading(true);
        setEndedState(null);
        setCountdown(10);
        if (countdownRef.current) clearInterval(countdownRef.current);

        video.volume = isMuted ? 0 : volume;
        video.muted  = isMuted;

        if (videoId) {
            const saved = progressMapRef.current[videoId];
            if (saved && saved > 5) {
                shouldAutoPlayRef.current = false;
                setResumePrompt({ time: saved });
            } else {
                setResumePrompt(null);
                shouldAutoPlayRef.current = true;
            }
        } else {
            setResumePrompt(null);
            shouldAutoPlayRef.current = true;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoUrl, videoId]);

    // ── Cleanup countdown on unmount ──────────────────────────────────────────
    useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

    // ── Video event listeners ─────────────────────────────────────────────────
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const onLoadedMetadata = () => {
            setDuration(video.duration);
            setIsLoading(false);
            setError(null);
        };

        const onTimeUpdate = () => {
            // Don't override currentTime display while user is dragging
            if (isDraggingRef.current) return;

            const t = video.currentTime;
            const d = video.duration;
            setCurrentTime(t);

            if (!video.paused) {
                const delta = t - lastTimeRef.current;
                if (delta > 0 && delta < 2) playedTimeRef.current += delta;
            }
            lastTimeRef.current = t;

            if (!viewTrackedRef.current && playedTimeRef.current >= 30 && onView) {
                viewTrackedRef.current = true;
                try { onView(); } catch (_) {}
            }

            if (videoId && d > 0 && t > 5 && t < d * 0.8) {
                setProgressMap(prev => ({ ...prev, [videoId]: t }));
            }
        };

        const onPlay  = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);

        const onEnded = () => {
            setIsPlaying(false);
            if (videoId) setProgressMap(prev => { const n = { ...prev }; delete n[videoId]; return n; });

            if (hasNext) {
                setEndedState('countdown');
                setCountdown(10);
                if (countdownRef.current) clearInterval(countdownRef.current);
                countdownRef.current = setInterval(() => {
                    setCountdown(prev => {
                        if (prev <= 1) { clearInterval(countdownRef.current); onNext?.(); return 0; }
                        return prev - 1;
                    });
                }, 1000);
            } else {
                setEndedState('replay');
            }
        };

        const onCanPlay   = () => {
            setIsLoading(false);
            setError(null);
            if (shouldAutoPlayRef.current) {
                shouldAutoPlayRef.current = false;
                video.play().catch(() => {});
            }
        };
        const onWaiting   = () => setIsLoading(true);
        const onError     = () => { setError('Failed to load video'); setIsLoading(false); };
        const onLoadStart = () => setIsLoading(true);

        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener('timeupdate',     onTimeUpdate);
        video.addEventListener('play',           onPlay);
        video.addEventListener('pause',          onPause);
        video.addEventListener('ended',          onEnded);
        video.addEventListener('canplay',        onCanPlay);
        video.addEventListener('waiting',        onWaiting);
        video.addEventListener('error',          onError);
        video.addEventListener('loadstart',      onLoadStart);

        return () => {
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            video.removeEventListener('timeupdate',     onTimeUpdate);
            video.removeEventListener('play',           onPlay);
            video.removeEventListener('pause',          onPause);
            video.removeEventListener('ended',          onEnded);
            video.removeEventListener('canplay',        onCanPlay);
            video.removeEventListener('waiting',        onWaiting);
            video.removeEventListener('error',          onError);
            video.removeEventListener('loadstart',      onLoadStart);
        };
    }, [autoPlayNext, hasNext, onNext, videoId, onView, setProgressMap]);

    // ── Fullscreen change ─────────────────────────────────────────────────────
    useEffect(() => {
        const onFsChange = () => {
            const isFull = !!document.fullscreenElement;
            setIsFullscreen(isFull);
            if (!isFull && screen.orientation?.unlock) {
                try { screen.orientation.unlock(); } catch (_) {}
            }
        };
        document.addEventListener('fullscreenchange', onFsChange);
        return () => document.removeEventListener('fullscreenchange', onFsChange);
    }, []);

    // ── Controls auto-hide ────────────────────────────────────────────────────
    const scheduleHide = useCallback(() => {
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
    }, []);

    const showAndScheduleHide = useCallback(() => {
        setShowControls(true);
        if (isPlaying) scheduleHide();
    }, [isPlaying, scheduleHide]);

    useEffect(() => {
        if (isPlaying) scheduleHide();
        else {
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
            setShowControls(true);
        }
        return () => { if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); };
    }, [isPlaying, scheduleHide]);

    // ── Resume handlers ───────────────────────────────────────────────────────
    const handleResume = useCallback(() => {
        const video = videoRef.current;
        if (!video || !resumePrompt) return;
        video.currentTime = resumePrompt.time;
        setCurrentTime(resumePrompt.time);
        setResumePrompt(null);
        video.play().catch(() => {});
    }, [resumePrompt]);

    const handleStartOver = useCallback(() => {
        if (videoId) setProgressMap(prev => { const n = { ...prev }; delete n[videoId]; return n; });
        setResumePrompt(null);
        videoRef.current?.play().catch(() => {});
    }, [videoId, setProgressMap]);

    // ── Playback controls ─────────────────────────────────────────────────────
    const handleReplay = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        setEndedState(null);
        video.currentTime = 0;
        video.play().catch(() => {});
    }, []);

    const handleCancelCountdown = useCallback(() => {
        if (countdownRef.current) clearInterval(countdownRef.current);
        setEndedState('replay');
    }, []);

    const handlePlayNextNow = useCallback(() => {
        if (countdownRef.current) clearInterval(countdownRef.current);
        setEndedState(null);
        onNext?.();
    }, [onNext]);

    const togglePlay = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (video.readyState < 2) { setIsLoading(true); return; }
        if (endedState === 'replay') { handleReplay(); return; }
        try {
            if (isPlaying) video.pause();
            else video.play().catch(() => { setError('Failed to play video'); setIsPlaying(false); });
        } catch (_) { setError('Failed to play video'); }
    }, [isPlaying, endedState, handleReplay]);

    const seekBy = useCallback((seconds) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
        setCurrentTime(video.currentTime);
    }, []);

    // ── Seek bar helpers ──────────────────────────────────────────────────────
    const getPctFromEvent = useCallback((e) => {
        const bar = seekBarRef.current;
        if (!bar) return 0;
        const rect = bar.getBoundingClientRect();
        const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    }, []);

    // ── Seek bar: click (no drag) ─────────────────────────────────────────────
    const handleSeekClick = useCallback((e) => {
        // Handled by pointerup after drag; this catches click-only (pointerdown+up in place)
        if (isDraggingRef.current) return;
        const pct = getPctFromEvent(e);
        const newTime = pct * duration;
        if (videoRef.current) { videoRef.current.currentTime = newTime; setCurrentTime(newTime); }
    }, [duration, getPctFromEvent]);

    // ── Seek bar: pointer events for drag ────────────────────────────────────
    const handleSeekPointerDown = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        const bar = seekBarRef.current;
        if (!bar) return;

        // Capture pointer so we receive move/up even when outside element
        bar.setPointerCapture(e.pointerId);

        const pct = getPctFromEvent(e);
        isDraggingRef.current = true;
        setIsDragging(true);
        setDragPct(pct);
        setCurrentTime(pct * duration);

        // Keep controls visible while dragging
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }, [duration, getPctFromEvent]);

    const handleSeekPointerMove = useCallback((e) => {
        if (!isDraggingRef.current) return;
        e.preventDefault();
        const pct = getPctFromEvent(e);
        setDragPct(pct);
        setCurrentTime(pct * duration);
        // Live-scrub video
        if (videoRef.current) videoRef.current.currentTime = pct * duration;
    }, [duration, getPctFromEvent]);

    const handleSeekPointerUp = useCallback((e) => {
        if (!isDraggingRef.current) return;
        const pct = getPctFromEvent(e);
        const newTime = pct * duration;
        if (videoRef.current) { videoRef.current.currentTime = newTime; setCurrentTime(newTime); }
        isDraggingRef.current = false;
        setIsDragging(false);
        setDragPct(null);
        // Resume hide timer if playing
        if (isPlaying) scheduleHide();
    }, [duration, getPctFromEvent, isPlaying, scheduleHide]);

    // ── Seek bar: hover for tooltip ───────────────────────────────────────────
    const handleSeekMouseMove = useCallback((e) => {
        if (isDraggingRef.current) return;
        setHoverPct(getPctFromEvent(e));
    }, [getPctFromEvent]);

    const handleSeekMouseLeave = useCallback(() => {
        if (!isDraggingRef.current) setHoverPct(null);
    }, []);

    const handleVolumeChange = (e) => {
        const v = parseFloat(e.target.value);
        if (v > 0) lastVolumeRef.current = v;
        setVolume(v);
        setIsMuted(v === 0);
    };

    const toggleMute = () => {
        if (isMuted) {
            const restore = lastVolumeRef.current > 0 ? lastVolumeRef.current : 1;
            setIsMuted(false);
            setVolume(restore);
        } else {
            if (volume > 0) lastVolumeRef.current = volume;
            setIsMuted(true);
        }
    };

    const adjustVolume = useCallback((delta) => {
        const current = isMuted ? 0 : volume;
        const newVol  = Math.max(0, Math.min(1, current + delta));
        if (newVol > 0) lastVolumeRef.current = newVol;
        setVolume(newVol);
        setIsMuted(newVol === 0);
        if (volumeIndicatorTimer.current) clearTimeout(volumeIndicatorTimer.current);
        setVolumeIndicator(Math.round(newVol * 100));
        volumeIndicatorTimer.current = setTimeout(() => setVolumeIndicator(null), 1500);
    }, [volume, isMuted, setVolume, setIsMuted]);

    const toggleFullscreen = useCallback(async () => {
        const target = containerRef.current;
        if (!target) return;
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                await target.requestFullscreen();
                if (screen.orientation?.lock) {
                    try { await screen.orientation.lock('landscape'); } catch (_) {}
                }
            }
        } catch (_) {}
    }, []);

    const handleQualityChange = (quality) => {
        const time = videoRef.current?.currentTime || 0;
        const playing = isPlaying;
        setSelectedQuality(quality);
        if (videoRef.current) {
            videoRef.current.currentTime = time;
            if (playing) videoRef.current.play();
        }
        setShowSettings(false);
    };

    const showSkipIndicator = useCallback((side, seconds = 10) => {
        const accum = skipAccumRef.current;
        if (accum.hideTimer) { clearTimeout(accum.hideTimer); accum.hideTimer = null; }
        const newTotal = accum.side === side ? accum.total + seconds : seconds;
        skipAccumRef.current.side  = side;
        skipAccumRef.current.total = newTotal;
        setSkipIndicator({ side, seconds: newTotal });
        accum.hideTimer = setTimeout(() => {
            setSkipIndicator(null);
            skipAccumRef.current = { side: null, total: 0, hideTimer: null };
        }, 800);
    }, []);

    // ── Keyboard shortcuts ────────────────────────────────────────────────────
    useEffect(() => {
        const onKeyDown = (e) => {
            const tag = e.target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;

            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    seekBy(-10);
                    showSkipIndicator('left');
                    showAndScheduleHide();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    seekBy(10);
                    showSkipIndicator('right');
                    showAndScheduleHide();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    adjustVolume(0.1);
                    showAndScheduleHide();
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    adjustVolume(-0.1);
                    showAndScheduleHide();
                    break;
                case ' ':
                case 'Enter':
                    e.preventDefault();
                    togglePlay();
                    showAndScheduleHide();
                    break;
                default:
                    break;
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [seekBy, togglePlay, showAndScheduleHide, adjustVolume, showSkipIndicator]);

    // ── Touch / Mouse ─────────────────────────────────────────────────────────
    const handleMouseMove = () => showAndScheduleHide();

    const handleDoubleClick = useCallback((e) => {
        if (e.target.closest('[data-controls]')) return;
        if (suppressClickRef.current) return;
        toggleFullscreen();
    }, [toggleFullscreen]);

    const handleTap = useCallback((e) => {
        if (e.target.closest('[data-controls]')) return;

        suppressClickRef.current = true;
        clearTimeout(suppressClickRef._timer);
        suppressClickRef._timer = setTimeout(() => { suppressClickRef.current = false; }, 400);

        const now  = Date.now();
        const rect = containerRef.current?.getBoundingClientRect();
        const tapX = e.changedTouches?.[0]?.clientX ?? e.clientX ?? 0;
        const relX = rect ? tapX - rect.left : 0;
        const side = relX < (rect?.width ?? 1) / 2 ? 'left' : 'right';
        const timeSinceLast = now - lastTapRef.current.time;

        if (timeSinceLast < 300) {
            if (doubleTapTimerRef.current) { clearTimeout(doubleTapTimerRef.current); doubleTapTimerRef.current = null; }
            seekBy(side === 'right' ? 10 : -10);
            showSkipIndicator(side);
            lastTapRef.current = { time: 0, x: 0 };
        } else {
            lastTapRef.current = { time: now, x: tapX };
            const controlsWereVisible = showControls;
            doubleTapTimerRef.current = setTimeout(() => {
                doubleTapTimerRef.current = null;
                if (controlsWereVisible) {
                    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
                    setShowControls(false);
                } else {
                    showAndScheduleHide();
                }
            }, 300);
        }
    }, [showControls, seekBy, showSkipIndicator, showAndScheduleHide]);

    // ── Helpers ───────────────────────────────────────────────────────────────
    // Use dragPct while dragging, else normal playback progress
    const displayPct   = isDragging && dragPct !== null ? dragPct * 100 : (duration > 0 ? (currentTime / duration) * 100 : 0);
    const tooltipPct   = hoverPct ?? (isDragging && dragPct !== null ? dragPct : null);
    const tooltipTime  = tooltipPct !== null ? tooltipPct * duration : null;

    const formatTime = (s) => {
        if (isNaN(s) || !isFinite(s)) return '0:00';
        const h   = Math.floor(s / 3600);
        const m   = Math.floor((s % 3600) / 60);
        const sec = Math.floor(s % 60);
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    if (!videoUrl) {
        return (
            <div className={isEmbedded ? 'relative w-full h-full bg-black flex items-center justify-center' : 'fixed inset-0 bg-black z-50 flex items-center justify-center'}>
                <p className="text-white text-xl">No video source provided</p>
            </div>
        );
    }

    const effectiveVolume = isMuted ? 0 : volume;

    return (
        <div
            ref={containerRef}
            className={`${isEmbedded ? 'relative w-full h-full' : 'fixed inset-0 z-50'} bg-black select-none`}
            onMouseMove={handleMouseMove}
            onTouchEnd={handleTap}
            onDoubleClick={handleDoubleClick}
            onClick={(e) => {
                if (e.detail > 1) return;
                if (suppressClickRef.current) return;
                if (e.target.closest('[data-controls]')) return;
                togglePlay();
                showAndScheduleHide();
            }}
        >
            {/* Video element */}
            <video
                ref={videoRef}
                src={videoUrl}
                className="w-full h-full object-contain"
                playsInline
                crossOrigin="anonymous"
            />

            {/* Resume prompt */}
            {resumePrompt && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20" data-controls>
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm mx-4 text-center shadow-2xl space-y-4">
                        <p className="text-white text-lg font-semibold">Continue watching?</p>
                        <p className="text-slate-400 text-sm">
                            You left off at <span className="text-white font-mono">{formatTime(resumePrompt.time)}</span>
                        </p>
                        <div className="flex gap-3">
                            <button onClick={handleStartOver} className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm font-medium transition whitespace-nowrap">
                                Start Over
                            </button>
                            <button onClick={handleResume} className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 rounded-xl text-sm font-medium transition">
                                Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                    <div className="bg-red-600/90 backdrop-blur-sm rounded-xl p-6 max-w-sm mx-4 text-center">
                        <p className="text-white text-lg mb-4">{error}</p>
                        <button data-controls onClick={() => { setError(null); setIsLoading(true); videoRef.current?.load(); }}
                            className="px-5 py-2 bg-white text-red-600 font-semibold rounded-lg hover:bg-gray-100 transition">
                            Retry
                        </button>
                    </div>
                </div>
            )}

            {/* Volume HUD */}
            {volumeIndicator !== null && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30 animate-fade-in">
                    <div className="bg-black/70 backdrop-blur-sm rounded-2xl px-6 py-4 flex items-center gap-2 min-w-30">
                        {volumeIndicator === 0
                            ? <VolumeX className="w-5 h-5 text-white" />
                            : volumeIndicator < 50
                                ? <Volume1 className="w-5 h-5 text-white" />
                                : <Volume2 className="w-5 h-5 text-white" />}
                        <div className="w-24 h-1 bg-white/30 rounded-full overflow-hidden">
                            <div className="h-full bg-white rounded-full transition-all duration-150" style={{ width: `${volumeIndicator}%` }} />
                        </div>
                        <span className="text-white text-xs font-mono">{volumeIndicator}%</span>
                    </div>
                </div>
            )}

            {/* Controls overlay */}
            {!endedState && !volumeIndicator && (
                <div
                    className={`absolute inset-0 transition-opacity duration-300 flex flex-col justify-end ${showControls && !resumePrompt ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                    style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 30%, transparent 60%, rgba(0,0,0,0.8) 100%)' }}
                >
                    {/* Center area: skip indicators + play button */}
                    {!error && (
                        <div className='flex-1 flex items-center justify-center cursor-pointer'>
                            <div className="pointer-events-none flex-1 flex flex-col items-center gap-1">
                                {skipIndicator?.side === 'left' && (
                                    <div className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 text-white font-bold text-sm">
                                        « {skipIndicator.seconds}s
                                    </div>
                                )}
                            </div>

                            <button onClick={togglePlay} className="p-5 sm:p-6 bg-red-500 rounded-full transition hover:scale-110 shadow-2xl opacity-40" data-controls>
                                {isLoading
                                    ? <RefreshCw className="w-10 h-10 sm:w-12 sm:h-12 text-white animate-spin" />
                                    : isPlaying
                                        ? <Pause className="w-10 h-10 sm:w-12 sm:h-12 text-white" fill="currentColor" />
                                        : <Play className="w-10 h-10 sm:w-12 sm:h-12 text-white" fill="currentColor" />}
                            </button>

                            <div className="pointer-events-none flex-1 flex flex-col items-center gap-1">
                                {skipIndicator?.side === 'right' && (
                                    <div className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 text-white font-bold text-sm">
                                        {skipIndicator.seconds}s »
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Bottom controls */}
                    <div className="px-3 pb-3 sm:px-4 sm:pb-4 space-y-1" data-controls>

                        {/* ── Seek bar ────────────────────────────────────────────────────────── */}
                        <div
                            ref={seekBarRef}
                            data-controls
                            className="relative flex items-center cursor-pointer group"
                            // Tall invisible hit zone: 28px total, visual bar is 6px centred inside
                            style={{ height: 28, touchAction: 'none' }}
                            onPointerDown={handleSeekPointerDown}
                            onPointerMove={handleSeekPointerMove}
                            onPointerUp={handleSeekPointerUp}
                            onPointerCancel={handleSeekPointerUp}
                            onMouseMove={handleSeekMouseMove}
                            onMouseLeave={handleSeekMouseLeave}
                        >
                            {/* Hover time tooltip */}
                            {tooltipTime !== null && (
                                <div
                                    className="absolute bottom-full mb-2 -translate-x-1/2 pointer-events-none z-40"
                                    style={{ left: `${(tooltipPct ?? 0) * 100}%` }}
                                >
                                    <div className="bg-black/80 backdrop-blur-sm rounded-md px-2 py-1 text-white text-xs font-mono whitespace-nowrap shadow-lg">
                                        {formatTime(tooltipTime)}
                                    </div>
                                </div>
                            )}

                            {/* Track background */}
                            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-white/30 rounded-full overflow-hidden pointer-events-none">
                                {/* Filled portion */}
                                <div
                                    className="h-full bg-red-500 rounded-full"
                                    style={{ width: `${displayPct}%`, transition: isDragging ? 'none' : undefined }}
                                />
                            </div>

                            {/* Hover preview tint */}
                            {tooltipPct !== null && (
                                <div
                                    className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-white/15 rounded-full pointer-events-none"
                                    style={{ left: `${displayPct}%`, width: `${Math.max(0, (tooltipPct - displayPct / 100) * 100)}%` }}
                                />
                            )}

                            {/* Thumb — always visible while dragging, hover-only otherwise */}
                            <div
                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-md pointer-events-none transition-transform duration-100"
                                style={{
                                    left: `${displayPct}%`,
                                    opacity: isDragging || hoverPct !== null ? 1 : 0,
                                    transform: `translateX(-50%) scale(${isDragging ? 1.3 : 1})`,
                                }}
                            />
                        </div>

                        {/* Buttons row */}
                        <div className="flex items-center justify-between gap-2">
                            {/* Left controls */}
                            <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                                <button onClick={endedState === 'replay' ? handleReplay : togglePlay}
                                    className="p-1.5 sm:p-2 hover:bg-white/20 rounded-lg transition"
                                    disabled={isLoading || !!error}
                                    title={endedState === 'replay' ? 'Replay' : isPlaying ? 'Pause' : 'Play'}
                                >
                                    {endedState === 'replay'
                                        ? <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
                                        : isPlaying
                                            ? <Pause className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
                                            : <Play className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />}
                                </button>

                                {(hasPrevious || hasNext) && (
                                    <>
                                        {hasPrevious && onPrevious && (
                                            <button onClick={onPrevious} className="p-1.5 sm:p-2 hover:bg-white/20 rounded-lg transition" title="Previous Episode">
                                                <SkipBack className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
                                            </button>
                                        )}
                                        {hasNext && onNext && (
                                            <button onClick={onNext} className="p-1.5 sm:p-2 hover:bg-white/20 rounded-lg transition" title="Next Episode">
                                                <SkipForward className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
                                            </button>
                                        )}
                                    </>
                                )}

                                {/* Volume */}
                                <div className="flex items-center gap-1 group/vol">
                                    <button onClick={toggleMute} className="p-1.5 sm:p-2 hover:bg-white/20 rounded-lg transition">
                                        {(isMuted || volume === 0)
                                            ? <VolumeX className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
                                            : volume < 0.5
                                                ? <Volume1 className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
                                                : <Volume2 className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />}
                                    </button>
                                    <input type="range" min="0" max="1" step="0.05"
                                        value={effectiveVolume} onChange={handleVolumeChange}
                                        className="w-0 group-hover/vol:w-16 sm:group-hover/vol:w-20 transition-all opacity-0 group-hover/vol:opacity-100 accent-red-500"
                                    />
                                </div>

                                {/* Time */}
                                <span className="text-xs sm:text-sm text-white/80 font-mono whitespace-nowrap">
                                    {formatTime(currentTime)} / {formatTime(duration)}
                                </span>
                            </div>

                            {/* Right controls */}
                            <div className="flex items-center gap-1 shrink-0">
                                {availableQualities.length > 0 && (
                                    <div className="relative">
                                        <button onClick={() => setShowSettings(v => !v)} className="p-1.5 sm:p-2 hover:bg-white/20 rounded-lg transition">
                                            <Settings className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
                                        </button>
                                        {showSettings && (
                                            <div className="absolute bottom-full right-0 mb-2 bg-slate-900 rounded-lg overflow-hidden border border-slate-700 min-w-32 shadow-xl">
                                                <div className="px-3 py-2 text-xs text-slate-400 border-b border-slate-700 uppercase tracking-wide">Quality</div>
                                                {availableQualities.map(q => (
                                                    <button key={q} onClick={() => handleQualityChange(q)}
                                                        className={`w-full text-left px-4 py-2 hover:bg-slate-800 transition text-sm ${selectedQuality === q ? 'text-red-500' : 'text-white'}`}>
                                                        {q}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <button onClick={toggleFullscreen} className="p-1.5 sm:p-2 hover:bg-white/20 rounded-lg transition">
                                    {isFullscreen
                                        ? <Minimize className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
                                        : <Maximize className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Replay */}
            {(endedState === 'replay' || endedState === 'countdown') && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10" data-controls>
                    {endedState === 'replay' && (
                        <button onClick={handleReplay} className="flex flex-col items-center gap-3 p-6 sm:p-8 bg-red-500/90 hover:bg-red-500 rounded-full transition hover:scale-110 shadow-2xl">
                            <RotateCcw className="w-12 h-12 sm:w-14 sm:h-14 text-white" />
                        </button>
                    )}
                    {endedState === 'countdown' && (
                        <>
                            <div className="relative w-24 h-24 sm:w-30 sm:h-30 rounded-full bg-red-500/90 hover:bg-red-500 transition hover:scale-110 shadow-2xl">
                                <svg className="w-full h-full -rotate-90 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" viewBox="0 0 80 80">
                                    <circle cx="40" cy="40" r="34" fill="none" stroke="white" strokeWidth="6"
                                        strokeDasharray={`${2 * Math.PI * 34}`}
                                        strokeDashoffset={`${2 * Math.PI * 34 * (1 - countdown / 10)}`}
                                        strokeLinecap="round"
                                        style={{ transition: 'stroke-dashoffset 0.9s linear' }}
                                    />
                                </svg>
                                <button
                                    onClick={handlePlayNextNow}
                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center text-2xl font-bold text-white"
                                >
                                    <Play className='w-12 h-12 sm:w-14 text-white' fill='white' />
                                </button>
                            </div>
                            <button onClick={handleCancelCountdown} className="mt-2 px-3 py-1.5 rounded-lg hover:bg-slate-700/30 transition cursor-pointer">Cancel</button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default VideoPlayer;