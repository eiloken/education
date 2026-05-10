import React, { useEffect, useRef, useState, useCallback } from "react";
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell
} from "recharts";
import {
    Film, Layers, Eye, Heart, HardDrive, Clock,
    TrendingUp, Star, Users, Tag, RefreshCw, Activity,
    Cpu, Archive, StopCircle, Play, AlertTriangle, CheckCircle2, XCircle,
    RotateCcw, Database, ListChecks,
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

            {/* ── Row 2: Top Favorite Videos + Series ── */}
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

            {/* ── Admin Panels ── */}
            {isAdmin && <AdminSection />}
        </div>
    );
}

// ─── AdminSection — owns the single queue SSE, distributes to children ────────
function AdminSection() {
    const [queue,        setQueue]        = useState(null);
    const [queueLoading, setQueueLoading] = useState(true);
    const esRef = useRef(null);

    useEffect(() => {
        const connect = () => {
            if (esRef.current) esRef.current.close();
            const es = new EventSource(videoAPI.transcodeQueueStreamUrl(), { withCredentials: true });
            esRef.current = es;
            es.onmessage = (e) => {
                try { setQueue(JSON.parse(e.data)); setQueueLoading(false); } catch (_) {}
            };
            es.onerror = () => { es.close(); setTimeout(connect, 5000); };
        };
        connect();
        return () => esRef.current?.close();
    }, []);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TranscodeQueuePanel queue={queue} loading={queueLoading} />
                <BackupPanel />
            </div>
            <TranscodeVerifyPanel queue={queue} />
        </div>
    );
}

