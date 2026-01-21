// Expense Tracker Offline Support
// Uses IndexedDB for local storage and sync queue

const DB_NAME = 'expense-tracker-db';
const DB_VERSION = 1;

// Database stores
const STORES = {
    EXPENSES: 'expenses',
    SAVINGS: 'savings',
    SYNC_QUEUE: 'sync_queue',
    METADATA: 'metadata'
};

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

// Add to sync queue
async function addToSyncQueue(type, action, data) {
    const queueItem = {
        type,
        action,
        data,
        timestamp: new Date().toISOString()
    };
    await addToStore(STORES.SYNC_QUEUE, queueItem);
    console.log('Added to sync queue:', queueItem);
}

// Get pending sync items
async function getPendingSyncItems() {
    return getAllFromStore(STORES.SYNC_QUEUE);
}

// Process sync queue
async function processSyncQueue() {
    if (!navigator.onLine) {
        console.log('Offline - skipping sync');
        return;
    }

    const items = await getPendingSyncItems();
    console.log('Processing sync queue:', items.length, 'items');

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
                console.log('Synced item:', item.id);
            }
        } catch (error) {
            console.error('Sync failed for item:', item.id, error);
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
                console.log('Service Worker registered:', registration.scope);
            })
            .catch((error) => {
                console.error('Service Worker registration failed:', error);
            });
    }

    // Sync when coming online
    window.addEventListener('online', () => {
        console.log('Back online - processing sync queue');
        processSyncQueue();
    });

    // Listen for service worker sync messages
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data.type === 'SYNC_COMPLETE') {
                processSyncQueue();
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
    STORES
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', initOfflineSupport);
