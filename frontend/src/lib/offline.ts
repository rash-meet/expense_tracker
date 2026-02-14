// IndexedDB operations for offline support

import { Expense, Saving, SyncQueueItem } from '@/types';

const DB_NAME = 'finchest-db';
const DB_VERSION = 4;

const STORES = {
    EXPENSES: 'expenses',
    SAVINGS: 'savings',
    SYNC_QUEUE: 'sync_queue',
    METADATA: 'metadata',
    MONTHLY_TOTALS: 'monthly_totals',
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
                expenseStore.createIndex('_id', '_id', { unique: true }); // Index for server ID
            } else {
                // Upgrade existing store to add _id index if missing
                const tx = (event.target as IDBOpenDBRequest).transaction!;
                const store = tx.objectStore(STORES.EXPENSES);
                if (!store.indexNames.contains('_id')) {
                    store.createIndex('_id', '_id', { unique: true });
                }
            }

            if (!db.objectStoreNames.contains(STORES.SAVINGS)) {
                const savingStore = db.createObjectStore(STORES.SAVINGS, { keyPath: 'id', autoIncrement: true });
                savingStore.createIndex('date', 'date');
                savingStore.createIndex('synced', 'synced');
                savingStore.createIndex('_id', '_id', { unique: true }); // Index for server ID
            } else {
                // Upgrade existing store to add _id index if missing
                const tx = (event.target as IDBOpenDBRequest).transaction!;
                const store = tx.objectStore(STORES.SAVINGS);
                if (!store.indexNames.contains('_id')) {
                    store.createIndex('_id', '_id', { unique: true });
                }
            }

            if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
                const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
                syncStore.createIndex('timestamp', 'timestamp');
                syncStore.createIndex('type', 'type');
            }

            if (!db.objectStoreNames.contains(STORES.METADATA)) {
                db.createObjectStore(STORES.METADATA, { keyPath: 'key' });
            }

            // Monthly totals store
            if (!db.objectStoreNames.contains(STORES.MONTHLY_TOTALS)) {
                db.createObjectStore(STORES.MONTHLY_TOTALS, { keyPath: 'monthKey' });
            }
        };
    });
}

// Generic store operations with auto-close
async function addToStore<T>(storeName: string, data: T): Promise<number> {
    const db = await openDB();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.add(data);
            request.onsuccess = () => resolve(request.result as number);
            request.onerror = () => reject(request.error);
        });
    } finally {
        db.close();
    }
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
    const db = await openDB();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result as T[]);
            request.onerror = () => reject(request.error);
        });
    } finally {
        db.close();
    }
}

async function clearStore(storeName: string): Promise<void> {
    const db = await openDB();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } finally {
        db.close();
    }
}

async function deleteFromStore(storeName: string, id: number): Promise<void> {
    const db = await openDB();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } finally {
        db.close();
    }
}

async function deleteFromStoreByServerId(storeName: string, serverId: string): Promise<void> {
    const db = await openDB();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);

            let _idIndex: IDBIndex | null = null;
            try {
                _idIndex = store.index('_id');
            } catch {
                _idIndex = null;
            }

            if (_idIndex) {
                const req = _idIndex.getKey(serverId);
                req.onsuccess = () => {
                    const key = req.result;
                    if (key !== undefined) {
                        store.delete(key as IDBValidKey);
                    }
                };
            } else {
                const req = store.getAll();
                req.onsuccess = () => {
                    const items = req.result as any[];
                    const match = items.find((i) => i._id === serverId);
                    if (match && match.id) {
                        store.delete(match.id);
                    }
                };
            }

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

async function getFromStore<T>(storeName: string, id: number): Promise<T | null> {
    const db = await openDB();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result as T || null);
            request.onerror = () => reject(request.error);
        });
    } finally {
        db.close();
    }
}

async function updateInStore<T>(storeName: string, data: T): Promise<void> {
    const db = await openDB();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } finally {
        db.close();
    }
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

// No changes needed for SyncService as offline.ts handles DB lifecycle now.

export async function removeSyncItem(id: number): Promise<void> {
    return deleteFromStore(STORES.SYNC_QUEUE, id);
}

// Update a sync queue item (for editing pending items)
export async function updateSyncQueueItem(id: number, updatedData: Expense | Saving): Promise<void> {
    const item = await getFromStore<SyncQueueItem>(STORES.SYNC_QUEUE, id);
    if (item) {
        item.data = updatedData;
        item.timestamp = new Date().toISOString();
        await updateInStore(STORES.SYNC_QUEUE, item);
    }
}

