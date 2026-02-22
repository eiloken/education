import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { seriesAPI, videoAPI } from "../api/api";
import toast, { Toaster } from "react-hot-toast";
import { ArrowLeft, Image, Layers, Loader, Plus, Save, Trash2, X } from "lucide-react";

// mode: 'create' | 'edit'
function CreateSeries({ mode = 'create' }) {
    const navigate = useNavigate();
    const { id } = useParams();
    const thumbInputRef = useRef(null);

    const [pageLoading, setPageLoading] = useState(mode === 'edit');
    const [saving, setSaving] = useState(false);
    const [existingSeries, setExistingSeries] = useState(null);

    const [formData, setFormData] = useState({
        title: "",
        description: "",
        tags: [],
        studios: [],
        actors: [],
        characters: [],
        year: new Date().getFullYear()
    });

    const [thumbnailFile, setThumbnailFile] = useState(null);
    const [thumbnailPreview, setThumbnailPreview] = useState(null);

    const [tagInput, setTagInput] = useState("");
    const [studioInput, setStudioInput] = useState("");
    const [actorInput, setActorInput] = useState("");
    const [characterInput, setCharacterInput] = useState("");

    const [availableTags, setAvailableTags] = useState([]);
    const [availableStudios, setAvailableStudios] = useState([]);
    const [availableActors, setAvailableActors] = useState([]);

    const fetchMeta = useCallback(async () => {
        try {
            const [tags, studios, actors] = await Promise.all([
                videoAPI.getTags(),
                videoAPI.getStudios(),
                videoAPI.getActors()
            ]);
            setAvailableTags(tags);
            setAvailableStudios(studios);
            setAvailableActors(actors);
        } catch (_) {}
    }, []);

    useEffect(() => { fetchMeta(); }, [fetchMeta]);

    useEffect(() => {
        if (mode !== 'edit' || !id) return;
        (async () => {
            try {
                const data = await seriesAPI.getSeriesWithEpisodes(id);
                const s = data.series;
                setExistingSeries(s);
                setFormData({
                    title: s.title || "",
                    description: s.description || "",
                    tags: s.tags || [],
                    studios: s.studios || [],
                    actors: s.actors || [],
                    characters: s.characters || [],
                    year: s.year || new Date().getFullYear()
                });
                if (s.thumbnailPath) {
                    setThumbnailPreview(seriesAPI.thumbnailUrl(s.thumbnailPath));
                }
            } catch (err) {
                toast.error("Failed to load series data");
            } finally {
                setPageLoading(false);
            }
        })();
    }, [mode, id]);

    const handleThumbnailChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setThumbnailFile(file);
        setThumbnailPreview(URL.createObjectURL(file));
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const addItem = (field, value, setInput) => {
        const trimmed = value.trim();
        if (trimmed && !formData[field].includes(trimmed)) {
            setFormData(prev => ({ ...prev, [field]: [...prev[field], trimmed] }));
            setInput("");
        }
    };

    const removeItem = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: prev[field].filter(v => v !== value) }));
    };

    const handleSubmit = async () => {
        if (!formData.title.trim()) {
            toast.error("Series title is required");
            return;
        }

        setSaving(true);
        try {
            const data = new FormData();
            data.append('title', formData.title.trim());
            data.append('description', formData.description || "");
            data.append('tags', JSON.stringify(formData.tags));
            data.append('studios', JSON.stringify(formData.studios));
            data.append('actors', JSON.stringify(formData.actors));
            data.append('characters', JSON.stringify(formData.characters));
            if (formData.year) data.append('year', formData.year);
            if (thumbnailFile) data.append('thumbnail', thumbnailFile);

            if (mode === 'edit') {
                const result = await seriesAPI.updateSeries(id, data);
                toast.success("Series updated successfully");
                setTimeout(() => navigate(`/series/${id}`), 800);
            } else {
                const result = await seriesAPI.createSeries(data);
                toast.success("Series created! You can now add episodes.");
                setTimeout(() => navigate(`/series/${result.series._id}`), 800);
            }
        } catch (error) {
            console.error("Error saving series:", error);
            toast.error(error.response?.data?.error || "Failed to save series");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm("Delete this entire series and all its episodes? This cannot be undone.")) return;
        try {
            await seriesAPI.deleteSeries(id);
            toast.success("Series deleted");
            navigate('/');
        } catch (error) {
            toast.error("Failed to delete series");
        }
    };

    if (pageLoading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <Loader className="w-10 h-10 animate-spin text-red-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <Toaster position="top-right" />

            {/* Header */}
            <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
                <div className="container mx-auto p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate(mode === 'edit' ? `/series/${id}` : '/')}
                                className="p-2 hover:bg-slate-800 rounded-lg transition"
                            >
                                <ArrowLeft className="w-6 h-6" />
                            </button>
                            <div>
                                <h1 className="text-2xl font-bold text-red-50 flex items-center gap-2">
                                    <Layers className="w-6 h-6 text-red-500" />
                                    {mode === 'edit' ? 'Edit Series' : 'Create New Series'}
                                </h1>
                                {mode === 'edit' && existingSeries && (
                                    <p className="text-sm text-slate-400 mt-0.5">{existingSeries.title}</p>
                                )}
                            </div>
                        </div>
                        {mode === 'edit' && (
                            <button
                                onClick={handleDelete}
                                className="flex items-center gap-2 px-4 py-2 bg-red-900/40 hover:bg-red-900/70 text-red-400 rounded-lg transition text-sm"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete Series
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8 max-w-3xl">
                <div className="space-y-6">

                    {/* Thumbnail */}
                    <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
                        <h2 className="text-xl font-semibold mb-4">Series Thumbnail</h2>
                        <div className="flex items-start gap-6">
                            {/* Preview */}
                            <div
                                onClick={() => thumbInputRef.current?.click()}
                                className="w-48 h-28 shrink-0 rounded-lg overflow-hidden bg-slate-800 border-2 border-dashed border-slate-600 hover:border-red-500 transition cursor-pointer flex items-center justify-center"
                            >
                                {thumbnailPreview ? (
                                    <img src={thumbnailPreview} alt="Thumbnail preview" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="text-center text-slate-500">
                                        <Image className="w-8 h-8 mx-auto mb-1" />
                                        <p className="text-xs">Click to upload</p>
                                    </div>
                                )}
                            </div>
                            <div>
                                <input
                                    ref={thumbInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleThumbnailChange}
                                    className="hidden"
                                />
                                <button
                                    type="button"
                                    onClick={() => thumbInputRef.current?.click()}
                                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition"
                                >
                                    {thumbnailPreview ? 'Change Thumbnail' : 'Upload Thumbnail'}
                                </button>
                                {thumbnailPreview && (
                                    <button
                                        type="button"
                                        onClick={() => { setThumbnailFile(null); setThumbnailPreview(null); }}
                                        className="ml-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-sm transition"
                                    >
                                        Remove
                                    </button>
                                )}
                                <p className="text-xs text-slate-500 mt-2">JPG, PNG, or WebP. Recommended: 16:9 aspect ratio.</p>
                            </div>
                        </div>
                    </div>

                    {/* Basic Info */}
                    <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
                        <h2 className="text-xl font-semibold mb-4">Series Info</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Title *</label>
                                <input
                                    type="text"
                                    name="title"
                                    value={formData.title}
                                    onChange={handleInputChange}
                                    placeholder="Series title"
                                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Description</label>
                                <textarea
                                    name="description"
                                    value={formData.description}
                                    onChange={handleInputChange}
                                    rows={4}
                                    placeholder="Series description..."
                                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Year</label>
                                <input
                                    type="number"
                                    name="year"
                                    value={formData.year}
                                    onChange={handleInputChange}
                                    min={1900}
                                    max={new Date().getFullYear() + 2}
                                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Tags */}
                    <TagSection
                        title="Tags"
                        inputValue={tagInput}
                        setInputValue={setTagInput}
                        items={formData.tags}
                        suggestions={availableTags}
                        datalistId="tags-datalist"
                        placeholder="Add tag"
                        onAdd={() => addItem('tags', tagInput, setTagInput)}
                        onRemove={(v) => removeItem('tags', v)}
                    />

                    {/* Studios */}
                    <TagSection
                        title="Studios"
                        inputValue={studioInput}
                        setInputValue={setStudioInput}
                        items={formData.studios}
                        suggestions={availableStudios}
                        datalistId="studios-datalist"
                        placeholder="Add studio"
                        onAdd={() => addItem('studios', studioInput, setStudioInput)}
                        onRemove={(v) => removeItem('studios', v)}
                    />

                    {/* Actors */}
                    <TagSection
                        title="Actors"
                        inputValue={actorInput}
                        setInputValue={setActorInput}
                        items={formData.actors}
                        suggestions={availableActors}
                        datalistId="actors-datalist"
                        placeholder="Add actor"
                        onAdd={() => addItem('actors', actorInput, setActorInput)}
                        onRemove={(v) => removeItem('actors', v)}
                    />

                    {/* Characters */}
                    <TagSection
                        title="Characters"
                        inputValue={characterInput}
                        setInputValue={setCharacterInput}
                        items={formData.characters}
                        suggestions={[]}
                        datalistId={null}
                        placeholder="Add character"
                        onAdd={() => addItem('characters', characterInput, setCharacterInput)}
                        onRemove={(v) => removeItem('characters', v)}
                    />

                    {/* Action buttons */}
                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={() => navigate(mode === 'edit' ? `/series/${id}` : '/')}
                            className="flex-1 px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg transition font-semibold"
                            disabled={saving}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={saving}
                            className="flex-1 px-6 py-3 bg-red-500 hover:bg-red-600 rounded-lg transition font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {saving ? (
                                <><Loader className="w-5 h-5 animate-spin" /> Saving...</>
                            ) : (
                                <><Save className="w-5 h-5" /> {mode === 'edit' ? 'Save Changes' : 'Create Series'}</>
                            )}
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}

function TagSection({ title, inputValue, setInputValue, items, suggestions, datalistId, placeholder, onAdd, onRemove }) {
    return (
        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
            <h2 className="text-xl font-semibold mb-4">{title}</h2>
            <div className="space-y-3">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onAdd())}
                        className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                        placeholder={placeholder}
                        list={datalistId || undefined}
                    />
                    {datalistId && suggestions.length > 0 && (
                        <datalist id={datalistId}>
                            {suggestions.map((s, i) => <option key={i} value={s} />)}
                        </datalist>
                    )}
                    <button
                        type="button"
                        onClick={onAdd}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg transition"
                    >
                        <Plus className="w-5 h-5" />
                    </button>
                </div>
                {items.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {items.map((item, i) => (
                            <span key={i} className="flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-full text-sm">
                                {item}
                                <button type="button" onClick={() => onRemove(item)} className="hover:text-red-500 transition">
                                    <X className="w-4 h-4" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default CreateSeries;
