import React, { useCallback, useEffect, useRef, useState } from "react";
import { albumAPI } from "../../api/api";
import {
    X, Plus, Eraser, Search, RefreshCw, ImageOff,
    ChevronDown, Images,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── useDebounce ──────────────────────────────────────────────────────────────
function useDebounce(value, delay) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}

// ─── Simple fuzzy filter ──────────────────────────────────────────────────────
function filterSuggestions(term, list, limit = 8) {
    if (!term) return list.slice(0, limit);
    const t = term.toLowerCase();
    return list
        .filter(s => s.toLowerCase().includes(t))
        .slice(0, limit);
}

// ─── TagSection — mirrors the UploadVideo TagSection style ───────────────────
function TagSection({ title, color = 'pink', inputValue, setInputValue, selectedItems, suggestions, onSelect, onAdd, onClear, disabled }) {
    const [matched,    setMatched]    = useState(suggestions || []);
    const [showItems,  setShowItems]  = useState([]);
    const [targetItem, setTargetItem] = useState(null);
    const searchTerm = useDebounce(inputValue, 250);

    useEffect(() => {
        const m = filterSuggestions(searchTerm, suggestions);
        setMatched(m);
    }, [searchTerm, suggestions]);

    useEffect(() => {
        const all = [...new Set([...selectedItems, ...matched])];
        setShowItems(all);
        setTargetItem(matched.find(m => !selectedItems.includes(m)) ?? null);
    }, [selectedItems, matched]);

    const ring = color === 'pink' ? 'focus:ring-pink-500 focus:border-pink-500' : 'focus:ring-blue-500 focus:border-blue-500';
    const activePill = color === 'pink' ? 'bg-pink-500 border-pink-500 text-white' : 'bg-blue-500 border-blue-500 text-white';
    const addBtn = color === 'pink' ? 'bg-pink-600 hover:bg-pink-500' : 'bg-blue-600 hover:bg-blue-500';

    return (
        <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/60 space-y-3">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <div className="flex gap-2">
                <div className="relative flex-1">
                    {!inputValue && (
                        <div className="absolute inset-0 flex items-center px-3 pointer-events-none text-slate-500 text-xs">
                            {showItems.length > 0
                                ? <span className="hidden sm:block">
                                    Press <kbd className="px-1 py-0.5 bg-slate-700 border border-slate-600 rounded font-mono mx-0.5">Enter</kbd> to add ·
                                    <kbd className="px-1 py-0.5 bg-slate-700 border border-slate-600 rounded font-mono mx-0.5">↑↓</kbd> to navigate
                                  </span>
                                : <span>Add new…</span>
                            }
                        </div>
                    )}
                    <input
                        type="text"
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); if (targetItem) onSelect(targetItem); else onAdd(); }
                            else if (e.key === 'Escape') setInputValue('');
                            else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                                e.preventDefault();
                                const len = showItems.length; if (!len) return;
                                const cur = showItems.indexOf(targetItem);
                                const delta = e.key === 'ArrowDown' ? 1 : -1;
                                const base  = cur === -1 ? (delta === 1 ? 0 : len - 1) : cur;
                                setTargetItem(showItems[(base + delta + len) % len]);
                            }
                        }}
                        maxLength={50}
                        disabled={disabled}
                        className={`w-full pl-3 pr-14 py-2 text-sm bg-white/10 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 text-white placeholder-transparent ${ring} disabled:opacity-50`}
                    />
                    <div className="absolute top-1/2 right-2 -translate-y-1/2 flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-500">{inputValue?.length || 0}/50</span>
                        {inputValue && (
                            <button type="button" onClick={() => setInputValue('')} tabIndex={-1} disabled={disabled}>
                                <X className="w-3.5 h-3.5 text-slate-400 hover:text-white" />
                            </button>
                        )}
                    </div>
                </div>
                <button type="button" onClick={onClear} disabled={disabled || !selectedItems.length}
                    className="shrink-0 px-2.5 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition disabled:opacity-40" title="Clear all">
                    <Eraser className="w-4 h-4 text-slate-300" />
                </button>
                <button type="button" onClick={onAdd} disabled={disabled || !inputValue.trim()}
                    className={`shrink-0 px-2.5 py-2 ${addBtn} text-white rounded-lg transition disabled:opacity-40`}>
                    <Plus className="w-4 h-4" />
                </button>
            </div>

            {showItems.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {showItems.map(item => (
                        <button key={item} type="button" onClick={() => onSelect(item)} disabled={disabled}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition disabled:opacity-50 ${
                                selectedItems.includes(item)
                                    ? activePill
                                    : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-pink-400'
                            } ${item === targetItem ? 'ring-2 ring-offset-1 ring-offset-slate-800 ring-pink-400' : ''}`}>
                            {item}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── AlbumFormModal ───────────────────────────────────────────────────────────
export default function AlbumFormModal({ album, onSaved, onClose }) {
    const isEdit = !!album?._id;

    // Core fields
    const [title,       setTitle]       = useState(album?.title || '');
    const [description, setDescription] = useState(album?.description || '');
    const [year,        setYear]        = useState(album?.year || '');
    const [saving,      setSaving]      = useState(false);
    const [refreshing,  setRefreshing]  = useState(false);
    const [coverSrc,    setCoverSrc]    = useState(
        album?.mosaicPath ? albumAPI.imageUrl(album.mosaicPath)
        : album?.coverPath ? albumAPI.imageUrl(album.coverPath)
        : null
    );

    // Tag state pairs: [value, setter, selectedList, selectedSetter, suggestionsList]
    const [tagInput,       setTagInput]       = useState('');
    const [studioInput,    setStudioInput]    = useState('');
    const [actorInput,     setActorInput]     = useState('');
    const [charInput,      setCharInput]      = useState('');

    const [tags,       setTags]       = useState(album?.tags       || []);
    const [studios,    setStudios]    = useState(album?.studios    || []);
    const [actors,     setActors]     = useState(album?.actors     || []);
    const [characters, setCharacters] = useState(album?.characters || []);

    // Suggestions fetched from BE
    const [tagSugg,   setTagSugg]   = useState([]);
    const [studSugg,  setStudSugg]  = useState([]);
    const [actSugg,   setActSugg]   = useState([]);
    const [charSugg,  setCharSugg]  = useState([]);

    useEffect(() => {
        albumAPI.getMetadata('tags').then(d => setTagSugg(d || [])).catch(() => {});
        albumAPI.getMetadata('studios').then(d => setStudSugg(d || [])).catch(() => {});
        albumAPI.getMetadata('actors').then(d => setActSugg(d || [])).catch(() => {});
        albumAPI.getMetadata('characters').then(d => setCharSugg(d || [])).catch(() => {});
    }, []);

    // Generic helpers for TagSection
    const makeHandlers = (list, setList, inputSetter) => ({
        onSelect: (item) => {
            setList(prev => prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]);
            inputSetter('');
        },
        onAdd: () => {
            // handled by onSelect via targetItem in TagSection
        },
        onClear: () => setList([]),
    });

    // We wrap onAdd properly: add the raw input value if it's not already in list
    const makeAdd = (inputVal, inputSetter, list, setList) => () => {
        const v = inputVal.trim();
        if (v && !list.includes(v)) setList(prev => [...prev, v]);
        inputSetter('');
    };

    // Refresh cover (edit mode only)
    const handleRefreshCover = async () => {
        if (!album?._id) return;
        setRefreshing(true);
        try {
            const res = await albumAPI.refreshCover(album._id);
            if (res.mosaicPath) setCoverSrc(albumAPI.imageUrl(res.mosaicPath) + '?t=' + Date.now());
            toast.success('Cover refreshed');
        } catch { toast.error('Failed to refresh cover'); }
        finally   { setRefreshing(false); }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim()) return toast.error('Title is required');
        setSaving(true);
        try {
            const body = {
                title:       title.trim(),
                description: description.trim(),
                year:        year || '',
                tags,
                studios,
                actors,
                characters,
            };
            if (isEdit) {
                await albumAPI.updateAlbum(album._id, body);
                toast.success('Album updated');
            } else {
                await albumAPI.createAlbum(body);
                toast.success('Album created');
            }
            onSaved();
        } catch (err) {
            toast.error(err?.response?.data?.error || 'Save failed');
        } finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
                    <h2 className="text-white font-bold text-base flex items-center gap-2">
                        <Images className="w-4 h-4 text-pink-400" />
                        {isEdit ? 'Edit Album' : 'New Album'}
                    </h2>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg transition">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4 flex-1 overflow-y-auto">

                    {/* Cover preview (edit mode — auto-generated, no upload) */}
                    {isEdit && (
                        <div className="relative rounded-xl overflow-hidden bg-slate-800 border border-slate-700" style={{ aspectRatio: '3/2' }}>
                            {coverSrc
                                ? <img src={coverSrc} alt="cover" className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-500">
                                    <ImageOff className="w-8 h-8" />
                                    <span className="text-xs">No cover yet — upload images first</span>
                                  </div>
                            }
                            <button type="button" onClick={handleRefreshCover} disabled={refreshing}
                                className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5 bg-black/60 hover:bg-black/80 text-white text-xs rounded-lg border border-white/20 transition disabled:opacity-50">
                                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                                {refreshing ? 'Refreshing…' : 'Refresh cover'}
                            </button>
                        </div>
                    )}

                    {/* Title */}
                    <div>
                        <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider font-semibold">Title *</label>
                        <input value={title} onChange={e => setTitle(e.target.value)} required
                            placeholder="Album title"
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition" />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider font-semibold">Description</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                            placeholder="Optional description"
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none transition" />
                    </div>

                    {/* Year */}
                    <div>
                        <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider font-semibold">Year</label>
                        <input type="number" min="1900" max="2099" value={year} onChange={e => setYear(e.target.value)}
                            placeholder="e.g. 2024"
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-500 transition" />
                    </div>

                    {/* Tags */}
                    <TagSection title="Tags" color="pink"
                        inputValue={tagInput} setInputValue={setTagInput}
                        selectedItems={tags} suggestions={tagSugg}
                        {...makeHandlers(tags, setTags, setTagInput)}
                        onAdd={makeAdd(tagInput, setTagInput, tags, setTags)} />

                    {/* Studios */}
                    <TagSection title="Studios" color="pink"
                        inputValue={studioInput} setInputValue={setStudioInput}
                        selectedItems={studios} suggestions={studSugg}
                        {...makeHandlers(studios, setStudios, setStudioInput)}
                        onAdd={makeAdd(studioInput, setStudioInput, studios, setStudios)} />

                    {/* Actors */}
                    <TagSection title="Actors" color="pink"
                        inputValue={actorInput} setInputValue={setActorInput}
                        selectedItems={actors} suggestions={actSugg}
                        {...makeHandlers(actors, setActors, setActorInput)}
                        onAdd={makeAdd(actorInput, setActorInput, actors, setActors)} />

                    {/* Characters */}
                    <TagSection title="Characters" color="pink"
                        inputValue={charInput} setInputValue={setCharInput}
                        selectedItems={characters} suggestions={charSugg}
                        {...makeHandlers(characters, setCharacters, setCharInput)}
                        onAdd={makeAdd(charInput, setCharInput, characters, setCharacters)} />

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                        <button type="button" onClick={onClose}
                            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving}
                            className="px-5 py-2 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition">
                            {saving ? 'Saving…' : isEdit ? 'Update' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}