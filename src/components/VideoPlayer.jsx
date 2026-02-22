import React, { useRef, useEffect, useState } from 'react';
import { X, Play, Pause, Volume2, VolumeX, Maximize, Settings, SkipBack, SkipForward, RefreshCcw } from 'lucide-react';

function VideoPlayer({ 
    videoUrl, 
    availableQualities = [], 
    onPrevious = null,
    onNext = null,
    hasPrevious = false,
    hasNext = false,
    autoPlayNext = false,
    isEmbedded = false
}) {
    const videoRef = useRef(null);
    const containerRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [selectedQuality, setSelectedQuality] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const controlsTimeoutRef = useRef(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleLoadedMetadata = () => {
            setDuration(video.duration);
            setIsLoading(false);
            setError(null);
        };

        const handleTimeUpdate = () => {
            setCurrentTime(video.currentTime);
            
            // Auto play next episode when current ends
            if (autoPlayNext && hasNext && video.currentTime >= video.duration - 1) {
                onNext?.();
            }
        };

        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        const handleEnded = () => {
            setIsPlaying(false);
            if (autoPlayNext && hasNext) {
                onNext?.();
            }
        };

        const handleCanPlay = () => {
            setIsLoading(false);
            setError(null);
        };

        const handleWaiting = () => {
            setIsLoading(true);
        };

        const handleError = (e) => {
            console.error('Video error:', e);
            setError('Failed to load video');
            setIsLoading(false);
        };

        const handleLoadStart = () => {
            setIsLoading(true);
        };

        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);
        video.addEventListener('ended', handleEnded);
        video.addEventListener('canplay', handleCanPlay);
        video.addEventListener('waiting', handleWaiting);
        video.addEventListener('error', handleError);
        video.addEventListener('loadstart', handleLoadStart);

        return () => {
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('ended', handleEnded);
            video.removeEventListener('canplay', handleCanPlay);
            video.removeEventListener('waiting', handleWaiting);
            video.removeEventListener('error', handleError);
            video.removeEventListener('loadstart', handleLoadStart);
        };
    }, [autoPlayNext, hasNext, onNext]);

    // Auto-hide controls
    useEffect(() => {
        const resetTimeout = () => {
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current);
            }
            setShowControls(true);
            if (isPlaying) {
                controlsTimeoutRef.current = setTimeout(() => {
                    setShowControls(false);
                }, 3000);
            }
        };

        resetTimeout();

        return () => {
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current);
            }
        };
    }, [isPlaying]);

    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;

        // Check if video has a valid source
        if (!video.src && !video.currentSrc) {
            console.error('No video source available');
            setError('No video source available');
            return;
        }

        // Check if video is ready
        if (video.readyState < 2) {
            console.log('Video not ready yet, current readyState:', video.readyState);
            setIsLoading(true);
            return;
        }

        try {
            if (isPlaying) {
                video.pause();
            } else {
                const playPromise = video.play();
                if (playPromise !== undefined) {
                    playPromise
                        .then(() => {
                            setError(null);
                        })
                        .catch((error) => {
                            console.error('Play error:', error);
                            setError('Failed to play video');
                            setIsPlaying(false);
                        });
                }
            }
        } catch (err) {
            console.error('Toggle play error:', err);
            setError('Failed to play video');
        }
    };

    const handleSeek = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = x / rect.width;
        const newTime = percentage * duration;
        
        if (videoRef.current) {
            videoRef.current.currentTime = newTime;
            setCurrentTime(newTime);
        }
    };

    const handleVolumeChange = (e) => {
        const newVolume = parseFloat(e.target.value);
        setVolume(newVolume);
        setIsMuted(newVolume === 0);
        if (videoRef.current) {
            videoRef.current.volume = newVolume;
        }
    };

    const toggleMute = () => {
        if (videoRef.current) {
            const newMuted = !isMuted;
            setIsMuted(newMuted);
            videoRef.current.muted = newMuted;
            if (newMuted) {
                setVolume(0);
            } else {
                setVolume(1);
                videoRef.current.volume = 1;
            }
        }
    };

    const toggleFullscreen = () => {
        const target = isEmbedded ? containerRef.current : videoRef.current;
        if (target) {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                target.requestFullscreen();
            }
        }
    };

    const formatTime = (seconds) => {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleQualityChange = (quality) => {
        const currentTime = videoRef.current?.currentTime || 0;
        const wasPlaying = isPlaying;
        
        setSelectedQuality(quality);
        // In a real implementation, you would change the video source here
        // and restore the playback position
        
        if (videoRef.current) {
            videoRef.current.currentTime = currentTime;
            if (wasPlaying) {
                videoRef.current.play();
            }
        }
        
        setShowSettings(false);
    };

    const handleMouseMove = () => {
        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
        }
        setShowControls(true);
        if (isPlaying) {
            controlsTimeoutRef.current = setTimeout(() => {
                setShowControls(false);
            }, 3000);
        }
    };

    // Check if videoUrl is valid
    if (!videoUrl) {
        return (
            <div className={isEmbedded ? "relative w-full h-full bg-black flex items-center justify-center" : "fixed inset-0 bg-black z-50 flex items-center justify-center"}>
                <div className="text-center">
                    <p className="text-white text-xl mb-4">No video source provided</p>
                </div>
            </div>
        );
    }

    return (
        <div 
            ref={containerRef}
            className={isEmbedded ? "relative w-full h-full bg-black" : "fixed inset-0 bg-black z-50 flex items-center justify-center"}
            onMouseMove={handleMouseMove}
        >
            {/* Video */}
            <video
                ref={videoRef}
                src={videoUrl}
                className="w-full h-full object-contain"
                onClick={togglePlay}
                playsInline
                crossOrigin="anonymous"
            />

            {/* Loading Spinner */}
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-white text-lg">Loading video...</p>
                    </div>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                    <div className="bg-red-500/90 backdrop-blur-sm rounded-lg p-6 max-w-md mx-4">
                        <p className="text-white text-lg mb-4">{error}</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setError(null);
                                    setIsLoading(true);
                                    if (videoRef.current) {
                                        videoRef.current.load();
                                    }
                                }}
                                className="flex-1 px-4 py-2 bg-white text-red-500 rounded-lg hover:bg-gray-100 transition"
                            >
                                Retry
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Controls Overlay */}
            <div 
                className={`absolute inset-0 bg-linear-to-r from-black/80 via-transparent to-black/50 transition-opacity duration-300 ${
                    showControls ? 'opacity-100' : 'opacity-0'
                }`}
            >
                {/* Top Bar */}
                <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {/* Episode Navigation */}
                        {(hasPrevious || hasNext) && (
                            <div className="flex items-center gap-2">
                                {hasPrevious && onPrevious && (
                                    <button
                                        onClick={onPrevious}
                                        className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition backdrop-blur-sm"
                                        title="Previous Episode"
                                    >
                                        <SkipBack className="w-5 h-5" />
                                    </button>
                                )}
                                {hasNext && onNext && (
                                    <button
                                        onClick={onNext}
                                        className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition backdrop-blur-sm"
                                        title="Next Episode"
                                    >
                                        <SkipForward className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Center Play Button (when paused and not loading) */}
                {!error && (
                    <button
                        onClick={togglePlay}
                        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 p-6 bg-red-500/90 hover:bg-red-500 rounded-full transition hover:scale-110"
                    >
                        {isLoading 
                            ? <RefreshCcw className="w-12 h-12 animate-spin" fill="currentColor" /> 
                            : (isPlaying 
                                ? <Pause className="w-12 h-12" fill="currentColor" /> 
                                : <Play className="w-12 h-12" fill="currentColor" />)
                        }
                    </button>
                )}

                {/* Bottom Controls */}
                <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2">
                    {/* Progress Bar */}
                    <div 
                        className="h-1 bg-white/30 rounded-full cursor-pointer group"
                        onClick={handleSeek}
                    >
                        <div 
                            className="h-full bg-red-500 rounded-full relative transition-all"
                            style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
                        >
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                    </div>

                    {/* Control Buttons */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            {/* Play/Pause */}
                            <button
                                onClick={togglePlay}
                                className="p-2 hover:bg-white/20 rounded-lg transition text-red-500"
                                disabled={isLoading || !!error}
                            >
                                {isPlaying ? (
                                    <Pause className="w-6 h-6" fill="currentColor" />
                                ) : (
                                    <Play className="w-6 h-6" fill="currentColor" />
                                )}
                            </button>

                            {/* Volume */}
                            <div className="flex items-center gap-2 group">
                                <button
                                    onClick={toggleMute}
                                    className="p-2 hover:bg-white/20 rounded-lg transition text-red-500"
                                >
                                    {isMuted || volume === 0 ? (
                                        <VolumeX className="w-6 h-6" />
                                    ) : (
                                        <Volume2 className="w-6 h-6" />
                                    )}
                                </button>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={volume}
                                    onChange={handleVolumeChange}
                                    className="w-0 group-hover:w-20 transition-all opacity-0 group-hover:opacity-100 accent-red-500"
                                />
                            </div>

                            {/* Time */}
                            <div className="text-sm text-red-500">
                                {formatTime(currentTime)} / {formatTime(duration)}
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Settings (Quality) */}
                            {availableQualities.length > 0 && (
                                <div className="relative">
                                    <button
                                        onClick={() => setShowSettings(!showSettings)}
                                        className="p-2 hover:bg-white/20 rounded-lg transition text-red-500"
                                    >
                                        <Settings className="w-6 h-6" />
                                    </button>

                                    {showSettings && (
                                        <div className="absolute bottom-full right-0 mb-2 bg-slate-900 rounded-lg overflow-hidden border border-slate-700 min-w-37.5">
                                            <div className="p-2 text-sm text-slate-400 border-b border-slate-700">
                                                Quality
                                            </div>
                                            {availableQualities.map((quality) => (
                                                <button
                                                    key={quality}
                                                    onClick={() => handleQualityChange(quality)}
                                                    className={`w-full text-left px-4 py-2 hover:bg-slate-800 transition text-sm ${
                                                        selectedQuality === quality ? 'text-red-500' : 'text-white'
                                                    }`}
                                                >
                                                    {quality}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Fullscreen */}
                            <button
                                onClick={toggleFullscreen}
                                className="p-2 hover:bg-white/20 rounded-lg transition text-red-500"
                            >
                                <Maximize className="w-6 h-6" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Next Episode Notification */}
            {autoPlayNext && hasNext && currentTime >= duration - 10 && duration > 0 && (
                <div className="absolute bottom-20 right-4 bg-slate-900/95 backdrop-blur-sm rounded-lg p-4 border border-slate-700 max-w-xs">
                    <p className="text-sm mb-2">Next episode starting in {Math.ceil(duration - currentTime)}s</p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => onNext?.()}
                            className="flex-1 px-3 py-2 bg-red-500 hover:bg-red-600 rounded text-sm transition"
                        >
                            Play Now
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default VideoPlayer;