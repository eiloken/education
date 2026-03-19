import React, { useEffect, useRef, useState, useCallback } from "react";
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell
} from "recharts";
import {
    Film, Layers, Eye, Heart, HardDrive, Clock,
    TrendingUp, Star, Users, Tag, RefreshCw, Activity,
    Cpu, Archive, StopCircle, Play, AlertTriangle, CheckCircle2, XCircle,
} from "lucide-react";
import { statsAPI, generalAPI, backupAPI, videoAPI } from "../api/api";
import { formatViews, formatDuration, formatFileSize } from "../utils/format";
import { useAuth } from "../context/AuthContext";

const COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#8b5cf6","#ec4899","#14b8a6","#f59e0b","#3b82f6"];

function StatCard({ icon: Icon, label, value, sub, color = "red" }) {
    const accent = {
        red:    "text-red-400 bg-red-500/10 border-red-500/20",
        blue:   "text-blue-400 bg-blue-500/10 border-blue-500/20",
        green:  "text-green-400 bg-green-500/10 border-green-500/20",
        purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
        orange: "text-orange-400 bg-orange-500/10 border-orange-500/20",
        cyan:   "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    }[color];
    return (
        <div className={`rounded-xl border p-4 flex items-center gap-4 ${accent}`}>
            <div className={`p-3 rounded-lg ${accent}`}><Icon className="w-5 h-5" /></div>
            <div>
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{label}</p>
                <p className="text-white text-xl font-bold leading-tight">{value}</p>
                {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}
function SectionTitle({ icon: Icon, title }) {
    return (
        <div className="flex items-center gap-2 mb-4">
            <Icon className="w-4 h-4 text-red-400" />
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider">{title}</h3>
        </div>
    );
}
function Panel({ children, className = "" }) {
    return <div className={`bg-slate-900 border border-slate-800 rounded-xl p-4 ${className}`}>{children}</div>;
}
function ChartTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-xs shadow-xl">
            {label && <p className="text-slate-400 mb-1">{label}</p>}
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.color || p.fill }} className="font-medium">
                    {p.name}: {typeof p.value === "number" && p.value > 10000 ? formatViews(p.value) : p.value}
                </p>
            ))}
        </div>
    );
}

