'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '@/lib/auth';
import { getSavings, deleteSaving, checkHealth, getStats, getSettings } from '@/lib/api';
import { getCachedSavings, cacheSavings, cacheMonthlyTotals, getCachedMonthlyTotals, getPendingSyncItems, deletePendingItem, updatePendingOfflineEntry, updateLocalMonthlyTotals } from '@/lib/offline';
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
    const [currentMonth, setCurrentMonth] = useState('');
    const [totalFiltered, setTotalFiltered] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [hasPending, setHasPending] = useState(false);

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

    // Editing pending item
    const [editingPendingId, setEditingPendingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<{ amount: string; saving_mode: string; date: string; time: string; note: string }>({
        amount: '', saving_mode: '', date: '', time: '', note: ''
    });

    const currentYear = new Date().getFullYear();
    const yearsList = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4];

    useEffect(() => {
        if (!isAuthenticated) return;

        const initializeData = async () => {
            // Load cached monthly totals
            const cachedTotals = await getCachedMonthlyTotals();
            if (cachedTotals) {
                setTotalSaved(cachedTotals.monthSavings);
                setCurrentMonth(cachedTotals.currentMonth);
                setHasPending(cachedTotals.hasPending || false);
            }

            // Try to load settings for dropdowns
            try {
                const settings = await getSettings();
                if (settings?.saving_modes?.length) setSavingModes(settings.saving_modes);
            } catch { /* use loaded data for dropdowns */ }

            const cached = await getCachedSavings();
            if (cached.length > 0) {
                setSavings(cached);
                setFilteredSavings(cached);
                setTotalFiltered(cached.reduce((sum, s) => sum + s.amount, 0));
                setLoading(false);
                loadDataInBackground(1);
            } else {
                loadData(1, true);
            }
        };
        initializeData();
    }, [isAuthenticated]);

    // Background loading - doesn't show spinner
    const loadDataInBackground = async (pageNum: number) => {
        try {
            const filters: any = {};
            const response = await getSavings(pageNum, 50, filters);

            if (response.data && response.data.length > 0) {
                const cached = await getCachedSavings();
                const pendingOnly = cached.filter(s => s._pending);

                await cacheSavings(response.data);
                const updatedCache = await getCachedSavings();

                setSavings(updatedCache);
                setFilteredSavings(updatedCache);
                setTotalFiltered(updatedCache.reduce((sum, s) => sum + s.amount, 0));
                setHasMore(pageNum < response.pagination.pages);
                setPage(pageNum);
                cacheSavings(response.data);
                setIsOnline(true);

                const stats = await getStats();
                if (stats) {
                    setTotalSaved(stats.month_savings);
                    setCurrentMonth(stats.current_month);
                    setHasPending(pendingOnly.length > 0);
                    await cacheMonthlyTotals(stats);
                    const allModes = [...new Set([...savingModes, ...(stats.saving_modes || [])])];
                    if (allModes.length > 0) setSavingModes(allModes);
                }
            }
        } catch {
            setIsOnline(false);
        }
    };

    const loadData = async (pageNum: number, isReset: boolean = false) => {
        if (isReset) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }

        const healthy = await checkHealth();
        setIsOnline(healthy);

        if (healthy) {
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

            const response = await getSavings(pageNum, 50, filters);

            if (isReset) {
                setSavings(response.data);
                setFilteredSavings(response.data);
                const stats = await getStats();
                if (stats) {
                    setTotalSaved(stats.month_savings);
                    setCurrentMonth(stats.current_month);
                    setHasPending(false);
                    await cacheMonthlyTotals(stats);
                    const allModes = [...new Set([...savingModes, ...(stats.saving_modes || [])])];
                    if (allModes.length > 0) setSavingModes(allModes);
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

            if (isReset) {
                cacheSavings(response.data);
            }

            const allLoaded = isReset ? response.data : [...savings, ...response.data];
            setTotalFiltered(allLoaded.reduce((sum, s) => sum + s.amount, 0));

        } else {
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
        setTimeout(() => loadData(1, true), 50);
    };

    const displayedSavings = searchTerm
        ? filteredSavings.filter(s =>
            s.saving_mode.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.note || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.amount.toString().includes(searchTerm)
        )
        : filteredSavings;

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this saving?')) return;

        const deletedItem = savings.find(s => s._id === id);
        if (!deletedItem) return;

        const result = await deleteSaving(id);

        if (result.success) {
            const updated = savings.filter(s => s._id !== id);
            setSavings(updated);
            setFilteredSavings(filteredSavings.filter(s => s._id !== id));

            // Update totals
            setTotalFiltered(prev => prev - deletedItem.amount);
            setTotalSaved(prev => prev - deletedItem.amount);

            // Update offline cache
            await updateLocalMonthlyTotals(-deletedItem.amount, 'saving');

            // Background re-sync
            cacheSavings(updated);
        }
    };

    // Handle deleting a pending (unsynced) item
    const handleDeletePending = async (saving: Saving) => {
        if (!confirm('Delete this pending saving?')) return;
        const pendingItems = await getPendingSyncItems();
        const matchItem = pendingItems.find(p =>
            p.type === 'saving' &&
            (p.data as Saving).amount === saving.amount &&
            (p.data as Saving).date === saving.date &&
            (p.data as Saving).saving_mode === saving.saving_mode
        );
        if (matchItem && matchItem.id) {
            const result = await deletePendingItem(matchItem.id, 'saving');
            if (result) {
                await updateLocalMonthlyTotals(-result.amount, 'saving');
            }
            const cached = await getCachedSavings();
            setSavings(cached);
            setFilteredSavings(cached);
            setTotalFiltered(cached.reduce((sum, s) => sum + s.amount, 0));
            const cachedTotals = await getCachedMonthlyTotals();
            if (cachedTotals) {
                setTotalSaved(cachedTotals.monthSavings);
            }
        }
    };

    const startEditPending = (saving: Saving) => {
        const key = `${saving.amount}_${saving.date}_${saving.saving_mode}`;
        setEditingPendingId(key);
        setEditForm({
            amount: saving.amount.toString(),
            saving_mode: saving.saving_mode,
            date: saving.date,
            time: saving.time || '',
            note: saving.note || '',
        });
    };

    const saveEditPending = async (saving: Saving) => {
        const pendingItems = await getPendingSyncItems();
        const matchItem = pendingItems.find(p =>
            p.type === 'saving' &&
            (p.data as Saving).amount === saving.amount &&
            (p.data as Saving).date === saving.date &&
            (p.data as Saving).saving_mode === saving.saving_mode
        );
        if (matchItem && matchItem.id) {
            const updatedSaving: Saving = {
                amount: parseFloat(editForm.amount),
                saving_mode: editForm.saving_mode,
                date: editForm.date,
                time: editForm.time,
                note: editForm.note,
            };
            const result = await updatePendingOfflineEntry(matchItem.id, 'saving', updatedSaving);
            if (result) {
                const amountDiff = result.newAmount - result.oldAmount;
                if (amountDiff !== 0) {
                    await updateLocalMonthlyTotals(amountDiff, 'saving');
                }
            }
            setEditingPendingId(null);
            const cached = await getCachedSavings();
            setSavings(cached);
            setFilteredSavings(cached);
            setTotalFiltered(cached.reduce((sum, s) => sum + s.amount, 0));
            const cachedTotals = await getCachedMonthlyTotals();
            if (cachedTotals) {
                setTotalSaved(cachedTotals.monthSavings);
            }
        }
    };

    const cancelEditPending = () => {
        setEditingPendingId(null);
    };

    return (
        <ProtectedLayout>
            <h2 className="mb-4 fw-bold">Saving Report</h2>

            {/* Total Saved This Month */}
            <div className="alert mb-4" style={{ backgroundColor: '#1a365d', borderColor: '#4a8a80' }}>
                <span>💰 Total Saved in {currentMonth || 'this month'}: ₹{totalSaved.toFixed(2)}</span>
                {hasPending && (
                    <span className="badge bg-warning text-dark ms-2">+ Pending</span>
                )}
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
                        <select className="form-select" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
                            <option value="">All Months</option>
                            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    {monthFilter && (
                        <div className="col-md-2 col-6">
                            <label className="form-label">Year</label>
                            <select className="form-select" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
                                {yearsList.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="col-md-2 col-6">
                        <label className="form-label">From Date</label>
                        <input type="date" className="form-control" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                    </div>
                    <div className="col-md-2 col-6">
                        <label className="form-label">To Date</label>
                        <input type="date" className="form-control" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                    </div>
                    <div className="col-md-2 col-6">
                        <label className="form-label">Mode</label>
                        <select className="form-select" value={modeFilter} onChange={(e) => setModeFilter(e.target.value)}>
                            <option value="">All Modes</option>
                            {savingModes.map(mode => <option key={mode} value={mode}>{mode}</option>)}
                        </select>
                    </div>
                    <div className="col-12">
                        <button type="button" className="btn btn-primary w-100 py-2 mt-2" onClick={applyFilters}>
                            <i className="bi bi-funnel-fill me-2"></i>Apply Filters
                        </button>
                        <button type="button" className="btn btn-secondary w-100 py-2 mt-2" onClick={resetFilters}>
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
                                        displayedSavings.map((s, idx) => {
                                            const editKey = `${s.amount}_${s.date}_${s.saving_mode}`;
                                            const isEditing = editingPendingId === editKey && s._pending;
                                            return isEditing ? (
                                                <tr key={`edit_${idx}`} className="pending-sync">
                                                    <td>
                                                        <input type="date" className="form-control form-control-sm" value={editForm.date}
                                                            onChange={(ev) => setEditForm({ ...editForm, date: ev.target.value })} />
                                                    </td>
                                                    <td>
                                                        <input type="time" className="form-control form-control-sm" value={editForm.time}
                                                            onChange={(ev) => setEditForm({ ...editForm, time: ev.target.value })} />
                                                    </td>
                                                    <td>
                                                        <select className="form-select form-select-sm" value={editForm.saving_mode}
                                                            onChange={(ev) => setEditForm({ ...editForm, saving_mode: ev.target.value })}>
                                                            {savingModes.map(m => <option key={m} value={m}>{m}</option>)}
                                                        </select>
                                                    </td>
                                                    <td>
                                                        <input type="number" step="0.01" className="form-control form-control-sm" value={editForm.amount}
                                                            onChange={(ev) => setEditForm({ ...editForm, amount: ev.target.value })} />
                                                    </td>
                                                    <td>
                                                        <input type="text" className="form-control form-control-sm" value={editForm.note}
                                                            onChange={(ev) => setEditForm({ ...editForm, note: ev.target.value })} />
                                                    </td>
                                                    <td className="text-center">
                                                        <button className="btn btn-sm btn-outline-success mx-1" title="Save"
                                                            onClick={() => saveEditPending(s)}>
                                                            <i className="bi bi-check-lg"></i>
                                                        </button>
                                                        <button className="btn btn-sm btn-outline-secondary mx-1" title="Cancel"
                                                            onClick={cancelEditPending}>
                                                            <i className="bi bi-x-lg"></i>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ) : (
                                                <tr key={s._id || `pending_${idx}`} className={s._pending ? 'pending-sync' : ''}>
                                                    <td>{s.date}</td>
                                                    <td>{s.time || '-'}</td>
                                                    <td>{s.saving_mode}</td>
                                                    <td>₹{s.amount.toFixed(2)}</td>
                                                    <td>{s.note || ''}</td>
                                                    <td className="text-center">
                                                        {s._pending ? (
                                                            <>
                                                                <button
                                                                    className="btn btn-sm btn-outline-warning mx-1"
                                                                    title="Edit Pending"
                                                                    onClick={() => startEditPending(s)}
                                                                >
                                                                    <i className="bi bi-pencil"></i>
                                                                </button>
                                                                <button
                                                                    className="btn btn-sm btn-outline-danger mx-1"
                                                                    title="Delete Pending"
                                                                    onClick={() => handleDeletePending(s)}
                                                                >
                                                                    <i className="bi bi-trash"></i>
                                                                </button>
                                                            </>
                                                        ) : (
                                                            isOnline && s._id && (
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
                                                            )
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
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
