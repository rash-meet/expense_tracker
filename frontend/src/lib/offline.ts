// IndexedDB operations for offline support

import { Expense, Saving, SyncQueueItem } from '@/types';

const DB_NAME = 'expense-tracker-db';
const DB_VERSION = 1;

const STORES = {
    EXPENSES: 'expenses',
    SAVINGS: 'savings',
    SYNC_QUEUE: 'sync_queue',
    METADATA: 'metadata',
} as const;

// Open IndexedDB
function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            if (!db.objectStoreNames.contains(STORES.EXPENSES)) {
                const expenseStore = db.createObjectStore(STORES.EXPENSES, { keyPath: 'id', autoIncrement: true });
                expenseStore.createIndex('date', 'date');
                expenseStore.createIndex('synced', 'synced');
            }

            if (!db.objectStoreNames.contains(STORES.SAVINGS)) {
                const savingStore = db.createObjectStore(STORES.SAVINGS, { keyPath: 'id', autoIncrement: true });
                savingStore.createIndex('date', 'date');
                savingStore.createIndex('synced', 'synced');
            }

            if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
                const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
                syncStore.createIndex('timestamp', 'timestamp');
                syncStore.createIndex('type', 'type');
            }

            if (!db.objectStoreNames.contains(STORES.METADATA)) {
                db.createObjectStore(STORES.METADATA, { keyPath: 'key' });
            }
        };
    });
}

// Generic store operations
async function addToStore<T>(storeName: string, data: T): Promise<number> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.add(data);
        request.onsuccess = () => resolve(request.result as number);
        request.onerror = () => reject(request.error);
    });
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
    });
}

async function clearStore(storeName: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function deleteFromStore(storeName: string, id: number): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Sync queue operations
export async function addToSyncQueue(
    type: 'expense' | 'saving',
    action: 'add' | 'update' | 'delete',
    data: Expense | Saving
): Promise<void> {
    const queueItem: Omit<SyncQueueItem, 'id'> = {
        type,
        action,
        data,
        timestamp: new Date().toISOString(),
    };
    await addToStore(STORES.SYNC_QUEUE, queueItem);
}

export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
    return getAllFromStore<SyncQueueItem>(STORES.SYNC_QUEUE);
}

export async function clearSyncQueue(): Promise<void> {
    return clearStore(STORES.SYNC_QUEUE);
}

export async function removeSyncItem(id: number): Promise<void> {
    return deleteFromStore(STORES.SYNC_QUEUE, id);
}

// Cache operations
export async function cacheExpenses(expenses: Expense[]): Promise<void> {
    await clearStore(STORES.EXPENSES);
    for (const expense of expenses) {
        await addToStore(STORES.EXPENSES, { ...expense, synced: true });
    }
}

export async function cacheSavings(savings: Saving[]): Promise<void> {
    await clearStore(STORES.SAVINGS);
    for (const saving of savings) {
        await addToStore(STORES.SAVINGS, { ...saving, synced: true });
    }
}

export async function getCachedExpenses(): Promise<Expense[]> {
    const cached = await getAllFromStore<Expense>(STORES.EXPENSES);
    const pending = (await getPendingSyncItems()).filter(i => i.type === 'expense');
    const pendingData = pending.map(p => ({
        ...p.data as Expense,
        _pending: true,
    }));
    return [...pendingData, ...cached];
}

export async function getCachedSavings(): Promise<Saving[]> {
    const cached = await getAllFromStore<Saving>(STORES.SAVINGS);
    const pending = (await getPendingSyncItems()).filter(i => i.type === 'saving');
    const pendingData = pending.map(p => ({
        ...p.data as Saving,
        _pending: true,
    }));
    return [...pendingData, ...cached];
}

// Check if there's cached data
export async function hasCachedData(): Promise<boolean> {
    try {
        const expenses = await getAllFromStore<Expense>(STORES.EXPENSES);
        const savings = await getAllFromStore<Saving>(STORES.SAVINGS);
        return expenses.length > 0 || savings.length > 0;
    } catch {
        return false;
    }
}
