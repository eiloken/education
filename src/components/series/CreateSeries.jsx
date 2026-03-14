import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { generalAPI, seriesAPI, videoAPI } from "../../api/api";
import toast from "react-hot-toast";
import { ArrowLeft, Check, Image, ImagePlay, Layers, Loader, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";

// ─── ThumbnailStrip ───────────────────────────────────────────────────────────
function ThumbnailStrip({ candidates, selected, onSelect, loading, disabled = false }) {
    const fmt   = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const isSel = t => selected?.filename === t.filename;

    if (loading) return (
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="aspect-video bg-slate-700 rounded-lg animate-pulse" />
            ))}
        </div>
    );
    if (!candidates.length) return null;

    return (
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {candidates.map(thumb => {
                const sel = isSel(thumb);
                return (
                    <button key={thumb.filename} type="button" disabled={disabled}
                        onClick={() => onSelect(sel ? null : thumb)}
                        className={`relative rounded-lg overflow-hidden aspect-video border-2 transition-all focus:outline-none disabled:cursor-not-allowed ${
                            sel
                                ? 'border-red-500 ring-2 ring-red-500/30 scale-[1.04]'
                                : 'border-slate-700 hover:border-slate-500 hover:scale-[1.02]'
                        }`}
                    >
                        <img src={thumb.url} alt="" className="w-full h-full object-cover"
                            onError={e => { e.target.style.display = 'none'; }} />
                        <div className="absolute bottom-0.5 left-0.5 px-1 py-0.5 bg-black/75 text-white text-[9px] sm:text-[10px] rounded font-mono leading-none">
                            {fmt(thumb.ts)}
                        </div>
                        {sel && (
                            <div className="absolute inset-0 bg-red-500/25 flex items-center justify-center">
                                <div className="bg-red-500 rounded-full p-1 shadow">
                                    <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                                </div>
                            </div>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

// mode: 'create' | 'edit'

function CreateSeries({ mode = 'create' }) {
    const navigate = useNavigate();
    const { id } = useParams();
    const thumbInputRef = useRef(null);

    const [isDragging, setIsDragging] = useState(false);

    const [pageLoading, setPageLoading] = useState(mode === 'edit');
    const [saving, setSaving] = useState(false);
    const [existingSeries, setExistingSeries] = useState(null);

    // ── Thumbnail generation from episode ──────────────────────────────────
    const [thumbCandidates,  setThumbCandidates]  = useState([]);
    const [selectedThumb,    setSelectedThumb]    = useState(null);
    const [generatingThumbs, setGeneratingThumbs] = useState(false);


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

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        setThumbnailFile(file);
        setThumbnailPreview(URL.createObjectURL(file));
    };

    // Generate 5 thumbnail candidates from a random episode (edit mode only)
    const handleGenerateThumbs = async () => {
        if (!id) return;
        setGeneratingThumbs(true);
        setThumbCandidates([]);
        setSelectedThumb(null);
        try {
            const data     = await seriesAPI.getSeriesWithEpisodes(id);
            const episodes = data.episodes || [];
            if (!episodes.length) {
                toast.error('No episodes found — add an episode first');
                return;
            }
            const episode = episodes[Math.floor(Math.random() * episodes.length)];
            const res     = await videoAPI.generateThumbnails(episode._id, 5);
            if (!res.success || !res.thumbnails?.length) {
                toast.error('Failed to generate thumbnails');
                return;
            }
            setThumbCandidates(res.thumbnails.map(t => ({
                ...t,
                url: generalAPI.thumbnailUrl(t.filename),
            })));
        } catch (err) {
            toast.error(err?.response?.data?.error || 'Failed to generate thumbnails');
        } finally {
            setGeneratingThumbs(false);
        }
    };

    // When a generated thumbnail is selected, fetch it as a blob so the normal
    // series FormData upload flow can use it without any new backend endpoint
    const handleSelectThumb = async (thumb) => {
        if (!thumb) { setSelectedThumb(null); return; }
        setSelectedThumb(thumb);
        try {
            const resp = await fetch(thumb.url, { credentials: 'include' });
            const blob = await resp.blob();
            const file = new File([blob], thumb.filename, { type: 'image/jpeg' });
            setThumbnailFile(file);
            setThumbnailPreview(thumb.url);
        } catch {
            toast.error('Failed to use selected thumbnail');
            setSelectedThumb(null);
        }
    };

    const handleSubmit = async () => {
        if (!formData.title.trim()) {
            toast.error("Series title is required");
            return;
        }

        setSaving(true);

        const data = new FormData();
        data.append('title', formData.title.trim());
        data.append('description', formData.description || "");
        if (formData.year) data.append('year', formData.year);
        if (thumbnailFile) data.append('thumbnail', thumbnailFile);

        if (mode === 'edit') {
            toast.promise(seriesAPI.updateSeries(id, data).then((res) => {
                if (res?.success) {
                    setTimeout(() => navigate(`/series/${res.series._id}`), 800);
                    return res;
                } else {
                    throw new Error("Failed to update series");
                }
            }).catch((e) => { 
                console.error(e); 
                throw new Error("Failed to update series");
            }).finally(() => setSaving(false)), {
                loading: "Updating series...",
                success: "Series updated!",
                error: "Failed to update series"
            });
        } else {
            toast.promise(seriesAPI.createSeries(data).then((res) => {
                if (res?.success) {
                    setTimeout(() => navigate(`/series/${res.series._id}`), 800);
                    return res;
                } else {
                    throw new Error("Failed to create series");
                }
            }).catch((e) => {
                console.error(e);
                throw new Error("Failed to create series");
            }).finally(() => setSaving(false)), {
                loading: "Creating series...",
                success: "Series created! You can now add episodes.",
                error: "Failed to create series"
            });
        }
    };

    const handleDelete = async () => {
        if (!window.confirm("Delete this entire series and all its episodes? This cannot be undone.")) return;

        toast.promise(seriesAPI.deleteSeries(id).then((res) => {
            if (res?.success) {
                navigate('/');
                return "Series deleted";
            } else {
                throw new Error("Failed to delete series");
            }
        }), {
            loading: "Deleting series...",
            success: "Series deleted",
            error: "Failed to delete series"
        });
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
                                onDragOver={handleDragOver} 
                                onDragLeave={handleDragLeave} 
                                onDrop={handleDrop}
                                className={`w-48 h-28 shrink-0 rounded-lg overflow-hidden bg-slate-800 border-2 border-dashed transition cursor-pointer flex items-center justify-center
                                    ${isDragging ? 'border-red-400 bg-slate-700 scale-105' : 'border-slate-600 hover:border-red-500'}    
                                `}
                            >
                                {thumbnailPreview ? (
                                    <img src={thumbnailPreview} alt="Thumbnail preview" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="text-center text-slate-500">
                                        <Image className="w-8 h-8 mx-auto mb-1" />
                                        <p className="text-xs">{isDragging ? 'Drop to upload' : 'Click or drop image'}</p>
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

                        {/* Generate from episode (edit mode only) */}
                        {mode === 'edit' && (
                            <div className="mt-5 pt-5 border-t border-slate-700">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-sm font-medium text-slate-300 flex items-center gap-2">
                                        <ImagePlay className="w-4 h-4 text-red-400" />
                                        Generate from episode
                                    </p>
                                    <button
                                        type="button"
                                        onClick={handleGenerateThumbs}
                                        disabled={generatingThumbs || saving}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs sm:text-sm transition disabled:opacity-50"
                                    >
                                        {generatingThumbs
                                            ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                                            : <><RefreshCw className="w-3.5 h-3.5" /> {thumbCandidates.length ? 'Try again' : 'Generate'}</>
                                        }
                                    </button>
                                </div>
                                {(generatingThumbs || thumbCandidates.length > 0) ? (
                                    <div>
                                        <ThumbnailStrip
                                            candidates={thumbCandidates}
                                            selected={selectedThumb}
                                            onSelect={handleSelectThumb}
                                            loading={generatingThumbs}
                                            disabled={saving}
                                        />
                                        {thumbCandidates.length > 0 && !generatingThumbs && (
                                            <p className="text-xs text-slate-500 mt-2">
                                                {selectedThumb
                                                    ? '✓ Thumbnail selected — save to apply it'
                                                    : 'Click a scene to use it as the series thumbnail'}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-500">
                                        Picks a random episode and extracts 5 scenes to choose from.
                                    </p>
                                )}
                            </div>
                        )}
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

export default CreateSeries;