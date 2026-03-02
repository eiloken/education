import React, { useEffect, useState, useCallback } from "react";
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
    Film, Layers, Eye, Heart, HardDrive, Clock,
    TrendingUp, Star, Users, Tag, Play, RefreshCw
} from "lucide-react";
import { statsAPI, generalAPI } from "../api/api";
import { formatViews, formatDuration, formatFileSize } from "../utils/format";

// ── Palette ───────────────────────────────────────────────────────────────────
const COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#8b5cf6","#ec4899","#14b8a6","#f59e0b","#3b82f6"];

// ── Tiny helpers ──────────────────────────────────────────────────────────────
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
            <div className={`p-3 rounded-lg ${accent}`}>
                <Icon className="w-5 h-5" />
            </div>
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
    return (
        <div className={`bg-slate-900 border border-slate-800 rounded-xl p-4 ${className}`}>
            {children}
        </div>
    );
}

// Custom tooltip for recharts
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

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async (isRefresh = false) => {
        isRefresh ? setRefreshing(true) : setLoading(true);
        setError(null);
        try {
            const d = await statsAPI.getStats();
            setData(d);
        } catch (e) {
            setError("Failed to load stats. Make sure your server is running.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500" />
                <p className="text-slate-400">Loading stats…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
                <p className="text-slate-400">{error}</p>
                <button onClick={() => load()} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm transition">
                    Retry
                </button>
            </div>
        );
    }

    const { overview, topVideos, recentVideos, uploadsByMonth, topTags, topActors, topStudios, resolutionBreakdown, topSeries } = data;

    // Hours of content
    const hoursOfContent = Math.round((overview.totalDuration || 0) / 3600);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-white">Platform Dashboard</h2>
                    <p className="text-slate-500 text-sm mt-0.5">Overview of your video library</p>
                </div>
                <button
                    onClick={() => load(true)}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition"
                >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                    Refresh
                </button>
            </div>

            {/* ── Overview cards ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard icon={Film}      label="Videos"    value={overview.totalVideos.toLocaleString()}   color="red"    />
                <StatCard icon={Layers}    label="Series"    value={overview.totalSeries.toLocaleString()}   color="purple" />
                <StatCard icon={Eye}       label="Total Views" value={formatViews(overview.totalViews)}      color="cyan"   />
                <StatCard icon={Heart}     label="Favorites" value={overview.totalFavorites.toLocaleString()} color="orange" />
                <StatCard icon={HardDrive} label="Storage"   value={formatFileSize(overview.totalStorage)}  color="blue"   />
                <StatCard icon={Clock}     label="Content"   value={`${hoursOfContent}h`} sub={formatDuration(overview.totalDuration)} color="green" />
            </div>

            {/* ── Row 1: Uploads over time + Resolution breakdown ────────────── */}
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
                                <YAxis yAxisId="left" tick={{ fill: "#64748b", fontSize: 11 }} />
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
                    <SectionTitle icon={Play} title="Resolutions" />
                    {resolutionBreakdown.length === 0 ? (
                        <p className="text-slate-600 text-sm text-center py-8">No data</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <Pie
                                    data={resolutionBreakdown}
                                    cx="50%" cy="50%"
                                    innerRadius={55} outerRadius={85}
                                    paddingAngle={3}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    labelLine={{ stroke: "#475569", strokeWidth: 1 }}
                                >
                                    {resolutionBreakdown.map((_, i) => (
                                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip content={<ChartTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </Panel>
            </div>

            {/* ── Row 2: Top videos + Recent uploads ────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Panel>
                    <SectionTitle icon={TrendingUp} title="Top 10 Most Viewed" />
                    {topVideos.length === 0 ? (
                        <p className="text-slate-600 text-sm text-center py-8">No videos yet</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={topVideos.map(v => ({ name: v.title.slice(0, 22) + (v.title.length > 22 ? "…" : ""), views: v.views }))}
                                layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
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

                <Panel>
                    <SectionTitle icon={Clock} title="Recent Uploads" />
                    <div className="space-y-2">
                        {recentVideos.length === 0 ? (
                            <p className="text-slate-600 text-sm text-center py-8">No videos yet</p>
                        ) : recentVideos.map((v, i) => (
                            <div key={v._id || i} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-slate-600 text-xs font-mono w-4 shrink-0">{i + 1}</span>
                                    <div className="min-w-0">
                                        <p className="text-white text-sm truncate">{v.title}</p>
                                        <p className="text-slate-500 text-xs">
                                            {new Date(v.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                <div className="shrink-0 text-right">
                                    <p className="text-slate-400 text-xs">{formatDuration(v.duration)}</p>
                                    <p className="text-slate-600 text-xs">{formatFileSize(v.fileSize)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </Panel>
            </div>

            {/* ── Row 3: Tags + Actors + Studios ───────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                    { icon: Tag,   title: "Top Tags",    data: topTags   },
                    { icon: Users, title: "Top Actors",  data: topActors  },
                    { icon: Star,  title: "Top Studios", data: topStudios },
                ].map(({ icon, title, data: barData }) => (
                    <Panel key={title}>
                        <SectionTitle icon={icon} title={title} />
                        {barData.length === 0 ? (
                            <p className="text-slate-600 text-sm text-center py-8">None yet</p>
                        ) : (
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={barData.map(t => ({ name: t.name.slice(0, 16) + (t.name.length > 16 ? "…" : ""), count: t.count }))}
                                    margin={{ top: 0, right: 4, left: -24, bottom: 40 }}>
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

            {/* ── Row 4: Top series ─────────────────────────────────────────── */}
            {topSeries.length > 0 && (
                <Panel>
                    <SectionTitle icon={Layers} title="Top Series by Views" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                        {topSeries.map((s, i) => (
                            <div key={s._id || i} className="bg-slate-800/50 rounded-lg p-3 border border-slate-800">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-2xl font-black text-slate-700">#{i + 1}</span>
                                </div>
                                <p className="text-white text-sm font-medium truncate">{s.title}</p>
                                <p className="text-slate-400 text-xs mt-1">{s.episodeCount} episodes</p>
                                <p className="text-red-400 text-xs font-medium">{formatViews(s.totalViews)} views</p>
                            </div>
                        ))}
                    </div>
                </Panel>
            )}
        </div>
    );
}