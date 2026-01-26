'use client';

import { useEffect, useState } from 'react';
import { checkHealth } from '@/lib/api';
import { ConnectionStatus as Status } from '@/types';

export default function ConnectionStatus() {
    const [status, setStatus] = useState<Status>('checking');
    const [isOnline, setIsOnline] = useState(true);

    useEffect(() => {
        const checkConnection = async () => {
            if (!navigator.onLine) {
                setIsOnline(false);
                setStatus('disconnected');
                return;
            }

            setIsOnline(true);
            setStatus('checking');

            const healthy = await checkHealth();
            setStatus(healthy ? 'connected' : 'disconnected');
        };

        checkConnection();

        // Check every 30 seconds
        const interval = setInterval(checkConnection, 30000);

        // Listen for online/offline events
        window.addEventListener('online', checkConnection);
        window.addEventListener('offline', () => {
            setIsOnline(false);
            setStatus('disconnected');
        });

        return () => {
            clearInterval(interval);
            window.removeEventListener('online', checkConnection);
            window.removeEventListener('offline', () => { });
        };
    }, []);

    const statusConfig = {
        connected: {
            color: 'bg-green-500',
            glow: 'shadow-green-500/50',
            text: 'Connected',
        },
        disconnected: {
            color: 'bg-red-500',
            glow: 'shadow-red-500/50',
            text: isOnline ? 'Backend Sleeping' : 'Offline',
        },
        checking: {
            color: 'bg-yellow-500 animate-pulse',
            glow: 'shadow-yellow-500/50',
            text: 'Checking...',
        },
    };

    const config = statusConfig[status];

    return (
        <div className="fixed bottom-4 right-4 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-full px-4 py-2 flex items-center gap-2 text-sm z-50">
            <span className={`w-2.5 h-2.5 rounded-full ${config.color} shadow-lg ${config.glow}`} />
            <span className="text-gray-300">{config.text}</span>
        </div>
    );
}
