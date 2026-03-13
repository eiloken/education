import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Film, Eye, EyeOff, AlertCircle } from 'lucide-react';

export default function Login({ onShowRegister }) {
    const { login } = useAuth();
    const [username, setUsername]     = useState('');
    const [password, setPassword]     = useState('');
    const [showPw, setShowPw]         = useState(false);
    const [error, setError]           = useState('');
    const [loading, setLoading]       = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(username.trim(), password);
            // AuthContext updates user state; parent router redirects automatically
        } catch (err) {
            setError(err?.response?.data?.error || 'Login failed. Check your credentials.');
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

                {/* Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
                    <h2 className="text-white font-semibold text-lg mb-6">Sign in</h2>

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
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                autoComplete="username"
                                required
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition text-sm"
                                placeholder="your_username"
                            />
                        </div>

                        <div>
                            <label className="block text-slate-400 text-sm mb-1.5">Password</label>
                            <div className="relative">
                                <input
                                    type={showPw ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    required
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 pr-11 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition text-sm"
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPw(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                                    tabIndex={-1}
                                >
                                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition text-sm mt-2"
                        >
                            {loading ? 'Signing in…' : 'Sign in'}
                        </button>
                    </form>

                    <div className="mt-6 pt-5 border-t border-slate-800 text-center">
                        <p className="text-slate-500 text-sm">
                            Don't have an account?{' '}
                            <button
                                onClick={onShowRegister}
                                className="text-red-400 hover:text-red-300 font-medium transition"
                            >
                                Request access
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}