// Delete a pending item from sync queue and its corresponding offline store entry
export async function deletePendingItem(
    syncId: number,
    type: 'expense' | 'saving'
): Promise<{ amount: number } | null> {
    const item = await getFromStore<SyncQueueItem>(STORES.SYNC_QUEUE, syncId);
    if (!item) return null;
    const amount = (item.data as any).amount || 0;
    await deleteFromStore(STORES.SYNC_QUEUE, syncId);

    // Also remove from the offline expenses/savings store
    const storeName = type === 'expense' ? STORES.EXPENSES : STORES.SAVINGS;
    const allItems = await getAllFromStore<any>(storeName);
    const offlineItem = allItems.find((i: any) => i._pending && i._offlineId && i.amount === amount);
    if (offlineItem && offlineItem.id) {
        await deleteFromStore(storeName, offlineItem.id);
    }
    return { amount };
}

// Update a pending offline entry in the local store
export async function updatePendingOfflineEntry(
    syncId: number,
    type: 'expense' | 'saving',
    updatedData: Expense | Saving
): Promise<{ oldAmount: number; newAmount: number } | null> {
    const item = await getFromStore<SyncQueueItem>(STORES.SYNC_QUEUE, syncId);
    if (!item) return null;
    const oldAmount = (item.data as any).amount || 0;
    const newAmount = updatedData.amount || 0;

    // Update sync queue
    item.data = updatedData;
    item.timestamp = new Date().toISOString();
    await updateInStore(STORES.SYNC_QUEUE, item);

    // Update in offline store
    const storeName = type === 'expense' ? STORES.EXPENSES : STORES.SAVINGS;
    const allItems = await getAllFromStore<any>(storeName);
    const offlineItem = allItems.find((i: any) => i._pending && i._offlineId && i.amount === oldAmount);
    if (offlineItem && offlineItem.id) {
        const updated = { ...offlineItem, ...updatedData, _pending: true, synced: false };
        await updateInStore(storeName, updated);
    }
    return { oldAmount, newAmount };
}

export async function removeCachedExpenseByServerId(id: string): Promise<void> {
    await deleteFromStoreByServerId(STORES.EXPENSES, id);
}

export async function removeCachedSavingByServerId(id: string): Promise<void> {
    await deleteFromStoreByServerId(STORES.SAVINGS, id);
}

// Check if an item is pending sync
async function isPending(id: string, type: 'expense' | 'saving'): Promise<boolean> {
    const pending = await getPendingSyncItems();
    return pending.some(item =>
        item.type === type && (item.action === 'update' || item.action === 'delete') &&
        (item.data as any)._id === id
    );
}

// Cache operations with robust upsert
export async function cacheExpenses(expenses: Expense[]): Promise<void> {
    const db = await openDB();
    try {
        for (const expense of expenses) {
            if (!expense._id) continue;

            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(STORES.EXPENSES, 'readwrite');
                const store = tx.objectStore(STORES.EXPENSES);

                let _idIndex: IDBIndex | null = null;
                try {
                    _idIndex = store.index('_id');
                } catch {
                    console.warn('[Offline] _id index missing for EXPENSES, falling back to manual scan/add.');
                }

                const saveItem = () => {
                    store.add({ ...expense, synced: true });
                };

                const updateItem = (item: any) => {
                    if (item._pending || item.synced === false) return; // Don't overwrite pending local changes
                    const updated = { ...expense, id: item.id, synced: true };
                    store.put(updated);
                };

                if (_idIndex) {
                    const req = _idIndex.get(expense._id);
                    req.onsuccess = () => {
                        if (req.result) updateItem(req.result);
                        else saveItem();
                    };
                    req.onerror = () => { saveItem(); };
                } else {
                    // Fallback: if index is missing, we can't efficiently check for existing items by _id.
                    // To prevent data loss, we'll just add the item. This might create duplicates if the item
                    // already exists but was not found due to missing index.
                    saveItem();
                }

                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
        }
    } finally {
        db.close();
    }
}

