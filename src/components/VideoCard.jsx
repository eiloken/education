import React, { useEffect, useState } from "react";
import { generalAPI } from "../api/api";
import { Clock, Eye, Film, Heart, Layers, Play } from "lucide-react";
import { TagsContainer } from "./SeriesCard";
import { formatDuration, formatViews } from "../utils/format";

function VideoCard({ video, onToggleFavorite, onTagClick, onStudioClick, onCharacterClick, onActorClick }) {
    return (
        <a
            href={video.seriesId ? `/series/${video.seriesId}?ep=${video._id}` : `/video/${video._id}`}
            className="relative bg-slate-900 rounded-lg overflow-hidden border border-slate-800 hover:border-slate-600 transition cursor-pointer group"
        >
            {/* Thumbnail */}
            <div className="relative aspect-video bg-slate-800 overflow-hidden">
                {video.thumbnailPath ? (
                    <img
                        src={generalAPI.thumbnailUrl(video.thumbnailPath)}
                        alt={video.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-12 h-12 text-slate-600" />
                    </div>
                )}

                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-linear-to-r from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-red-500 rounded-full p-3">
                            <Play className="w-6 h-6 text-white" fill="currentColor" />
                        </div>
                    </div>
                </div>

                {/* Favorite button */}
                <button
                    onClick={(e) => { 
                        e.preventDefault();
                        e.stopPropagation(); 
                        onToggleFavorite?.(); 
                    }}
                    className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full transition-opacity"
                >
                    <Heart
                        className={`w-4 h-4 transition ${video.isFavorite ? 'text-red-500' : 'text-white'}`}
                        fill={video.isFavorite ? 'currentColor' : 'none'}
                    />
                </button>
            </div>

            {/* Info */}
            <div className="p-3">
                <h3 className="font-bold text-white text-sm leading-tight mb-1 line-clamp-2 group-hover:text-red-400 transition uppercase">
                    {video.title}
                </h3>

                <div className="flex items-center gap-3 text-sm text-slate-400 mb-2">
                    <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {formatViews(video.views || 0)}
                    </span>
                    {video.duration && (
                        <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDuration(video.duration)}
                        </span>
                    )}
                </div>

                {video.description && (
                    <p className="text-slate-400 text-sm line-clamp-2">{video.description}</p>
                )}

                <TagsContainer tags={video.studios} color="blue" onClick={onStudioClick} limit={2} />
                <TagsContainer tags={video.actors} color="green" onClick={onActorClick} limit={2} />
                <TagsContainer tags={video.characters} color="purple" onClick={onCharacterClick} limit={2} />
                <TagsContainer tags={video.tags} color="slate" onClick={onTagClick} limit={5} />
            </div>
        </a>
    );
}

export default VideoCard;