import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, AlertCircle, CheckCircle2, Check, X } from 'lucide-react';
import { authAPI } from '../../api/api';
import { useAuth } from '../../context/AuthContext';

const rules = [
    { label: 'At least 8 characters',       test: (p) => p.length >= 8 },
    { label: 'Uppercase letter (A–Z)',       test: (p) => /[A-Z]/.test(p) },
    { label: 'Lowercase letter (a–z)',       test: (p) => /[a-z]/.test(p) },
    { label: 'Number (0–9)',                 test: (p) => /\d/.test(p) },
    { label: 'Special character (!@#$…)',    test: (p) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p) },
];

function StrengthRule({ label, ok }) {
    return (
        <li className={`flex items-center gap-2 text-xs transition ${ok ? 'text-green-400' : 'text-slate-500'}`}>
            {ok
                ? <Check className="w-3.5 h-3.5 shrink-0" />
                : <X    className="w-3.5 h-3.5 shrink-0" />}
            {label}
        </li>
    );
}

export default function ChangePassword() {
    const { refreshUser } = useAuth();
    const [current, setCurrent]     = useState('');
    const [next, setNext]           = useState('');
    const [confirm, setConfirm]     = useState('');
    const [showCur, setShowCur]     = useState(false);
    const [showNew, setShowNew]     = useState(false);
    const [error, setError]         = useState('');
    const [success, setSuccess]     = useState(false);
    const [loading, setLoading]     = useState(false);

    const allRulesMet = rules.every(r => r.test(next));
    const passwordsMatch = next === confirm && confirm.length > 0;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!allRulesMet)     return setError('Password does not meet all requirements.');
        if (!passwordsMatch)  return setError('Passwords do not match.');

        setLoading(true);
        try {
            await authAPI.changePassword(current, next);
            setSuccess(true);
            await refreshUser(); // clears requirePasswordChange flag
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to change password.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
                <div className="text-center">
                    <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto mb-4" />
                    <h2 className="text-white text-xl font-semibold mb-2">Password updated!</h2>
                    <p className="text-slate-400 text-sm">You're all set. Taking you in…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
            <div className="w-full max-w-sm">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl mb-4">
                        <KeyRound className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Set your password</h1>
                    <p className="text-slate-400 mt-2 text-sm">
                        You're using a temporary password. Please create a permanent one to continue.
                    </p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
                    {error && (
                        <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-5 text-sm">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Current (temp) password */}
                        <div>
                            <label className="block text-slate-400 text-sm mb-1.5">Temporary password</label>
                            <div className="relative">
                                <input
                                    type={showCur ? 'text' : 'password'}
                                    value={current}
                                    onChange={e => setCurrent(e.target.value)}
                                    autoComplete="current-password"
                                    required
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 pr-11 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition text-sm"
                                    placeholder="••••••••"
                                />
                                <button type="button" tabIndex={-1} onClick={() => setShowCur(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition">
                                    {showCur ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* New password */}
                        <div>
                            <label className="block text-slate-400 text-sm mb-1.5">New password</label>
                            <div className="relative">
                                <input
                                    type={showNew ? 'text' : 'password'}
                                    value={next}
                                    onChange={e => setNext(e.target.value)}
                                    autoComplete="new-password"
                                    required
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 pr-11 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition text-sm"
                                    placeholder="••••••••"
                                />
                                <button type="button" tabIndex={-1} onClick={() => setShowNew(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition">
                                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>

                            {/* Strength checklist */}
                            {next.length > 0 && (
                                <ul className="mt-2 space-y-1 pl-1">
                                    {rules.map(r => (
                                        <StrengthRule key={r.label} label={r.label} ok={r.test(next)} />
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Confirm */}
                        <div>
                            <label className="block text-slate-400 text-sm mb-1.5">Confirm new password</label>
                            <input
                                type="password"
                                value={confirm}
                                onChange={e => setConfirm(e.target.value)}
                                autoComplete="new-password"
                                required
                                className={`w-full bg-slate-800 border rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition text-sm ${
                                    confirm.length > 0
                                        ? passwordsMatch
                                            ? 'border-green-500 focus:ring-green-500/50'
                                            : 'border-red-500 focus:ring-red-500/50'
                                        : 'border-slate-700 focus:ring-red-500/50 focus:border-red-500'
                                }`}
                                placeholder="••••••••"
                            />
                            {confirm.length > 0 && !passwordsMatch && (
                                <p className="text-red-400 text-xs mt-1">Passwords do not match</p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !allRulesMet || !passwordsMatch}
                            className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:bg-red-500/40 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition text-sm mt-2"
                        >
                            {loading ? 'Saving…' : 'Set new password'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
