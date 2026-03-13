import React, { useState } from "react";
import { generalAPI } from "../../api/api";
import { Heart, Layers, Play } from "lucide-react";

// Read latest saved episode progress for a series — returns { episodeId, pct } or null
function useSeriesProgress(series) {
    const [best] = useState(() => {
        if (!series?._id) return null;
        try {
            const map = JSON.parse(localStorage.getItem('vibeflix_progress') || '{}');
            // We don't have episode list here, but the series card might have episodeIds
            // Check if series has episodes referenced (passed via extra prop if needed)
            // Fallback: scan the whole map for any key we can associate — we can't easily do that
            // without episode ids, so we skip for plain SeriesCard.
            return null;
        } catch { return null; }
    });
    return best;
}

function SeriesCard({ series, onToggleFavorite, onTagClick, onStudioClick, onCharacterClick, onActorClick }) {
    const { title, thumbnailPath, episodeCount, seasonCount, tags, actors, characters, studios, isFavorite } = series;

    return (
        <a
            href={`/series/${series._id}`}
            className="relative bg-slate-900 rounded-xl overflow-hidden border border-slate-800 hover:border-slate-600 transition cursor-pointer group flex flex-col h-full"
        >
            {/* Thumbnail */}
            <div className="relative aspect-video bg-slate-800 overflow-hidden flex-none">
                {thumbnailPath ? (
                    <img
                        src={generalAPI.thumbnailUrl(thumbnailPath)}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Layers className="w-10 h-10 sm:w-12 sm:h-12 text-slate-600" />
                    </div>
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-red-500 rounded-full p-2.5 sm:p-3 shadow-lg">
                            <Play className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="currentColor" />
                        </div>
                    </div>
                </div>

                {/* Series badge */}
                <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-red-500 text-white text-xs font-bold rounded uppercase">
                    Series
                </div>

                {/* Episode count badge */}
                <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 bg-black/80 text-white text-xs rounded font-medium">
                    <Play className="w-2.5 h-2.5" />
                    {episodeCount || 0} eps
                </div>

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
                        className={`w-3.5 h-3.5 transition ${isFavorite ? 'text-red-500' : 'text-white'}`}
                        fill={isFavorite ? 'currentColor' : 'none'}
                    />
                </button>
            </div>

            {/* Info */}
            <div className="p-2.5 sm:p-3 flex-1 flex flex-col">
                <h3 className="font-bold text-white text-xs sm:text-sm leading-tight mb-1 line-clamp-2 group-hover:text-red-400 transition uppercase">
                    {title}
                </h3>

                <div className="flex items-center gap-2 text-xs text-slate-400 mb-1.5">
                    <span className="flex items-center gap-1">
                        <Play className="w-2.5 h-2.5" />
                        {episodeCount || 0} ep{episodeCount !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1">
                        <Layers className="w-2.5 h-2.5" />
                        {seasonCount || 1} S{(seasonCount || 1) > 1 ? 's' : ''}
                    </span>
                </div>

                <div className="mt-auto">
                    <TagsContainer tags={studios}    color="blue"   onClick={onStudioClick}    limit={2} />
                    <TagsContainer tags={actors}     color="green"  onClick={onActorClick}     limit={2} />
                    <TagsContainer tags={characters} color="purple" onClick={onCharacterClick} limit={2} />
                    <TagsContainer tags={tags}       color="slate"  onClick={onTagClick}       limit={3} />
                </div>
            </div>
        </a>
    );
}

export function TagsContainer({ tags, color, onClick, limit }) {
    const [showMore, setShowMore] = useState(false);

    const remaining = showMore ? 0 : (tags && limit && limit > 0 && tags.length > limit) ? tags.length - limit : 0;
    const newLimit = showMore ? tags.length : limit;

    const handleShowMore = (e) => { e?.preventDefault(); e?.stopPropagation(); setShowMore(true); };

    return (
        tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
                {(remaining > 0 ? tags.slice(0, newLimit) : tags).map((tag, i) => (
                    <MetaChip key={i} label={tag} color={color} onClick={onClick} />
                ))}
                {remaining > 0 && <MetaChip label={`+${remaining}`} color={color} onClick={handleShowMore} />}
            </div>
        )
    );
}

export function MetaChip({ label, color = 'slate', onClick }) {
    const colors = {
        slate:  'bg-slate-700 text-slate-300 hover:bg-slate-600',
        blue:   'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30',
        green:  'bg-green-500/20 text-green-300 hover:bg-green-500/30',
        purple: 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30',
        red:    'bg-red-500/20 text-red-300 hover:bg-red-500/30',
    };
    return (
        <button 
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClick?.(label);
            }}
            className={`px-1.5 sm:px-2 py-0.5 ${colors[color || 'slate']} text-xs rounded-full cursor-pointer transition`}
        >
            {label}
        </button>
    );
}

export default SeriesCard;