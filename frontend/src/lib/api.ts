// API client with JWT authentication and offline support

import { Expense, Saving, AuthToken, ApiResponse, Stats, PaginatedResponse, BulkDeleteResponse } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// Token management
export function getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('token');
}

export function getTokenExpiry(): number | null {
    if (typeof window === 'undefined') return null;
    const expiry = localStorage.getItem('tokenExpiry');
    return expiry ? parseInt(expiry) : null;
}

export function setToken(token: string, expiresIn: number): void {
    localStorage.setItem('token', token);
    localStorage.setItem('tokenExpiry', String(Date.now() + expiresIn * 1000));
}

export function clearToken(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('tokenExpiry');
}

export function isTokenValid(): boolean {
    const token = getToken();
    const expiry = getTokenExpiry();
    return !!token && !!expiry && Date.now() < expiry;
}

// API request helper with auth
async function apiRequest<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<ApiResponse<T>> {
    const token = getToken();

    const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
    };

    if (token) {
        (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers,
        });

        const data = await response.json();

        if (!response.ok) {
            // Handle token expiry
            if (response.status === 401 && data.code === 'TOKEN_EXPIRED') {
                clearToken();
                window.location.href = '/login';
            }
            return { success: false, error: data.error || 'Request failed' };
        }

        return data;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Network error'
        };
    }
}

// Auth APIs
export async function login(username: string, password: string, totpCode: string): Promise<AuthToken | null> {
    try {
        const response = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, totp_code: totpCode }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
            setToken(data.token, data.expires_in);
            return data;
        }

        return null;
    } catch {
        return null;
    }
}

export function logout(): void {
    clearToken();
    window.location.href = '/login';
}

// Health check
export async function checkHealth(): Promise<boolean> {
    try {
        const response = await fetch(`${API_URL}/api/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(2000), // Reduced from 5s to 2s for faster offline detection
        });
        const data = await response.json();
        return response.ok && data.status === 'connected';
    } catch {
        return false;
    }
}

// Expense APIs
export async function getExpenses(page: number = 1, limit: number = 50, filters: any = {}): Promise<PaginatedResponse<Expense>> {
    const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...filters
    });

    // Convert date objects to strings if present
    if (filters.from_date) params.set('from_date', filters.from_date);
    if (filters.to_date) params.set('to_date', filters.to_date);

    const response = await apiRequest<any>(`/api/expenses?${params.toString()}`);

    if (response.success && response.data) {
        // Handle backend returning { data: [], pagination: {} }
        // apiRequest generic T maps to response.data if it matches?
        // Actually apiRequest returns ApiResponse<T> where T is the 'data' field?
        // No, look at apiRequest implementation:
        // const data = await response.json(); return data;
        // So response is the WHOLE JSON object.

        // If the backend returns { success: true, data: [...], pagination: {...} }
        // Then apiRequest returns that object.
        // But apiRequest<T> implies response.data is T?
        // Let's look closely at apiRequest.

        return {
            data: (response as any).data || [],
            pagination: (response as any).pagination || { page: 1, limit: limit, total: 0, pages: 0 }
        };
    }

    return { data: [], pagination: { page: 1, limit: limit, total: 0, pages: 0 } };
}

export async function addExpense(expense: Omit<Expense, '_id'>): Promise<ApiResponse<{ id: string }>> {
    return apiRequest('/api/expenses', {
        method: 'POST',
        body: JSON.stringify(expense),
    });
}

export async function updateExpense(id: string, expense: Partial<Expense>): Promise<ApiResponse<void>> {
    return apiRequest(`/api/expenses/${id}`, {
        method: 'PUT',
        body: JSON.stringify(expense),
    });
}

export async function deleteExpense(id: string): Promise<ApiResponse<void>> {
    return apiRequest(`/api/expenses/${id}`, {
        method: 'DELETE',
    });
}

// Savings APIs
export async function getSavings(page: number = 1, limit: number = 50, filters: any = {}): Promise<PaginatedResponse<Saving>> {
    const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...filters
    });

    const response = await apiRequest<any>(`/api/savings?${params.toString()}`);

    if (response.success && response.data) {
        return {
            data: (response as any).data || [],
            pagination: (response as any).pagination || { page: 1, limit: limit, total: 0, pages: 0 }
        };
    }

    return { data: [], pagination: { page: 1, limit: limit, total: 0, pages: 0 } };
}

export async function addSaving(saving: Omit<Saving, '_id'>): Promise<ApiResponse<{ id: string }>> {
    return apiRequest('/api/savings', {
        method: 'POST',
        body: JSON.stringify(saving),
    });
}

export async function updateSaving(id: string, saving: Partial<Saving>): Promise<ApiResponse<void>> {
    return apiRequest(`/api/savings/${id}`, {
        method: 'PUT',
        body: JSON.stringify(saving),
    });
}

export async function deleteSaving(id: string): Promise<ApiResponse<void>> {
    return apiRequest(`/api/savings/${id}`, {
        method: 'DELETE',
    });
}

// Bulk API
export async function bulkDelete(
    type: 'expense' | 'saving',
    filters: any,
    password: string
): Promise<BulkDeleteResponse> {
    const response = await apiRequest<any>('/api/delete-bulk', {
        method: 'POST',
        body: JSON.stringify({ type, filters, password }),
    });

    if (response.success) {
        return {
            success: true,
            deleted_count: (response as any).deleted_count,
            message: (response as any).message
        };
    }

    return {
        success: false,
        deleted_count: 0,
        message: response.error || 'Failed to delete data'
    };
}

// Stats API
export async function getStats(): Promise<Stats | null> {
    const response = await apiRequest<Stats>('/api/stats');
    return response.success && response.data ? response.data : null;
}

// Bulk sync for offline items
export async function syncBulk(expenses: Expense[], savings: Saving[]): Promise<ApiResponse<unknown>> {
    return apiRequest('/api/sync', {
        method: 'POST',
        body: JSON.stringify({ expenses, savings }),
    });
}

// Settings API
export interface Settings {
    categories: string[];
    payment_modes: string[];
    saving_modes: string[];
}

export async function getSettings(): Promise<Settings | null> {
    const response = await apiRequest<Settings>('/api/settings');
    if (response.success && response.data) {
        return response.data;
    }
    return null;
}

export async function updateSettings(settings: Partial<Settings>): Promise<ApiResponse<void>> {
    return apiRequest('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
    });
}
