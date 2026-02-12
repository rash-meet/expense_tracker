'use client';
// Force refresh

import { useEffect, useRef } from 'react';
import { checkHealth, addExpense, addSaving, updateExpense, updateSaving, deleteExpense, deleteSaving } from '@/lib/api';
import { getPendingSyncItems, removeSyncItem, clearPendingFromStore } from '@/lib/offline';
import { useAuth } from '@/lib/auth';

export default function SyncService() {
    const { isAuthenticated } = useAuth();
    const isSyncing = useRef(false);

    // Process sync queue and push pending items to server
    const processSyncQueue = async () => {
        if (isSyncing.current) return;
        isSyncing.current = true;

        try {
            const pendingItems = await getPendingSyncItems();

            if (pendingItems.length === 0) {
                isSyncing.current = false;
                return;
            }

            console.log(`[Sync] Processing ${pendingItems.length} pending items...`);

            for (const item of pendingItems) {
                try {
                    let success = false;

                    if (item.type === 'expense') {
                        switch (item.action) {
                            case 'add':
                                const addRes = await addExpense(item.data as any);
                                success = addRes.success;
                                break;
                            case 'update':
                                if (item.data._id) {
                                    const updateRes = await updateExpense(item.data._id, item.data as any);
                                    success = updateRes.success;
                                }
                                break;
                            case 'delete':
                                if (item.data._id) {
                                    const delRes = await deleteExpense(item.data._id);
                                    success = delRes.success;
                                }
                                break;
                        }
                    } else if (item.type === 'saving') {
                        switch (item.action) {
                            case 'add':
                                const addRes = await addSaving(item.data as any);
                                success = addRes.success;
                                break;
                            case 'update':
                                if (item.data._id) {
                                    const updateRes = await updateSaving(item.data._id, item.data as any);
                                    success = updateRes.success;
                                }
                                break;
                            case 'delete':
                                if (item.data._id) {
                                    const delRes = await deleteSaving(item.data._id);
                                    success = delRes.success;
                                }
                                break;
                        }
                    }

                    if (success && item.id) {
                        await removeSyncItem(item.id);
                        console.log(`[Sync] Successfully synced ${item.type} ${item.action}`);
                    }
                } catch (err) {
                    console.error(`[Sync] Failed to sync item:`, err);
                }
            }
        } catch (err) {
            console.error('[Sync] Error processing sync queue:', err);
        }

        // After sync, clear any remaining pending entries from local stores
        const remaining = await getPendingSyncItems();
        const hasExpensePending = remaining.some(i => i.type === 'expense');
        const hasSavingPending = remaining.some(i => i.type === 'saving');
        if (!hasExpensePending) await clearPendingFromStore('expense');
        if (!hasSavingPending) await clearPendingFromStore('saving');

        isSyncing.current = false;
    };

    // Check connection and sync when online
    const checkAndSync = async () => {
        if (!isAuthenticated) return;

        const isOnline = await checkHealth();
        if (isOnline) {
            await processSyncQueue();
        }
    };

    useEffect(() => {
        if (!isAuthenticated) return;

        // Initial sync check
        checkAndSync();

        // Periodic sync check every 30 seconds
        const syncInterval = setInterval(checkAndSync, 30000);

        // Listen for online/offline events
        const handleOnline = () => {
            console.log('[Sync] Connection restored, syncing...');
            checkAndSync();
        };

        window.addEventListener('online', handleOnline);

        return () => {
            clearInterval(syncInterval);
            window.removeEventListener('online', handleOnline);
        };
    }, [isAuthenticated]);

    // This component renders nothing - just runs sync logic
    return null;
}
