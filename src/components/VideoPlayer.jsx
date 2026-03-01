import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Settings, SkipBack, SkipForward, RefreshCcw, RotateCcw, Volume1, RefreshCw } from 'lucide-react';
import useMyStorage from '../utils/localStorage';

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
    const [resumePrompt, setResumePrompt] = useState(null);
    const [endedState, setEndedState] = useState(null);
    const [countdown, setCountdown] = useState(10);
    const countdownRef = useRef(null);

    const controlsTimeoutRef = useRef(null);
    const lastTapRef = useRef({ time: 0, x: 0 });
    const doubleTapTimerRef = useRef(null);
    const suppressClickRef = useRef(false);
    const shouldAutoPlayRef = useRef(false);

    // ── View-count tracking ───────────────────────────────────────────────────
    // Accumulates actual seconds played (ignoring seeks/pauses).
    // Fires onView() exactly once when ≥ 30 s have been played.
    const playedTimeRef  = useRef(0);
    const lastTimeRef    = useRef(0);
    const viewTrackedRef = useRef(false);

    // Reset tracking whenever the video/id changes
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
            const t = video.currentTime;
            const d = video.duration;
            setCurrentTime(t);

            // ── Accumulate real played time (skip large jumps = seeks) ──
            if (!video.paused) {
                const delta = t - lastTimeRef.current;
                if (delta > 0 && delta < 2) {       // <2 s gap = normal playback
                    playedTimeRef.current += delta;
                }
            }
            lastTimeRef.current = t;

            // ── Fire view once after 30 s of actual playback ──
            if (
                !viewTrackedRef.current &&
                playedTimeRef.current >= 30 &&
                onView
            ) {
                viewTrackedRef.current = true;
                try { onView(); } catch (_) {}
            }

            // ── Save resume progress (between 5 s and 80% watched) ──
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
                        if (prev <= 1) {
                            clearInterval(countdownRef.current);
                            onNext?.();
                            return 0;
                        }
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

    const handleSeek = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX ?? e.touches?.[0]?.clientX ?? 0) - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        const newTime = pct * duration;
        if (videoRef.current) { videoRef.current.currentTime = newTime; setCurrentTime(newTime); }
    };

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

    const toggleFullscreen = async () => {
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
    };

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

    // ── Touch / Mouse ─────────────────────────────────────────────────────────
    const handleMouseMove = () => showAndScheduleHide();

    const showSkipIndicator = (side) => {
        setSkipIndicator({ side, key: Date.now() });
        setTimeout(() => setSkipIndicator(null), 700);
    };

    const handleTap = useCallback((e) => {
        if (e.target.closest('[data-controls]')) return;

        suppressClickRef.current = true;
        clearTimeout(suppressClickRef._timer);
        suppressClickRef._timer = setTimeout(() => { suppressClickRef.current = false; }, 400);

        const now = Date.now();
        const rect = containerRef.current?.getBoundingClientRect();
        const tapX = e.changedTouches?.[0]?.clientX ?? e.clientX ?? 0;
        const relX = rect ? tapX - rect.left : 0;
        const width = rect?.width ?? 1;
        const side = relX < width / 2 ? 'left' : 'right';
        const timeSinceLast = now - lastTapRef.current.time;

        if (timeSinceLast < 300) {
            if (doubleTapTimerRef.current) { clearTimeout(doubleTapTimerRef.current); doubleTapTimerRef.current = null; }
            seekBy(side === 'right' ? 10 : -10);
            showSkipIndicator(side);
            lastTapRef.current = { time: 0, x: 0 };
            showAndScheduleHide();
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
    }, [showControls, seekBy, showAndScheduleHide]);

    // ── Helpers ───────────────────────────────────────────────────────────────
    const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

    const formatTime = (s) => {
        if (isNaN(s) || !isFinite(s)) return '0:00';
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
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
            onClick={(e) => { if (e.target === videoRef.current) return; }}
        >
            {/* Video element */}
            <video
                ref={videoRef}
                src={videoUrl}
                className="w-full h-full object-contain"
                onClick={(e) => { if (suppressClickRef.current) return; togglePlay(); }}
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

            {/* Controls overlay */}
            <div
                className={`absolute inset-0 transition-opacity duration-300 flex flex-col justify-end ${showControls && !resumePrompt ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 30%, transparent 60%, rgba(0,0,0,0.8) 100%)' }}
            >
                {/* Center play/pause button */}
                {!error && !endedState && (
                    <div className='flex-1 flex items-center justify-center cursor-pointer'>
                        <div className="pointer-events-none flex-1 flex flex-col items-center gap-1">
                            {skipIndicator?.side === 'left' && <div className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 text-white font-bold text-sm">« 10s</div>}
                        </div>
                        <button onClick={togglePlay} className="p-5 sm:p-6 bg-red-500 rounded-full transition hover:scale-110 shadow-2xl opacity-40">
                            {isLoading
                                ? <RefreshCw className="w-10 h-10 sm:w-12 sm:h-12 text-white animate-spin" />
                                : isPlaying
                                    ? <Pause className="w-10 h-10 sm:w-12 sm:h-12 text-white" fill="currentColor" />
                                    : <Play className="w-10 h-10 sm:w-12 sm:h-12 text-white" fill="currentColor" />}
                        </button>
                        <div className="pointer-events-none flex-1 flex flex-col items-center gap-1">
                            {skipIndicator?.side === 'right' && <div className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 text-white font-bold text-sm">10s »</div>}
                        </div>
                    </div>
                )}

                {/* Bottom controls */}
                <div className="px-3 pb-3 sm:px-4 sm:pb-4 space-y-2" data-controls>
                    {/* Progress bar */}
                    <div className="h-1.5 bg-white/30 rounded-full cursor-pointer group relative" onClick={handleSeek}>
                        <div className="h-full bg-red-500 rounded-full relative transition-none" style={{ width: `${progressPct}%` }}>
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
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
                            <div className="flex items-center gap-1 group">
                                <button onClick={toggleMute} className="p-1.5 sm:p-2 hover:bg-white/20 rounded-lg transition">
                                    {(isMuted || volume === 0)
                                        ? <VolumeX className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
                                        : volume < 0.5
                                            ? <Volume1 className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
                                            : <Volume2 className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />}
                                </button>
                                <input type="range" min="0" max="1" step="0.05"
                                    value={effectiveVolume} onChange={handleVolumeChange}
                                    className="w-0 group-hover:w-16 sm:group-hover:w-20 transition-all opacity-0 group-hover:opacity-100 accent-red-500"
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

            {/* Countdown to next */}
            {endedState === 'countdown' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10" data-controls>
                    <div className="bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-2xl p-4 max-w-xs mx-4 text-center shadow-2xl space-y-4">
                        <div className="relative w-20 h-20 mx-auto">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                                <circle cx="40" cy="40" r="34" fill="none" stroke="#334155" strokeWidth="6" />
                                <circle cx="40" cy="40" r="34" fill="none" stroke="#ef4444" strokeWidth="6"
                                    strokeDasharray={`${2 * Math.PI * 34}`}
                                    strokeDashoffset={`${2 * Math.PI * 34 * (1 - countdown / 10)}`}
                                    strokeLinecap="round"
                                    style={{ transition: 'stroke-dashoffset 0.9s linear' }}
                                />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-white">{countdown}</span>
                        </div>
                        <p className="text-white font-semibold">Next episode in {countdown}s</p>
                        <div className="flex gap-3">
                            <button onClick={handleCancelCountdown} className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm font-medium transition">Cancel</button>
                            <button onClick={handlePlayNextNow} className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 rounded-xl text-sm font-medium transition whitespace-nowrap">Play Now</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Replay */}
            {endedState === 'replay' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10" data-controls>
                    <button onClick={handleReplay} className="flex flex-col items-center gap-3 p-6 sm:p-8 bg-red-500/90 hover:bg-red-500 rounded-full transition hover:scale-110 shadow-2xl">
                        <RotateCcw className="w-12 h-12 sm:w-14 sm:h-14 text-white" />
                        <span className="text-white text-sm font-semibold -mt-1">Replay</span>
                    </button>
                </div>
            )}
        </div>
    );
}

export default VideoPlayer;