export async function cacheSavings(savings: Saving[]): Promise<void> {
    const db = await openDB();
    try {
        for (const saving of savings) {
            if (!saving._id) continue;

            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(STORES.SAVINGS, 'readwrite');
                const store = tx.objectStore(STORES.SAVINGS);

                let _idIndex: IDBIndex | null = null;
                try {
                    _idIndex = store.index('_id');
                } catch {
                    console.warn('[Offline] _id index missing for SAVINGS, falling back to manual scan/add.');
                }

                const saveItem = () => {
                    store.add({ ...saving, synced: true });
                };

                const updateItem = (item: any) => {
                    if (item._pending || item.synced === false) return; // Don't overwrite pending local changes
                    const updated = { ...saving, id: item.id, synced: true };
                    store.put(updated);
                };

                if (_idIndex) {
                    const req = _idIndex.get(saving._id);
                    req.onsuccess = () => {
                        if (req.result) updateItem(req.result);
                        else saveItem();
                    };
                    req.onerror = () => { saveItem(); };
                } else {
                    // Fallback: if index is missing, we can't efficiently check for existing items by _id.
                    // To prevent data loss, we'll just add the item. This might create duplicates if the item
                    // already exists but was not found due to missing index.
                    saveItem();
                }

                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
        }
    } finally {
        db.close();
    }
}

export async function getCachedExpenses(): Promise<Expense[]> {
    const cached = await getAllFromStore<any>(STORES.EXPENSES);
    // Mark pending entries from the store
    const mapped = cached.map((e: any) => ({
        ...e,
        _pending: e._pending || e.synced === false,
    }));

    // Sort by date desc, then time desc, then id desc
    return mapped.sort((a: any, b: any) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateA !== dateB) return dateB - dateA;

        if (a.time && b.time) {
            const timeCompare = b.time.localeCompare(a.time);
            if (timeCompare !== 0) return timeCompare;
        }

        return (b.id || 0) - (a.id || 0);
    });
}

export async function getCachedSavings(): Promise<Saving[]> {
    const cached = await getAllFromStore<any>(STORES.SAVINGS);
    // Mark pending entries from the store
    const mapped = cached.map((e: any) => ({
        ...e,
        _pending: e._pending || e.synced === false,
    }));

    // Sort by date desc, then time desc, then id desc
    return mapped.sort((a: any, b: any) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateA !== dateB) return dateB - dateA;

        if (a.time && b.time) {
            const timeCompare = b.time.localeCompare(a.time);
            if (timeCompare !== 0) return timeCompare;
        }

        return (b.id || 0) - (a.id || 0);
    });
}

// Clear pending entries from a store (called after successful sync)
export async function clearPendingFromStore(type: 'expense' | 'saving'): Promise<void> {
    const storeName = type === 'expense' ? STORES.EXPENSES : STORES.SAVINGS;
    const all = await getAllFromStore<any>(storeName);
    const pendingIds = all.filter((e: any) => e._pending || e.synced === false).map((e: any) => e.id).filter(Boolean);
    for (const id of pendingIds) {
        await deleteFromStore(storeName, id);
    }
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

// ==================== MONTH-BASED STORAGE ====================

const CURRENT_MONTH_KEY = 'cached_month';

// Get current month key in YYYY-MM format
function getCurrentMonthKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Get stored month from metadata
async function getStoredMonth(): Promise<string | null> {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORES.METADATA, 'readonly');
            const store = tx.objectStore(STORES.METADATA);
            const request = store.get(CURRENT_MONTH_KEY);
            request.onsuccess = () => {
                const result = request.result;
                resolve(result?.value || null);
            };
            request.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

// Save current month to metadata
async function setStoredMonth(month: string): Promise<void> {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORES.METADATA, 'readwrite');
            const store = tx.objectStore(STORES.METADATA);
            store.put({ key: CURRENT_MONTH_KEY, value: month });
            tx.oncomplete = () => resolve();
        });
    } catch {
        // Ignore errors
    }
}

// Check and clear old month data - call this on app load
export async function checkAndClearOldMonthData(): Promise<boolean> {
    try {
        const currentMonth = getCurrentMonthKey();
        const storedMonth = await getStoredMonth();

        if (storedMonth && storedMonth !== currentMonth) {
            console.log(`[Offline] Month changed from ${storedMonth} to ${currentMonth}. Clearing old data...`);
            await clearStore(STORES.EXPENSES);
            await clearStore(STORES.SAVINGS);
            await clearStore(STORES.SYNC_QUEUE);
            await setStoredMonth(currentMonth);
            return true; // Data was cleared
        }

        if (!storedMonth) {
            await setStoredMonth(currentMonth);
        }

        return false;
    } catch {
        return false;
    }
}

