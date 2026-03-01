import React, { useState } from "react";
import { generalAPI } from "../api/api";
import { Film, Heart, Layers, Play, Star } from "lucide-react";

function SeriesCard({ series, onToggleFavorite, onTagClick, onStudioClick, onCharacterClick, onActorClick }) {
    const { title, thumbnailPath, episodeCount, seasonCount, tags, actors, characters, studios, isFavorite } = series;

    // Grid mode
    return (
        <a
            href={`/series/${series._id}`}
            className="relative bg-slate-900 rounded-lg overflow-hidden border border-slate-800 hover:border-slate-600 transition cursor-pointer group"
        >
            {/* Thumbnail */}
            <div className="relative aspect-video bg-slate-800 overflow-hidden">
                {thumbnailPath ? (
                    <img
                        src={generalAPI.thumbnailUrl(thumbnailPath)}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Layers className="w-12 h-12 text-slate-600" />
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

                {/* Series badge */}
                <div className="absolute top-2 left-2 px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded uppercase">
                    Series
                </div>

                {/* Episode/season count badge */}
                <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-black/70 text-white text-xs rounded">
                    <Play className="w-3 h-3" />
                    {episodeCount || 0} eps
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
                        className={`w-4 h-4 transition ${isFavorite ? 'text-red-500' : 'text-white'}`}
                        fill={isFavorite ? 'currentColor' : 'none'}
                    />
                </button>
            </div>

            {/* Info */}
            <div className="p-3">
                <h3 className="font-bold text-white text-sm leading-tight mb-1 line-clamp-2 group-hover:text-red-400 transition uppercase">
                    {title}
                </h3>

                <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                    <span className="flex items-center gap-1">
                        <Play className="w-3 h-3" />
                        {episodeCount || 0} episodes
                    </span>
                    <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {seasonCount || 1} season{(seasonCount || 1) > 1 ? 's' : ''}
                    </span>
                </div>
                
                <TagsContainer tags={studios} color="blue" onClick={onStudioClick} limit={2} />
                <TagsContainer tags={actors} color="green" onClick={onActorClick} limit={2} />
                <TagsContainer tags={characters} color="purple" onClick={onCharacterClick} limit={2} />
                <TagsContainer tags={tags} color="slate" onClick={onTagClick} limit={5} />
            </div>
        </a>
    );
}

export function TagsContainer({ tags, color, onClick, limit }) {
    const [showMore, setShowMore] = useState(false);

    const remaining = showMore ? 0 : (tags && limit && limit > 0 && tags.length > limit) ? tags.length - limit : 0;
    const newLimit = showMore ? tags.length : limit;

    const handleShowMore = () => setShowMore(true);

    return (
        tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
                <>
                    {(remaining > 0 ? tags.slice(0, newLimit) : tags).map((tag, i) => (
                        <MetaChip key={i} label={tag} color={color} onClick={onClick} />
                    ))}
                    {remaining > 0 && <MetaChip label={`+${remaining}`} color={color} onClick={handleShowMore} />}
                </>
            </div>
        )
    );
}

export function MetaChip({ label, color = 'slate', onClick }) {
    const colors = {
        slate: 'bg-slate-700 text-slate-300',
        blue: 'bg-blue-500/20 text-blue-300',
        green: 'bg-green-500/20 text-green-300',
        purple: 'bg-purple-500/20 text-purple-300',
        red: 'bg-red-500/20 text-red-300',
    };
    return (
        <button 
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClick?.(label);
            }}
            className={`px-2 py-0.5 ${colors[color || 'slate']} text-xs rounded-full cursor-pointer hover:bg-slate-700 transition`}
        >
            {label}
        </button>
    );
}

export default SeriesCard;
