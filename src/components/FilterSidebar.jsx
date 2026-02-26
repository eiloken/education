import React, { useCallback, useEffect, useState } from "react";
import { videoAPI } from "../api/api";
import { Filter, Search, Users, UserCircle, X } from "lucide-react";

const DEFAULT_FILTERS = {
    search: '',
    tags: [],
    studios: [],
    actors: [],
    characters: [],
    year: '',
    favorite: false,
    sortBy: 'uploadDate',
    order: 'desc'
};

function FilterSidebar({ isOpen, onClose, onFilterChange, currentFilters }) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const [tags, setTags] = useState([]);
    const [studios, setStudios] = useState([]);
    const [actors, setActors] = useState([]);
    const [characters, setCharacters] = useState([]);

    // Search within filter lists for large datasets
    const [actorSearch, setActorSearch] = useState('');
    const [characterSearch, setCharacterSearch] = useState('');
    const [studioSearch, setStudioSearch] = useState('');
    const [tagSearch, setTagSearch] = useState('');

    const [localFilters, setLocalFilters] = useState(DEFAULT_FILTERS);

    const fetchFilterOptions = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [tagsData, studiosData, actorsData, charsData] = await Promise.all([
                videoAPI.getTags(),
                videoAPI.getStudios(),
                videoAPI.getActors(),
                videoAPI.getCharacters()
            ]);
            setTags(tagsData || []);
            setStudios(studiosData || []);
            setActors(actorsData || []);
            setCharacters(charsData || []);
        } catch (err) {
            console.error('Error fetching filter options:', err);
            setError(err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchFilterOptions(); }, [fetchFilterOptions]);

    useEffect(() => {
        if (currentFilters) {
            setLocalFilters({
                ...DEFAULT_FILTERS,
                ...currentFilters,
                // Ensure all array fields exist
                tags: currentFilters.tags || [],
                studios: currentFilters.studios || [],
                actors: currentFilters.actors || [],
                characters: currentFilters.characters || []
            });
        }
    }, [currentFilters]);

    const handleChange = (key, value) => {
        setLocalFilters(prev => ({ ...prev, [key]: value }));
    };

    const toggleItem = (field, item) => {
        setLocalFilters(prev => {
            const arr = prev[field] || [];
            return {
                ...prev,
                [field]: arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item]
            };
        });
    };

    const applyFilters = () => {
        onFilterChange(localFilters);
        onClose();
    };

    const resetFilters = () => {
        setLocalFilters(DEFAULT_FILTERS);
        onFilterChange(DEFAULT_FILTERS);
    };

    const activeCount = [
        ...(localFilters.tags || []),
        ...(localFilters.studios || []),
        ...(localFilters.actors || []),
        ...(localFilters.characters || [])
    ].length + (localFilters.year ? 1 : 0) + (localFilters.favorite ? 1 : 0);

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 50 }, (_, i) => currentYear - i);

    const filteredActors = actors.filter(a =>
        !actorSearch || a.toLowerCase().includes(actorSearch.toLowerCase())
    );
    const filteredCharacters = characters.filter(c =>
        !characterSearch || c.toLowerCase().includes(characterSearch.toLowerCase())
    );

    if (!isOpen) return null;

    return (
        <>
            {/* Sidebar */}
            <div className="fixed inset-0 bg-slate-900 z-50 overflow-y-auto flex flex-col items-center justify-between">
                <div className="p-6 container">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Filter className="w-6 h-6 text-red-500" />
                            Filters
                            {activeCount > 0 && (
                                <span className="ml-1 text-sm font-normal text-slate-400">({activeCount} active)</span>
                            )}
                        </h2>
                        <button onClick={onClose} className="text-slate-400 hover:text-white transition">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Loading */}
                    {isLoading && (
                        <div className="flex items-center gap-2 text-slate-400 text-sm mb-4">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-500" />
                            Loading options...
                        </div>
                    )}

                    {/* Search */}
                    <Section title="Search">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                value={localFilters.search}
                                onChange={(e) => handleChange('search', e.target.value)}
                                placeholder="Search by title..."
                                className="w-full pl-10 pr-4 py-2 bg-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                            />
                        </div>
                    </Section>

                    {/* Favorites */}
                    <Section>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={localFilters.favorite}
                                onChange={(e) => handleChange('favorite', e.target.checked)}
                                className="w-4 h-4 accent-red-500"
                            />
                            <span className="text-white text-sm">Show favorites only</span>
                        </label>
                    </Section>

                    {/* Year */}
                    <Section title="Year">
                        <select
                            value={localFilters.year}
                            onChange={(e) => handleChange('year', e.target.value)}
                            className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                        >
                            <option value="">All Years</option>
                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </Section>

                    {/* Sort */}
                    <Section title="Sort By">
                        <div className="space-y-2">
                            <select
                                value={localFilters.sortBy}
                                onChange={(e) => handleChange('sortBy', e.target.value)}
                                className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                            >
                                <option value="uploadDate">Upload Date</option>
                                <option value="createdAt">Created Date</option>
                                <option value="title">Title</option>
                                <option value="year">Year</option>
                                <option value="views">Views</option>
                            </select>
                            <select
                                value={localFilters.order}
                                onChange={(e) => handleChange('order', e.target.value)}
                                className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                            >
                                <option value="desc">Descending</option>
                                <option value="asc">Ascending</option>
                            </select>
                        </div>
                    </Section>

                    {/* Studios */}
                    {studios && studios.length > 0 && (
                        <TagsSection 
                            title="Studios: " 
                            field="studios" 
                            localFilters={localFilters} 
                            ontoggleItem={toggleItem} 
                            tags={studios}
                        />
                    )}
                    

                    {/* Actors */}
                    {actors && actors.length > 0 && (
                        <TagsSection 
                            title="Actors: " 
                            field="actors" 
                            localFilters={localFilters} 
                            ontoggleItem={toggleItem} 
                            tags={actors}
                        />
                    )}

                    {/* Characters */}
                    {characters && characters.length > 0 && (
                        <TagsSection 
                            title="Characters: " 
                            field="characters" 
                            localFilters={localFilters} 
                            ontoggleItem={toggleItem} 
                            tags={characters}
                        />
                    )}

                    {/* Tags */}
                    {tags && tags.length > 0 && (
                        <TagsSection 
                            title="Tags: " 
                            field="tags" 
                            localFilters={localFilters} 
                            ontoggleItem={toggleItem} 
                            tags={tags}
                        />
                    )}

                    {/* Active filter summary */}
                    {activeCount > 0 && (
                        <div className="mb-4 p-3 bg-slate-800 rounded-lg">
                            <p className="text-xs text-slate-400 mb-2">Active filters:</p>
                            <div className="flex flex-wrap gap-1 text-xs">
                                {localFilters.favorite && <Badge label="Favorites" color="red" />}
                                {localFilters.studios.length > 0 && <Badge label={`${localFilters.studios.length} studio${localFilters.studios.length > 1 ? 's' : ''}`} color="slate" />}
                                {localFilters.actors.length > 0 && <Badge label={`${localFilters.actors.length} actor${localFilters.actors.length > 1 ? 's' : ''}`} color="blue" />}
                                {localFilters.characters.length > 0 && <Badge label={`${localFilters.characters.length} character${localFilters.characters.length > 1 ? 's' : ''}`} color="purple" />}
                                {localFilters.tags.length > 0 && <Badge label={`${localFilters.tags.length} tag${localFilters.tags.length > 1 ? 's' : ''}`} color="slate" />}
                                {localFilters.year && <Badge label={`Year: ${localFilters.year}`} color="green" />}
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="p-6 container">
                    {/* Actions */}
                    <div className="flex items-center flex-col sm:flex-row gap-4">
                        <button
                            onClick={applyFilters}
                            className="w-full py-3 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition"
                        >
                            Apply Filters
                        </button>
                        <button
                            onClick={resetFilters}
                            className="w-full py-3 bg-slate-700 text-white rounded-lg font-medium hover:bg-slate-600 transition"
                        >
                            Reset All
                        </button>
                    </div>

                    {error && (
                        <div className="mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
                            <p className="text-red-400 text-sm">Failed to load filter options. Try refreshing.</p>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

function TagsSection({ title, field, tags, localFilters, ontoggleItem }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredTags, setFilteredTags] = useState(tags || []);

    useEffect(() => {
        if (!searchTerm) {
            setFilteredTags(tags);
            return;
        }

        const debounce = setTimeout(() => {
            const matched = tags.filter((t) => t.toLowerCase().includes(searchTerm.toLowerCase()));
            setFilteredTags(matched);
        }, 500);

        return () => clearTimeout(debounce);
    }, [searchTerm, tags]);

    return (
        <Section title={`${title}${localFilters[field].length > 0 ? ` (${localFilters[field].length})` : ''}`}>
            {tags.length > 6 && (
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filter..."
                    className="w-full px-3 py-1.5 bg-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-xs mb-2"
                />
            )}
            <div className="flex flex-wrap gap-1.5 max-h-125 overflow-y-auto p-2 bg-slate-800 rounded-lg">
                {filteredTags.length === 0 ? (
                    <p className="text-slate-500 text-xs">
                        {searchTerm ? `No results matching "${searchTerm}"` : 'No tags available'}
                    </p>
                ) : (
                    filteredTags.map(tag => (
                        <button
                            key={tag}
                            onClick={() => ontoggleItem(field, tag)}
                            className={`px-2.5 py-1 rounded-full text-xs transition ${
                                localFilters[field].includes(tag)
                                    ? 'bg-red-500 text-white'
                                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                        >
                            {tag}
                        </button>
                    ))
                )}
            </div>
        </Section>
    );
}

function Section({ title, icon, children }) {
    return (
        <div className="mb-5">
            {title && (
                <div className="flex items-center gap-1.5 mb-2">
                    {icon}
                    <label className="block text-white text-sm font-semibold">{title}</label>
                </div>
            )}
            {children}
        </div>
    );
}

function Badge({ label, color = "slate" }) {
    const colorMap = {
        red: 'bg-red-500/20 text-red-400',
        blue: 'bg-blue-500/20 text-blue-400',
        purple: 'bg-purple-500/20 text-purple-400',
        green: 'bg-green-500/20 text-green-400',
        slate: 'bg-slate-600 text-slate-300'
    };
    return (
        <span className={`px-2 py-0.5 rounded text-xs ${colorMap[color]}`}>{label}</span>
    );
}

export default FilterSidebar;
