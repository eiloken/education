import React, { useEffect, useRef, useState } from "react";
import { albumAPI } from "../../api/api";
import { X, Plus, Upload } from "lucide-react";
import toast from "react-hot-toast";

function TagInput({ label, values, onChange, placeholder }) {
    const [input, setInput] = useState('');
    const add = () => {
        const v = input.trim();
        if (v && !values.includes(v)) onChange([...values, v]);
        setInput('');
    };
    const remove = (val) => onChange(values.filter(v => v !== val));
    return (
        <div>
            <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">{label}</label>
            <div className="flex gap-2 mb-2">
                <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                    placeholder={placeholder}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-pink-500 transition"
                />
                <button type="button" onClick={add} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition">
                    <Plus className="w-3.5 h-3.5" />
                </button>
            </div>
            {values.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {values.map(v => (
                        <span key={v} className="flex items-center gap-1 px-2 py-0.5 bg-pink-500/20 text-pink-300 text-xs rounded-full">
                            {v}
                            <button type="button" onClick={() => remove(v)} className="text-pink-400 hover:text-pink-200 transition">
                                <X className="w-2.5 h-2.5" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function AlbumFormModal({ album, onSaved, onClose }) {
    const [title,       setTitle]       = useState(album?.title || '');
    const [description, setDescription] = useState(album?.description || '');
    const [year,        setYear]        = useState(album?.year || '');
    const [tags,        setTags]        = useState(album?.tags || []);
    const [studios,     setStudios]     = useState(album?.studios || []);
    const [actors,      setActors]      = useState(album?.actors || []);
    const [characters,  setCharacters]  = useState(album?.characters || []);
    const [coverFile,   setCoverFile]   = useState(null);
    const [coverPreview, setCoverPreview] = useState(null);
    const [saving, setSaving] = useState(false);

    const coverInputRef = useRef(null);

    useEffect(() => {
        if (coverFile) {
            const url = URL.createObjectURL(coverFile);
            setCoverPreview(url);
            return () => URL.revokeObjectURL(url);
        }
    }, [coverFile]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim()) return toast.error('Title is required');
        setSaving(true);
        try {
            const fd = new FormData();
            fd.append('title', title.trim());
            fd.append('description', description.trim());
            fd.append('year', year || '');
            fd.append('tags', JSON.stringify(tags));
            fd.append('studios', JSON.stringify(studios));
            fd.append('actors', JSON.stringify(actors));
            fd.append('characters', JSON.stringify(characters));
            if (coverFile) fd.append('cover', coverFile);

            if (album?._id) {
                await albumAPI.updateAlbum(album._id, fd);
                toast.success('Album updated');
            } else {
                await albumAPI.createAlbum(fd);
                toast.success('Album created');
            }
            onSaved();
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
                <div className="flex items-center justify-between p-5 border-b border-slate-800">
                    <h2 className="text-white font-bold text-base">{album ? 'Edit Album' : 'New Album'}</h2>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"><X className="w-4 h-4" /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">Title *</label>
                        <input
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="Album title"
                            required
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-pink-500 transition"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">Description</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            rows={2}
                            placeholder="Optional description"
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-pink-500 resize-none transition"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">Year</label>
                        <input
                            type="number" min="1900" max="2099" value={year}
                            onChange={e => setYear(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-pink-500 transition"
                        />
                    </div>

                    {/* Cover */}
                    <div>
                        <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">Cover Image</label>
                        <div className="flex items-center gap-3">
                            {coverPreview ? (
                                <img src={coverPreview} alt="" className="w-16 h-12 object-cover rounded-lg" />
                            ) : album?.coverPath ? (
                                <img src={albumAPI.imageUrl(album.coverPath)} alt="" className="w-16 h-12 object-cover rounded-lg" />
                            ) : null}
                            <button type="button" onClick={() => coverInputRef.current?.click()}
                                className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition">
                                <Upload className="w-3.5 h-3.5" /> Choose cover
                            </button>
                        </div>
                        <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
                            onChange={e => { if (e.target.files[0]) setCoverFile(e.target.files[0]); }} />
                    </div>

                    <TagInput label="Tags"       values={tags}       onChange={setTags}       placeholder="Add tag…" />
                    <TagInput label="Studios"    values={studios}    onChange={setStudios}    placeholder="Add studio…" />
                    <TagInput label="Actors"     values={actors}     onChange={setActors}     placeholder="Add actor…" />
                    <TagInput label="Characters" values={characters} onChange={setCharacters} placeholder="Add character…" />

                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose}
                            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving}
                            className="px-4 py-2 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                            {saving ? 'Saving…' : album ? 'Update' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
