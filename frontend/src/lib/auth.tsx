'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { isTokenValid, clearToken } from '@/lib/api';

interface AuthContextType {
    isAuthenticated: boolean;
    isLoading: boolean;
    expiresAt: number | null;
    daysLeft: number | null;
    checkAuth: () => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [expiresAt, setExpiresAt] = useState<number | null>(null);
    const [daysLeft, setDaysLeft] = useState<number | null>(null);

    const checkAuth = () => {
        const valid = isTokenValid();
        setIsAuthenticated(valid);

        if (valid) {
            const expiry = parseInt(localStorage.getItem('tokenExpiry') || '0');
            setExpiresAt(expiry);

            const diff = expiry - Date.now();
            const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
            setDaysLeft(days > 0 ? days : 0);
        } else {
            setExpiresAt(null);
            setDaysLeft(null);
        }

        setIsLoading(false);
    };

    const logout = () => {
        clearToken();
        setIsAuthenticated(false);
        setExpiresAt(null);
        setDaysLeft(null);
        window.location.href = '/login';
    };

    useEffect(() => {
        checkAuth();

        // Check auth status every minute
        const interval = setInterval(checkAuth, 60000);
        return () => clearInterval(interval);
    }, []);

    return (
        <AuthContext.Provider value={{ isAuthenticated, isLoading, expiresAt, daysLeft, checkAuth, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