// ─── Transcode Queue Monitor (controlled — queue state owned by AdminSection) ─
function TranscodeQueuePanel({ queue, loading }) {

    const isEmpty = !queue || (
        (queue.processingList?.length || 0) === 0 &&
        (queue.queuedList?.length     || 0) === 0 &&
        (queue.recentlyDone?.length   || 0) === 0
    );

    return (
        <Panel>
            <div className="flex items-center justify-between mb-3">
                <SectionTitle icon={Cpu} title="Transcode Queue" />
                <div className="flex items-center gap-2">
                    {queue?.encoder && (
                        <span className="text-[10px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded-full border border-slate-700 font-mono hidden sm:inline">
                            {queue.encoder}
                        </span>
                    )}
                    <span className="flex items-center gap-1 text-[10px] text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        LIVE
                    </span>
                </div>
            </div>

            {queue && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                    <QueueStatChip label="Active"  value={queue.active}   color="text-amber-400" />
                    <QueueStatChip label="Queued"  value={queue.queued}   color="text-blue-400"  />
                    <QueueStatChip label="Slots"   value={`${queue.active}/${queue.maxActive}`} color="text-slate-300" />
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
                    {queue.processingList?.length > 0 && (
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1.5 px-0.5">Processing</p>
                            <div className="space-y-2">
                                {queue.processingList.map(item => (
                                    <TranscodeVideoCard key={item.videoId} item={item} />
                                ))}
                            </div>
                        </div>
                    )}

                    {queue.queuedList?.length > 0 && (
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1.5 px-0.5">Waiting</p>
                            <div className="space-y-2">
                                {queue.queuedList.map(item => (
                                    <TranscodeVideoCard key={item.videoId} item={item} />
                                ))}
                            </div>
                        </div>
                    )}

                    {queue.recentlyDone?.length > 0 && (
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1.5 px-0.5">Recent</p>
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

function TranscodeVideoCard({ item }) {
    const isProcessing = item.status === 'processing';
    const isQueued     = item.status === 'queued';
    const isDone       = item.status === 'done';

    const borderClass = isProcessing ? 'border-amber-500/40 bg-amber-500/8'
                      : isQueued     ? 'border-slate-700    bg-slate-800/50'
                      : item.success ? 'border-green-500/40 bg-green-500/8'
                                     : 'border-red-500/40   bg-red-500/8';

    const plannedCount = item.plannedResolutions?.length || 0;
    const doneCount    = item.completedResolutions?.length || 0;
    const resPct       = item.resolutionPercent || 0;
    const overallPct   = plannedCount > 0
        ? Math.round(((doneCount * 100) + (doneCount < plannedCount ? resPct : 0)) / plannedCount)
        : 0;

    return (
        <div className={`flex gap-2.5 p-2.5 rounded-xl border transition-all ${borderClass}`}>
            <div className="relative w-16 h-10 rounded-lg overflow-hidden shrink-0 bg-slate-800">
                {item.thumbnailPath ? (
                    <img src={generalAPI.thumbnailUrl(item.thumbnailPath)} alt={item.title} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-4 h-4 text-slate-600" />
                    </div>
                )}
                <div className={`absolute top-1 left-1 w-2 h-2 rounded-full border border-black/40 ${
                    isProcessing   ? 'bg-amber-400 animate-pulse'
                    : isQueued     ? 'bg-slate-500'
                    : item.success ? 'bg-green-500'
                                   : 'bg-red-500'
                }`} />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-1 mb-1">
                    <p className="text-xs font-semibold text-white truncate leading-snug">
                        {item.title || `…${item.videoId?.slice(-8)}`}
                    </p>
                    <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase leading-none ${
                        isProcessing   ? 'bg-amber-500/20 text-amber-300'
                        : isQueued     ? 'bg-slate-700 text-slate-400'
                        : item.success ? 'bg-green-500/20 text-green-300'
                                       : 'bg-red-500/20 text-red-300'
                    }`}>
                        {isProcessing ? 'Encoding' : isQueued ? `#${item.position}` : item.success ? 'Done' : 'Failed'}
                    </span>
                </div>

                {isProcessing && (
                    <>
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="text-[10px] text-amber-400 font-mono font-bold">
                                {item.currentResolution || '…'}
                            </span>
                            {resPct > 0 && <span className="text-[10px] text-amber-300/70">{resPct}%</span>}
                            <span className="text-[10px] text-slate-600 ml-auto">{overallPct}% overall</span>
                        </div>
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
                                                        done ? 'bg-green-500' : active ? 'bg-amber-400' : ''
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

                {isQueued && (
                    <p className="text-[10px] text-slate-500">Waiting for an open slot…</p>
                )}

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

// ─── Backup + Restore Panel ───────────────────────────────────────────────────
const BACKUP_STATUS_META = {
    idle:             { icon: Archive,       color: 'text-slate-400',  label: 'Ready to backup' },
    running:          { icon: Archive,       color: 'text-blue-400',   label: 'Backup running…' },
    stopped:          { icon: StopCircle,    color: 'text-amber-400',  label: 'Stopped by user' },
    done:             { icon: CheckCircle2,  color: 'text-green-400',  label: 'Backup complete' },
    done_with_errors: { icon: AlertTriangle, color: 'text-amber-400',  label: 'Done with errors' },
    error:            { icon: XCircle,       color: 'text-red-400',    label: 'Backup error' },
};

const RESTORE_STATUS_META = {
    idle:             { icon: Database,      color: 'text-slate-400',  label: 'Ready to restore' },
    running:          { icon: RotateCcw,     color: 'text-blue-400',   label: 'Restoring…' },
    done:             { icon: CheckCircle2,  color: 'text-green-400',  label: 'Restore complete' },
    done_with_errors: { icon: AlertTriangle, color: 'text-amber-400',  label: 'Done with errors' },
    error:            { icon: XCircle,       color: 'text-red-400',    label: 'Restore error' },
};

const BACKUP_MODES = [
    { value: 'both', label: 'Both',     desc: 'Raw videos + HLS' },
    { value: 'raw',  label: 'Raw only', desc: 'Video files only' },
    { value: 'hls',  label: 'HLS only', desc: 'Transcode folders' },
];

function BackupPanel() {
    const [activeTab,  setActiveTab]  = useState('backup');
    const [mode,       setMode]       = useState('both');
    const [bk,         setBk]         = useState({ status: 'idle', total: 0, done: 0, failed: 0, skipped: 0, errors: [], currentFile: null, startedAt: null, finishedAt: null, mode: 'both' });
    const [restore,    setRestore]    = useState({ status: 'idle', total: 0, done: 0, failed: 0, skipped: 0, errors: [], currentFile: null, startedAt: null, finishedAt: null });
    const [starting,   setStarting]   = useState(false);
    const [stopping,   setStopping]   = useState(false);
    const [restoring,  setRestoring]  = useState(false);
    const bkEsRef  = useRef(null);
    const rstEsRef = useRef(null);

    // Backup SSE
    useEffect(() => {
        const connect = () => {
            if (bkEsRef.current) bkEsRef.current.close();
            const es = new EventSource(backupAPI.statusUrl(), { withCredentials: true });
            bkEsRef.current = es;
            es.onmessage = (e) => { try { setBk(JSON.parse(e.data)); } catch {} };
            es.onerror   = () => { es.close(); setTimeout(connect, 5000); };
        };
        connect();
        return () => bkEsRef.current?.close();
    }, []);

    // Restore SSE
    useEffect(() => {
        const connect = () => {
            if (rstEsRef.current) rstEsRef.current.close();
            const es = new EventSource(backupAPI.restoreStatusUrl(), { withCredentials: true });
            rstEsRef.current = es;
            es.onmessage = (e) => { try { setRestore(JSON.parse(e.data)); } catch {} };
            es.onerror   = () => { es.close(); setTimeout(connect, 5000); };
        };
        connect();
        return () => rstEsRef.current?.close();
    }, []);

    const handleStart = async () => {
        setStarting(true);
        try { await backupAPI.start(mode); }
        catch (e) { alert(e?.response?.data?.error || 'Failed to start backup'); }
        finally { setStarting(false); }
    };

    const handleStop = async () => {
        setStopping(true);
        try { await backupAPI.stop(); } catch {}
        finally { setStopping(false); }
    };

    const handleRestore = async () => {
        if (!window.confirm(
            'This will restore missing series, videos, and media files from the backup directory.\n\n' +
            'Existing records will NOT be overwritten — only missing ones will be added.\n\nProceed?'
        )) return;
        setRestoring(true);
        try { await backupAPI.restore(); }
        catch (e) { alert(e?.response?.data?.error || 'Failed to start restore'); }
        finally { setRestoring(false); }
    };

    const bkPct  = bk.total      > 0 ? Math.round((bk.done      / bk.total)      * 100) : 0;
    const rstPct = restore.total  > 0 ? Math.round((restore.done / restore.total)  * 100) : 0;
    const bkMeta  = BACKUP_STATUS_META[bk.status]       || BACKUP_STATUS_META.idle;
    const rstMeta = RESTORE_STATUS_META[restore.status]  || RESTORE_STATUS_META.idle;
    const BkIcon  = bkMeta.icon;
    const RstIcon = rstMeta.icon;
    const isBackingUp  = bk.status === 'running';
    const isRestoring  = restore.status === 'running';

    return (
        <Panel>
            {/* Panel header + tab switcher */}
            <div className="flex items-center justify-between mb-4">
                <SectionTitle icon={Archive} title="Backup & Restore" />
                <div className="flex bg-slate-800 rounded-lg p-0.5 gap-0.5">
                    {['backup', 'restore'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-3 py-1 rounded-md text-xs font-medium transition capitalize ${
                                activeTab === tab
                                    ? 'bg-slate-700 text-white'
                                    : 'text-slate-400 hover:text-slate-300'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Backup Tab ─────────────────────────────────────────────────── */}
            {activeTab === 'backup' && (
                <div className="space-y-4">
                    {/* Mode selector */}
                    <div>
                        <p className="text-slate-500 text-xs mb-2">What to back up</p>
                        <div className="grid grid-cols-3 gap-1.5">
                            {BACKUP_MODES.map(m => (
                                <button
                                    key={m.value}
                                    onClick={() => !isBackingUp && setMode(m.value)}
                                    disabled={isBackingUp}
                                    className={`flex flex-col items-center p-2 rounded-lg border text-center transition ${
                                        mode === m.value
                                            ? 'border-blue-500/60 bg-blue-500/10 text-blue-300'
                                            : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                    <span className="text-xs font-semibold">{m.label}</span>
                                    <span className="text-[10px] opacity-70 mt-0.5">{m.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Status */}
                    <div className={`flex items-center gap-2 text-sm ${bkMeta.color}`}>
                        <BkIcon className={`w-4 h-4 ${isBackingUp ? 'animate-pulse' : ''}`} />
                        <span className="font-medium">{bkMeta.label}</span>
                        {bk.mode && bk.status !== 'idle' && (
                            <span className="text-slate-600 text-xs ml-auto">{bk.mode}</span>
                        )}
                    </div>

                    {/* Progress bar */}
                    {bk.total > 0 && (
                        <div>
                            <div className="flex justify-between text-xs text-slate-400 mb-1">
                                <span>{bk.done} / {bk.total} files</span>
                                <span>{bkPct}%</span>
                            </div>
                            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                        bk.status === 'done'   ? 'bg-green-500' :
                                        bk.status === 'error' || bk.status === 'stopped' ? 'bg-amber-500' : 'bg-blue-500'
                                    }`}
                                    style={{ width: `${bkPct}%` }}
                                />
                            </div>
                            <div className="flex gap-4 mt-1.5 text-xs text-slate-500">
                                {bk.skipped > 0 && <span className="text-slate-400">↷ {bk.skipped} skipped</span>}
                                {bk.failed  > 0 && <span className="text-red-400">✕ {bk.failed} failed</span>}
                            </div>
                        </div>
                    )}

                    {bk.currentFile && (
                        <p className="text-xs text-slate-500 truncate font-mono bg-slate-800 px-2 py-1 rounded">
                            {bk.currentFile}
                        </p>
                    )}

                    {bk.startedAt && (
                        <div className="text-xs text-slate-500 space-y-0.5">
                            <p>Started: {new Date(bk.startedAt).toLocaleTimeString()}</p>
                            {bk.finishedAt && <p>Finished: {new Date(bk.finishedAt).toLocaleTimeString()}</p>}
                        </div>
                    )}

                    {bk.errors?.length > 0 && (
                        <div className="max-h-24 overflow-y-auto space-y-1">
                            {bk.errors.map((e, i) => (
                                <p key={i} className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">{e}</p>
                            ))}
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2">
                        {!isBackingUp ? (
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
                </div>
            )}

            {/* ── Restore Tab ────────────────────────────────────────────────── */}
            {activeTab === 'restore' && (
                <div className="space-y-4">
                    {/* Info banner */}
                    <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 text-xs text-slate-400 space-y-1">
                        <p className="text-slate-300 font-medium">What restore does:</p>
                        <p>• Reads JSON manifests from the backup's <span className="font-mono text-slate-300">_metadata/</span> folder</p>
                        <p>• Creates missing series and video records in the database</p>
                        <p>• Copies missing raw video files back to the upload directory</p>
                        <p>• Re-links HLS transcode folders if they were backed up</p>
                        <p className="text-slate-500 pt-1">Existing records and files are never overwritten.</p>
                    </div>

                    {/* Status */}
                    <div className={`flex items-center gap-2 text-sm ${rstMeta.color}`}>
                        <RstIcon className={`w-4 h-4 ${isRestoring ? 'animate-spin' : ''}`} />
                        <span className="font-medium">{rstMeta.label}</span>
                    </div>

                    {/* Progress bar */}
                    {restore.total > 0 && (
                        <div>
                            <div className="flex justify-between text-xs text-slate-400 mb-1">
                                <span>{restore.done} / {restore.total} entries</span>
                                <span>{rstPct}%</span>
                            </div>
                            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                        restore.status === 'done'   ? 'bg-green-500' :
                                        restore.status === 'error'  ? 'bg-red-500' : 'bg-blue-500'
                                    }`}
                                    style={{ width: `${rstPct}%` }}
                                />
                            </div>
                            <div className="flex gap-4 mt-1.5 text-xs text-slate-500">
                                {restore.skipped > 0 && <span className="text-slate-400">↷ {restore.skipped} existing (skipped)</span>}
                                {restore.failed  > 0 && <span className="text-red-400">✕ {restore.failed} failed</span>}
                            </div>
                        </div>
                    )}

                    {restore.currentFile && (
                        <p className="text-xs text-slate-500 truncate font-mono bg-slate-800 px-2 py-1 rounded">
                            {restore.currentFile}
                        </p>
                    )}

                    {restore.startedAt && (
                        <div className="text-xs text-slate-500 space-y-0.5">
                            <p>Started: {new Date(restore.startedAt).toLocaleTimeString()}</p>
                            {restore.finishedAt && <p>Finished: {new Date(restore.finishedAt).toLocaleTimeString()}</p>}
                        </div>
                    )}

                    {restore.errors?.length > 0 && (
                        <div className="max-h-24 overflow-y-auto space-y-1">
                            {restore.errors.map((e, i) => (
                                <p key={i} className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">{e}</p>
                            ))}
                        </div>
                    )}

                    <button
                        onClick={handleRestore}
                        disabled={restoring || isRestoring}
                        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
                    >
                        <RotateCcw className={`w-3.5 h-3.5 ${isRestoring ? 'animate-spin' : ''}`} />
                        {restoring || isRestoring
                            ? 'Restoring…'
                            : restore.status === 'idle' ? 'Start Restore' : 'Restore Again'
                        }
                    </button>
                </div>
            )}
        </Panel>
    );
}

// ─── Transcode Verification Panel ─────────────────────────────────────────────
const HLS_STATUS_COLOR = {
    none:       'text-slate-400',
    pending:    'text-blue-400',
    processing: 'text-amber-400',
    failed:     'text-red-400',
    ready:      'text-green-400',
};

function TranscodeVerifyPanel({ queue }) {
    const [loading,  setLoading]  = useState(false);
    const [videos,   setVideos]   = useState(null);
    const [selected, setSelected] = useState(new Set());
    const [queuing,  setQueuing]  = useState(false);
    const [result,   setResult]   = useState(null);

    // Track previously-seen recentlyDone length to detect new completions
    const prevDoneCountRef = useRef(0);

    const scan = useCallback(async () => {
        setLoading(true);
        setResult(null);
        try {
            const data = await videoAPI.verifyTranscode();
            setVideos(data);
            setSelected(new Set());
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    // Auto-rescan when a new job finishes (recentlyDone grows), but only if
    // the panel has already been scanned at least once.
    useEffect(() => {
        const currentCount = queue?.recentlyDone?.length ?? 0;
        if (currentCount > prevDoneCountRef.current && videos !== null) {
            // Small delay so the DB has time to persist the final hlsStatus
            const t = setTimeout(scan, 1200);
            prevDoneCountRef.current = currentCount;
            return () => clearTimeout(t);
        }
        prevDoneCountRef.current = currentCount;
    }, [queue?.recentlyDone?.length, videos, scan]);

    const toggleAll = () => {
        if (selected.size === videos.length) setSelected(new Set());
        else setSelected(new Set(videos.map(v => v._id.toString())));
    };

    const toggle = (id) => {
        const next = new Set(selected);
        next.has(id) ? next.delete(id) : next.add(id);
        setSelected(next);
    };

    const queueSelected = async () => {
        if (!selected.size) return;
        setQueuing(true);
        try {
            const res = await videoAPI.batchTranscode([...selected]);
            setResult(res);
            setSelected(new Set());
            // Small delay then rescan — queue SSE will also trigger one on completion
            setTimeout(scan, 1000);
        } catch (e) {
            console.error(e);
        } finally {
            setQueuing(false);
        }
    };

    const pendingCount   = videos?.filter(v => v.hlsStatus === 'none').length    ?? 0;
    const failedCount    = videos?.filter(v => v.hlsStatus === 'failed').length   ?? 0;
    const missingCount   = videos?.filter(v => v.hlsStatus === 'ready' && !v.hlsFileExists).length ?? 0;

    // IDs currently processing or queued — used to show live status badges in the list
    const activeIds  = new Set(queue?.activeIds  || []);
    const queuedIds  = new Set(queue?.queuedIds  || []);

    return (
        <Panel>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <SectionTitle icon={ListChecks} title="Transcode Verification" />
                <div className="flex items-center gap-2">
                    {/* Live auto-update indicator — only shown after first scan */}
                    {videos !== null && (
                        <span className="flex items-center gap-1 text-[10px] text-green-400" title="Auto-updates when queue finishes a job">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                            LIVE
                        </span>
                    )}
                    <button
                        onClick={scan}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        {videos === null ? 'Scan Library' : 'Re-scan'}
                    </button>
                </div>
            </div>

            {/* Initial state */}
            {videos === null && !loading && (
                <div className="text-center py-10">
                    <ListChecks className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">
                        Scan your library to find videos that aren't transcoded or whose HLS files are missing.
                    </p>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex items-center gap-2 justify-center py-10 text-slate-500 text-sm">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400" />
                    Scanning library…
                </div>
            )}

            {/* Results */}
            {videos !== null && !loading && (
                <>
                    {videos.length === 0 ? (
                        <div className="flex items-center gap-2 text-green-400 text-sm py-6 justify-center">
                            <CheckCircle2 className="w-5 h-5" />
                            All videos are transcoded and HLS files are present
                        </div>
                    ) : (
                        <>
                            {/* Summary chips */}
                            <div className="flex flex-wrap gap-2 mb-4">
                                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-amber-400">
                                    {videos.length} need attention
                                </span>
                                {pendingCount > 0 && (
                                    <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
                                        {pendingCount} never transcoded
                                    </span>
                                )}
                                {failedCount > 0 && (
                                    <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 border border-red-900/40 text-red-400">
                                        {failedCount} failed
                                    </span>
                                )}
                                {missingCount > 0 && (
                                    <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 border border-amber-900/40 text-amber-400">
                                        {missingCount} files missing
                                    </span>
                                )}
                            </div>

                            {/* Toolbar */}
                            <div className="flex items-center justify-between mb-3">
                                <button
                                    onClick={toggleAll}
                                    className="text-xs text-slate-400 hover:text-white transition"
                                >
                                    {selected.size === videos.length ? 'Deselect all' : `Select all (${videos.length})`}
                                </button>
                                <button
                                    onClick={queueSelected}
                                    disabled={!selected.size || queuing}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-lg text-xs font-medium transition"
                                >
                                    <Play className="w-3 h-3" fill="currentColor" />
                                    {queuing
                                        ? 'Queuing…'
                                        : selected.size
                                            ? `Queue ${selected.size} video${selected.size !== 1 ? 's' : ''}`
                                            : 'Queue selected'
                                    }
                                </button>
                            </div>

                            {/* Queue result banner */}
                            {result && (
                                <div className="mb-3 p-2.5 rounded-lg bg-slate-800 border border-slate-700 text-xs flex gap-4 items-center">
                                    {result.queued > 0  && <span className="text-amber-400 font-medium">▶ {result.queued} queued</span>}
                                    {result.skipped > 0 && <span className="text-slate-400">↷ {result.skipped} skipped (already ready)</span>}
                                    {result.errors > 0  && <span className="text-red-400">✕ {result.errors} errors</span>}
                                </div>
                            )}

                            {/* Video list */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-80 overflow-y-auto">
                                {videos.map(v => {
                                    const id          = v._id.toString();
                                    const isChecked   = selected.has(id);
                                    const isActive    = activeIds.has(id);
                                    const isQueuedNow = queuedIds.has(id);
                                    return (
                                        <div
                                            key={id}
                                            onClick={() => !isActive && !isQueuedNow && toggle(id)}
                                            className={`flex items-center gap-2.5 p-2 rounded-lg transition border ${
                                                isActive    ? 'border-amber-500/60 bg-amber-500/10 cursor-default' :
                                                isQueuedNow ? 'border-blue-500/40  bg-blue-500/8  cursor-default' :
                                                isChecked   ? 'border-amber-500/50 bg-amber-500/10 cursor-pointer' :
                                                              'border-slate-800 bg-slate-800/40 hover:bg-slate-800 cursor-pointer'
                                            }`}
                                        >
                                            {/* Checkbox — hidden while live in queue */}
                                            {!isActive && !isQueuedNow && (
                                                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
                                                    isChecked ? 'bg-amber-500 border-amber-500' : 'border-slate-600'
                                                }`}>
                                                    {isChecked && <span className="text-white text-[9px] font-bold leading-none">✓</span>}
                                                </div>
                                            )}
                                            {/* Live status dot */}
                                            {(isActive || isQueuedNow) && (
                                                <div className={`w-4 h-4 flex items-center justify-center shrink-0`}>
                                                    <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-amber-400 animate-pulse' : 'bg-blue-400'}`} />
                                                </div>
                                            )}

                                            {/* Thumbnail */}
                                            <div className="w-12 h-8 rounded bg-slate-700 shrink-0 overflow-hidden">
                                                {v.thumbnailPath ? (
                                                    <img
                                                        src={generalAPI.thumbnailUrl(v.thumbnailPath)}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <Film className="w-3 h-3 text-slate-600" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white text-xs truncate font-medium leading-tight">
                                                    {v.title}
                                                </p>
                                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                    {/* Live queue status overrides stored hlsStatus */}
                                                    {isActive ? (
                                                        <span className="text-[10px] font-mono text-amber-400">encoding…</span>
                                                    ) : isQueuedNow ? (
                                                        <span className="text-[10px] font-mono text-blue-400">queued</span>
                                                    ) : (
                                                        <span className={`text-[10px] font-mono ${HLS_STATUS_COLOR[v.hlsStatus] || 'text-slate-500'}`}>
                                                            {v.hlsStatus || 'none'}
                                                        </span>
                                                    )}
                                                    {v.hlsStatus === 'ready' && !v.hlsFileExists && (
                                                        <span className="text-[10px] text-red-400">⚠ files missing</span>
                                                    )}
                                                    {v.duration > 0 && (
                                                        <span className="text-[10px] text-slate-600">
                                                            {formatDuration(v.duration)}
                                                        </span>
                                                    )}
                                                    {v.fileSize > 0 && (
                                                        <span className="text-[10px] text-slate-600">
                                                            {formatFileSize(v.fileSize)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </>
            )}
        </Panel>
    );
}