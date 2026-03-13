import React, { useState, useEffect, useCallback } from 'react';
import {
    Users, Clock, CheckCircle2, XCircle,
    RefreshCw, ChevronDown, ChevronUp, AlertCircle,
    UserCheck, UserX, Shield, ShieldOff,
} from 'lucide-react';
import { authAPI } from '../api/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)   return 'just now';
    if (m < 60)  return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

function expiresIn(expiresAt) {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'expired';
    const h = Math.floor(diff / 3600000);
    if (h < 24) return `${h}h left`;
    return `${Math.floor(h / 24)}d left`;
}

const STATUS_CLASSES = {
    pending:  'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    approved: 'bg-green-500/10 text-green-400 border-green-500/20',
    rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
};

// ── Request card ──────────────────────────────────────────────────────────────

function RequestCard({ request, onApprove, onReject, busy }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden">
            <div className="flex items-start gap-3 p-4">
                {/* Avatar placeholder */}
                <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center shrink-0 text-white font-semibold text-sm uppercase">
                    {request.username[0]}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-medium text-sm">{request.username}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_CLASSES[request.status]}`}>
                            {request.status}
                        </span>
                        {request.status === 'pending' && (
                            <span className="text-xs text-slate-500">{expiresIn(request.expiresAt)}</span>
                        )}
                    </div>
                    <p className="text-slate-400 text-xs mt-0.5 truncate">{request.email}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{timeAgo(request.createdAt)}</p>
                </div>

                {/* Expand reason */}
                <button
                    onClick={() => setExpanded(v => !v)}
                    className="text-slate-500 hover:text-slate-300 transition shrink-0 mt-0.5"
                    title="View reason"
                >
                    {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
            </div>

            {/* Reason */}
            {expanded && (
                <div className="px-4 pb-3">
                    <div className="bg-slate-900/60 rounded-lg px-3 py-2 text-slate-300 text-sm whitespace-pre-wrap border border-slate-700/40">
                        {request.reason}
                    </div>
                </div>
            )}

            {/* Actions */}
            {request.status === 'pending' && (
                <div className="flex gap-2 px-4 pb-4">
                    <button
                        onClick={() => onApprove(request._id)}
                        disabled={busy}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <UserCheck className="w-4 h-4" /> Approve
                    </button>
                    <button
                        onClick={() => onReject(request._id)}
                        disabled={busy}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <UserX className="w-4 h-4" /> Reject
                    </button>
                </div>
            )}
        </div>
    );
}

// ── User row ──────────────────────────────────────────────────────────────────

