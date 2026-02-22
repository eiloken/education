import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { seriesAPI, videoAPI } from "../api/api";
import toast, { Toaster } from "react-hot-toast";
import { ArrowLeft, Film, Layers, Loader, Plus, RefreshCw, Upload, X } from "lucide-react";

// mode: 'new' | 'add-episode' | 'edit'
function UploadVideo({ mode = 'new' }) {
    const navigate = useNavigate();
    const { id, seriesId: seriesIdParam } = useParams();

    const [pageLoading, setPageLoading] = useState(mode !== 'new');
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    const [seriesInfo, setSeriesInfo] = useState(null); // for add-episode
    const [existingVideo, setExistingVideo] = useState(null); // for edit

    const [formData, setFormData] = useState({
        title: "",
        description: "",
        tags: [],
        studios: [],
        actors: [],
        characters: [],
        year: new Date().getFullYear(),
        seriesId: null,
        episodeNumber: null,
        seasonNumber: 1
    });

    const [videoFile, setVideoFile] = useState(null);
    const [replaceVideo, setReplaceVideo] = useState(false);

    const [tagInput, setTagInput] = useState("");
    const [studioInput, setStudioInput] = useState("");
    const [actorInput, setActorInput] = useState("");
    const [characterInput, setCharacterInput] = useState("");

    const [availableTags, setAvailableTags] = useState([]);
    const [availableStudios, setAvailableStudios] = useState([]);
    const [availableActors, setAvailableActors] = useState([]);
    const [availableSeries, setAvailableSeries] = useState([]);

    // In 'new' mode: optionally assign to an existing series
    const [assignToSeries, setAssignToSeries] = useState(false);

    const fetchMetaData = useCallback(async () => {
        try {
            const [tags, studios, actors, seriesData] = await Promise.all([
                seriesAPI.getTags(seriesIdParam),
                seriesAPI.getStudios(seriesIdParam),
                seriesAPI.getActors(seriesIdParam),
                seriesAPI.getSeries({ limit: 1000 })
            ]);
            setAvailableTags(tags);
            setAvailableStudios(studios);
            setAvailableActors(actors);
            setAvailableSeries(seriesData.series || []);
        } catch (_) {}
    }, []);

    useEffect(() => { fetchMetaData(); }, [fetchMetaData]);

    useEffect(() => {
        if (mode === 'new') return;
        const init = async () => {
            try {
                if (mode === 'edit' && id) {
                    const data = await videoAPI.getVideo(id);
                    const video = data.video || data;
                    setExistingVideo(video);
                    const isEpisode = !!video.seriesId;
                    setAssignToSeries(isEpisode);
                    setFormData({
                        title: video.title || "",
                        description: video.description || "",
                        tags: video.tags || [],
                        studios: video.studios || [],
                        actors: video.actors || [],
                        characters: video.characters || [],
                        year: video.year || new Date().getFullYear(),
                        seriesId: video.seriesId?._id || video.seriesId || null,
                        episodeNumber: video.episodeNumber || null,
                        seasonNumber: video.seasonNumber || 1
                    });
                }

                if (mode === 'add-episode' && seriesIdParam) {
                    const data = await seriesAPI.getSeriesWithEpisodes(seriesIdParam);
                    const series = data.series;
                    const episodes = data.episodes || [];
                    setSeriesInfo(series);

                    const maxEpisode = episodes.reduce((max, ep) => Math.max(max, ep.episodeNumber || 0), 0);
                    const maxSeason = episodes.reduce((max, ep) => Math.max(max, ep.seasonNumber || 1), 1);

                    // Merge tags/studios/actors/characters from the series AND every episode
                    const mergeUnique = (...arrays) => [...new Set(arrays.flat().filter(Boolean))];

                    setFormData(prev => ({
                        ...prev,
                        seriesId: seriesIdParam,
                        episodeNumber: maxEpisode + 1,
                        seasonNumber: maxSeason,
                        tags: mergeUnique(series.tags, ...episodes.map(ep => ep.tags)),
                        studios: mergeUnique(series.studios, ...episodes.map(ep => ep.studios)),
                        actors: mergeUnique(series.actors, ...episodes.map(ep => ep.actors)),
                        characters: mergeUnique(series.characters, ...episodes.map(ep => ep.characters)),
                        year: series.year || new Date().getFullYear()
                    }));
                }
            } catch (err) {
                console.error("Init error:", err);
                toast.error("Failed to load data");
            } finally {
                setPageLoading(false);
            }
        };
        init();
    }, [mode, id, seriesIdParam]);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const validExt = /\.(mp4|mkv|avi|mov|wmv|webm|flv)$/i.test(file.name);
        if (!validExt) { toast.error("Please select a valid video file"); return; }
        setVideoFile(file);
        if (mode !== 'edit') {
            const ext = file.name.split('.').pop().toLowerCase();
            setFormData(prev => ({ ...prev, title: file.name.replace(`.${ext}`, '') }));
        }
    };

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const addItem = (field, value, setInput) => {
        const trimmed = value.trim();
        if (trimmed && !formData[field].includes(trimmed)) {
            setFormData(prev => ({ ...prev, [field]: [...prev[field], trimmed] }));
            setInput("");
        }
    };

    const removeItem = (field, valueToRemove) => {
        setFormData(prev => ({ ...prev, [field]: prev[field].filter(v => v !== valueToRemove) }));
    };

    // When selecting a series in 'new' mode, auto-fill episode number
    const handleSeriesSelect = async (seriesId) => {
        setFormData(prev => ({ ...prev, seriesId: seriesId || null }));
        if (!seriesId) return;
        try {
            const data = await seriesAPI.getSeriesWithEpisodes(seriesId);
            const episodes = data.episodes || [];
            const series = data.series;
            const maxEp = episodes.reduce((max, ep) => Math.max(max, ep.episodeNumber || 0), 0);
            const maxSeason = episodes.reduce((max, ep) => Math.max(max, ep.seasonNumber || 1), 1);
            setFormData(prev => ({
                ...prev,
                seriesId,
                episodeNumber: maxEp + 1,
                seasonNumber: maxSeason,
                // Inherit metadata from series if fields are empty
                tags: prev.tags.length ? prev.tags : (series.tags || []),
                studios: prev.studios.length ? prev.studios : (series.studios || []),
                actors: prev.actors.length ? prev.actors : (series.actors || []),
                characters: prev.characters.length ? prev.characters : (series.characters || []),
                year: prev.year ? prev.year : (series.year || new Date().getFullYear())
            }));
        } catch (_) {}
    };

    const handleSubmit = async () => {
        if (!formData.title.trim()) { toast.error("Please enter a title"); return; }

        const needsFile = mode !== 'edit' || replaceVideo;
        if (needsFile && !videoFile) {
            toast.error(mode === 'edit' ? "Please select a replacement video file" : "Please select a video file");
            return;
        }

        setUploading(true);
        setUploadProgress(0);

        const onProgress = (progressEvent) => {
            setUploadProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
        };

        try {
            if (mode === 'edit' && !replaceVideo) {
                const meta = {
                    title: formData.title,
                    description: formData.description,
                    tags: formData.tags,
                    studios: formData.studios,
                    actors: formData.actors,
                    characters: formData.characters,
                    year: formData.year ? parseInt(formData.year) : null,
                    seriesId: assignToSeries ? (formData.seriesId || null) : null,
                    episodeNumber: assignToSeries ? (formData.episodeNumber ? parseInt(formData.episodeNumber) : null) : null,
                    seasonNumber: assignToSeries ? (formData.seasonNumber ? parseInt(formData.seasonNumber) : null) : null
                };
                await videoAPI.updateVideo(id, meta);
                toast.success("Video updated successfully");
                const backUrl = existingVideo?.seriesId ? `/series/${existingVideo.seriesId?._id || existingVideo.seriesId}` : `/video/${id}`;
                setTimeout(() => navigate(backUrl), 800);

            } else if (mode === 'edit' && replaceVideo) {
                const data = new FormData();
                data.append('video', videoFile);
                data.append('title', formData.title);
                data.append('description', formData.description || "");
                data.append('tags', JSON.stringify(formData.tags));
                data.append('studios', JSON.stringify(formData.studios));
                data.append('actors', JSON.stringify(formData.actors));
                data.append('characters', JSON.stringify(formData.characters));
                if (formData.year) data.append('year', formData.year);
                if (assignToSeries && formData.seriesId) {
                    data.append('seriesId', formData.seriesId);
                    if (formData.episodeNumber) data.append('episodeNumber', formData.episodeNumber);
                    data.append('seasonNumber', formData.seasonNumber || 1);
                }
                await videoAPI.replaceVideo(id, data, onProgress);
                toast.success("Video replaced successfully");
                const backUrl = existingVideo?.seriesId ? `/series/${existingVideo.seriesId?._id || existingVideo.seriesId}` : `/video/${id}`;
                setTimeout(() => navigate(backUrl), 800);

            } else {
                // New upload or add-episode
                const data = new FormData();
                data.append('video', videoFile);
                data.append('title', formData.title);
                data.append('description', formData.description || "");
                data.append('tags', JSON.stringify(formData.tags));
                data.append('studios', JSON.stringify(formData.studios));
                data.append('actors', JSON.stringify(formData.actors));
                data.append('characters', JSON.stringify(formData.characters));
                if (formData.year) data.append('year', formData.year);

                const targetSeriesId = mode === 'add-episode' ? seriesIdParam : (assignToSeries ? formData.seriesId : null);
                if (targetSeriesId) {
                    data.append('seriesId', targetSeriesId);
                    if (formData.episodeNumber) data.append('episodeNumber', formData.episodeNumber);
                    data.append('seasonNumber', formData.seasonNumber || 1);
                }

                const response = await videoAPI.uploadVideo(data, onProgress);
                const successMsg = targetSeriesId ? "Episode added successfully!" : "Video uploaded successfully!";
                toast.success(successMsg);

                const navTarget = targetSeriesId
                    ? `/series/${targetSeriesId}`
                    : `/video/${response.video._id}`;
                setTimeout(() => navigate(navTarget), 800);
            }
        } catch (error) {
            console.error("Submit error:", error);
            toast.error(error.response?.data?.error || "Operation failed");
        } finally {
            setUploading(false);
            setUploadProgress(0);
        }
    };

    const config = (() => {
        switch (mode) {
            case 'add-episode':
                return {
                    title: seriesInfo ? `Add Episode — ${seriesInfo.title}` : 'Add Episode',
                    submitLabel: 'Add Episode',
                    submitIcon: <Plus className="w-5 h-5" />,
                    backPath: seriesIdParam ? `/series/${seriesIdParam}` : '/'
                };
            case 'edit':
                return {
                    title: 'Edit Video',
                    submitLabel: replaceVideo ? 'Replace & Save' : 'Save Changes',
                    submitIcon: replaceVideo ? <RefreshCw className="w-5 h-5" /> : <Upload className="w-5 h-5" />,
                    backPath: existingVideo?.seriesId ? `/series/${existingVideo.seriesId?._id || existingVideo.seriesId}` : (id ? `/video/${id}` : '/')
                };
            default:
                return {
                    title: 'Upload Video',
                    submitLabel: 'Upload Video',
                    submitIcon: <Upload className="w-5 h-5" />,
                    backPath: '/'
                };
        }
    })();

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
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate(config.backPath)}
                            className="p-2 hover:bg-slate-800 rounded-lg transition"
                        >
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-red-50">{config.title}</h1>
                            {mode === 'add-episode' && seriesInfo && (
                                <p className="text-sm text-slate-400 mt-0.5">
                                    Season {formData.seasonNumber} · Episode {formData.episodeNumber}
                                </p>
                            )}
                            {mode === 'edit' && existingVideo && (
                                <p className="text-sm text-slate-400 mt-0.5">
                                    {existingVideo.seriesId ? `Episode in series` : 'Standalone video'}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8 max-w-4xl">
                <div className="space-y-6">

                    {/* Series context banner (add-episode) */}
                    {mode === 'add-episode' && seriesInfo && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-4">
                            <Layers className="w-8 h-8 text-red-400 shrink-0" />
                            <div>
                                <p className="font-semibold text-red-300">{seriesInfo.title}</p>
                                <p className="text-sm text-slate-400">
                                    Adding as Episode {formData.episodeNumber} of Season {formData.seasonNumber}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Video File */}
                    <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
                        <div className="flex items-center justify-between mb-4">
                            <label className="block text-lg font-semibold">
                                Video File {mode !== 'edit' ? '*' : ''}
                            </label>
                            {mode === 'edit' && (
                                <button
                                    type="button"
                                    onClick={() => { setReplaceVideo(r => !r); setVideoFile(null); }}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                                        replaceVideo ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                                    }`}
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    {replaceVideo ? 'Cancel Replace' : 'Replace Video File'}
                                </button>
                            )}
                        </div>

                        {mode === 'edit' && !replaceVideo && existingVideo && (
                            <div className="flex items-center gap-4 p-4 bg-slate-800 rounded-lg border border-slate-700">
                                <Film className="w-8 h-8 text-slate-400 shrink-0" />
                                <div>
                                    <p className="text-white font-medium">{existingVideo.videoPath}</p>
                                    <p className="text-sm text-slate-400">Current file — click "Replace Video File" to swap it</p>
                                </div>
                            </div>
                        )}

                        {(mode !== 'edit' || replaceVideo) && (
                            <>
                                <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-red-500 transition">
                                    <input
                                        type="file"
                                        accept="video/*"
                                        onChange={handleFileChange}
                                        className="hidden"
                                        id="video-upload"
                                        disabled={uploading}
                                    />
                                    <label
                                        htmlFor="video-upload"
                                        className={`flex flex-col items-center gap-3 cursor-pointer ${uploading ? 'pointer-events-none' : ''}`}
                                    >
                                        <Upload className="w-12 h-12 text-slate-500" />
                                        {videoFile ? (
                                            <div>
                                                <p className="text-white font-medium">{videoFile.name}</p>
                                                <p className="text-sm text-slate-400">{(videoFile.size / (1024 * 1024 * 1024)).toFixed(2)} GB</p>
                                            </div>
                                        ) : (
                                            <div>
                                                <p className="text-slate-300 font-medium">Click to select video</p>
                                                <p className="text-sm text-slate-500 mt-1">MP4, MKV, AVI, MOV, WMV, WebM up to 10GB</p>
                                            </div>
                                        )}
                                    </label>
                                </div>

                                {/* Upload progress */}
                                {uploading && uploadProgress > 0 && (
                                    <div className="mt-3">
                                        <div className="flex justify-between text-sm text-slate-400 mb-1">
                                            <span>Uploading...</span>
                                            <span>{uploadProgress}%</span>
                                        </div>
                                        <div className="w-full bg-slate-700 rounded-full h-2">
                                            <div
                                                className="bg-red-500 h-2 rounded-full transition-all duration-300"
                                                style={{ width: `${uploadProgress}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Basic Info */}
                    <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
                        <h2 className="text-xl font-semibold mb-4">Video Info</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Title *</label>
                                <input
                                    type="text"
                                    name="title"
                                    value={formData.title}
                                    onChange={handleInputChange}
                                    placeholder="Video title"
                                    disabled={uploading}
                                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Description</label>
                                <textarea
                                    name="description"
                                    value={formData.description}
                                    onChange={handleInputChange}
                                    rows={3}
                                    disabled={uploading}
                                    placeholder="Optional description..."
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
                                    disabled={uploading}
                                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Series Assignment (only for 'new' and 'edit' modes, not add-episode) */}
                    {mode !== 'add-episode' && (
                        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-semibold">Series Assignment</h2>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <span className="text-sm text-slate-400">Add to a series</span>
                                    <input
                                        type="checkbox"
                                        checked={assignToSeries}
                                        onChange={(e) => {
                                            setAssignToSeries(e.target.checked);
                                            if (!e.target.checked) {
                                                setFormData(prev => ({ ...prev, seriesId: null, episodeNumber: null, seasonNumber: 1 }));
                                            }
                                        }}
                                        className="w-4 h-4 accent-red-500"
                                        disabled={uploading}
                                    />
                                </label>
                            </div>

                            {!assignToSeries ? (
                                <p className="text-slate-500 text-sm">This video will be saved as a standalone video.</p>
                            ) : (
                                <div className="space-y-4">
                                    {/* Series selector */}
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Select Series *</label>
                                        {availableSeries.length === 0 ? (
                                            <div className="p-4 bg-slate-800 rounded-lg text-center text-slate-400 text-sm">
                                                No series created yet.{' '}
                                                <button
                                                    type="button"
                                                    onClick={() => navigate('/series/create')}
                                                    className="text-red-400 hover:text-red-300 underline"
                                                >
                                                    Create one first
                                                </button>
                                            </div>
                                        ) : (
                                            <select
                                                name="seriesId"
                                                value={formData.seriesId || ""}
                                                onChange={(e) => handleSeriesSelect(e.target.value)}
                                                disabled={uploading}
                                                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                            >
                                                <option value="">— Select a series —</option>
                                                {availableSeries.map(s => (
                                                    <option key={s._id} value={s._id}>{s.title}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>

                                    {formData.seriesId && (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium mb-1">Season Number</label>
                                                <input
                                                    type="number"
                                                    name="seasonNumber"
                                                    value={formData.seasonNumber || 1}
                                                    onChange={handleInputChange}
                                                    min={1}
                                                    disabled={uploading}
                                                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium mb-1">Episode Number</label>
                                                <input
                                                    type="number"
                                                    name="episodeNumber"
                                                    value={formData.episodeNumber || ""}
                                                    onChange={handleInputChange}
                                                    min={1}
                                                    disabled={uploading}
                                                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Episode info for add-episode mode */}
                    {mode === 'add-episode' && (
                        <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
                            <h2 className="text-xl font-semibold mb-4">Episode Info</h2>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Season Number</label>
                                    <input
                                        type="number"
                                        name="seasonNumber"
                                        value={formData.seasonNumber || 1}
                                        onChange={handleInputChange}
                                        min={1}
                                        disabled={uploading}
                                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Episode Number</label>
                                    <input
                                        type="number"
                                        name="episodeNumber"
                                        value={formData.episodeNumber || ""}
                                        onChange={handleInputChange}
                                        min={1}
                                        disabled={uploading}
                                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tags */}
                    <TagSection title="Tags" field="tags" inputValue={tagInput} setInputValue={setTagInput}
                        items={formData.tags} suggestions={availableTags} datalistId="tags-list" placeholder="Add tag"
                        onAdd={() => addItem('tags', tagInput, setTagInput)} onRemove={(v) => removeItem('tags', v)} disabled={uploading} />

                    {/* Studios */}
                    <TagSection title="Studios" field="studios" inputValue={studioInput} setInputValue={setStudioInput}
                        items={formData.studios} suggestions={availableStudios} datalistId="studios-list" placeholder="Add studio"
                        onAdd={() => addItem('studios', studioInput, setStudioInput)} onRemove={(v) => removeItem('studios', v)} disabled={uploading} />

                    {/* Actors */}
                    <TagSection title="Actors" field="actors" inputValue={actorInput} setInputValue={setActorInput}
                        items={formData.actors} suggestions={availableActors} datalistId="actors-list" placeholder="Add actor"
                        onAdd={() => addItem('actors', actorInput, setActorInput)} onRemove={(v) => removeItem('actors', v)} disabled={uploading} />

                    {/* Characters */}
                    <TagSection title="Characters" field="characters" inputValue={characterInput} setInputValue={setCharacterInput}
                        items={formData.characters} suggestions={[]} datalistId={null} placeholder="Add character"
                        onAdd={() => addItem('characters', characterInput, setCharacterInput)} onRemove={(v) => removeItem('characters', v)} disabled={uploading} />

                    {/* Submit */}
                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={() => navigate(config.backPath)}
                            className="flex-1 px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg transition font-semibold"
                            disabled={uploading}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={uploading}
                            className="flex-1 px-6 py-3 bg-red-500 hover:bg-red-600 rounded-lg transition font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {uploading ? (
                                <><Loader className="w-5 h-5 animate-spin" /> {uploadProgress > 0 ? `${uploadProgress}%` : 'Processing...'}</>
                            ) : (
                                <>{config.submitIcon} {config.submitLabel}</>
                            )}
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}

function TagSection({ title, inputValue, setInputValue, items, suggestions, datalistId, placeholder, onAdd, onRemove, disabled }) {
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
                        disabled={disabled}
                    />
                    {datalistId && suggestions.length > 0 && (
                        <datalist id={datalistId}>
                            {suggestions.map((s, i) => <option key={i} value={s} />)}
                        </datalist>
                    )}
                    <button type="button" onClick={onAdd} disabled={disabled}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg transition disabled:opacity-50">
                        <Plus className="w-5 h-5" />
                    </button>
                </div>
                {items.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {items.map((item, i) => (
                            <span key={i} className="flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-full text-sm">
                                {item}
                                <button type="button" onClick={() => onRemove(item)} disabled={disabled}
                                    className="hover:text-red-500 transition">
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

export default UploadVideo;