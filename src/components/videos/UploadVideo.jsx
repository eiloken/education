import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { generalAPI, seriesAPI, videoAPI } from "../../api/api";
import toast from "react-hot-toast";
import {
    ArrowLeft, Check, ChevronDown, Film, ImagePlay, Layers, Loader,
    Plus, RefreshCw, Search, Upload, X,
} from "lucide-react";

// ─── Client-side frame extractor (works before upload) ───────────────────────
async function extractFrames(file, count = 5) {
    return new Promise((resolve, reject) => {
        const video   = document.createElement('video');
        const src     = URL.createObjectURL(file);
        video.src     = src;
        video.muted   = true;
        video.playsInline = true;
        video.preload = 'metadata';
        const cleanup = () => URL.revokeObjectURL(src);

        video.addEventListener('loadedmetadata', async () => {
            const dur = video.duration;
            if (!dur || dur < 1) { cleanup(); reject(new Error('Cannot read duration')); return; }
            const usable = dur > 10 ? dur - 4 : dur * 0.85;
            const step   = usable / (count + 1);
            const times  = Array.from({ length: count }, (_, i) =>
                Math.min(2 + step * (i + 1), dur - 0.5)
            );
            const results = [];
            for (let i = 0; i < times.length; i++) {
                await new Promise(res => {
                    video.currentTime = times[i];
                    const onSeeked = () => {
                        video.removeEventListener('seeked', onSeeked);
                        const vw = video.videoWidth  || 640;
                        const vh = video.videoHeight || 360;
                        const w  = Math.min(vw, 640);
                        const h  = Math.round(vh * (w / vw));
                        const canvas = document.createElement('canvas');
                        canvas.width = w; canvas.height = h;
                        canvas.getContext('2d').drawImage(video, 0, 0, w, h);
                        canvas.toBlob(blob => {
                            if (blob) results.push({
                                url: URL.createObjectURL(blob),
                                blob, ts: Math.floor(times[i]), index: i,
                            });
                            res();
                        }, 'image/jpeg', 0.85);
                    };
                    video.addEventListener('seeked', onSeeked);
                });
            }
            cleanup();
            resolve(results);
        });
        video.addEventListener('error', () => { cleanup(); reject(new Error('Video load error')); });
    });
}

