import React, { useCallback, useEffect, useState } from "react";
import { videoAPI } from "../api/api";
import { Filter, Search, X, ToggleLeft, ToggleRight } from "lucide-react";

export const DEFAULT_FILTERS = {
    search: '',
    tags: [],           tagsExclude: [],
    studios: [],        studiosExclude: [],
    actors: [],         actorsExclude: [],
    characters: [],     charactersExclude: [],
    year: '',
    favorite: false,
    filterMode: 'or',
    sortBy: 'updatedAt',
    order: 'desc',
    durationFilter: '',
    hlsFilter: '',
};

// ─── URL serialisation helpers ────────────────────────────────────────────────
export const filtersToParams = (f) => {
    const arr = (a) => (a?.length ? a.join('|') : null);
    return {
        q:    f.search    || null,
        tags: arr(f.tags),
        txc:  arr(f.tagsExclude),
        stu:  arr(f.studios),
        sxc:  arr(f.studiosExclude),
        act:  arr(f.actors),
        axc:  arr(f.actorsExclude),
        chr:  arr(f.characters),
        cxc:  arr(f.charactersExclude),
        yr:   f.year      || null,
        fav:  f.favorite  ? '1' : null,
        fm:   f.filterMode && f.filterMode !== DEFAULT_FILTERS.filterMode ? f.filterMode : null,
        sort: f.sortBy    && f.sortBy    !== DEFAULT_FILTERS.sortBy  ? f.sortBy  : null,
        ord:  f.order     && f.order     !== DEFAULT_FILTERS.order   ? f.order   : null,
        dur:  f.durationFilter || null,
        hls:  f.hlsFilter      || null,
    };
};

export const paramsToFilters = (params) => {
    const arr = (k) => params.get(k)?.split('|').filter(Boolean) || [];
    return {
        search:            params.get('q')   || '',
        tags:              arr('tags'),
        tagsExclude:       arr('txc'),
        studios:           arr('stu'),
        studiosExclude:    arr('sxc'),
        actors:            arr('act'),
        actorsExclude:     arr('axc'),
        characters:        arr('chr'),
        charactersExclude: arr('cxc'),
        year:              params.get('yr')  || '',
        favorite:          params.get('fav') === '1',
        filterMode:        params.get('fm')  || DEFAULT_FILTERS.filterMode,
        sortBy:            params.get('sort')|| DEFAULT_FILTERS.sortBy,
        order:             params.get('ord') || DEFAULT_FILTERS.order,
        durationFilter:    params.get('dur') || '',
        hlsFilter:         params.get('hls') || '',
    };
};

// ─── cycleItem ────────────────────────────────────────────────────────────────
function cycleItem(filters, field, item) {
    const inclField = field;
    const exclField = `${field}Exclude`;
    const included = filters[inclField] || [];
    const excluded = filters[exclField] || [];

    if (included.includes(item)) {
        return { ...filters, [inclField]: included.filter(x => x !== item), [exclField]: [...excluded, item] };
    } else if (excluded.includes(item)) {
        return { ...filters, [exclField]: excluded.filter(x => x !== item) };
    } else {
        return { ...filters, [inclField]: [...included, item] };
    }
}

