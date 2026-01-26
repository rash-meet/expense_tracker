// TypeScript interfaces for the expense tracker

export interface Expense {
    _id?: string;
    id?: number;  // Local ID for IndexedDB
    amount: number;
    category: string;
    payment_mode: string;
    date: string;
    time: string;
    note?: string;
    _pending?: boolean;  // True if not yet synced
}

export interface Saving {
    _id?: string;
    id?: number;  // Local ID for IndexedDB
    amount: number;
    saving_mode: string;
    date: string;
    time: string;
    note?: string;
    _pending?: boolean;  // True if not yet synced
}

export interface LoginCredentials {
    username: string;
    password: string;
}

export interface AuthToken {
    token: string;
    expires_at: string;
    expires_in: number;
}

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

export interface SyncQueueItem {
    id?: number;
    type: 'expense' | 'saving';
    action: 'add' | 'update' | 'delete';
    data: Expense | Saving;
    timestamp: string;
}

export interface Stats {
    total_expenses: number;
    total_savings: number;
    month_expenses: number;
    month_savings: number;
    expense_count: number;
    savings_count: number;
    categories: string[];
    payment_modes: string[];
    saving_modes: string[];
    current_month: string;
}

// Connection status types
export type ConnectionStatus = 'connected' | 'disconnected' | 'checking';

export interface Pagination {
    page: number;
    limit: number;
    total: number;
    pages: number;
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: Pagination;
}

export interface BulkDeleteResponse {
    success: boolean;
    deleted_count: number;
    message: string;
}
