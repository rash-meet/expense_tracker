'use client';

import { useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import Navbar from '@/components/Navbar';
import ConnectionStatus from '@/components/ConnectionStatus';
import OfflineBanner from '@/components/OfflineBanner';
import SyncService from '@/components/SyncService';

interface ProtectedLayoutProps {
    children: ReactNode;
}

export default function ProtectedLayout({ children }: ProtectedLayoutProps) {
    const { isAuthenticated, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.replace('/login?expired=true');
        }
    }, [isAuthenticated, isLoading, router]);

    // Show loading spinner while checking auth
    if (isLoading) {
        return (
            <div className="d-flex justify-content-center align-items-center min-vh-100 bg-dark">
                <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                </div>
            </div>
        );
    }

    // Don't render anything if not authenticated (will redirect)
    if (!isAuthenticated) {
        return (
            <div className="d-flex justify-content-center align-items-center min-vh-100 bg-dark">
                <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Redirecting...</span>
                </div>
            </div>
        );
    }

    // Authenticated - show page with navbar and sync service
    return (
        <>
            <SyncService />
            <OfflineBanner />
            <Navbar />
            <div className="container my-4">
                {children}
            </div>
            <ConnectionStatus />
        </>
    );
}
