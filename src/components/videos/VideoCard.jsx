import React, { useState } from "react";
import { generalAPI } from "../../api/api";
import { Ban, CircleCheck, Clock, Eye, Film, Heart, Play } from "lucide-react";
import { TagsContainer } from "../series/SeriesCard";
import { formatDuration, formatViews } from "../../utils/format";

// Read saved progress (seconds) for a given videoId from localStorage
function useSavedProgress(videoId, duration) {
    const [pct] = useState(() => {
        if (!videoId || !duration) return null;
        try {
            const map = JSON.parse(localStorage.getItem('vibeflix_progress') || '{}');
            const saved = map[videoId];
            if (!saved || saved <= 0) return null;
            return Math.min(saved / duration, 1);
        } catch { return null; }
    });
    return pct; // 0-1 or null
}

export default function VideoCard({ video, onToggleFavorite, onTagClick, onStudioClick, onCharacterClick, onActorClick }) {
    const progressPct = useSavedProgress(video._id, video.duration);
    const { hlsStatus } = video;

    return (
        <a
            href={video.seriesId ? `/series/${video.seriesId}?ep=${video._id}` : `/video/${video._id}`}
            className="relative bg-slate-900 rounded-xl overflow-hidden border border-slate-800 hover:border-slate-600 transition cursor-pointer group flex flex-col h-full"
        >
            {/* Thumbnail */}
            <div className="relative aspect-video bg-slate-800 overflow-hidden flex-none">
                {video.thumbnailPath ? (
                    <img
                        src={generalAPI.thumbnailUrl(video.thumbnailPath)}
                        alt={video.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-10 h-10 sm:w-12 sm:h-12 text-slate-600" />
                    </div>
                )}

                {/* HLS status badge */}
                <div className={`absolute top-3.5 left-3.5 rounded-full text-white ${hlsStatus === 'pending' 
                        ? 'bg-amber-400' 
                        : hlsStatus === 'ready' 
                            ? 'bg-green-400' 
                            : 'bg-red-500'
                }`}>
                    {hlsStatus === 'pending' ? (
                        <Clock className="w-5 h-5" />
                    ) : hlsStatus === 'ready' ? (
                        <CircleCheck className="w-5 h-5" />
                    ) : (
                        <Ban className="w-5 h-5" />
                    )}
                </div>

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-red-500 rounded-full p-2.5 sm:p-3 shadow-lg">
                            <Play className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="currentColor" />
                        </div>
                    </div>
                </div>

                {/* Duration badge */}
                {video.duration && (
                    <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/80 text-white text-xs rounded font-medium">
                        {formatDuration(video.duration)}
                    </div>
                )}

                {/* Favorite button */}
                <button
                    onClick={(e) => { 
                        e.preventDefault();
                        e.stopPropagation(); 
                        onToggleFavorite?.(); 
                    }}
                    className="absolute top-1.5 right-1.5 p-1.5 bg-black/60 rounded-full"
                >
                    <Heart
                        className={`w-3.5 h-3.5 transition ${video.isFavorite ? 'text-red-500' : 'text-white'}`}
                        fill={video.isFavorite ? 'currentColor' : 'none'}
                    />
                </button>

                {/* Progress bar (YouTube-style) */}
                {progressPct !== null && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                        <div
                            className="h-full bg-red-500 transition-none"
                            style={{ width: `${progressPct * 100}%` }}
                        />
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="p-2.5 sm:p-3 flex-1 flex flex-col">
                <h3 className="font-bold text-white text-xs sm:text-sm leading-tight mb-1 line-clamp-2 group-hover:text-red-400 transition uppercase">
                    {video.title}
                </h3>

                <div className="flex items-center gap-2 sm:gap-3 text-xs text-slate-400 mb-1.5">
                    <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {formatViews(video.views || 0)}
                    </span>
                    {video.duration && (
                        <span className="flex items-center gap-1 sm:hidden">
                            <Clock className="w-3 h-3" />
                            {formatDuration(video.duration)}
                        </span>
                    )}
                </div>

                <div className="mt-auto">
                    <TagsContainer tags={video.studios}    color="blue"   onClick={onStudioClick}    limit={2} />
                    <TagsContainer tags={video.actors}     color="green"  onClick={onActorClick}     limit={2} />
                    <TagsContainer tags={video.characters} color="purple" onClick={onCharacterClick} limit={2} />
                    <TagsContainer tags={video.tags}       color="slate"  onClick={onTagClick}       limit={3} />
                </div>
            </div>
        </a>
    );
}