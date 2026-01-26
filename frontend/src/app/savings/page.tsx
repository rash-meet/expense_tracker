'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '@/lib/auth';
import { getSavings, deleteSaving, checkHealth, getStats } from '@/lib/api';
import { getCachedSavings, cacheSavings } from '@/lib/offline';
import ProtectedLayout from '@/components/ProtectedLayout';
import { Saving } from '@/types';

// Dynamic import for Chart.js to avoid SSR issues
const PieChart = dynamic(() => import('@/components/PieChart'), { ssr: false });

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function SavingReportPage() {
    const { isAuthenticated } = useAuth();
    const [savings, setSavings] = useState<Saving[]>([]);
    const [filteredSavings, setFilteredSavings] = useState<Saving[]>([]);
    const [isOnline, setIsOnline] = useState(true);
    const [loading, setLoading] = useState(true);
    const [totalSaved, setTotalSaved] = useState(0);
    const [totalFiltered, setTotalFiltered] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');

    // Pagination State
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    // Filters
    const [monthFilter, setMonthFilter] = useState('');
    const [yearFilter, setYearFilter] = useState('');
    const [modeFilter, setModeFilter] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [savingModes, setSavingModes] = useState<string[]>([]);

    const currentYear = new Date().getFullYear();
    const yearsList = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4];

    useEffect(() => {
        if (!isAuthenticated) return;

        // Load data without default date filters to allow full history pagination
        loadData(1, true);
    }, [isAuthenticated]);

    const loadData = async (pageNum: number, isReset: boolean = false) => {
        if (isReset) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }

        const healthy = await checkHealth();
        setIsOnline(healthy);

        if (healthy) {
            // Build filters
            const filters: any = {};
            if (fromDate) filters.from_date = fromDate;
            if (toDate) filters.to_date = toDate;

            if (modeFilter) filters.saving_mode = modeFilter;

            if (monthFilter) {
                const monthNum = MONTHS.indexOf(monthFilter);
                const year = yearFilter ? parseInt(yearFilter) : currentYear;
                const start = new Date(year, monthNum, 1);
                const end = new Date(year, monthNum + 1, 0);
                filters.from_date = start.toISOString().split('T')[0];
                filters.to_date = end.toISOString().split('T')[0];
            }

            const response = await getSavings(pageNum, 200, filters);

            if (isReset) {
                setSavings(response.data);
                setFilteredSavings(response.data);

                const stats = await getStats();
                if (stats) {
                    setTotalSaved(stats.total_savings);
                }
            } else {
                setSavings(prev => {
                    const newItems = response.data.filter(newItem =>
                        !prev.some(existing => existing._id === newItem._id)
                    );
                    return [...prev, ...newItems];
                });

                setFilteredSavings(prev => {
                    const newItems = response.data.filter(newItem =>
                        !prev.some(existing => existing._id === newItem._id)
                    );
                    return [...prev, ...newItems];
                });
            }

            setHasMore(pageNum < response.pagination.pages);
            setPage(pageNum);

            const allLoaded = isReset ? response.data : [...savings, ...response.data];
            const modes = [...new Set(allLoaded.map(s => s.saving_mode))];
            setSavingModes(modes);

            setTotalFiltered(allLoaded.reduce((sum, s) => sum + s.amount, 0));
            if (!totalSaved && isReset) {
                setTotalSaved(allLoaded.reduce((sum, s) => sum + s.amount, 0));
            }
        } else {
            // Offline
            const data = await getCachedSavings();
            setSavings(data);
            setFilteredSavings(data);
            setHasMore(false);
            setTotalFiltered(data.reduce((sum, s) => sum + s.amount, 0));
        }

        setLoading(false);
        setLoadingMore(false);
    };

    const handleLoadMore = () => {
        loadData(page + 1, false);
    };

    const applyFilters = () => {
        loadData(1, true);
    };

    const resetFilters = () => {
        setMonthFilter('');
        setYearFilter('');
        setModeFilter('');
        setFromDate('');
        setToDate('');

        // Timeout to allow state updates to propagate or just force load with default dates in logic?
        // Since loadData uses state, we have to wait a bit or pass params.
        // For simplicity reusing the timeout trick.
        setTimeout(() => loadData(1, true), 50);
    };

    // Client-side search (filters mostly done on backend now, but search is client side on loaded data)
    const displayedSavings = searchTerm
        ? filteredSavings.filter(s =>
            s.saving_mode.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.note || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.amount.toString().includes(searchTerm)
        )
        : filteredSavings;

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this saving?')) return;
        const result = await deleteSaving(id);
        if (result.success) {
            const updated = savings.filter(s => s._id !== id);
            setSavings(updated);
            setFilteredSavings(filteredSavings.filter(s => s._id !== id));
        }
    };

    return (
        <ProtectedLayout>
            <h2 className="mb-4 fw-bold">Saving Report</h2>

            {/* Total Saved */}
            <div className="alert alert-dark mb-4">
                Total Saved: ₹{totalSaved.toFixed(2)}
            </div>

            {/* Search Box */}
            <div className="mb-4">
                <div className="input-group">
                    <span className="input-group-text bg-dark text-white border-secondary">
                        <i className="bi bi-search"></i>
                    </span>
                    <input
                        type="text"
                        className="form-control"
                        placeholder="Search savings by mode, note, amount..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Filters */}
            <div className="mb-4">
                <div className="row g-3">
                    <div className="col-md-2 col-6">
                        <label className="form-label">Month</label>
                        <select
                            className="form-select"
                            value={monthFilter}
                            onChange={(e) => setMonthFilter(e.target.value)}
                        >
                            <option value="">All Months</option>
                            {MONTHS.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>
                    {monthFilter && (
                        <div className="col-md-2 col-6">
                            <label className="form-label">Year</label>
                            <select
                                className="form-select"
                                value={yearFilter}
                                onChange={(e) => setYearFilter(e.target.value)}
                            >
                                {yearsList.map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="col-md-2 col-6">
                        <label className="form-label">From Date</label>
                        <input
                            type="date"
                            className="form-control"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                        />
                    </div>
                    <div className="col-md-2 col-6">
                        <label className="form-label">To Date</label>
                        <input
                            type="date"
                            className="form-control"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                        />
                    </div>
                    <div className="col-md-2 col-6">
                        <label className="form-label">Mode</label>
                        <select
                            className="form-select"
                            value={modeFilter}
                            onChange={(e) => setModeFilter(e.target.value)}
                        >
                            <option value="">All Modes</option>
                            {savingModes.map(mode => (
                                <option key={mode} value={mode}>{mode}</option>
                            ))}
                        </select>
                    </div>
                    <div className="col-12">
                        <button
                            type="button"
                            className="btn btn-primary w-100 py-2 mt-2"
                            onClick={applyFilters}
                        >
                            <i className="bi bi-funnel-fill me-2"></i>Apply Filters
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary w-100 py-2 mt-2"
                            onClick={resetFilters}
                        >
                            <i className="bi bi-arrow-counterclockwise me-2"></i>Reset
                        </button>
                    </div>
                </div>
            </div>

            {/* Filtered Total */}
            {totalFiltered > 0 && (
                <div className="alert alert-info mb-4">
                    Total in Filtered Results: ₹{totalFiltered.toFixed(2)}
                </div>
            )}

            {/* Chart and Table Row */}
            <div className="row g-4">
                {/* Pie Chart Section */}
                <div className="col-12 col-md-6">
                    {!loading && (
                        <PieChart
                            data={(() => {
                                const modeData: { [key: string]: number } = {};
                                filteredSavings.forEach(s => {
                                    modeData[s.saving_mode] = (modeData[s.saving_mode] || 0) + s.amount;
                                });
                                return modeData;
                            })()}
                        />
                    )}
                </div>

                {/* Table Section */}
                <div className="col-12 col-md-6">
                    {loading ? (
                        <div className="text-center py-5">
                            <div className="spinner-border text-primary" role="status">
                                <span className="visually-hidden">Loading...</span>
                            </div>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="table table-dark table-hover align-middle">
                                <thead className="table-secondary">
                                    <tr>
                                        <th>Date</th>
                                        <th>Time</th>
                                        <th>Mode</th>
                                        <th>Amount</th>
                                        <th>Note</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayedSavings.length === 0 ? (
                                        <tr className="text-center">
                                            <td colSpan={6} className="text-muted">No savings found.</td>
                                        </tr>
                                    ) : (
                                        displayedSavings.map((s) => (
                                            <tr key={s._id || s.id} className={s._pending ? 'pending-sync' : ''}>
                                                <td>{s.date}</td>
                                                <td>{s.time || '-'}</td>
                                                <td>{s.saving_mode}</td>
                                                <td>₹{s.amount.toFixed(2)}</td>
                                                <td>{s.note || ''}</td>
                                                <td className="text-center">
                                                    {isOnline && s._id && !s._pending && (
                                                        <>
                                                            <Link
                                                                href={`/savings/edit/${s._id}`}
                                                                className="btn btn-sm btn-outline-warning mx-1"
                                                                title="Edit"
                                                            >
                                                                <i className="bi bi-pencil"></i>
                                                            </Link>
                                                            <button
                                                                className="btn btn-sm btn-outline-danger mx-1"
                                                                title="Delete"
                                                                onClick={() => handleDelete(s._id!)}
                                                            >
                                                                <i className="bi bi-trash"></i>
                                                            </button>
                                                        </>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Load More Button */}
            {hasMore && !loading && (
                <div className="text-center mt-4 mb-5">
                    <button
                        className="btn btn-outline-primary px-5 py-2"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                    >
                        {loadingMore ? (
                            <>
                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                Loading...
                            </>
                        ) : (
                            'Load More'
                        )}
                    </button>
                </div>
            )}
        </ProtectedLayout>
    );
}
