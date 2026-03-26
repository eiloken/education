import React, { useRef, useEffect, useState, useCallback } from 'react';
import Hls from 'hls.js'
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Settings, SkipBack, SkipForward, RefreshCcw, RotateCcw, Volume1, RefreshCw } from 'lucide-react';
import useMyStorage from '../../utils/localStorage';
import { historyAPI } from '../../api/api';

// ─── Component ────────────────────────────────────────────────────────────────
function VideoPlayer({
    videoId,
    videoUrl,
    hlsUrl,
    availableQualities = [],
    onPrevious = null,
    onNext = null,
    hasPrevious = false,
    hasNext = false,
    autoPlayNext = false,
    isEmbedded = false,
    onView = null,          // Called once after 30 s of actual playback
    title = null,           // Episode / video title shown in the top bar
    seriesTitle = null,     // Series name shown as subtitle in the top bar
    episodeLabel = null,    // e.g. "S01 · E03"
}) {
    const videoRef = useRef(null);
    const containerRef = useRef(null);
    const hlsRef = useRef(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    const [volume, setVolume]   = useMyStorage('vibeflix_volume', 1);
    const [isMuted, setIsMuted] = useMyStorage('vibeflix_muted', false);
    const lastVolumeRef = useRef(volume > 0 ? volume : 1);

    // ── Server-side progress tracking ─────────────────────────────────────────
    const savedProgressRef   = useRef(0);    // seconds fetched from server on mount
    const progressSaveTimer  = useRef(null); // setInterval handle — fires every 15 s
    const videoReadyRef      = useRef(false); // true once onCanPlay has fired for the current src

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

    const [hlsLevels, setHlsLevels] = useState([]);
    const [hlsLevel, setHlsLevel] = useState(-1);

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

        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }

        video.pause();
        video.removeAttribute('src');
        video.load();

        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        setSelectedQuality('');
        setError(null);
        setIsLoading(true);
        setEndedState(null);
        setCountdown(10);
        setHlsLevels([]);
        setHlsLevel(-1);
        if (countdownRef.current) clearInterval(countdownRef.current);

        video.volume = isMuted ? 0 : volume;
        video.muted  = isMuted;

        // Cancel any in-flight progress interval from the previous video
        if (progressSaveTimer.current) clearInterval(progressSaveTimer.current);
        progressSaveTimer.current = null;
        savedProgressRef.current  = 0;
        videoReadyRef.current     = false;
        setResumePrompt(null);

        // Default to NOT auto-playing — we wait for the progress fetch to decide.
        // This prevents the race where onCanPlay fires before the async fetch resolves
        // and auto-plays the video before we know there is saved progress to resume.
        shouldAutoPlayRef.current = false;

        if (videoId) {
            historyAPI.getProgress(videoId).then(({ progress, duration: savedDur }) => {
                savedProgressRef.current = progress || 0;

                // A progress >= 98 % of the recorded duration means the user finished
                // the video — treat it as a fresh start (no resume prompt, play from 0).
                const isComplete = savedDur > 0 && progress >= savedDur * 0.98;

                if (progress > 5 && !isComplete) {
                    // Mid-video: show the resume prompt, keep autoplay suppressed.
                    // Also explicitly pause — MANIFEST_PARSED or onCanPlay may have
                    // already fired while the fetch was in-flight (race condition).
                    shouldAutoPlayRef.current = false;
                    videoRef.current?.pause();
                    setResumePrompt({ time: progress });
                } else {
                    // No progress, < 5 s, or already finished: play from the beginning
                    shouldAutoPlayRef.current = true;
                    // If onCanPlay already fired while the fetch was in flight, play now
                    if (videoReadyRef.current) {
                        videoRef.current?.play().catch(() => {});
                    }
                }
            }).catch(() => {
                // On network error fall back to normal autoplay
                shouldAutoPlayRef.current = true;
                if (videoReadyRef.current) {
                    videoRef.current?.play().catch(() => {});
                }
            });

            // ── Progress save interval ────────────────────────────────────────
            const SAVE_INTERVAL_MS = 15_000;
            progressSaveTimer.current = setInterval(() => {
                const v = videoRef.current;
                if (!v || v.paused || v.ended) return;
                const t = v.currentTime;
                const d = v.duration;
                if (d > 0 && t > 5 && t < d * 0.98) {
                    historyAPI.saveProgress(videoId, Math.floor(t), Math.floor(d)).catch(() => {});
                }
            }, SAVE_INTERVAL_MS);
        } else {
            // No videoId — just autoplay immediately
            shouldAutoPlayRef.current = true;
        }

        if (hlsUrl && Hls.isSupported()) {
            // ── Pick a preferred start level (480p) ───────────────────────────
            // startLevel -1 = auto; we override once MANIFEST_PARSED fires.
            const hls = new Hls({
                startLevel: -1,
                autoLevelEnabled: true,
                capLevelToPlayerSize: true,
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
                maxBufferSize: 60 * 1000 * 1000,
                manifestLoadingMaxRetry: 3,
                levelLoadingMaxRetry: 3,
                fragLoadingMaxRetry: 4,
            });

            hls.loadSource(hlsUrl);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
                const levels = data.levels.map((lvl, idx) => ({
                    index: idx,
                    label: lvl.name || (lvl.height ? `${lvl.height}p` : `Level ${idx}`),
                    height: lvl.height || 0,
                }));
                setHlsLevels(levels);

                // Choose 480p as default; fall back to next-lowest, then lowest
                const preferred = 480;
                let chosenIdx = -1; // -1 = auto
                // Try exact match first
                const exact = levels.find(l => l.height === preferred);
                if (exact) {
                    chosenIdx = exact.index;
                } else {
                    // Pick the highest level that is ≤ 480p, or lowest available
                    const below = levels.filter(l => l.height > 0 && l.height <= preferred);
                    if (below.length > 0) {
                        chosenIdx = below.reduce((a, b) => b.height > a.height ? b : a).index;
                    } else if (levels.length > 0) {
                        chosenIdx = levels[0].index; // lowest quality as safe fallback
                    }
                }
                if (chosenIdx !== -1) {
                    hls.startLevel = chosenIdx;
                    hls.currentLevel = chosenIdx;
                    setHlsLevel(chosenIdx);
                }

                if (shouldAutoPlayRef.current) {
                    video.play().catch(() => {});
                }
            });

            hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
                setHlsLevel(data.level);
            });

            hls.on(Hls.Events.ERROR, (_, data) => {
                if (data.fatal) {
                    console.error('HLS error:', data);
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        hls.startLoad();
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        hls.recoverMediaError();
                    } else {
                        hls.destroy();
                        hlsRef.current = null;
                        // Fallback to raw stream
                        video.src = videoUrl;
                        video.load();
                    }
                }
            });

            hlsRef.current = hls;
        } else if (hlsUrl && video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = hlsUrl;
            if (shouldAutoPlayRef.current) {
                video.play().catch(() => {});
            }
        } else {
            video.src = videoUrl;
            if (shouldAutoPlayRef.current) {
                video.play().catch(() => {});
            }
        }

        return () => {
            if (progressSaveTimer.current) clearInterval(progressSaveTimer.current);
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
        }
    }, [videoUrl, hlsUrl, videoId]);

    // ── Cleanup countdown on unmount ──────────────────────────────────────────
    useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

    // ── Fire onNext when countdown expires ───────────────────────────────────
    // onNext must NOT be called inside the setCountdown updater (updaters must
    // be pure — calling setState on a parent component from there triggers the
    // "Cannot update a component while rendering a different component" warning).
    // Instead, we watch countdown reach 0 here in a plain effect.
    useEffect(() => {
        if (countdown === 0 && endedState === 'countdown') {
            onNext?.();
        }
    }, [countdown, endedState, onNext]);

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
        };

        const onPlay  = () => setIsPlaying(true);
        const onPause = () => {
            setIsPlaying(false);
            // Flush progress immediately on pause so the position isn't lost
            // between the 15-second interval ticks
            const t = video.currentTime;
            const d = video.duration;
            if (videoId && d > 0 && t > 5 && t < d * 0.98) {
                historyAPI.saveProgress(videoId, Math.floor(t), Math.floor(d)).catch(() => {});
            }
        };

        const onEnded = () => {
            setIsPlaying(false);
            // Eagerly save 100 % so the history card shows a full bar and the
            // next load knows the video was completed (starts fresh, no resume prompt).
            const d = Math.floor(video.duration || 0);
            if (videoId && d > 0) {
                historyAPI.saveProgress(videoId, d, d).catch(() => {});
            }

            if (hasNext) {
                setEndedState('countdown');
                setCountdown(10);
                if (countdownRef.current) clearInterval(countdownRef.current);
                countdownRef.current = setInterval(() => {
                    setCountdown(prev => {
                        if (prev <= 1) {
                            clearInterval(countdownRef.current);
                            return 0; // onNext is fired by the useEffect below — NOT here
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
            videoReadyRef.current = true;
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
    }, [autoPlayNext, hasNext, onNext, videoId, onView]);

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
        const video = videoRef.current;
        if (videoId) historyAPI.clearProgress(videoId).catch(() => {});
        setResumePrompt(null);
        if (video) video.currentTime = 0;
        video?.play().catch(() => {});
    }, [videoId]);

    // ── Playback controls ─────────────────────────────────────────────────────
    const handleReplay = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        setEndedState(null);
        video.currentTime = 0;
        // Do NOT reset history here — the video ended at 100 % and we want
        // to keep that record. The 15 s interval will naturally overwrite it
        // with real positions as the user rewatches.
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

    const handleQualityChange = useCallback((levelIndexOrLabel) => {
        setShowSettings(false);
        if (hlsRef.current) {
            hlsRef.current.currentLevel = levelIndexOrLabel;
            setHlsLevel(levelIndexOrLabel);
        } else {
            setSelectedQuality(levelIndexOrLabel);
            const video = videoRef.current;
            if (!video) return;
            const saved = video.currentTime;
            const wasPlaying = !video.paused;
            video.src = `${videoUrl}?quality=${levelIndexOrLabel}`;
            video.load();
            video.currentTime = saved;
            if (wasPlaying) video.play().catch(() => {});
        }
    }, [videoUrl]);

    const hasQualityOptions = hlsLevels.length > 0 || availableQualities.length > 0;

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
                    className={`absolute inset-0 transition-opacity duration-300 flex flex-col justify-between ${showControls && !resumePrompt ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                    style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 28%, transparent 58%, rgba(0,0,0,0.85) 100%)' }}
                >
                    {/* ── Top title bar (mirrors height of bottom controls) ─── */}
                    <div className="px-2 pt-2 pb-1 sm:px-3 sm:pt-3 sm:pb-2 md:px-4 md:pt-4 space-y-0.5" data-controls>
                        <div className="flex items-center gap-2 min-h-7 sm:min-h-8 md:min-h-9 text-white text-xs sm:text-sm md:text-base">
                            {title && (
                                <p className="font-semibold truncate leading-tight drop-shadow">
                                    {title}
                                </p>
                            )}
                            {title && seriesTitle && (
                                <span className="leading-none">·</span>
                            )}
                            <div className="flex items-center h-5 sm:h-6 gap-1.5 text-white/40">
                                {seriesTitle && (
                                    <span className="truncate leading-none drop-shadow">
                                        {seriesTitle}
                                    </span>
                                )}
                                {episodeLabel && seriesTitle && (
                                    <span className="leading-none">·</span>
                                )}
                                {episodeLabel && (
                                    <span className="truncate leading-none drop-shadow shrink-0">
                                        {episodeLabel}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
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

                            <button onClick={togglePlay} className="p-4 sm:p-5 md:p-6 bg-red-500 rounded-full transition hover:scale-110 shadow-2xl opacity-40" data-controls>
                                {isLoading
                                    ? <RefreshCw className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-white animate-spin" />
                                    : isPlaying
                                        ? <Pause className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-white" fill="currentColor" />
                                        : <Play className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-white" fill="currentColor" />}
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
                    <div className="px-2 pb-2 sm:px-3 sm:pb-3 md:px-4 md:pb-4 space-y-1" data-controls>

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
                            <div className="flex items-center gap-0.5 sm:gap-1 md:gap-2 min-w-0">
                                <button onClick={endedState === 'replay' ? handleReplay : togglePlay}
                                    className="p-1 sm:p-1.5 md:p-2 hover:bg-white/20 rounded-lg transition"
                                    disabled={isLoading || !!error}
                                    title={endedState === 'replay' ? 'Replay' : isPlaying ? 'Pause' : 'Play'}
                                >
                                    {endedState === 'replay'
                                        ? <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-red-500" />
                                        : isPlaying
                                            ? <Pause className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-red-500" />
                                            : <Play className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-red-500" />}
                                </button>

                                {(hasPrevious || hasNext) && (
                                    <>
                                        {hasPrevious && onPrevious && (
                                            <button onClick={onPrevious} className="p-1 sm:p-1.5 md:p-2 hover:bg-white/20 rounded-lg transition" title="Previous Episode">
                                                <SkipBack className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-red-500" />
                                            </button>
                                        )}
                                        {hasNext && onNext && (
                                            <button onClick={onNext} className="p-1 sm:p-1.5 md:p-2 hover:bg-white/20 rounded-lg transition" title="Next Episode">
                                                <SkipForward className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-red-500" />
                                            </button>
                                        )}
                                    </>
                                )}

                                {/* Volume */}
                                <div className="flex items-center gap-0.5 sm:gap-1 group/vol">
                                    <button onClick={toggleMute} className="p-1 sm:p-1.5 md:p-2 hover:bg-white/20 rounded-lg transition">
                                        {(isMuted || volume === 0)
                                            ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-red-500" />
                                            : volume < 0.5
                                                ? <Volume1 className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-red-500" />
                                                : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-red-500" />}
                                    </button>
                                    {/* Hide volume slider on xs screens — tap mute icon instead */}
                                    <input type="range" min="0" max="1" step="0.05"
                                        value={effectiveVolume} onChange={handleVolumeChange}
                                        className="hidden sm:block w-0 group-hover/vol:w-16 md:group-hover/vol:w-20 transition-all opacity-0 group-hover/vol:opacity-100 accent-red-500"
                                    />
                                </div>

                                {/* Time */}
                                <span className="text-xs sm:text-xs md:text-sm text-white/80 font-mono whitespace-nowrap">
                                    {formatTime(currentTime)} / {formatTime(duration)}
                                </span>
                            </div>

                            {/* Right controls */}
                            <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                                {hasQualityOptions && (
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowSettings(v => !v)}
                                            className="p-1 sm:p-1.5 md:p-2 hover:bg-white/20 rounded-lg transition"
                                            title="Quality"
                                        >
                                            <Settings className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-red-500" />
                                        </button>
                            
                                        {showSettings && (
                                            <div className="absolute bottom-full right-0 mb-2 bg-slate-900 rounded-lg overflow-hidden border border-slate-700 min-w-36 shadow-xl">
                                                <div className="px-3 py-2 text-xs text-slate-400 border-b border-slate-700 uppercase tracking-wide">Quality</div>
                            
                                                {hlsLevels.length > 0 ? (
                                                    <>
                                                        {/* Auto option */}
                                                        <button
                                                            onClick={() => handleQualityChange(-1)}
                                                            className={`w-full text-left px-4 py-2 hover:bg-slate-800 transition text-sm ${hlsLevel === -1 ? 'text-red-500' : 'text-white'}`}
                                                        >
                                                            Auto {hlsLevel >= 0 && hlsLevels[hlsLevel] ? `(${hlsLevels[hlsLevel].label})` : ''}
                                                        </button>
                            
                                                        {/* Manual quality options — highest first */}
                                                        {[...hlsLevels].reverse().map(lvl => (
                                                            <button
                                                                key={lvl.index}
                                                                onClick={() => handleQualityChange(lvl.index)}
                                                                className={`w-full text-left px-4 py-2 hover:bg-slate-800 transition text-sm ${hlsLevel === lvl.index ? 'text-red-500' : 'text-white'}`}
                                                            >
                                                                {lvl.label}
                                                            </button>
                                                        ))}
                                                    </>
                                                ) : (
                                                    // Legacy quality strings (pre-HLS)
                                                    availableQualities.map(q => (
                                                        <button
                                                            key={q}
                                                            onClick={() => handleQualityChange(q)}
                                                            className={`w-full text-left px-4 py-2 hover:bg-slate-800 transition text-sm ${selectedQuality === q ? 'text-red-500' : 'text-white'}`}
                                                        >
                                                            {q}
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <button onClick={toggleFullscreen} className="p-1 sm:p-1.5 md:p-2 hover:bg-white/20 rounded-lg transition">
                                    {isFullscreen
                                        ? <Minimize className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-red-500" />
                                        : <Maximize className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-red-500" />}
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
                        <button onClick={handleReplay} className="flex flex-col items-center gap-3 p-5 sm:p-6 md:p-8 bg-red-500/90 hover:bg-red-500 rounded-full transition hover:scale-110 shadow-2xl">
                            <RotateCcw className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 text-white" />
                        </button>
                    )}
                    {endedState === 'countdown' && (
                        <>
                            <div className="relative w-20 h-20 sm:w-24 sm:h-24 md:w-30 md:h-30 rounded-full bg-red-500/90 hover:bg-red-500 transition hover:scale-110 shadow-2xl">
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
                                    <Play className='w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 text-white' fill='white' />
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