function UserRow({ user, currentUserId, onRoleChange, onActiveChange, busy }) {
    return (
        <div className="flex items-center gap-3 py-3 border-b border-slate-800 last:border-0">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-xs font-semibold uppercase shrink-0">
                {user.username[0]}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{user.username}</p>
                <p className="text-slate-500 text-xs truncate">{user.email}</p>
            </div>

            {user._id !== currentUserId && (
                <div className="flex items-center gap-2 shrink-0">
                    {/* Role toggle */}
                    <button
                        onClick={() => onRoleChange(user._id, user.role === 'admin' ? 'user' : 'admin')}
                        disabled={busy}
                        title={user.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
                        className={`p-1.5 rounded-lg border transition disabled:opacity-50 ${
                            user.role === 'admin'
                                ? 'bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20'
                                : 'bg-slate-700/60 border-slate-600 text-slate-400 hover:text-purple-400 hover:border-purple-500/30'
                        }`}
                    >
                        <Shield className="w-3.5 h-3.5" />
                    </button>

                    {/* Active toggle */}
                    <button
                        onClick={() => onActiveChange(user._id, !user.isActive)}
                        disabled={busy}
                        title={user.isActive ? 'Deactivate' : 'Reactivate'}
                        className={`p-1.5 rounded-lg border transition disabled:opacity-50 ${
                            user.isActive
                                ? 'bg-slate-700/60 border-slate-600 text-slate-400 hover:text-red-400 hover:border-red-500/30'
                                : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                        }`}
                    >
                        {user.isActive ? <ShieldOff className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                    </button>
                </div>
            )}

            {user._id === currentUserId && (
                <span className="text-xs text-slate-600 italic shrink-0">you</span>
            )}
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

const TABS = [
    { key: 'pending',  label: 'Pending',  icon: Clock },
    { key: 'approved', label: 'Approved', icon: CheckCircle2 },
    { key: 'rejected', label: 'Rejected', icon: XCircle },
    { key: 'users',    label: 'Users',    icon: Users },
];

export default function AdminRequests({ currentUserId }) {
    const [tab, setTab]           = useState('pending');
    const [requests, setRequests] = useState([]);
    const [users, setUsers]       = useState([]);
    const [loading, setLoading]   = useState(false);
    const [busy, setBusy]         = useState(false);
    const [error, setError]       = useState('');
    const [pendingCount, setPendingCount] = useState(0);

    const loadRequests = useCallback(async (status) => {
        setLoading(true);
        setError('');
        try {
            const data = await authAPI.getRequests(status);
            setRequests(data.requests || []);
        } catch (e) {
            setError('Failed to load requests.');
        } finally {
            setLoading(false);
        }
    }, []);

    const loadUsers = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await authAPI.getUsers();
            setUsers(data.users || []);
        } catch (e) {
            setError('Failed to load users.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Load pending count for badge
    useEffect(() => {
        authAPI.getRequests('pending')
            .then(d => setPendingCount(d.requests?.length ?? 0))
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (tab === 'users') loadUsers();
        else loadRequests(tab);
    }, [tab, loadRequests, loadUsers]);

    const handleApprove = async (id) => {
        setBusy(true);
        try {
            await authAPI.approveRequest(id);
            setRequests(r => r.filter(x => x._id !== id));
            setPendingCount(c => Math.max(0, c - 1));
        } catch (e) {
            setError(e?.response?.data?.error || 'Approval failed.');
        } finally {
            setBusy(false);
        }
    };

    const handleReject = async (id) => {
        setBusy(true);
        try {
            await authAPI.rejectRequest(id);
            setRequests(r => r.filter(x => x._id !== id));
            setPendingCount(c => Math.max(0, c - 1));
        } catch (e) {
            setError(e?.response?.data?.error || 'Rejection failed.');
        } finally {
            setBusy(false);
        }
    };

    const handleRoleChange = async (id, role) => {
        setBusy(true);
        try {
            const { user } = await authAPI.setUserRole(id, role);
            setUsers(us => us.map(u => u._id === id ? { ...u, role: user.role } : u));
        } catch (e) {
            setError(e?.response?.data?.error || 'Role change failed.');
        } finally {
            setBusy(false);
        }
    };

    const handleActiveChange = async (id, isActive) => {
        setBusy(true);
        try {
            const { user } = await authAPI.setUserActive(id, isActive);
            setUsers(us => us.map(u => u._id === id ? { ...u, isActive: user.isActive } : u));
        } catch (e) {
            setError(e?.response?.data?.error || 'Status change failed.');
        } finally {
            setBusy(false);
        }
    };

    const refresh = () => {
        if (tab === 'users') loadUsers();
        else loadRequests(tab);
    };

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                <h2 className="text-white font-semibold text-base">User Management</h2>
                <button
                    onClick={refresh}
                    disabled={loading}
                    className="text-slate-500 hover:text-slate-300 transition disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-800">
                {TABS.map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition relative ${
                            tab === key
                                ? 'text-red-400 border-b-2 border-red-500 -mb-px'
                                : 'text-slate-500 hover:text-slate-300'
                        }`}
                    >
                        <Icon className="w-3.5 h-3.5" />
                        <span className='hidden sm:block'>{label}</span>
                        {key === 'pending' && pendingCount > 0 && (
                            <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold leading-none">
                                {pendingCount > 9 ? '9+' : pendingCount}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="p-4">
                {error && (
                    <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3 text-sm">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {error}
                    </div>
                )}

                {loading && (
                    <div className="flex justify-center py-8">
                        <RefreshCw className="w-5 h-5 text-slate-500 animate-spin" />
                    </div>
                )}

                {!loading && tab !== 'users' && (
                    requests.length === 0
                        ? <p className="text-center text-slate-600 text-sm py-8">No {tab} requests</p>
                        : <div className="space-y-3">
                            {requests.map(r => (
                                <RequestCard
                                    key={r._id}
                                    request={r}
                                    onApprove={handleApprove}
                                    onReject={handleReject}
                                    busy={busy}
                                />
                            ))}
                        </div>
                )}

                {!loading && tab === 'users' && (
                    users.length === 0
                        ? <p className="text-center text-slate-600 text-sm py-8">No users yet</p>
                        : <div>
                            {users.map(u => (
                                <UserRow
                                    key={u._id}
                                    user={u}
                                    currentUserId={currentUserId}
                                    onRoleChange={handleRoleChange}
                                    onActiveChange={handleActiveChange}
                                    busy={busy}
                                />
                            ))}
                        </div>
                )}
            </div>
        </div>
    );
}
