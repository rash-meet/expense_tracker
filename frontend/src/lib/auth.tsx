'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { isTokenValid, clearToken } from '@/lib/api';

interface AuthContextType {
    isAuthenticated: boolean;
    isLoading: boolean;
    checkAuth: () => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const checkAuth = () => {
        const valid = isTokenValid();
        setIsAuthenticated(valid);
        setIsLoading(false);
    };

    const logout = () => {
        clearToken();
        setIsAuthenticated(false);
        window.location.href = '/login';
    };

    useEffect(() => {
        checkAuth();

        // Check auth status every minute
        const interval = setInterval(checkAuth, 60000);
        return () => clearInterval(interval);
    }, []);

    return (
        <AuthContext.Provider value={{ isAuthenticated, isLoading, checkAuth, logout }}>
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