// ==================== OFFLINE ENTRY STORAGE ====================
// These functions store entries locally so they appear in reports even when backend is down

export async function addOfflineExpense(expense: Expense): Promise<void> {
    await addToStore(STORES.EXPENSES, {
        ...expense,
        synced: false,
        _pending: true,
        _offlineId: `offline_${Date.now()}`
    });
}

export async function addOfflineSaving(saving: Saving): Promise<void> {
    await addToStore(STORES.SAVINGS, {
        ...saving,
        synced: false,
        _pending: true,
        _offlineId: `offline_${Date.now()}`
    });
}

// Filter cached data to only include current month entries
export async function getCachedExpensesForCurrentMonth(): Promise<Expense[]> {
    const currentMonth = getCurrentMonthKey();
    const all = await getCachedExpenses();

    return all.filter(expense => {
        if (!expense.date) return true;
        const expenseMonth = expense.date.substring(0, 7);
        return expenseMonth === currentMonth;
    });
}

export async function getCachedSavingsForCurrentMonth(): Promise<Saving[]> {
    const currentMonth = getCurrentMonthKey();
    const all = await getCachedSavings();

    return all.filter(saving => {
        if (!saving.date) return true;
        const savingMonth = saving.date.substring(0, 7);
        return savingMonth === currentMonth;
    });
}

// ==================== MONTHLY TOTALS CACHING ====================

export interface MonthlyTotals {
    monthKey: string;
    monthExpenses: number;
    monthSavings: number;
    totalExpenses: number;
    totalSavings: number;
    currentMonth: string;
    lastUpdated: string;
    hasPending?: boolean;
}

// Cache monthly totals from API stats
export async function cacheMonthlyTotals(statsData: {
    month_expenses: number;
    month_savings: number;
    total_expenses: number;
    total_savings: number;
    current_month: string;
}): Promise<void> {
    try {
        const monthKey = getCurrentMonthKey();
        const totalsData: MonthlyTotals = {
            monthKey,
            monthExpenses: statsData.month_expenses || 0,
            monthSavings: statsData.month_savings || 0,
            totalExpenses: statsData.total_expenses || 0,
            totalSavings: statsData.total_savings || 0,
            currentMonth: statsData.current_month || '',
            lastUpdated: new Date().toISOString(),
        };

        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORES.MONTHLY_TOTALS, 'readwrite');
            const store = tx.objectStore(STORES.MONTHLY_TOTALS);
            store.put(totalsData);
            tx.oncomplete = () => {
                console.log('[Finchest] Cached monthly totals:', totalsData);
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    } catch (error) {
        console.error('[Finchest] Error caching monthly totals:', error);
    }
}

// Get cached monthly totals
export async function getCachedMonthlyTotals(): Promise<MonthlyTotals | null> {
    try {
        const monthKey = getCurrentMonthKey();
        const db = await openDB();

        return new Promise((resolve) => {
            const tx = db.transaction(STORES.MONTHLY_TOTALS, 'readonly');
            const store = tx.objectStore(STORES.MONTHLY_TOTALS);
            const request = store.get(monthKey);

            request.onsuccess = async () => {
                const cached = request.result as MonthlyTotals | undefined;
                if (cached) {
                    // Check for pending items
                    const pendingItems = await getPendingSyncItems();
                    const hasPending = pendingItems.length > 0;
                    resolve({ ...cached, hasPending });
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

// Update local monthly totals when adding expense offline
export async function updateLocalMonthlyTotals(amount: number, type: 'expense' | 'saving'): Promise<void> {
    try {
        const cached = await getCachedMonthlyTotals();
        if (!cached) return;

        if (type === 'expense') {
            cached.monthExpenses += amount;
            cached.totalExpenses += amount;
        } else {
            cached.monthSavings += amount;
            cached.totalSavings += amount;
        }
        cached.lastUpdated = new Date().toISOString();

        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORES.MONTHLY_TOTALS, 'readwrite');
            const store = tx.objectStore(STORES.MONTHLY_TOTALS);
            store.put(cached);
            tx.oncomplete = () => {
                console.log('[Finchest] Updated local monthly totals:', cached);
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    } catch (error) {
        console.error('[Finchest] Error updating local monthly totals:', error);
    }
}

