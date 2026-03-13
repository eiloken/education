import React, { useState } from 'react';
import { Film, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { authAPI } from '../api/api';

export default function Register({ onShowLogin }) {
    const [form, setForm]       = useState({ username: '', email: '', reason: '' });
    const [error, setError]     = useState('');
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await authAPI.submitRequest(form.username.trim(), form.email.trim(), form.reason.trim());
            setSuccess(true);
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to submit request. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
            <div className="w-full max-w-sm p-4">
                {/* Logo */}
                <div className="text-center mb-8 flex items-center justify-center gap-4">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl">
                        <Film className="w-8 h-8 text-red-500" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-red-500 tracking-tight">VIBEFLIX</h1>
                        <p className="text-slate-400 mt-2 text-sm">Your private video library</p>
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
                    {success ? (
                        <div className="text-center py-4">
                            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" />
                            <h2 className="text-white font-semibold text-lg mb-2">Request submitted!</h2>
                            <p className="text-slate-400 text-sm mb-6">
                                The admin will review your request. If approved, you'll receive login credentials by email.
                                Requests expire after 7 days.
                            </p>
                            <button
                                onClick={onShowLogin}
                                className="text-red-400 hover:text-red-300 text-sm font-medium flex items-center gap-1.5 mx-auto transition"
                            >
                                <ArrowLeft className="w-4 h-4" /> Back to sign in
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-3 mb-6">
                                <button
                                    onClick={onShowLogin}
                                    className="text-slate-500 hover:text-slate-300 transition"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                </button>
                                <div>
                                    <h2 className="text-white font-semibold text-lg leading-none">Request access</h2>
                                    <p className="text-slate-500 text-xs mt-0.5">Admin will review and approve</p>
                                </div>
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-5 text-sm">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-slate-400 text-sm mb-1.5">Username</label>
                                    <input
                                        type="text"
                                        value={form.username}
                                        onChange={set('username')}
                                        required
                                        maxLength={30}
                                        pattern="[a-zA-Z0-9_]{3,30}"
                                        title="3–30 characters: letters, numbers, underscores"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition text-sm"
                                        placeholder="your_username"
                                    />
                                    <p className="text-slate-600 text-xs mt-1">Letters, numbers, underscores. 3–30 characters.</p>
                                </div>

                                <div>
                                    <label className="block text-slate-400 text-sm mb-1.5">Email address</label>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={set('email')}
                                        required
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition text-sm"
                                        placeholder="you@example.com"
                                    />
                                    <p className="text-slate-600 text-xs mt-1">Your temporary password will be sent here.</p>
                                </div>

                                <div>
                                    <label className="block text-slate-400 text-sm mb-1.5">Reason for access</label>
                                    <textarea
                                        value={form.reason}
                                        onChange={set('reason')}
                                        required
                                        minLength={10}
                                        maxLength={1000}
                                        rows={3}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition text-sm resize-none"
                                        placeholder="Tell the admin why you'd like access…"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition text-sm"
                                >
                                    {loading ? 'Submitting…' : 'Submit request'}
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
