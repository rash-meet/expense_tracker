'use client';

import { useEffect, useState } from 'react';
import { getPendingSyncItems } from '@/lib/offline';

export default function OfflineBanner() {
    const [isOffline, setIsOffline] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);

    useEffect(() => {
        const updateStatus = async () => {
            setIsOffline(!navigator.onLine);
            const pending = await getPendingSyncItems();
            setPendingCount(pending.length);
        };

        updateStatus();

        window.addEventListener('online', updateStatus);
        window.addEventListener('offline', updateStatus);

        // Listen for sync complete events
        const handleSyncComplete = () => updateStatus();
        window.addEventListener('syncComplete', handleSyncComplete);

        return () => {
            window.removeEventListener('online', updateStatus);
            window.removeEventListener('offline', updateStatus);
            window.removeEventListener('syncComplete', handleSyncComplete);
        };
    }, []);

    if (!isOffline && pendingCount === 0) return null;

    return (
        <div className={`${isOffline ? 'bg-gradient-to-r from-orange-500 to-amber-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'} text-white text-center py-2 px-4 text-sm font-medium`}>
            {isOffline ? (
                <>
                    📡 You&apos;re offline. Changes will sync when connected.
                    {pendingCount > 0 && ` (${pendingCount} pending)`}
                </>
            ) : (
                <>
                    🔄 {pendingCount} item{pendingCount > 1 ? 's' : ''} waiting to sync...
                </>
            )}
        </div>
    );
}
