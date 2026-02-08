// Finchest Offline Support
// Uses IndexedDB for local storage and sync queue

const DB_NAME = 'finchest-db';
const DB_VERSION = 2; // Upgraded for monthly totals support

// Database stores
const STORES = {
    EXPENSES: 'expenses',
    SAVINGS: 'savings',
    SYNC_QUEUE: 'sync_queue',
    METADATA: 'metadata',
    MONTHLY_TOTALS: 'monthly_totals'
};

// IST Timezone offset (UTC+5:30)
const IST_OFFSET = 5.5 * 60 * 60 * 1000;

// Get current date in IST
function getISTDate() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + IST_OFFSET);
}

// Get current month key (YYYY-MM format)
function getCurrentMonthKey() {
    const ist = getISTDate();
    return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, '0')}`;
}

// Open IndexedDB
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Expenses store
            if (!db.objectStoreNames.contains(STORES.EXPENSES)) {
                const expenseStore = db.createObjectStore(STORES.EXPENSES, { keyPath: 'id', autoIncrement: true });
                expenseStore.createIndex('date', 'date');
                expenseStore.createIndex('synced', 'synced');
            }

            // Savings store
            if (!db.objectStoreNames.contains(STORES.SAVINGS)) {
                const savingStore = db.createObjectStore(STORES.SAVINGS, { keyPath: 'id', autoIncrement: true });
                savingStore.createIndex('date', 'date');
                savingStore.createIndex('synced', 'synced');
            }

            // Sync queue for offline additions
            if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
                const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
                syncStore.createIndex('timestamp', 'timestamp');
                syncStore.createIndex('type', 'type');
            }

            // Metadata store for last sync time
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

// Generic store operations
async function addToStore(storeName, data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.add(data);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function putToStore(storeName, data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put(data);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getFromStore(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getAllFromStore(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function clearStore(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function deleteFromStore(storeName, id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ==================== MONTHLY TOTALS ====================

// Cache monthly totals from API
async function cacheMonthlyTotals(statsData) {
    const monthKey = getCurrentMonthKey();
    const totalsData = {
        monthKey: monthKey,
        monthExpenses: statsData.month_expenses || 0,
        monthSavings: statsData.month_savings || 0,
        totalExpenses: statsData.total_expenses || 0,
        totalSavings: statsData.total_savings || 0,
        currentMonth: statsData.current_month || '',
        lastUpdated: new Date().toISOString()
    };
    await putToStore(STORES.MONTHLY_TOTALS, totalsData);
    console.log('Finchest: Cached monthly totals', totalsData);
}

// Get cached monthly totals
async function getCachedMonthlyTotals() {
    const monthKey = getCurrentMonthKey();
    const cached = await getFromStore(STORES.MONTHLY_TOTALS, monthKey);
    if (cached) {
        // Add pending expenses from sync queue
        const pendingExpenses = (await getPendingSyncItems()).filter(i => i.type === 'expense');
        const pendingTotal = pendingExpenses.reduce((sum, item) => {
            // Check if expense is for current month
            const expenseDate = new Date(item.data.date);
            const expenseMonthKey = `${expenseDate.getFullYear()}-${String(expenseDate.getMonth() + 1).padStart(2, '0')}`;
            if (expenseMonthKey === monthKey) {
                return sum + (parseFloat(item.data.amount) || 0);
            }
            return sum;
        }, 0);

        return {
            ...cached,
            monthExpenses: cached.monthExpenses + pendingTotal,
            hasPending: pendingTotal > 0
        };
    }
    return null;
}

// Update local monthly totals when adding expense offline
async function updateLocalMonthlyTotals(expenseData) {
    const monthKey = getCurrentMonthKey();
    const expenseDate = new Date(expenseData.date);
    const expenseMonthKey = `${expenseDate.getFullYear()}-${String(expenseDate.getMonth() + 1).padStart(2, '0')}`;

    // Only update if expense is for current month
    if (expenseMonthKey === monthKey) {
        let cached = await getFromStore(STORES.MONTHLY_TOTALS, monthKey);
        if (cached) {
            cached.monthExpenses += parseFloat(expenseData.amount) || 0;
            cached.totalExpenses += parseFloat(expenseData.amount) || 0;
            cached.lastUpdated = new Date().toISOString();
            await putToStore(STORES.MONTHLY_TOTALS, cached);
            console.log('Finchest: Updated local monthly totals', cached);
        }
    }
}

// Recalculate monthly totals from cached data
async function recalculateMonthlyTotals() {
    const cachedExpenses = await getAllFromStore(STORES.EXPENSES);
    const pendingExpenses = (await getPendingSyncItems()).filter(i => i.type === 'expense');

    const monthKey = getCurrentMonthKey();
    const [year, month] = monthKey.split('-').map(Number);

    let monthTotal = 0;
    let allTotal = 0;

    // Add cached expenses
    for (const exp of cachedExpenses) {
        const expDate = new Date(exp.date);
        allTotal += parseFloat(exp.amount) || 0;
        if (expDate.getFullYear() === year && expDate.getMonth() + 1 === month) {
            monthTotal += parseFloat(exp.amount) || 0;
        }
    }

    // Add pending expenses
    for (const item of pendingExpenses) {
        const expDate = new Date(item.data.date);
        allTotal += parseFloat(item.data.amount) || 0;
        if (expDate.getFullYear() === year && expDate.getMonth() + 1 === month) {
            monthTotal += parseFloat(item.data.amount) || 0;
        }
    }

    const totalsData = {
        monthKey: monthKey,
        monthExpenses: monthTotal,
        totalExpenses: allTotal,
        lastUpdated: new Date().toISOString()
    };

    await putToStore(STORES.MONTHLY_TOTALS, totalsData);
    console.log('Finchest: Recalculated monthly totals', totalsData);
    return totalsData;
}

// ==================== SYNC QUEUE ====================

// Add to sync queue
async function addToSyncQueue(type, action, data) {
    const queueItem = {
        type,
        action,
        data,
        timestamp: getISTDate().toISOString()
    };
    await addToStore(STORES.SYNC_QUEUE, queueItem);
    console.log('Finchest: Added to sync queue:', queueItem);

    // Update local monthly totals if adding expense
    if (type === 'expense' && action === 'add') {
        await updateLocalMonthlyTotals(data);
    }

    // Dispatch event for UI update
    window.dispatchEvent(new CustomEvent('offlineDataUpdated', { detail: { type, action, data } }));
}

// Get pending sync items
async function getPendingSyncItems() {
    return getAllFromStore(STORES.SYNC_QUEUE);
}

// Process sync queue
async function processSyncQueue() {
    if (!navigator.onLine) {
        console.log('Finchest: Offline - skipping sync');
        return;
    }

    const items = await getPendingSyncItems();
    console.log('Finchest: Processing sync queue:', items.length, 'items');

    for (const item of items) {
        try {
            const endpoint = item.type === 'expense' ? '/api/expenses' : '/api/savings';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item.data)
            });

            if (response.ok) {
                await deleteFromStore(STORES.SYNC_QUEUE, item.id);
                console.log('Finchest: Synced item:', item.id);
            }
        } catch (error) {
            console.error('Finchest: Sync failed for item:', item.id, error);
        }
    }

    // Trigger UI update
    window.dispatchEvent(new CustomEvent('syncComplete'));
}

// Cache expenses from API
async function cacheExpenses(expenses) {
    await clearStore(STORES.EXPENSES);
    for (const expense of expenses) {
        expense.synced = true;
        await addToStore(STORES.EXPENSES, expense);
    }
}

// Cache savings from API
async function cacheSavings(savings) {
    await clearStore(STORES.SAVINGS);
    for (const saving of savings) {
        saving.synced = true;
        await addToStore(STORES.SAVINGS, saving);
    }
}

// Get cached data with pending items
async function getCachedExpenses() {
    const cached = await getAllFromStore(STORES.EXPENSES);
    const pending = (await getPendingSyncItems()).filter(i => i.type === 'expense');

    // Mark pending items
    const pendingData = pending.map(p => ({
        ...p.data,
        _pending: true
    }));

    return [...pendingData, ...cached];
}

async function getCachedSavings() {
    const cached = await getAllFromStore(STORES.SAVINGS);
    const pending = (await getPendingSyncItems()).filter(i => i.type === 'saving');

    const pendingData = pending.map(p => ({
        ...p.data,
        _pending: true
    }));

    return [...pendingData, ...cached];
}

// Initialize offline support
function initOfflineSupport() {
    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/static/sw.js')
            .then((registration) => {
                console.log('Finchest: Service Worker registered:', registration.scope);
            })
            .catch((error) => {
                console.error('Finchest: Service Worker registration failed:', error);
            });
    }

    // Sync when coming online
    window.addEventListener('online', () => {
        console.log('Finchest: Back online - processing sync queue');
        processSyncQueue();
    });

    // Listen for service worker sync messages
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data.type === 'SYNC_COMPLETE') {
                processSyncQueue();
            }
            if (event.data.type === 'STATS_UPDATED') {
                // Refresh monthly totals from cache
                window.dispatchEvent(new CustomEvent('monthlyTotalsUpdated'));
            }
        });
    }
}

// Export for use in other scripts
window.OfflineDB = {
    init: initOfflineSupport,
    addToSyncQueue,
    getPendingSyncItems,
    processSyncQueue,
    cacheExpenses,
    cacheSavings,
    getCachedExpenses,
    getCachedSavings,
    cacheMonthlyTotals,
    getCachedMonthlyTotals,
    updateLocalMonthlyTotals,
    recalculateMonthlyTotals,
    getISTDate,
    getCurrentMonthKey,
    STORES
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', initOfflineSupport);