export default function Dashboard() {
    const [data,       setData]       = useState(null);
    const [loading,    setLoading]    = useState(true);
    const [error,      setError]      = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const { isAdmin } = useAuth();

    const load = useCallback(async (isRefresh = false) => {
        isRefresh ? setRefreshing(true) : setLoading(true);
        setError(null);
        try   { setData(await statsAPI.getStats()); }
        catch (e) { console.error(e); setError("Failed to load stats. Make sure your server is running."); }
        finally   { setLoading(false); setRefreshing(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500" />
            <p className="text-slate-400">Loading stats…</p>
        </div>
    );
    if (error) return (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
            <p className="text-slate-400">{error}</p>
            <button onClick={() => load()} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm transition">Retry</button>
        </div>
    );

    const {
        overview, topVideos, recentVideos, uploadsByMonth,
        topTags, topActors, topStudios, topSeries,
        mostFavoritedVideos = [], mostFavoritedSeries = [],
        activeByHour = [],
    } = data;

    const hoursOfContent = Math.round((overview.totalDuration || 0) / 3600);

    // Find peak hour label for sub-stat
    const peakHour = activeByHour.reduce((best, h) => h.sessions > (best?.sessions ?? 0) ? h : best, null);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-white">Platform Dashboard</h2>
                    <p className="text-slate-500 text-sm mt-0.5">Overview of your video library</p>
                </div>
                <button
                    onClick={() => load(true)} disabled={refreshing}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition"
                >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
                </button>
            </div>

            {/* ── Overview cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard icon={Film}      label="Videos"     value={overview.totalVideos.toLocaleString()}              color="red"    />
                <StatCard icon={Layers}    label="Series"     value={overview.totalSeries.toLocaleString()}              color="purple" />
                <StatCard icon={Eye}       label="Total Views" value={formatViews(overview.totalViews)}                  color="cyan"   />
                <StatCard icon={Heart}     label="Favorites"  value={overview.totalFavorites.toLocaleString()} sub="all users" color="orange" />
                <StatCard icon={HardDrive} label="Storage"    value={formatFileSize(overview.totalStorage)}              color="blue"   />
                <StatCard icon={Clock}     label="Content"    value={`${hoursOfContent}h`} sub={formatDuration(overview.totalDuration)} color="green" />
            </div>

            {/* ── Row 1: Uploads over time + Active users by hour ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Panel className="lg:col-span-2">
                    <SectionTitle icon={TrendingUp} title="Uploads & Views (Last 12 months)" />
                    {uploadsByMonth.length === 0 ? (
                        <p className="text-slate-600 text-sm text-center py-8">No data yet</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={uploadsByMonth} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} />
                                <YAxis yAxisId="left"  tick={{ fill: "#64748b", fontSize: 11 }} />
                                <YAxis yAxisId="right" orientation="right" tick={{ fill: "#64748b", fontSize: 11 }} />
                                <Tooltip content={<ChartTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                                <Line yAxisId="left"  type="monotone" dataKey="uploads" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: "#ef4444" }} name="Uploads" />
                                <Line yAxisId="right" type="monotone" dataKey="views"   stroke="#06b6d4" strokeWidth={2} dot={{ r: 3, fill: "#06b6d4" }} name="Views" />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </Panel>

                {/* Active users by hour of day */}
                <Panel>
                    <SectionTitle icon={Activity} title="Active Sessions by Hour" />
                    {peakHour && (
                        <p className="text-slate-500 text-xs mb-3">
                            Peak: <span className="text-red-400 font-medium">{peakHour.label}</span> — {peakHour.sessions} sessions (last 7 days)
                        </p>
                    )}
                    {activeByHour.every(h => h.sessions === 0) ? (
                        <p className="text-slate-600 text-sm text-center py-8">No activity yet</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={200}>
                            <AreaChart data={activeByHour} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="activityGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}   />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 9 }} interval={5} />
                                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} allowDecimals={false} />
                                <Tooltip content={<ChartTooltip />} />
                                <Area type="monotone" dataKey="sessions" stroke="#ef4444" strokeWidth={2} fill="url(#activityGrad)" name="Sessions" />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </Panel>
            </div>

            {/* ── Row 2: Top Favorite Videos (full-width list) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Panel>
                    <SectionTitle icon={Heart} title="Top Favorite Videos" />
                    <div className="space-y-2">
                        {mostFavoritedVideos.length === 0 ? (
                            <p className="text-slate-600 text-sm text-center py-8">No favorites yet</p>
                        ) : mostFavoritedVideos.slice(0, 8).map((v, i) => (
                            <div key={v._id || i} className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition">
                                <span className="text-2xl font-black text-slate-700 w-8 shrink-0">#{i + 1}</span>
                                {v.thumbnailPath && (
                                    <img src={generalAPI.thumbnailUrl(v.thumbnailPath)} alt={v.title} className="w-10 h-10 rounded object-cover shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-white text-sm truncate">{v.title}</p>
                                    <p className="text-slate-400 text-xs">
                                        <span className="text-red-400">{v.favoriteCount} ❤</span>
                                        {v.views !== undefined && <span className="ml-2">{formatViews(v.views)} views</span>}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </Panel>

                {mostFavoritedSeries.length > 0 && (
                    <Panel>
                        <SectionTitle icon={Heart} title="Most Favorited Series" />
                        <div className="space-y-2">
                            {mostFavoritedSeries.map((s, i) => (
                                <div key={s._id || i} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition">
                                    <span className="text-2xl font-black text-slate-700 w-8 shrink-0">#{i + 1}</span>
                                    {s.thumbnailPath && (
                                        <img src={generalAPI.thumbnailUrl(s.thumbnailPath)} alt={s.title} className="w-10 h-10 rounded object-cover shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-sm font-medium truncate">{s.title}</p>
                                        <p className="text-red-400 text-xs">{s.favoriteCount} ❤</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Panel>
                )}
            </div>

            {/* ── Row 3: Top Videos (by views) ── */}
            <Panel>
                <SectionTitle icon={TrendingUp} title="Top 10 Most Viewed" />
                {topVideos.length === 0 ? (
                    <p className="text-slate-600 text-sm text-center py-8">No videos yet</p>
                ) : (
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart
                            data={topVideos.map(v => ({ name: v.title.slice(0, 22) + (v.title.length > 22 ? "…" : ""), views: v.views }))}
                            layout="vertical"
                            margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                            <XAxis type="number" tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={formatViews} />
                            <YAxis type="category" dataKey="name" width={130} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar dataKey="views" name="Views" radius={[0, 4, 4, 0]}>
                                {topVideos.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </Panel>

            {/* ── Row 4: Tags + Actors + Studios ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                    { icon: Tag,   title: "Top Tags",    data: topTags    },
                    { icon: Users, title: "Top Actors",  data: topActors  },
                    { icon: Star,  title: "Top Studios", data: topStudios },
                ].map(({ icon, title, data: barData }) => (
                    <Panel key={title}>
                        <SectionTitle icon={icon} title={title} />
                        {barData.length === 0 ? (
                            <p className="text-slate-600 text-sm text-center py-8">None yet</p>
                        ) : (
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart
                                    data={barData.map(t => ({ name: t.name.slice(0, 16) + (t.name.length > 16 ? "…" : ""), count: t.count }))}
                                    margin={{ top: 0, right: 4, left: -24, bottom: 40 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                    <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                                    <YAxis tick={{ fill: "#64748b", fontSize: 10 }} allowDecimals={false} />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Bar dataKey="count" name="Videos" radius={[3, 3, 0, 0]}>
                                        {barData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </Panel>
                ))}
            </div>

            {/* ── Row 5: Top Series by Views ── */}
            {topSeries.length > 0 && (
                <Panel>
                    <SectionTitle icon={Layers} title="Top Series by Views" />
                    <div className="space-y-2">
                        {topSeries.map((s, i) => (
                            <div key={s._id || i} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition">
                                <span className="text-2xl font-black text-slate-700 w-8 shrink-0">#{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white text-sm font-medium truncate">{s.title}</p>
                                    <p className="text-slate-400 text-xs">{s.episodeCount} ep · <span className="text-red-400">{formatViews(s.totalViews)} views</span></p>
                                </div>
                            </div>
                        ))}
                    </div>
                </Panel>
            )}

            {/* ── Admin Panels: Transcode Queue + Backup ── */}
            {isAdmin && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <TranscodeQueuePanel />
                    <BackupPanel />
                </div>
            )}
        </div>
    );
}

// ─── Transcode Queue Monitor ──────────────────────────────────────────────────
function TranscodeQueuePanel() {
    const [queue,   setQueue]   = useState(null);
    const [loading, setLoading] = useState(true);
    const esRef = useRef(null);

    useEffect(() => {
        const connect = () => {
            if (esRef.current) esRef.current.close();
            const es = new EventSource(videoAPI.transcodeQueueStreamUrl(), { withCredentials: true });
            esRef.current = es;
            es.onmessage = (e) => { try { setQueue(JSON.parse(e.data)); setLoading(false); } catch (_) {} };
            es.onerror   = () => { es.close(); setTimeout(connect, 5000); };
        };
        connect();
        return () => esRef.current?.close();
    }, []);

    const isEmpty = !queue || (
        (queue.processingList?.length || 0) === 0 &&
        (queue.queuedList?.length     || 0) === 0 &&
        (queue.recentlyDone?.length   || 0) === 0
    );

    return (
        <Panel>
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <SectionTitle icon={Cpu} title="Transcode Queue" />
                <div className="flex items-center gap-2">
                    {/* Encoder chip */}
                    {queue?.encoder && (
                        <span className="text-[10px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded-full border border-slate-700 font-mono hidden sm:inline">
                            {queue.encoder}
                        </span>
                    )}
                    {/* Live indicator */}
                    <span className="flex items-center gap-1 text-[10px] text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        LIVE
                    </span>
                </div>
            </div>

            {/* Stat row */}
            {queue && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                    <QueueStatChip label="Active"  value={queue.active}   color="text-amber-400" />
                    <QueueStatChip label="Queued"  value={queue.queued}   color="text-blue-400"  />
                    <QueueStatChip label={`Slots`} value={`${queue.active}/${queue.maxActive}`} color="text-slate-300" />
                </div>
            )}

            {loading && (
                <div className="flex items-center gap-2 text-slate-500 text-sm py-6 justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-400" />
                    Connecting…
                </div>
            )}

            {!loading && isEmpty && (
                <p className="text-slate-600 text-sm text-center py-8">Queue is empty</p>
            )}

            {!loading && !isEmpty && (
                <div className="space-y-3 max-h-115 overflow-y-auto pr-0.5">
                    {/* ── Processing ── */}
                    {queue.processingList?.length > 0 && (
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1.5 px-0.5">
                                Processing
                            </p>
                            <div className="space-y-2">
                                {queue.processingList.map(item => (
                                    <TranscodeVideoCard key={item.videoId} item={item} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Queued ── */}
                    {queue.queuedList?.length > 0 && (
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1.5 px-0.5">
                                Waiting
                            </p>
                            <div className="space-y-2">
                                {queue.queuedList.map(item => (
                                    <TranscodeVideoCard key={item.videoId} item={item} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Recently done ── */}
                    {queue.recentlyDone?.length > 0 && (
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1.5 px-0.5">
                                Recent
                            </p>
                            <div className="space-y-2">
                                {queue.recentlyDone.map(item => (
                                    <TranscodeVideoCard key={`${item.videoId}-${item.completedAt}`} item={{ ...item, status: 'done' }} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </Panel>
    );
}

function QueueStatChip({ label, value, color }) {
    return (
        <div className="bg-slate-800 rounded-lg p-2 text-center">
            <p className={`text-base font-bold leading-none ${color}`}>{value}</p>
            <p className="text-slate-500 text-[10px] mt-0.5">{label}</p>
        </div>
    );
}

// ─── Individual transcode job card ────────────────────────────────────────────
function TranscodeVideoCard({ item }) {
    const isProcessing = item.status === 'processing';
    const isQueued     = item.status === 'queued';
    const isDone       = item.status === 'done';

    const borderClass = isProcessing ? 'border-amber-500/40 bg-amber-500/8'
                      : isQueued     ? 'border-slate-700    bg-slate-800/50'
                      : item.success ? 'border-green-500/40 bg-green-500/8'
                                     : 'border-red-500/40   bg-red-500/8';

    // Overall percent across all planned resolutions
    const plannedCount = item.plannedResolutions?.length || 0;
    const doneCount    = item.completedResolutions?.length || 0;
    const resPct       = item.resolutionPercent || 0;
    const overallPct   = plannedCount > 0
        ? Math.round(((doneCount * 100) + (doneCount < plannedCount ? resPct : 0)) / plannedCount)
        : 0;

    return (
        <div className={`flex gap-2.5 p-2.5 rounded-xl border transition-all ${borderClass}`}>
            {/* Thumbnail */}
            <div className="relative w-16 h-10 rounded-lg overflow-hidden shrink-0 bg-slate-800">
                {item.thumbnailPath ? (
                    <img
                        src={generalAPI.thumbnailUrl(item.thumbnailPath)}
                        alt={item.title}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-4 h-4 text-slate-600" />
                    </div>
                )}
                {/* Status overlay dot */}
                <div className={`absolute top-1 left-1 w-2 h-2 rounded-full border border-black/40 ${
                    isProcessing         ? 'bg-amber-400 animate-pulse'
                    : isQueued           ? 'bg-slate-500'
                    : item.success       ? 'bg-green-500'
                                         : 'bg-red-500'
                }`} />
            </div>

            {/* Info column */}
            <div className="flex-1 min-w-0">
                {/* Title + right badge */}
                <div className="flex items-start justify-between gap-1 mb-1">
                    <p className="text-xs font-semibold text-white truncate leading-snug">
                        {item.title || `…${item.videoId?.slice(-8)}`}
                    </p>
                    <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase leading-none ${
                        isProcessing         ? 'bg-amber-500/20 text-amber-300'
                        : isQueued           ? 'bg-slate-700 text-slate-400'
                        : item.success       ? 'bg-green-500/20 text-green-300'
                                             : 'bg-red-500/20 text-red-300'
                    }`}>
                        {isProcessing ? 'Encoding' : isQueued ? `#${item.position}` : item.success ? 'Done' : 'Failed'}
                    </span>
                </div>

                {/* Processing: resolution segments + overall bar */}
                {isProcessing && (
                    <>
                        {/* Current resolution + pct */}
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="text-[10px] text-amber-400 font-mono font-bold">
                                {item.currentResolution || '…'}
                            </span>
                            {resPct > 0 && (
                                <span className="text-[10px] text-amber-300/70">{resPct}%</span>
                            )}
                            <span className="text-[10px] text-slate-600 ml-auto">{overallPct}% overall</span>
                        </div>

                        {/* Per-resolution segment bars */}
                        {item.plannedResolutions?.length > 0 && (
                            <div className="flex gap-1">
                                {item.plannedResolutions.map(res => {
                                    const done   = item.completedResolutions?.includes(res);
                                    const active = item.currentResolution === res && !done;
                                    return (
                                        <div key={res} className="flex-1 min-w-0">
                                            <div className="flex justify-center mb-0.5">
                                                <span className="text-[8px] text-slate-500 font-mono">{res}</span>
                                            </div>
                                            <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-500 ${
                                                        done   ? 'bg-green-500'
                                                        : active ? 'bg-amber-400'
                                                               : ''
                                                    }`}
                                                    style={{ width: done ? '100%' : active ? `${resPct}%` : '0%' }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}

                {/* Queued: simple label */}
                {isQueued && (
                    <p className="text-[10px] text-slate-500">Waiting for an open slot…</p>
                )}

                {/* Done: labels or error */}
                {isDone && item.success && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                        {(item.labels || []).map(l => (
                            <span key={l} className="text-[9px] px-1.5 py-0.5 bg-green-500/15 text-green-400 rounded font-mono">{l}</span>
                        ))}
                        {item.completedAt && (
                            <span className="text-[9px] text-slate-600 ml-auto self-end">
                                {new Date(item.completedAt).toLocaleTimeString()}
                            </span>
                        )}
                    </div>
                )}
                {isDone && !item.success && (
                    <p className="text-[10px] text-red-400 truncate mt-0.5">{item.error || 'Transcoding failed'}</p>
                )}
            </div>
        </div>
    );
}

// ─── Backup Panel ─────────────────────────────────────────────────────────────
const STATUS_META = {
    idle:             { icon: Archive,       color: 'text-slate-400',  label: 'Ready to backup' },
    running:          { icon: Archive,       color: 'text-blue-400',   label: 'Backup running…' },
    stopped:          { icon: StopCircle,    color: 'text-amber-400',  label: 'Stopped by user' },
    done:             { icon: CheckCircle2,  color: 'text-green-400',  label: 'Backup complete' },
    done_with_errors: { icon: AlertTriangle, color: 'text-amber-400',  label: 'Done with errors' },
    error:            { icon: XCircle,       color: 'text-red-400',    label: 'Backup error' },
};

function BackupPanel() {
    const [bk, setBk]         = useState({ status: 'idle', total: 0, done: 0, failed: 0, skipped: 0, errors: [], currentFile: null, startedAt: null, finishedAt: null });
    const [starting, setStarting] = useState(false);
    const [stopping, setStopping] = useState(false);
    const esRef  = useRef(null);

    // Connect SSE
    useEffect(() => {
        const connect = () => {
            if (esRef.current) esRef.current.close();
            const es = new EventSource(backupAPI.statusUrl(), { withCredentials: true });
            esRef.current = es;
            es.onmessage = (e) => { try { setBk(JSON.parse(e.data)); } catch { } };
            es.onerror   = () => { es.close(); setTimeout(connect, 5000); };
        };
        connect();
        return () => esRef.current?.close();
    }, []);

    const handleStart = async () => {
        setStarting(true);
        try { await backupAPI.start(); } catch (e) { alert(e?.response?.data?.error || 'Failed to start backup'); }
        finally { setStarting(false); }
    };

    const handleStop = async () => {
        setStopping(true);
        try { await backupAPI.stop(); } catch { }
        finally { setStopping(false); }
    };

    const pct     = bk.total > 0 ? Math.round((bk.done / bk.total) * 100) : 0;
    const meta    = STATUS_META[bk.status] || STATUS_META.idle;
    const StatusIcon = meta.icon;
    const isRunning  = bk.status === 'running';

    return (
        <Panel>
            <div className="flex items-center justify-between mb-4">
                <SectionTitle icon={Archive} title="Backup" />
                <StatusIcon className={`w-4 h-4 ${meta.color} ${isRunning ? 'animate-pulse' : ''}`} />
            </div>

            {/* Status row */}
            <div className={`flex items-center gap-2 text-sm mb-4 ${meta.color}`}>
                <span className="font-medium">{meta.label}</span>
            </div>

            {/* Progress bar (visible when running or after) */}
            {bk.total > 0 && (
                <div className="mb-4">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span>{bk.done} / {bk.total} files</span>
                        <span>{pct}%</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-300 ${
                                bk.status === 'done' ? 'bg-green-500' :
                                bk.status === 'error' || bk.status === 'stopped' ? 'bg-amber-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                    <div className="flex gap-4 mt-1.5 text-xs text-slate-500">
                        {bk.skipped > 0 && <span className="text-slate-400">↷ {bk.skipped} skipped</span>}
                        {bk.failed  > 0 && <span className="text-red-400">✕ {bk.failed} failed</span>}
                    </div>
                </div>
            )}

            {/* Current file */}
            {bk.currentFile && (
                <p className="text-xs text-slate-500 truncate mb-3 font-mono bg-slate-800 px-2 py-1 rounded">
                    {bk.currentFile}
                </p>
            )}

            {/* Timestamps */}
            {bk.startedAt && (
                <div className="text-xs text-slate-500 mb-3 space-y-0.5">
                    <p>Started: {new Date(bk.startedAt).toLocaleTimeString()}</p>
                    {bk.finishedAt && <p>Finished: {new Date(bk.finishedAt).toLocaleTimeString()}</p>}
                </div>
            )}

            {/* Errors */}
            {bk.errors?.length > 0 && (
                <div className="mb-3 max-h-24 overflow-y-auto space-y-1">
                    {bk.errors.map((e, i) => (
                        <p key={i} className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">{e}</p>
                    ))}
                </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 mt-2">
                {!isRunning ? (
                    <button
                        onClick={handleStart}
                        disabled={starting}
                        className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
                    >
                        <Play className="w-3.5 h-3.5" fill="currentColor" />
                        {starting ? 'Starting…' : bk.status === 'idle' ? 'Start Backup' : 'Run Again'}
                    </button>
                ) : (
                    <button
                        onClick={handleStop}
                        disabled={stopping}
                        className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
                    >
                        <StopCircle className="w-3.5 h-3.5" />
                        {stopping ? 'Stopping…' : 'Stop Backup'}
                    </button>
                )}
            </div>
        </Panel>
    );
}