// ─── FilterSidebar ────────────────────────────────────────────────────────────
// allItems from the API are now { value: string, count: number }[]
// The internal filter arrays still store plain strings — no breaking change.
function FilterSidebar({ isOpen, onClose, onFilterChange, currentFilters }) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError]         = useState(null);
    // Each is { value: string, count: number }[]
    const [tags, setTags]           = useState([]);
    const [studios, setStudios]     = useState([]);
    const [actors, setActors]       = useState([]);
    const [characters, setChars]    = useState([]);
    const [localFilters, setLocalFilters] = useState({ ...DEFAULT_FILTERS });

    useEffect(() => {
        document.body.style.overflow = isOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    const fetchFilterOptions = useCallback(async () => {
        setIsLoading(true); setError(null);
        try {
            const [tagsData, studiosData, actorsData, charsData] = await Promise.all([
                videoAPI.getTags(),
                videoAPI.getStudios(),
                videoAPI.getActors(),
                videoAPI.getCharacters(),
            ]);
            // API now returns { value, count }[] — store as-is
            setTags(tagsData || []);
            setStudios(studiosData || []);
            setActors(actorsData || []);
            setChars(charsData || []);
        } catch (err) {
            console.error('Error fetching filter options:', err);
            setError(err);
        } finally { setIsLoading(false); }
    }, []);

    useEffect(() => { fetchFilterOptions(); }, [fetchFilterOptions]);
    useEffect(() => { if (currentFilters) setLocalFilters({ ...DEFAULT_FILTERS, ...currentFilters }); }, [currentFilters]);

    const handleChange = (key, value) => setLocalFilters(prev => ({ ...prev, [key]: value }));
    const handleCycle  = (field, item) => setLocalFilters(prev => cycleItem(prev, field, item));
    const applyFilters = () => { onFilterChange(localFilters); onClose(); };
    const resetFilters = () => { setLocalFilters(DEFAULT_FILTERS); onFilterChange(DEFAULT_FILTERS); onClose(); };

    const activeCount =
        (localFilters.tags?.length || 0)       + (localFilters.tagsExclude?.length || 0) +
        (localFilters.studios?.length || 0)    + (localFilters.studiosExclude?.length || 0) +
        (localFilters.actors?.length || 0)     + (localFilters.actorsExclude?.length || 0) +
        (localFilters.characters?.length || 0) + (localFilters.charactersExclude?.length || 0) +
        (localFilters.year ? 1 : 0) + (localFilters.favorite ? 1 : 0) +
        (localFilters.durationFilter ? 1 : 0) + (localFilters.hlsFilter ? 1 : 0);

    const years = Array.from({ length: 50 }, (_, i) => new Date().getFullYear() - i);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900 flex flex-col">
            <div className="flex flex-col h-full w-full mx-auto">

                {/* Header */}
                <div className="flex-none flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-800">
                    <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                        <Filter className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
                        Filters
                        {activeCount > 0 && (
                            <span className="ml-1 text-sm font-normal text-slate-400">({activeCount} active)</span>
                        )}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition p-1">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4">

                    {isLoading && (
                        <div className="flex items-center gap-2 text-slate-400 text-sm mb-4">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-500" />
                            Loading options…
                        </div>
                    )}

                    <Section title="Search">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input type="text" value={localFilters.search}
                                onChange={e => handleChange('search', e.target.value)}
                                placeholder="Search by title…"
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm" />
                        </div>
                    </Section>

                    <Section title="Filter match mode">
                        <button
                            onClick={() => handleChange('filterMode', localFilters.filterMode === 'or' ? 'and' : 'or')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border-2 transition ${
                                localFilters.filterMode === 'and'
                                    ? 'border-red-500 bg-red-500/20 text-red-300'
                                    : 'border-slate-600 bg-slate-700 text-slate-300'
                            }`}>
                            {localFilters.filterMode === 'and' ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                            {localFilters.filterMode === 'and' ? 'AND — all tags must match' : 'OR — any tag matches'}
                        </button>
                        <p className="text-xs text-slate-500 mt-1.5">
                            {localFilters.filterMode === 'and'
                                ? 'Results must match every included tag/actor/etc.'
                                : 'Results match if they have at least one of the included items.'}
                        </p>
                    </Section>

                    {/* Chip legend */}
                    <div className="mb-5 flex flex-wrap items-center gap-3 text-xs text-slate-400">
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

                    <Section>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" checked={localFilters.favorite}
                                onChange={e => handleChange('favorite', e.target.checked)}
                                className="w-4 h-4 accent-red-500" />
                            <span className="text-white text-sm">Show favorites only</span>
                        </label>
                    </Section>

                    <Section title="Year">
                        <select value={localFilters.year} onChange={e => handleChange('year', e.target.value)}
                            className="w-full px-3 py-2.5 bg-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm">
                            <option value="">All Years</option>
                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </Section>

                    <Section title="Sort By">
                        <div className="flex gap-2">
                            <select value={localFilters.sortBy} onChange={e => handleChange('sortBy', e.target.value)}
                                className="flex-1 px-3 py-2.5 bg-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm">
                                <option value="updatedAt">Updated</option>
                                <option value="createdAt">Added</option>
                                <option value="title">Title (A–Z)</option>
                                <option value="year">Year</option>
                                <option value="views">Views</option>
                                <option value="duration">Duration</option>
                                <option value="episodeNumber">Episode #</option>
                            </select>
                            <select value={localFilters.order} onChange={e => handleChange('order', e.target.value)}
                                className="px-3 py-2.5 bg-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm">
                                <option value="desc">↓ Desc</option>
                                <option value="asc">↑ Asc</option>
                            </select>
                        </div>
                    </Section>

                    <Section title="Duration">
                        <div className="flex gap-2 flex-wrap">
                            {[
                                { value: '',       label: 'All',              sub: '' },
                                { value: 'short',  label: '⚡ Short',          sub: '< 5 min' },
                                { value: 'medium', label: '🎬 Medium',         sub: '5 ~ 30 min' },
                                { value: 'long',   label: '🎥 Long',           sub: '> 30 min' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => handleChange('durationFilter', opt.value)}
                                    className={`flex-1 min-w-17.5 px-2.5 py-2 rounded-lg text-xs font-medium border-2 transition text-center ${
                                        localFilters.durationFilter === opt.value
                                            ? 'border-red-500 bg-red-500/20 text-red-300'
                                            : 'border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600'
                                    }`}
                                >
                                    <div>{opt.label}</div>
                                    {opt.sub && <div className="text-slate-400 text-[10px]">{opt.sub}</div>}
                                </button>
                            ))}
                        </div>
                    </Section>

                    <Section title="Streaming">
                        <div className="flex gap-2 flex-wrap">
                            {[
                                { value: '',               label: '🎬 All',           sub: 'no filter' },
                                { value: 'transcoded',     label: '✅ Transcoded',     sub: 'HLS ready' },
                                { value: 'not_transcoded', label: '⚡ Not transcoded', sub: 'raw stream' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => handleChange('hlsFilter', opt.value)}
                                    className={`flex-1 min-w-17.5 px-2.5 py-2 rounded-lg text-xs font-medium border-2 transition text-center ${
                                        localFilters.hlsFilter === opt.value
                                            ? 'border-red-500 bg-red-500/20 text-red-300'
                                            : 'border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600'
                                    }`}
                                >
                                    <div>{opt.label}</div>
                                    <div className="text-slate-400 text-[10px]">{opt.sub}</div>
                                </button>
                            ))}
                        </div>
                    </Section>

                    {studios.length    > 0 && <TagSection title="Studios"    field="studios"    localFilters={localFilters} onCycle={handleCycle} allItems={studios}    />}
                    {actors.length     > 0 && <TagSection title="Actors"     field="actors"     localFilters={localFilters} onCycle={handleCycle} allItems={actors}     />}
                    {characters.length > 0 && <TagSection title="Characters" field="characters" localFilters={localFilters} onCycle={handleCycle} allItems={characters} />}
                    {tags.length       > 0 && <TagSection title="Tags"       field="tags"       localFilters={localFilters} onCycle={handleCycle} allItems={tags}       />}

                    {activeCount > 0 && (
                        <div className="mb-4 p-3 bg-slate-800 rounded-lg">
                            <p className="text-xs text-slate-400 mb-2">Active filters:</p>
                            <div className="flex flex-wrap gap-1 text-xs">
                                {localFilters.favorite        && <Badge label="❤ Favorites" color="red" />}
                                {localFilters.year            && <Badge label={`Year: ${localFilters.year}`} color="green" />}
                                {localFilters.durationFilter  && <Badge label={`Duration: ${localFilters.durationFilter}`} color="green" />}
                                {localFilters.hlsFilter       && <Badge label={`Streaming: ${localFilters.hlsFilter === 'transcoded' ? 'Transcoded' : 'Not transcoded'}`} color="green" />}
                                {['studios', 'actors', 'characters', 'tags'].map(f => (
                                    <React.Fragment key={f}>
                                        {localFilters[f]?.length > 0 && <Badge label={`✓ ${localFilters[f].length} ${f}`} color="green" />}
                                        {localFilters[`${f}Exclude`]?.length > 0 && <Badge label={`✗ ${localFilters[`${f}Exclude`].length} ${f}`} color="red" />}
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

                {/* Footer */}
                <div className="flex-none border-t border-slate-800 px-4 sm:px-6 py-4">
                    <div className="flex gap-3">
                        <button onClick={applyFilters}
                            className="flex-1 py-3 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition text-sm sm:text-base">
                            Apply{activeCount > 0 ? ` (${activeCount})` : ''}
                        </button>
                        <button onClick={resetFilters}
                            className="px-4 sm:px-5 py-3 bg-slate-700 text-white rounded-lg font-medium hover:bg-slate-600 transition text-sm sm:text-base">
                            Reset
                        </button>
                        <button onClick={onClose}
                            className="px-4 py-3 bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700 transition text-sm sm:text-base">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── TagSection ───────────────────────────────────────────────────────────────
// allItems: { value: string, count: number }[]
function TagSection({ title, field, allItems, localFilters, onCycle }) {
    const [search, setSearch]     = useState('');
    const [filtered, setFiltered] = useState(allItems);

    useEffect(() => {
        if (!search) { setFiltered(allItems); return; }
        const t = setTimeout(() => {
            const q = search.toLowerCase();
            setFiltered(allItems.filter(i => i.value.toLowerCase().includes(q)));
        }, 300);
        return () => clearTimeout(t);
    }, [search, allItems]);

    const included    = localFilters[field]              || [];
    const excluded    = localFilters[`${field}Exclude`] || [];
    const activeCount = included.length + excluded.length;

    // Total video count across all visible items in this section
    const totalCount = allItems.reduce((s, i) => s + (i.count || 0), 0);

    return (
        <Section title={
            <span className="flex items-center gap-2">
                {title}
                {activeCount > 0 && (
                    <span className="text-xs font-normal text-slate-400">({activeCount} selected)</span>
                )}
                <span className="ml-auto text-xs font-normal text-slate-500">{totalCount} videos</span>
            </span>
        }>
            {allItems.length > 6 && (
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder={`Filter ${title.toLowerCase()}…`}
                    className="w-full px-3 py-1.5 bg-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-xs mb-2" />
            )}
            <div className="flex flex-wrap gap-1.5 max-h-96 overflow-y-auto p-2 bg-slate-800 rounded-lg">
                {filtered.length === 0 ? (
                    <p className="text-slate-500 text-xs">No results</p>
                ) : (
                    filtered.map(item => {
                        const isIncluded = included.includes(item.value);
                        const isExcluded = excluded.includes(item.value);
                        return (
                            <button
                                key={item.value}
                                onClick={() => onCycle(field, item.value)}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition border-2 ${
                                    isIncluded
                                        ? 'bg-green-500/20 text-green-300 border-dashed border-green-400'
                                        : isExcluded
                                            ? 'bg-red-500/20 text-red-300 border-red-500 line-through'
                                            : 'bg-slate-700 text-slate-300 border-transparent hover:bg-slate-600'
                                }`}
                                title={isIncluded ? 'Click to exclude' : isExcluded ? 'Click to clear' : 'Click to include'}
                            >
                                {isIncluded && <span>✓ </span>}{isExcluded && <span>✗ </span>}
                                {item.value}
                                {/* Count badge */}
                                <span className={`ml-0.5 px-1 py-0 rounded text-[10px] leading-4 font-mono ${
                                    isIncluded ? 'bg-green-500/30 text-green-200'
                                    : isExcluded ? 'bg-red-500/30 text-red-200'
                                    : 'bg-slate-600 text-slate-400'
                                }`}>
                                    {item.count}
                                </span>
                            </button>
                        );
                    })
                )}
            </div>
        </Section>
    );
}

function Section({ title, children }) {
    return (
        <div className="mb-5">
            {title && (
                <div className="flex items-center justify-between mb-2">
                    {typeof title === 'string'
                        ? <label className="block text-white text-sm font-semibold">{title}</label>
                        : <div className="flex items-center w-full text-white text-sm font-semibold">{title}</div>
                    }
                </div>
            )}
            {children}
        </div>
    );
}

function Badge({ label, color = 'slate' }) {
    const map = { red: 'bg-red-500/20 text-red-400', green: 'bg-green-500/20 text-green-400', slate: 'bg-slate-600 text-slate-300' };
    return <span className={`px-2 py-0.5 rounded text-xs ${map[color] || map.slate}`}>{label}</span>;
}

export { cycleItem };
export default FilterSidebar;