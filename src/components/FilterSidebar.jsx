import React, { useCallback, useEffect, useState } from "react";
import { videoAPI, seriesAPI } from "../api/api";
import { Filter, Search, X, CheckCircle, XCircle, ToggleLeft, ToggleRight } from "lucide-react";

export const DEFAULT_FILTERS = {
    search: '',
    tags: [],           tagsExclude: [],
    studios: [],        studiosExclude: [],
    actors: [],         actorsExclude: [],
    characters: [],     charactersExclude: [],
    year: '',
    favorite: false,
    filterMode: 'or',   // 'or' = any match ($in), 'and' = all must match ($all)
    sortBy: 'updatedAt',
    order: 'desc'
};

// ─── Chip state cycling ───────────────────────────────────────────────────────
// none → include (green) → exclude (red) → none

function cycleItem(filters, field, item) {
    const inclField = field;
    const exclField = `${field}Exclude`;
    const included = filters[inclField] || [];
    const excluded = filters[exclField] || [];

    if (included.includes(item)) {
        // include → exclude
        return {
            ...filters,
            [inclField]: included.filter(x => x !== item),
            [exclField]: [...excluded, item]
        };
    } else if (excluded.includes(item)) {
        // exclude → none
        return { ...filters, [exclField]: excluded.filter(x => x !== item) };
    } else {
        // none → include
        return { ...filters, [inclField]: [...included, item] };
    }
}

// ─────────────────────────────────────────────────────────────────────────────

