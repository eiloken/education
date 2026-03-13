import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../api/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser]       = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchUser = useCallback(async () => {
        try {
            const data = await authAPI.me();
            setUser(data.user ?? null);
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchUser(); }, [fetchUser]);

    const login = async (username, password) => {
        const data = await authAPI.login(username, password);
        setUser(data.user);
        return data; // caller can check data.requirePasswordChange
    };

    const logout = async () => {
        try { await authAPI.logout(); } catch (_) {}
        setUser(null);
    };

    const isAdmin = user?.role === 'admin';
    const needsPasswordChange = user?.requirePasswordChange === true;

    return (
        <AuthContext.Provider value={{
            user, loading, login, logout,
            isAdmin, needsPasswordChange,
            refreshUser: fetchUser,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}