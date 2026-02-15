'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '@/lib/auth';
import { getExpenses, deleteExpense, checkHealth, getStats, getSettings } from '@/lib/api';
import { getCachedExpensesForCurrentMonth, cacheExpenses, checkAndClearOldMonthData, cacheMonthlyTotals, getCachedMonthlyTotals, getPendingSyncItems, deletePendingItem, updatePendingOfflineEntry, updateLocalMonthlyTotals, removeCachedExpenseByServerId, rebuildExpensesCacheFromServer, cleanupInvalidCachedRows } from '@/lib/offline';
import ProtectedLayout from '@/components/ProtectedLayout';
import { Expense, SyncQueueItem } from '@/types';

// Dynamic import for Chart.js to avoid SSR issues
const PieChart = dynamic(() => import('@/components/PieChart'), { ssr: false });

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function ExpenseReportPage() {
    const { isAuthenticated } = useAuth();
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [filteredExpenses, setFilteredExpenses] = useState<Expense[]>([]);
    const [isOnline, setIsOnline] = useState(true);
    const [loading, setLoading] = useState(true);
    const [currentMonthTotal, setCurrentMonthTotal] = useState(0);
    const [totalFiltered, setTotalFiltered] = useState(0);
    const [currentMonth, setCurrentMonth] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [hasPending, setHasPending] = useState(false);
    const fullSyncDoneRef = useRef(false);
    const initGuardRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Pagination State
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    // Filters
    const [monthFilter, setMonthFilter] = useState('');
    const [yearFilter, setYearFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [paymentFilter, setPaymentFilter] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [categories, setCategories] = useState<string[]>([]);
    const [paymentModes, setPaymentModes] = useState<string[]>([]);

    // Pending items mapping (syncQueueId -> SyncQueueItem)
    const [pendingSyncMap, setPendingSyncMap] = useState<Map<string, number>>(new Map());

    // Editing pending item
    const [editingPendingId, setEditingPendingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<{ amount: string; category: string; payment_mode: string; date: string; time: string; note: string }>({
        amount: '', category: '', payment_mode: '', date: '', time: '', note: ''
    });

    const currentYear = new Date().getFullYear();
    const yearsList = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4];

    useEffect(() => {
        if (!isAuthenticated) return;
        initGuardRef.current = setTimeout(() => setLoading(false), 8000);

        const initializeData = async () => {
            try {
                await checkAndClearOldMonthData();

                // Load cached monthly totals
                const cachedTotals = await getCachedMonthlyTotals();
                if (cachedTotals) {
                    setCurrentMonth(cachedTotals.currentMonth);
                    setCurrentMonthTotal(cachedTotals.monthExpenses);
                    setHasPending(cachedTotals.hasPending || false);
                }

                // Load pending sync map
                await refreshPendingMap();
                await cleanupInvalidCachedRows();

                // Load cached report rows first so offline UI is immediate.
                const cached = await getCachedExpensesForCurrentMonth();
                if (cached.length > 0) {
                    setExpenses(cached);
                    setFilteredExpenses(cached);
                    setTotalFiltered(cached.reduce((sum, e) => sum + e.amount, 0));
                    loadDataInBackground(1);
                } else {
                    await loadData(1, true);
                }

                // Fetch settings in background; never block report rendering.
                getSettings()
                    .then((settings) => {
                        if (!settings) return;
                        if (settings.categories?.length) setCategories(settings.categories);
                        if (settings.payment_modes?.length) setPaymentModes(settings.payment_modes);
                    })
                    .catch(() => { });
            } catch {
                await loadCachedData();
            } finally {
                if (initGuardRef.current) {
                    clearTimeout(initGuardRef.current);
                    initGuardRef.current = null;
                }
                setLoading(false);
            }
        };
        initializeData();

        return () => {
            if (initGuardRef.current) {
                clearTimeout(initGuardRef.current);
                initGuardRef.current = null;
            }
        };
    }, [isAuthenticated]);

    const refreshPendingMap = async () => {
        const pendingItems = await getPendingSyncItems();
        const map = new Map<string, number>();
        pendingItems.filter(i => i.type === 'expense').forEach((item, idx) => {
            // Use a composite key for pending items
            const key = `pending_${item.id || idx}`;
            map.set(key, item.id!);
        });
        setPendingSyncMap(map);
    };

    const syncFullCacheFromServer = async () => {
        if (fullSyncDoneRef.current) return;
        fullSyncDoneRef.current = true;

        try {
            const all: Expense[] = [];
            let pageNum = 1;
            const limit = 200;

            while (true) {
                const response = await getExpenses(pageNum, limit, {});
                if (response.data?.length) {
                    all.push(...response.data);
                }
                if (pageNum >= response.pagination.pages) break;
                pageNum += 1;
            }

            await rebuildExpensesCacheFromServer(all);
            const updatedCache = await getCachedExpensesForCurrentMonth();
            setExpenses(updatedCache);
            setFilteredExpenses(updatedCache);
            setTotalFiltered(updatedCache.reduce((sum, e) => sum + e.amount, 0));
        } catch {
            // Ignore errors; background sync will retry next load
            fullSyncDoneRef.current = false;
        }
    };

    const loadCachedData = async () => {
        try {
            const data = await getCachedExpensesForCurrentMonth();
            setExpenses(data);
            setFilteredExpenses(data);
            setHasMore(false);
            setCurrentMonth(MONTHS[new Date().getMonth()]);
            setTotalFiltered(data.reduce((sum, e) => sum + e.amount, 0));
            setIsOnline(false);
        } catch {
            setExpenses([]);
            setFilteredExpenses([]);
            setHasMore(false);
            setTotalFiltered(0);
            setIsOnline(false);
        }
    };

    // Background loading - doesn't show spinner
    const loadDataInBackground = async (pageNum: number) => {
        try {
            const filters: any = {};
            const response = await getExpenses(pageNum, 50, filters);
            setIsOnline(true);

            if (response.data && response.data.length > 0) {
                // Add pending items from cache
                const cached = await getCachedExpensesForCurrentMonth();
                const pendingOnly = cached.filter(e => e._pending);

                // Merge strategies:
                // 1. Start with existing cached data (already in state? maybe)
                // 2. Or re-read cache completely (safest if cacheExpenses executed successfully)

                // Since we just called cacheExpenses(response.data), the indexedDB now has the merged data.
                // So we should re-read the FULL cache to update the UI consistently.

                await cacheExpenses(response.data); // Update cache first
                const updatedCache = await getCachedExpensesForCurrentMonth(); // Read back full source of truth

                setExpenses(updatedCache);
                setFilteredExpenses(updatedCache);
                setTotalFiltered(updatedCache.reduce((sum, e) => sum + e.amount, 0));
                setHasMore(pageNum < response.pagination.pages);
                setPage(pageNum);

                const stats = await getStats();
                if (stats) {
                    setCurrentMonth(stats.current_month);
                    setCurrentMonthTotal(stats.month_expenses);
                    setHasPending(pendingOnly.length > 0);
                    await cacheMonthlyTotals(stats);
                    // Merge settings categories with data categories
                    const allCats = [...new Set([...categories, ...(stats.categories || [])])];
                    const allModes = [...new Set([...paymentModes, ...(stats.payment_modes || [])])];
                    if (allCats.length > 0) setCategories(allCats);
                    if (allModes.length > 0) setPaymentModes(allModes);
                }
            } else {
                setHasMore(false);
            }

            if (pageNum === 1) {
                await syncFullCacheFromServer();
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

        try {
            const healthy = await checkHealth();
            setIsOnline(healthy);

            if (healthy) {
                const filters: any = {};
                if (fromDate) filters.from_date = fromDate;
                if (toDate) filters.to_date = toDate;
                if (categoryFilter) filters.category = categoryFilter;
                if (paymentFilter) filters.payment_mode = paymentFilter;
                if (monthFilter) {
                    const monthNum = MONTHS.indexOf(monthFilter);
                    const year = yearFilter ? parseInt(yearFilter) : currentYear;
                    const start = new Date(year, monthNum, 1);
                    const end = new Date(year, monthNum + 1, 0);
                    filters.from_date = start.toISOString().split('T')[0];
                    filters.to_date = end.toISOString().split('T')[0];
                }

                const response = await getExpenses(pageNum, 50, filters);

                if (isReset) {
                    setExpenses(response.data);
                    setFilteredExpenses(response.data);
                    const stats = await getStats();
                    if (stats) {
                        setCurrentMonth(stats.current_month);
                        setCurrentMonthTotal(stats.month_expenses);
                        // Merge categories from stats
                        const allCats = [...new Set([...categories, ...(stats.categories || [])])];
                        const allModes = [...new Set([...paymentModes, ...(stats.payment_modes || [])])];
                        if (allCats.length > 0) setCategories(allCats);
                        if (allModes.length > 0) setPaymentModes(allModes);
                    }
                } else {
                    setExpenses(prev => {
                        const newItems = response.data.filter(newItem =>
                            !prev.some(existing => existing._id === newItem._id)
                        );
                        return [...prev, ...newItems];
                    });

                    setFilteredExpenses(prev => {
                        const newItems = response.data.filter(newItem =>
                            !prev.some(existing => existing._id === newItem._id)
                        );
                        return [...prev, ...newItems];
                    });
                }

                setHasMore(pageNum < response.pagination.pages);
                setPage(pageNum);

                if (isReset) {
                    await cacheExpenses(response.data);
                    await syncFullCacheFromServer();
                }

                const allLoaded = isReset ? response.data : [...expenses, ...response.data];
                setTotalFiltered(allLoaded.reduce((sum, e) => sum + e.amount, 0));
            } else {
                await loadCachedData();
            }
        } catch {
            await loadCachedData();
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
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
        setCategoryFilter('');
        setPaymentFilter('');
        setFromDate('');
        setToDate('');
        setTimeout(() => loadData(1, true), 50);
    };

    // Client-side search
    const displayedExpenses = searchTerm
        ? filteredExpenses.filter(e =>
            e.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (e.note || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            e.amount.toString().includes(searchTerm)
        )
        : filteredExpenses;

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this expense?')) return;

        // Optimistic update
        const deletedItem = expenses.find(e => e._id === id);
        if (!deletedItem) return;

        // API call
        const result = await deleteExpense(id);

        if (result.success) {
            const updated = expenses.filter(e => e._id !== id);
            setExpenses(updated);
            setFilteredExpenses(filteredExpenses.filter(e => e._id !== id));

            // Update totals
            setTotalFiltered(prev => prev - deletedItem.amount);
            setCurrentMonthTotal(prev => prev - deletedItem.amount);

            // Update offline cache for reliability
            await updateLocalMonthlyTotals(-deletedItem.amount, 'expense');
            await removeCachedExpenseByServerId(id);
        }
    };

    // Handle deleting a pending (unsynced) item
    const handleDeletePending = async (expense: Expense) => {
        if (!confirm('Delete this pending expense?')) return;
        const pendingItems = await getPendingSyncItems();
        const matchItem = pendingItems.find(p =>
            p.type === 'expense' &&
            (p.data as Expense).amount === expense.amount &&
            (p.data as Expense).date === expense.date &&
            (p.data as Expense).category === expense.category
        );
        if (matchItem && matchItem.id) {
            const result = await deletePendingItem(matchItem.id, 'expense');
            if (result) {
                await updateLocalMonthlyTotals(-result.amount, 'expense');
            }
            // Refresh data
            const cached = await getCachedExpensesForCurrentMonth();
            setExpenses(cached);
            setFilteredExpenses(cached);
            setTotalFiltered(cached.reduce((sum, e) => sum + e.amount, 0));
            const cachedTotals = await getCachedMonthlyTotals();
            if (cachedTotals) {
                setCurrentMonthTotal(cachedTotals.monthExpenses);
            }
            await refreshPendingMap();
        }
    };

    // Start editing a pending item
    const startEditPending = (expense: Expense) => {
        const key = `${expense.amount}_${expense.date}_${expense.category}`;
        setEditingPendingId(key);
        setEditForm({
            amount: expense.amount.toString(),
            category: expense.category,
            payment_mode: expense.payment_mode,
            date: expense.date,
            time: expense.time || '',
            note: expense.note || '',
        });
    };

    // Save edited pending item
    const saveEditPending = async (expense: Expense) => {
        const pendingItems = await getPendingSyncItems();
        const matchItem = pendingItems.find(p =>
            p.type === 'expense' &&
            (p.data as Expense).amount === expense.amount &&
            (p.data as Expense).date === expense.date &&
            (p.data as Expense).category === expense.category
        );
        if (matchItem && matchItem.id) {
            const updatedExpense: Expense = {
                amount: parseFloat(editForm.amount),
                category: editForm.category,
                payment_mode: editForm.payment_mode,
                date: editForm.date,
                time: editForm.time,
                note: editForm.note,
            };
            const result = await updatePendingOfflineEntry(matchItem.id, 'expense', updatedExpense);
            if (result) {
                const amountDiff = result.newAmount - result.oldAmount;
                if (amountDiff !== 0) {
                    await updateLocalMonthlyTotals(amountDiff, 'expense');
                }
            }
            setEditingPendingId(null);
            // Refresh data
            const cached = await getCachedExpensesForCurrentMonth();
            setExpenses(cached);
            setFilteredExpenses(cached);
            setTotalFiltered(cached.reduce((sum, e) => sum + e.amount, 0));
            const cachedTotals = await getCachedMonthlyTotals();
            if (cachedTotals) {
                setCurrentMonthTotal(cachedTotals.monthExpenses);
            }
        }
    };

    const cancelEditPending = () => {
        setEditingPendingId(null);
    };

    return (
        <ProtectedLayout>
            <h2 className="mb-4 fw-bold">Expense Report</h2>

            {/* Current Month Total */}
            <div className="alert mb-4" style={{ backgroundColor: '#1a365d', borderColor: '#4a8a80' }}>
                <span>💰 Total Spent in {currentMonth}: ₹{currentMonthTotal.toFixed(2)}</span>
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
                        placeholder="Search expenses by category, note, amount..."
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
                        <label className="form-label">Category</label>
                        <select
                            className="form-select"
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                        >
                            <option value="">All Categories</option>
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                    <div className="col-md-2 col-6">
                        <label className="form-label">Payment Mode</label>
                        <select
                            className="form-select"
                            value={paymentFilter}
                            onChange={(e) => setPaymentFilter(e.target.value)}
                        >
                            <option value="">All Modes</option>
                            {paymentModes.map(mode => (
                                <option key={mode} value={mode}>{mode}</option>
                            ))}
                        </select>
                    </div>
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
                <div className="alert alert-success mb-4">
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
                                const categoryData: { [key: string]: number } = {};
                                filteredExpenses.forEach(e => {
                                    categoryData[e.category] = (categoryData[e.category] || 0) + e.amount;
                                });
                                return categoryData;
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
                                        <th>Category</th>
                                        <th>Mode</th>
                                        <th>Amount</th>
                                        <th>Note</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayedExpenses.length === 0 ? (
                                        <tr className="text-center">
                                            <td colSpan={7} className="text-muted">No expenses found.</td>
                                        </tr>
                                    ) : (
                                        displayedExpenses.map((e, idx) => {
                                            const editKey = `${e.amount}_${e.date}_${e.category}`;
                                            const isEditing = editingPendingId === editKey && e._pending;
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
                                                        <select className="form-select form-select-sm" value={editForm.category}
                                                            onChange={(ev) => setEditForm({ ...editForm, category: ev.target.value })}>
                                                            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                                        </select>
                                                    </td>
                                                    <td>
                                                        <select className="form-select form-select-sm" value={editForm.payment_mode}
                                                            onChange={(ev) => setEditForm({ ...editForm, payment_mode: ev.target.value })}>
                                                            {paymentModes.map(m => <option key={m} value={m}>{m}</option>)}
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
                                                            onClick={() => saveEditPending(e)}>
                                                            <i className="bi bi-check-lg"></i>
                                                        </button>
                                                        <button className="btn btn-sm btn-outline-secondary mx-1" title="Cancel"
                                                            onClick={cancelEditPending}>
                                                            <i className="bi bi-x-lg"></i>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ) : (
                                                <tr key={e._id || `pending_${idx}`} className={e._pending ? 'pending-sync' : ''}>
                                                    <td>{e.date}</td>
                                                    <td>{e.time || '-'}</td>
                                                    <td>{e.category}</td>
                                                    <td>{e.payment_mode}</td>
                                                    <td>₹{e.amount.toFixed(2)}</td>
                                                    <td>{e.note || ''}</td>
                                                    <td className="text-center">
                                                        {e._pending ? (
                                                            <>
                                                                <button
                                                                    className="btn btn-sm btn-outline-warning mx-1"
                                                                    title="Edit Pending"
                                                                    onClick={() => startEditPending(e)}
                                                                >
                                                                    <i className="bi bi-pencil"></i>
                                                                </button>
                                                                <button
                                                                    className="btn btn-sm btn-outline-danger mx-1"
                                                                    title="Delete Pending"
                                                                    onClick={() => handleDeletePending(e)}
                                                                >
                                                                    <i className="bi bi-trash"></i>
                                                                </button>
                                                            </>
                                                        ) : (
                                                            isOnline && e._id && (
                                                                <>
                                                                    <Link
                                                                        href={`/expenses/edit/${e._id}`}
                                                                        className="btn btn-sm btn-outline-warning mx-1"
                                                                        title="Edit"
                                                                    >
                                                                        <i className="bi bi-pencil"></i>
                                                                    </Link>
                                                                    <button
                                                                        className="btn btn-sm btn-outline-danger mx-1"
                                                                        title="Delete"
                                                                        onClick={() => handleDelete(e._id!)}
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