function FilterSidebar({ isOpen, onClose, onFilterChange, currentFilters, mode = 'videos' }) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const [tags, setTags]           = useState([]);
    const [studios, setStudios]     = useState([]);
    const [actors, setActors]       = useState([]);
    const [characters, setChars]    = useState([]);

    const [localFilters, setLocalFilters] = useState({ ...DEFAULT_FILTERS });

    // ── Fetch metadata options ────────────────────────────────────────────────
    const fetchFilterOptions = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const api = mode === 'series' ? seriesAPI : videoAPI;
            const [tagsData, studiosData, actorsData, charsData] = await Promise.all([
                api.getTags ? api.getTags() : [],
                api.getStudios ? api.getStudios() : [],
                api.getActors ? api.getActors() : [],
                api.getCharacters ? api.getCharacters() : []
            ]);
            setTags(tagsData || []);
            setStudios(studiosData || []);
            setActors(actorsData || []);
            setChars(charsData || []);
        } catch (err) {
            console.error('Error fetching filter options:', err);
            setError(err);
        } finally {
            setIsLoading(false);
        }
    }, [mode]);

    useEffect(() => { fetchFilterOptions(); }, [fetchFilterOptions]);

    // Sync from parent
    useEffect(() => {
        if (currentFilters) {
            setLocalFilters({ ...DEFAULT_FILTERS, ...currentFilters });
        }
    }, [currentFilters]);

    const handleChange = (key, value) =>
        setLocalFilters(prev => ({ ...prev, [key]: value }));

    const handleCycle = (field, item) =>
        setLocalFilters(prev => cycleItem(prev, field, item));

    const applyFilters = () => { onFilterChange(localFilters); onClose(); };
    const resetFilters = () => { setLocalFilters(DEFAULT_FILTERS); onFilterChange(DEFAULT_FILTERS); };

    const activeCount =
        (localFilters.tags?.length || 0) + (localFilters.tagsExclude?.length || 0) +
        (localFilters.studios?.length || 0) + (localFilters.studiosExclude?.length || 0) +
        (localFilters.actors?.length || 0) + (localFilters.actorsExclude?.length || 0) +
        (localFilters.characters?.length || 0) + (localFilters.charactersExclude?.length || 0) +
        (localFilters.year ? 1 : 0) + (localFilters.favorite ? 1 : 0);

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 50 }, (_, i) => currentYear - i);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900 z-50 overflow-y-auto flex flex-col">
            <div className="p-6 container mx-auto flex-1">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Filter className="w-6 h-6 text-red-500" />
                        Filters
                        {activeCount > 0 && (
                            <span className="ml-1 text-sm font-normal text-slate-400">({activeCount} active)</span>
                        )}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition p-1">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {isLoading && (
                    <div className="flex items-center gap-2 text-slate-400 text-sm mb-4">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-500" />
                        Loading options…
                    </div>
                )}

                {/* ── Search ── */}
                <Section title="Search">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            value={localFilters.search}
                            onChange={e => handleChange('search', e.target.value)}
                            placeholder="Search by title…"
                            className="w-full pl-10 pr-4 py-2 bg-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                        />
                    </div>
                </Section>

                {/* ── AND / OR mode toggle ── */}
                <Section title="Filter match mode">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => handleChange('filterMode', localFilters.filterMode === 'or' ? 'and' : 'or')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border-2 transition ${
                                localFilters.filterMode === 'and'
                                    ? 'border-red-500 bg-red-500/20 text-red-300'
                                    : 'border-slate-600 bg-slate-700 text-slate-300'
                            }`}
                        >
                            {localFilters.filterMode === 'and'
                                ? <ToggleRight className="w-5 h-5" />
                                : <ToggleLeft className="w-5 h-5" />
                            }
                            {localFilters.filterMode === 'and' ? 'AND — all tags must match' : 'OR — any tag matches'}
                        </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5">
                        {localFilters.filterMode === 'and'
                            ? 'Results must match every included tag/actor/etc.'
                            : 'Results match if they have at least one of the included items.'}
                    </p>
                </Section>

                {/* ── Chip legend ── */}
                <div className="mb-5 flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-green-500/40 border-2 border-dashed border-green-400 inline-block" />
                        Click once = include
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-red-500/40 border border-red-500 inline-block" />
                        Click twice = exclude
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-slate-700 border border-slate-600 inline-block" />
                        Click thrice = clear
                    </span>
                </div>

                {/* ── Favorites ── */}
                <Section>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={localFilters.favorite}
                            onChange={e => handleChange('favorite', e.target.checked)}
                            className="w-4 h-4 accent-red-500"
                        />
                        <span className="text-white text-sm">Show favorites only</span>
                    </label>
                </Section>

                {/* ── Year ── */}
                <Section title="Year">
                    <select
                        value={localFilters.year}
                        onChange={e => handleChange('year', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                    >
                        <option value="">All Years</option>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </Section>

                {/* ── Sort ── */}
                <Section title="Sort By">
                    <div className="flex gap-2">
                        <select
                            value={localFilters.sortBy}
                            onChange={e => handleChange('sortBy', e.target.value)}
                            className="flex-1 px-3 py-2 bg-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                        >
                            <option value="updatedAt">Updated</option>
                            <option value="createdAt">Added</option>
                            <option value="title">Title</option>
                            <option value="year">Year</option>
                            <option value="views">Views</option>
                        </select>
                        <select
                            value={localFilters.order}
                            onChange={e => handleChange('order', e.target.value)}
                            className="px-3 py-2 bg-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                        >
                            <option value="desc">↓ Desc</option>
                            <option value="asc">↑ Asc</option>
                        </select>
                    </div>
                </Section>

                {/* ── Tag sections ── */}
                {studios.length > 0 && (
                    <TagSection title="Studios" field="studios" localFilters={localFilters} onCycle={handleCycle} allItems={studios} />
                )}
                {actors.length > 0 && (
                    <TagSection title="Actors" field="actors" localFilters={localFilters} onCycle={handleCycle} allItems={actors} />
                )}
                {characters.length > 0 && (
                    <TagSection title="Characters" field="characters" localFilters={localFilters} onCycle={handleCycle} allItems={characters} />
                )}
                {tags.length > 0 && (
                    <TagSection title="Tags" field="tags" localFilters={localFilters} onCycle={handleCycle} allItems={tags} />
                )}

                {/* ── Active filter summary ── */}
                {activeCount > 0 && (
                    <div className="mb-4 p-3 bg-slate-800 rounded-lg">
                        <p className="text-xs text-slate-400 mb-2">Active filters:</p>
                        <div className="flex flex-wrap gap-1 text-xs">
                            {localFilters.favorite && <Badge label="❤ Favorites" color="red" />}
                            {localFilters.year && <Badge label={`Year: ${localFilters.year}`} color="green" />}
                            {['studios', 'actors', 'characters', 'tags'].map(f => (
                                <React.Fragment key={f}>
                                    {(localFilters[f]?.length > 0) && <Badge label={`✓ ${localFilters[f].length} ${f}`} color="green" />}
                                    {(localFilters[`${f}Exclude`]?.length > 0) && <Badge label={`✗ ${localFilters[`${f}Exclude`].length} ${f}`} color="red" />}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                )}

                {error && (
                    <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
                        <p className="text-red-400 text-sm">Failed to load filter options. Try refreshing.</p>
                    </div>
                )}
            </div>

            {/* Sticky footer actions */}
            <div className="sticky bottom-0 border-t border-slate-800 bg-slate-900 p-4 container mx-auto">
                <div className="flex gap-3">
                    <button
                        onClick={applyFilters}
                        className="flex-1 py-3 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition"
                    >
                        Apply Filters {activeCount > 0 ? `(${activeCount})` : ''}
                    </button>
                    <button
                        onClick={resetFilters}
                        className="px-5 py-3 bg-slate-700 text-white rounded-lg font-medium hover:bg-slate-600 transition"
                    >
                        Reset
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── TagSection ───────────────────────────────────────────────────────────────

function TagSection({ title, field, allItems, localFilters, onCycle }) {
    const [search, setSearch] = useState('');
    const [filtered, setFiltered] = useState(allItems);

    useEffect(() => {
        if (!search) { setFiltered(allItems); return; }
        const t = setTimeout(() => {
            setFiltered(allItems.filter(i => i.toLowerCase().includes(search.toLowerCase())));
        }, 300);
        return () => clearTimeout(t);
    }, [search, allItems]);

    const included = localFilters[field] || [];
    const excluded = localFilters[`${field}Exclude`] || [];
    const activeCount = included.length + excluded.length;

    return (
        <Section title={`${title}${activeCount > 0 ? ` (${activeCount})` : ''}`}>
            {allItems.length > 6 && (
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={`Filter ${title.toLowerCase()}…`}
                    className="w-full px-3 py-1.5 bg-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-xs mb-2"
                />
            )}
            <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto p-2 bg-slate-800 rounded-lg">
                {filtered.length === 0 ? (
                    <p className="text-slate-500 text-xs">No results</p>
                ) : (
                    filtered.map(item => {
                        const isIncluded = included.includes(item);
                        const isExcluded = excluded.includes(item);
                        return (
                            <button
                                key={item}
                                onClick={() => onCycle(field, item)}
                                className={`px-2.5 py-1 rounded-full text-xs font-medium transition border-2 ${
                                    isIncluded
                                        ? 'bg-green-500/20 text-green-300 border-dashed border-green-400'
                                        : isExcluded
                                        ? 'bg-red-500/20 text-red-300 border-red-500 line-through'
                                        : 'bg-slate-700 text-slate-300 border-transparent hover:bg-slate-600'
                                }`}
                                title={isIncluded ? 'Click to exclude' : isExcluded ? 'Click to clear' : 'Click to include'}
                            >
                                {isIncluded && '✓ '}
                                {isExcluded && '✗ '}
                                {item}
                            </button>
                        );
                    })
                )}
            </div>
        </Section>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Section({ title, children }) {
    return (
        <div className="mb-5">
            {title && <label className="block text-white text-sm font-semibold mb-2">{title}</label>}
            {children}
        </div>
    );
}

function Badge({ label, color = 'slate' }) {
    const map = {
        red:   'bg-red-500/20 text-red-400',
        green: 'bg-green-500/20 text-green-400',
        slate: 'bg-slate-600 text-slate-300'
    };
    return <span className={`px-2 py-0.5 rounded text-xs ${map[color] || map.slate}`}>{label}</span>;
}

// ─── Exported helper: cycle filter state from outside (e.g. card chip clicks) ─

export { cycleItem };
export default FilterSidebar;