// ─── ThumbnailStrip ───────────────────────────────────────────────────────────
function ThumbnailStrip({ candidates, selected, onSelect, loading, count = 5, disabled = false }) {
    const fmt   = s  => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const isSel = t  => selected && (selected.filename
        ? selected.filename === t.filename
        : selected.index    === t.index);

    if (loading) return (
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="aspect-video bg-slate-700 rounded-lg animate-pulse" />
            ))}
        </div>
    );
    if (!candidates.length) return null;

    return (
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {candidates.map((thumb, i) => {
                const sel = isSel(thumb);
                return (
                    <button
                        key={thumb.filename ?? thumb.index ?? i}
                        type="button"
                        disabled={disabled}
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

// ─── SeriesSearchSelect ───────────────────────────────────────────────────────
// Searchable dropdown that replaces the plain <select> for series assignment
function SeriesSearchSelect({ series, value, onChange, disabled, locked = false }) {
    const [query, setQuery]       = useState("");
    const [open, setOpen]         = useState(false);
    const containerRef            = useRef(null);
    const inputRef                = useRef(null);

    const selected = series.find(s => s._id === value) || null;

    // Close on outside click
    useEffect(() => {
        const handler = (e) => {
            if (!containerRef.current?.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const filtered = query.trim()
        ? series.filter(s => s.title.toLowerCase().includes(query.toLowerCase()))
        : series;

    const handleSelect = (s) => {
        onChange(s._id);
        setQuery("");
        setOpen(false);
    };

    const handleClear = (e) => {
        e.stopPropagation();
        onChange("");
        setQuery("");
        setOpen(false);
    };

    const handleOpen = () => {
        if (disabled) return;
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    return (
        <div ref={containerRef} className="relative">
            {/* Trigger / selected display */}
            <div
                onClick={handleOpen}
                className={`flex items-center gap-2 w-full px-3 py-2.5 bg-slate-800 border rounded-lg cursor-pointer transition select-none
                    ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-slate-600"}
                    ${open ? "border-red-500 ring-2 ring-red-500/30" : "border-slate-700"}`}
            >
                <Search className="w-4 h-4 text-slate-500 shrink-0" />
                {open ? (
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => {
                            if (e.key === "Escape") { setOpen(false); setQuery(""); }
                            if (e.key === "Enter" && filtered.length === 1) handleSelect(filtered[0]);
                        }}
                        placeholder="Search series…"
                        className="flex-1 bg-transparent text-white text-sm outline-none placeholder-slate-500 min-w-0"
                        disabled={disabled}
                    />
                ) : (
                    <span className={`flex-1 text-sm truncate ${selected ? "text-white" : "text-slate-500"}`}>
                        {selected ? selected.title : "— Search and select a series —"}
                    </span>
                )}
                {selected && !open ? (
                    <button
                        type="button"
                        onClick={locked ? undefined : handleClear}
                        disabled={disabled || locked}
                        title={locked ? "Cannot remove — this is the only episode in its series" : undefined}
                        className={`shrink-0 p-0.5 rounded transition ${locked ? "opacity-30 cursor-not-allowed text-slate-500" : "text-slate-400 hover:text-white"}`}
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                ) : (
                    <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                )}
            </div>

            {/* Dropdown */}
            {open && (
                <div className="absolute z-50 mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                    <div className="max-h-52 overflow-y-auto">
                        {filtered.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-slate-500 text-center">No series found</div>
                        ) : (
                            filtered.map(s => (
                                <button
                                    key={s._id}
                                    type="button"
                                    onClick={() => handleSelect(s)}
                                    className={`w-full text-left px-4 py-2.5 text-sm transition flex items-center gap-2
                                        ${s._id === value
                                            ? "bg-red-500/20 text-red-300"
                                            : "text-slate-200 hover:bg-slate-700"}`}
                                >
                                    <Layers className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                                    <span className="truncate">{s.title}</span>
                                    {s._id === value && <span className="ml-auto text-red-400 text-xs">Selected</span>}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── TagSection ───────────────────────────────────────────────────────────────
function TagSection({ title, inputValue, setInputValue, selectedItems, suggestions, placeholder, onSelect, onAdd, disabled }) {
    const [matchedItems, setMatchedItems] = useState(suggestions || []);

    useEffect(() => {
        if (!inputValue) { setMatchedItems(suggestions); return; }
        const t = setTimeout(() => {
            setMatchedItems(suggestions.filter(s => s.toLowerCase().includes(inputValue.toLowerCase())));
        }, 300);
        return () => clearTimeout(t);
    }, [inputValue, suggestions]);

    const showItems = [...new Set([...selectedItems, ...matchedItems])];

    return (
        <div className="bg-slate-900 rounded-lg p-4 sm:p-5 border border-slate-800">
            <h2 className="text-base sm:text-lg font-semibold mb-3">{title}</h2>
            <div className="space-y-2.5">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={e => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            if (matchedItems.length === 0) onAdd();
                            else if (matchedItems.length === 1) { onSelect?.(matchedItems[0]); setInputValue(""); }
                        }}
                        className="flex-1 min-w-0 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                        placeholder={placeholder}
                        disabled={disabled}
                    />
                    <button
                        type="button"
                        onClick={onAdd}
                        disabled={disabled}
                        className="shrink-0 px-3 py-2 bg-red-500 hover:bg-red-600 rounded-lg transition disabled:opacity-50"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
                {showItems.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {showItems.map((item, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => onSelect?.(item)}
                                disabled={disabled}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer border transition disabled:opacity-50 disabled:cursor-not-allowed ${
                                    selectedItems.includes(item)
                                        ? "bg-red-500 border-red-500 text-white"
                                        : "bg-slate-800 border-slate-700 text-slate-300 hover:border-red-500"
                                }`}
                            >
                                {item}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── UploadVideo ──────────────────────────────────────────────────────────────
function UploadVideo({ mode = "new" }) {
    const navigate = useNavigate();
    const { id, seriesId: seriesIdParam } = useParams();

    const [pageLoading,     setPageLoading]     = useState(mode !== "new");
    const [uploading,       setUploading]       = useState(false);
    const [uploadProgress,  setUploadProgress]  = useState(0);

    const [seriesInfo,      setSeriesInfo]      = useState(null);
    const [existingVideo,   setExistingVideo]   = useState(null);

    const [formData, setFormData] = useState({
        title: "", description: "",
        tags: [], studios: [], actors: [], characters: [],
        year: new Date().getFullYear(),
        seriesId: null, episodeNumber: null, seasonNumber: 1,
    });

    const [videoFile,       setVideoFile]       = useState(null);
    const [replaceVideo,    setReplaceVideo]    = useState(false);
    const [assignToSeries,  setAssignToSeries]  = useState(false);
    const [isDragging,      setIsDragging]      = useState(false);

    // ── Thumbnail generation ──────────────────────────────────────────────────
    const [thumbCandidates,  setThumbCandidates]  = useState([]);
    const [selectedThumb,    setSelectedThumb]    = useState(null);
    const [generatingThumbs, setGeneratingThumbs] = useState(false);
    const [applyingThumb,    setApplyingThumb]    = useState(false);
    const thumbBlobsRef = useRef([]);  // track client-side blob URLs for cleanup

    const [isLastEpisode,   setIsLastEpisode]   = useState(false);

    const [tagInput,        setTagInput]        = useState("");
    const [studioInput,     setStudioInput]     = useState("");
    const [actorInput,      setActorInput]      = useState("");
    const [characterInput,  setCharacterInput]  = useState("");

    const [availableTags,    setAvailableTags]    = useState([]);
    const [availableStudios, setAvailableStudios] = useState([]);
    const [availableActors,  setAvailableActors]  = useState([]);
    const [availableSeries,  setAvailableSeries]  = useState([]);

    // ── Fetch metadata ────────────────────────────────────────────────────────
    const fetchMetaData = useCallback(async () => {
        try {
            const [tags, studios, actors, seriesData] = await Promise.all([
                videoAPI.getTags(),
                videoAPI.getStudios(),
                videoAPI.getActors(),
                seriesAPI.getSeries({ limit: 1000 }),
            ]);
            setAvailableTags(tags);
            setAvailableStudios(studios);
            setAvailableActors(actors);
            setAvailableSeries(seriesData.series || []);
        } catch (_) {}
    }, []);

    useEffect(() => { fetchMetaData(); }, [fetchMetaData]);

    // Cleanup client-side blob URLs on unmount
    useEffect(() => () => { thumbBlobsRef.current.forEach(u => URL.revokeObjectURL(u)); }, []);

    // Generate thumbnails client-side from the local file (new / add-episode mode)
    const generateClientThumbs = useCallback(async (file) => {
        setGeneratingThumbs(true);
        setThumbCandidates([]);
        setSelectedThumb(null);
        thumbBlobsRef.current.forEach(u => URL.revokeObjectURL(u));
        thumbBlobsRef.current = [];
        try {
            const frames = await extractFrames(file, 5);
            thumbBlobsRef.current = frames.map(f => f.url);
            setThumbCandidates(frames);
            // Auto-select the middle frame
            if (frames.length) setSelectedThumb(frames[Math.floor(frames.length / 2)]);
        } catch (err) {
            console.warn('Client thumbnail generation failed:', err.message);
            // Silent fail — server will auto-generate one on upload
        } finally {
            setGeneratingThumbs(false);
        }
    }, []);

    // Generate thumbnails server-side from an existing video (edit mode)
    const handleGenerateThumbs = async () => {
        if (!id) return;
        setGeneratingThumbs(true);
        setThumbCandidates([]);
        setSelectedThumb(null);
        try {
            const res = await videoAPI.generateThumbnails(id, 5);
            if (!res.success) throw new Error('Failed');
            // Convert relative paths to full URLs
            setThumbCandidates(res.thumbnails.map(t => ({
                ...t,
                url: generalAPI.thumbnailUrl(t.filename),
            })));
        } catch {
            toast.error('Failed to generate thumbnails');
        } finally {
            setGeneratingThumbs(false);
        }
    };

    // Apply the selected server-side thumbnail to this video (edit mode)
    const handleApplyThumb = async () => {
        if (!selectedThumb?.filename || !id) return;
        setApplyingThumb(true);
        try {
            const res = await videoAPI.applyThumbnail(id, selectedThumb.filename, false);
            if (!res.success) throw new Error('Failed');
            toast.success('Thumbnail updated!');
            setSelectedThumb(null);
            setThumbCandidates([]);
        } catch {
            toast.error('Failed to apply thumbnail');
        } finally {
            setApplyingThumb(false);
        }
    };


    // ── Init for edit / add-episode ───────────────────────────────────────────
    useEffect(() => {
        if (mode === "new") return;
        const init = async () => {
            try {
                if (mode === "edit" && id) {
                    const data  = await videoAPI.getVideo(id);
                    const video = data.video || data;
                    setExistingVideo(video);
                    const isEpisode = !!video.seriesId;
                    setAssignToSeries(isEpisode);
                    // Check if this is the only episode in its series
                    if (isEpisode) {
                        const sid = video.seriesId?._id || video.seriesId;
                        try {
                            const sd = await seriesAPI.getSeriesWithEpisodes(sid);
                            setIsLastEpisode((sd.episodes || []).length <= 1);
                        } catch (_) {}
                    }
                    setFormData({
                        title:         video.title        || "",
                        description:   video.description  || "",
                        tags:          video.tags         || [],
                        studios:       video.studios      || [],
                        actors:        video.actors       || [],
                        characters:    video.characters   || [],
                        year:          video.year         || new Date().getFullYear(),
                        seriesId:      video.seriesId?._id || video.seriesId || null,
                        episodeNumber: video.episodeNumber || null,
                        seasonNumber:  video.seasonNumber  || 1,
                    });
                }
                if (mode === "add-episode" && seriesIdParam) {
                    const data     = await seriesAPI.getSeriesWithEpisodes(seriesIdParam);
                    const series   = data.series;
                    const episodes = data.episodes || [];
                    setSeriesInfo(series);
                    const maxEpisode = episodes.reduce((max, ep) => Math.max(max, ep.episodeNumber || 0), 0);
                    const maxSeason  = episodes.reduce((max, ep) => Math.max(max, ep.seasonNumber  || 1), 1);
                    const mergeUnique = (...arrays) => [...new Set(arrays.flat().filter(Boolean))];
                    setFormData(prev => ({
                        ...prev,
                        seriesId:      seriesIdParam,
                        episodeNumber: maxEpisode + 1,
                        seasonNumber:  maxSeason,
                        tags:          mergeUnique(series.tags,       ...episodes.map(ep => ep.tags)),
                        studios:       mergeUnique(series.studios,    ...episodes.map(ep => ep.studios)),
                        actors:        mergeUnique(series.actors,     ...episodes.map(ep => ep.actors)),
                        characters:    mergeUnique(series.characters, ...episodes.map(ep => ep.characters)),
                        year:          series.year || new Date().getFullYear(),
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

    // ── File handling ─────────────────────────────────────────────────────────
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!/\.(mp4|mkv|avi|mov|wmv|webm|flv)$/i.test(file.name)) {
            toast.error("Please select a valid video file"); return;
        }
        setVideoFile(file);
        if (mode !== "edit") {
            const ext = file.name.split(".").pop().toLowerCase();
            setFormData(prev => ({ ...prev, title: file.name.replace(`.${ext}`, "") }));
            generateClientThumbs(file);
        }
    };

    const handleDragOver  = (e) => { e.preventDefault(); setIsDragging(true);  };
    const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop      = (e) => {
        e.preventDefault(); setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (!/\.(mp4|mkv|avi|mov|wmv|webm|flv)$/i.test(file.name)) {
            toast.error("Please select a valid video file"); return;
        }
        setVideoFile(file);
        if (mode !== "edit") {
            const ext = file.name.split(".").pop().toLowerCase();
            setFormData(prev => ({ ...prev, title: file.name.replace(`.${ext}`, "") }));
            generateClientThumbs(file);
        }
    };

    // ── Form helpers ──────────────────────────────────────────────────────────
    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    };

    const addItem    = (field, value, setInput) => {
        const trimmed = value.trim();
        if (trimmed && !formData[field].includes(trimmed)) {
            setFormData(prev => ({ ...prev, [field]: [...prev[field], trimmed] }));
            setInput("");
        }
    };
    const toggleItem = (field, item) => {
        const trimmed = item.trim();
        if (!trimmed) return;
        setFormData(prev => ({
            ...prev,
            [field]: prev[field].includes(trimmed)
                ? prev[field].filter(i => i !== trimmed)
                : [...prev[field], trimmed],
        }));
    };

    // ── Series selection (new/edit modes) ─────────────────────────────────────
    const handleSeriesSelect = async (seriesId) => {
        setFormData(prev => ({ ...prev, seriesId: seriesId || null }));
        if (!seriesId) return;
        try {
            const data     = await seriesAPI.getSeriesWithEpisodes(seriesId);
            const episodes = data.episodes || [];
            const series   = data.series;
            const maxEp     = episodes.reduce((max, ep) => Math.max(max, ep.episodeNumber || 0), 0);
            const maxSeason = episodes.reduce((max, ep) => Math.max(max, ep.seasonNumber  || 1), 1);
            setFormData(prev => ({
                ...prev,
                seriesId,
                episodeNumber: maxEp + 1,
                seasonNumber:  maxSeason,
                tags:          prev.tags.length       ? prev.tags       : (series.tags       || []),
                studios:       prev.studios.length    ? prev.studios    : (series.studios    || []),
                actors:        prev.actors.length     ? prev.actors     : (series.actors     || []),
                characters:    prev.characters.length ? prev.characters : (series.characters || []),
                year:          prev.year              ? prev.year       : (series.year || new Date().getFullYear()),
            }));
        } catch (_) {}
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        if (!formData.title.trim()) { toast.error("Please enter a title"); return; }
        const needsFile = mode !== "edit" || replaceVideo;
        if (needsFile && !videoFile) {
            toast.error(mode === "edit" ? "Please select a replacement video file" : "Please select a video file");
            return;
        }

        setUploading(true);
        setUploadProgress(0);
        const onProgress = (e) => setUploadProgress(Math.round((e.loaded * 100) / e.total));

        const backUrl = existingVideo?.seriesId
            ? `/series/${existingVideo.seriesId?._id || existingVideo.seriesId}?ep=${existingVideo._id}`
            : `/video/${id}`;

        if (mode === "edit" && !replaceVideo) {
            const meta = {
                title:         formData.title,
                description:   formData.description,
                tags:          formData.tags,
                studios:       formData.studios,
                actors:        formData.actors,
                characters:    formData.characters,
                year:          formData.year ? parseInt(formData.year) : null,
                seriesId:      assignToSeries ? (formData.seriesId || null) : null,
                episodeNumber: assignToSeries ? (formData.episodeNumber ? parseInt(formData.episodeNumber) : null) : null,
                seasonNumber:  assignToSeries ? (formData.seasonNumber  ? parseInt(formData.seasonNumber)  : null) : null,
            };
            toast.promise(
                videoAPI.updateVideo(id, meta)
                    .then(res => { if (res?.success) { setTimeout(() => navigate(backUrl), 800); return res; } throw new Error(); })
                    .finally(() => { setUploading(false); setUploadProgress(0); }),
                { loading: "Updating…", success: "Video updated", error: "Failed to update" }
            );
            return;
        }

        const data = new FormData();
        if (mode === "edit" && replaceVideo) data.append("video", videoFile);
        if (mode !== "edit")                 data.append("video", videoFile);
        // Include selected thumbnail blob (new/add-episode mode only)
        if (mode !== "edit" && selectedThumb?.blob) {
            data.append("thumbnail", selectedThumb.blob, "thumbnail.jpg");
        }
        data.append("title",       formData.title);
        data.append("description", formData.description || "");
        data.append("tags",        JSON.stringify(formData.tags));
        data.append("studios",     JSON.stringify(formData.studios));
        data.append("actors",      JSON.stringify(formData.actors));
        data.append("characters",  JSON.stringify(formData.characters));
        if (formData.year) data.append("year", formData.year);

        const targetSeriesId = mode === "add-episode"
            ? seriesIdParam
            : (assignToSeries ? formData.seriesId : null);

        if (targetSeriesId) {
            data.append("seriesId", targetSeriesId);
            if (formData.episodeNumber) data.append("episodeNumber", formData.episodeNumber);
            data.append("seasonNumber", formData.seasonNumber || 1);
        }

        const apiCall = mode === "edit" && replaceVideo
            ? videoAPI.replaceVideo(id, data, onProgress)
            : videoAPI.uploadVideo(data, onProgress);

        const navTarget = mode === "edit"
            ? backUrl
            : (targetSeriesId ? `/series/${targetSeriesId}?ep={id}` : null);

        toast.promise(
            apiCall
                .then(res => {
                    if (res?.success) {
                        const dest = mode === "edit" ? backUrl : (targetSeriesId ? `/series/${targetSeriesId}?ep=${res.video._id}` : `/video/${res.video._id}`);
                        setTimeout(() => navigate(dest), 800);
                        return res;
                    }
                    throw new Error();
                })
                .finally(() => { setUploading(false); setUploadProgress(0); }),
            {
                loading: mode === "edit" ? "Replacing video…" : (targetSeriesId ? "Uploading episode…" : "Uploading video…"),
                success: mode === "edit" ? "Video replaced" : (targetSeriesId ? "Episode added!" : "Video uploaded!"),
                error:   mode === "edit" ? "Failed to replace" : "Failed to upload",
            }
        );
    };

    // ── Config ────────────────────────────────────────────────────────────────
    const config = (() => {
        switch (mode) {
            case "add-episode": return {
                title:       seriesInfo ? `Add Episode — ${seriesInfo.title}` : "Add Episode",
                submitLabel: "Add Episode",
                submitIcon:  <Plus className="w-4 h-4" />,
                backPath:    seriesIdParam ? `/series/${seriesIdParam}` : "/",
            };
            case "edit": return {
                title:       "Edit Video",
                submitLabel: replaceVideo ? "Replace & Save" : "Save Changes",
                submitIcon:  replaceVideo ? <RefreshCw className="w-4 h-4" /> : <Upload className="w-4 h-4" />,
                backPath:    existingVideo?.seriesId
                    ? `/series/${existingVideo.seriesId?._id || existingVideo.seriesId}`
                    : (id ? `/video/${id}` : "/"),
            };
            default: return {
                title:       "Upload Video",
                submitLabel: "Upload Video",
                submitIcon:  <Upload className="w-4 h-4" />,
                backPath:    "/",
            };
        }
    })();

    if (pageLoading) return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <Loader className="w-10 h-10 animate-spin text-red-500" />
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-950 text-white">

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800">
                <div className="container mx-auto px-3 sm:px-4 py-3">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate(config.backPath)}
                            className="shrink-0 p-2 hover:bg-slate-800 rounded-lg transition"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="min-w-0">
                            <h1 className="text-lg sm:text-2xl font-bold text-red-50 truncate">{config.title}</h1>
                            {mode === "add-episode" && seriesInfo && (
                                <p className="text-xs sm:text-sm text-slate-400">
                                    Season {formData.seasonNumber} · Episode {formData.episodeNumber}
                                </p>
                            )}
                            {mode === "edit" && existingVideo && (
                                <p className="text-xs sm:text-sm text-slate-400">
                                    {existingVideo.seriesId ? "Episode in series" : "Standalone video"}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-3 sm:px-4 py-5 sm:py-8 max-w-3xl">
                <div className="space-y-4 sm:space-y-5">

                    {/* Series context banner (add-episode) */}
                    {mode === "add-episode" && seriesInfo && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 sm:p-4 flex items-center gap-3">
                            <Layers className="w-6 h-6 sm:w-8 sm:h-8 text-red-400 shrink-0" />
                            <div className="min-w-0">
                                <p className="font-semibold text-red-300 truncate">{seriesInfo.title}</p>
                                <p className="text-xs sm:text-sm text-slate-400">
                                    Adding as Episode {formData.episodeNumber} of Season {formData.seasonNumber}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ── Video File ─────────────────────────────────────────── */}
                    <div className="bg-slate-900 rounded-lg p-4 sm:p-5 border border-slate-800">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-base sm:text-lg font-semibold">
                                Video File{mode !== "edit" ? " *" : ""}
                            </h2>
                            {mode === "edit" && (
                                <button
                                    type="button"
                                    onClick={() => { setReplaceVideo(r => !r); setVideoFile(null); }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition ${
                                        replaceVideo ? "bg-red-500 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                                    }`}
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    <span className="hidden xs:inline">{replaceVideo ? "Cancel Replace" : "Replace File"}</span>
                                    <span className="xs:hidden">{replaceVideo ? "Cancel" : "Replace"}</span>
                                </button>
                            )}
                        </div>

                        {mode === "edit" && !replaceVideo && existingVideo && (
                            <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg border border-slate-700">
                                <Film className="w-6 h-6 text-slate-400 shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-sm text-white font-medium truncate">{existingVideo.videoPath}</p>
                                    <p className="text-xs text-slate-400">Current file — click "Replace File" to swap</p>
                                </div>
                            </div>
                        )}

                        {(mode !== "edit" || replaceVideo) && (
                            <>
                                <div
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    className={`border-2 border-dashed rounded-lg py-8 px-4 text-center transition ${
                                        isDragging
                                            ? "border-red-500 bg-slate-700 scale-[1.02]"
                                            : "border-slate-700 hover:border-red-500"
                                    }`}
                                >
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
                                        className={`flex flex-col items-center gap-2 cursor-pointer ${uploading ? "pointer-events-none" : ""}`}
                                    >
                                        <Upload className="w-8 h-8 sm:w-10 sm:h-10 text-slate-500" />
                                        {videoFile ? (
                                            <div>
                                                <p className="text-white font-medium text-sm sm:text-base truncate max-w-xs mx-auto">{videoFile.name}</p>
                                                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">{(videoFile.size / (1024 * 1024 * 1024)).toFixed(2)} GB</p>
                                            </div>
                                        ) : (
                                            <div>
                                                <p className="text-slate-300 font-medium text-sm sm:text-base">
                                                    {isDragging ? "Drop video file here" : "Click or drag video here"}
                                                </p>
                                                <p className="text-xs text-slate-500 mt-1">MP4, MKV, AVI, MOV, WMV, WebM — up to 10 GB</p>
                                            </div>
                                        )}
                                    </label>
                                </div>

                                {uploading && uploadProgress > 0 && (
                                    <div className="mt-3">
                                        <div className="flex justify-between text-xs text-slate-400 mb-1">
                                            <span>Uploading…</span>
                                            <span>{uploadProgress}%</span>
                                        </div>
                                        <div className="w-full bg-slate-700 rounded-full h-1.5">
                                            <div
                                                className="bg-red-500 h-1.5 rounded-full transition-all duration-300"
                                                style={{ width: `${uploadProgress}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* ── Thumbnail picker (new/add-episode) ─────── */}
                                {(generatingThumbs || thumbCandidates.length > 0) && (
                                    <div className="mt-4 pt-4 border-t border-slate-700">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-xs sm:text-sm font-medium text-slate-300 flex items-center gap-1.5">
                                                <ImagePlay className="w-3.5 h-3.5 text-red-400" />
                                                Choose thumbnail
                                            </p>
                                            {thumbCandidates.length > 0 && !generatingThumbs && (
                                                <p className="text-xs text-slate-500">
                                                    {selectedThumb ? 'Selected' : 'Click one to select'}
                                                </p>
                                            )}
                                        </div>
                                        <ThumbnailStrip
                                            candidates={thumbCandidates}
                                            selected={selectedThumb}
                                            onSelect={setSelectedThumb}
                                            loading={generatingThumbs}
                                            disabled={uploading}
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* ── Thumbnail (edit mode) ───────────────────────────────── */}
                    {mode === "edit" && (
                        <div className="bg-slate-900 rounded-lg p-4 sm:p-5 border border-slate-800">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
                                    <ImagePlay className="w-4 h-4 text-red-400" />
                                    Thumbnail
                                </h2>
                                <button
                                    type="button"
                                    onClick={handleGenerateThumbs}
                                    disabled={generatingThumbs || applyingThumb || uploading}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs sm:text-sm transition disabled:opacity-50"
                                >
                                    {generatingThumbs
                                        ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                                        : <><RefreshCw className="w-3.5 h-3.5" /> {thumbCandidates.length ? 'Regenerate' : 'Generate from video'}</>
                                    }
                                </button>
                            </div>

                            {(generatingThumbs || thumbCandidates.length > 0) && (
                                <div>
                                    <ThumbnailStrip
                                        candidates={thumbCandidates}
                                        selected={selectedThumb}
                                        onSelect={setSelectedThumb}
                                        loading={generatingThumbs}
                                        disabled={applyingThumb || uploading}
                                    />
                                    {selectedThumb && !generatingThumbs && (
                                        <button
                                            type="button"
                                            onClick={handleApplyThumb}
                                            disabled={applyingThumb || uploading}
                                            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
                                        >
                                            {applyingThumb
                                                ? <><Loader className="w-4 h-4 animate-spin" /> Applying…</>
                                                : <><Check className="w-4 h-4" strokeWidth={3} /> Set as thumbnail</>
                                            }
                                        </button>
                                    )}
                                </div>
                            )}
                            {!generatingThumbs && thumbCandidates.length === 0 && (
                                <p className="text-xs text-slate-500">Click "Generate from video" to pick from 5 scenes.</p>
                            )}
                        </div>
                    )}

                    {/* ── Video Info ─────────────────────────────────────────── */}
                    <div className="bg-slate-900 rounded-lg p-4 sm:p-5 border border-slate-800">
                        <h2 className="text-base sm:text-lg font-semibold mb-3">Video Info</h2>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1">Title *</label>
                                <input
                                    type="text"
                                    name="title"
                                    value={formData.title}
                                    onChange={handleInputChange}
                                    placeholder="Video title"
                                    disabled={uploading}
                                    className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1">Description</label>
                                <textarea
                                    name="description"
                                    value={formData.description}
                                    onChange={handleInputChange}
                                    rows={3}
                                    disabled={uploading}
                                    placeholder="Optional description…"
                                    className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                                />
                            </div>
                            <div className="w-full sm:w-40">
                                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1">Year</label>
                                <input
                                    type="number"
                                    name="year"
                                    value={formData.year}
                                    onChange={handleInputChange}
                                    min={1900}
                                    max={new Date().getFullYear() + 2}
                                    disabled={uploading}
                                    className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* ── Series Assignment (new / edit only) ────────────────── */}
                    {mode !== "add-episode" && (
                        <div className="bg-slate-900 rounded-lg p-4 sm:p-5 border border-slate-800">
                            {/* Toggle header */}
                            <div className="flex items-center justify-between">
                                <h2 className="text-base sm:text-lg font-semibold">Series Assignment</h2>
                                <button
                                    type="button"
                                    disabled={uploading || isLastEpisode}
                                    title={isLastEpisode ? "Cannot remove — this is the only episode in its series" : undefined}
                                    onClick={() => {
                                        if (isLastEpisode) return;
                                        setAssignToSeries(v => !v);
                                        if (assignToSeries) {
                                            setFormData(prev => ({ ...prev, seriesId: null, episodeNumber: null, seasonNumber: 1 }));
                                        }
                                    }}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                                        assignToSeries ? "bg-red-500" : "bg-slate-700"
                                    } ${isLastEpisode ? "opacity-50 cursor-not-allowed" : "disabled:opacity-50"}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                        assignToSeries ? "translate-x-6" : "translate-x-1"
                                    }`} />
                                </button>
                            </div>

                            {/* Locked warning — only episode in its series */}
                            {isLastEpisode && (
                                <div className="flex items-start gap-2 mt-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                                    <span className="text-amber-400 text-base leading-none mt-0.5">⚠</span>
                                    <p className="text-xs text-amber-300 leading-relaxed">
                                        This is the only episode in its series. You can reassign it to a different series, but it cannot be removed from all series.
                                    </p>
                                </div>
                            )}

                            {!assignToSeries ? (
                                <p className="text-slate-500 text-xs sm:text-sm mt-2">This video will be saved as a standalone video.</p>
                            ) : (
                                <div className="mt-3 space-y-3">
                                    {/* Series search-select */}
                                    <div>
                                        <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1">Select Series *</label>
                                        {availableSeries.length === 0 ? (
                                            <div className="p-3 bg-slate-800 rounded-lg text-center text-slate-400 text-sm">
                                                No series yet.{" "}
                                                <button
                                                    type="button"
                                                    onClick={() => navigate("/series/create")}
                                                    className="text-red-400 hover:text-red-300 underline"
                                                >
                                                    Create one first
                                                </button>
                                            </div>
                                        ) : (
                                            <SeriesSearchSelect
                                                series={availableSeries}
                                                value={formData.seriesId || ""}
                                                onChange={handleSeriesSelect}
                                                disabled={uploading}
                                                locked={isLastEpisode}
                                            />
                                        )}
                                    </div>

                                    {/* Season / Episode row */}
                                    {formData.seriesId && (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1">Season</label>
                                                <input
                                                    type="number"
                                                    name="seasonNumber"
                                                    value={formData.seasonNumber || 1}
                                                    onChange={handleInputChange}
                                                    min={1}
                                                    disabled={uploading}
                                                    className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1">Episode</label>
                                                <input
                                                    type="number"
                                                    name="episodeNumber"
                                                    value={formData.episodeNumber || ""}
                                                    onChange={handleInputChange}
                                                    min={1}
                                                    disabled={uploading}
                                                    className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Episode Info (add-episode only) ───────────────────── */}
                    {mode === "add-episode" && (
                        <div className="bg-slate-900 rounded-lg p-4 sm:p-5 border border-slate-800">
                            <h2 className="text-base sm:text-lg font-semibold mb-3">Episode Info</h2>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1">Season</label>
                                    <input
                                        type="number"
                                        name="seasonNumber"
                                        value={formData.seasonNumber || 1}
                                        onChange={handleInputChange}
                                        min={1}
                                        disabled={uploading}
                                        className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs sm:text-sm font-medium text-slate-300 mb-1">Episode</label>
                                    <input
                                        type="number"
                                        name="episodeNumber"
                                        value={formData.episodeNumber || ""}
                                        onChange={handleInputChange}
                                        min={1}
                                        disabled={uploading}
                                        className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Metadata tags ─────────────────────────────────────── */}
                    <TagSection
                        title="Tags"
                        inputValue={tagInput}       setInputValue={setTagInput}
                        selectedItems={formData.tags}   suggestions={availableTags}
                        placeholder="Add tag"
                        onSelect={val => toggleItem("tags", val)}
                        onAdd={() => addItem("tags", tagInput, setTagInput)}
                        disabled={uploading}
                    />
                    <TagSection
                        title="Studios"
                        inputValue={studioInput}    setInputValue={setStudioInput}
                        selectedItems={formData.studios} suggestions={availableStudios}
                        placeholder="Add studio"
                        onSelect={val => toggleItem("studios", val)}
                        onAdd={() => addItem("studios", studioInput, setStudioInput)}
                        disabled={uploading}
                    />
                    <TagSection
                        title="Actors"
                        inputValue={actorInput}     setInputValue={setActorInput}
                        selectedItems={formData.actors}  suggestions={availableActors}
                        placeholder="Add actor"
                        onSelect={val => toggleItem("actors", val)}
                        onAdd={() => addItem("actors", actorInput, setActorInput)}
                        disabled={uploading}
                    />
                    <TagSection
                        title="Characters"
                        inputValue={characterInput} setInputValue={setCharacterInput}
                        selectedItems={formData.characters} suggestions={[]}
                        placeholder="Add character"
                        onSelect={val => toggleItem("characters", val)}
                        onAdd={() => addItem("characters", characterInput, setCharacterInput)}
                        disabled={uploading}
                    />

                    {/* ── Submit ─────────────────────────────────────────────── */}
                    <div className="flex gap-3 pb-6">
                        <button
                            type="button"
                            onClick={() => navigate(config.backPath)}
                            disabled={uploading}
                            className="flex-1 px-4 py-2.5 sm:py-3 text-sm sm:text-base bg-slate-800 hover:bg-slate-700 rounded-lg transition font-semibold disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={uploading}
                            className="flex-1 px-4 py-2.5 sm:py-3 text-sm sm:text-base bg-red-500 hover:bg-red-600 rounded-lg transition font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {uploading ? (
                                <><Loader className="w-4 h-4 animate-spin" /> {uploadProgress > 0 ? `${uploadProgress}%` : "Processing…"}</>
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

export default UploadVideo;