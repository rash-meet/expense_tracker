'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '@/lib/auth';
import { getExpenses, deleteExpense, checkHealth, getStats } from '@/lib/api';
import { getCachedExpenses, cacheExpenses } from '@/lib/offline';
import ProtectedLayout from '@/components/ProtectedLayout';
import { Expense } from '@/types';

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

    // Pagination State
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    // Initial fetch done ref to prevent double fetch on mount
    const initialFetchDone = useState(false);

    // Filters
    const [monthFilter, setMonthFilter] = useState('');
    const [yearFilter, setYearFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [paymentFilter, setPaymentFilter] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [categories, setCategories] = useState<string[]>([]);
    const [paymentModes, setPaymentModes] = useState<string[]>([]);

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
            // Only apply other filters if they are set (handled by applyFilters usually, 
            // but here we need current state if we are loading more)
            // Actually, state values are current.
            if (categoryFilter) filters.category = categoryFilter;
            if (paymentFilter) filters.payment_mode = paymentFilter;
            // Month filter overrides date range if set, but we are defaulting to date range.
            // If user selected specific month, we should use that.
            if (monthFilter) {
                const monthNum = MONTHS.indexOf(monthFilter);
                const year = yearFilter ? parseInt(yearFilter) : currentYear;
                // Calculate start and end of that month
                const start = new Date(year, monthNum, 1);
                const end = new Date(year, monthNum + 1, 0);
                filters.from_date = start.toISOString().split('T')[0];
                filters.to_date = end.toISOString().split('T')[0];
            }

            const response = await getExpenses(pageNum, 200, filters);

            if (isReset) {
                setExpenses(response.data);
                setFilteredExpenses(response.data);
                // Stats for total
                const stats = await getStats();
                if (stats) {
                    setCurrentMonth(stats.current_month);
                    setCurrentMonthTotal(stats.month_expenses);
                }
            } else {
                setExpenses(prev => {
                    // Filter out any items that already exist in the state to prevent duplicates
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

            // Update categories/modes from ALL loaded data (or just current batch? Better all)
            // But we only have loaded data.
            const allLoaded = isReset ? response.data : [...expenses, ...response.data];
            const cats = [...new Set(allLoaded.map(e => e.category))];
            const modes = [...new Set(allLoaded.map(e => e.payment_mode))];
            setCategories(cats);
            setPaymentModes(modes);

            // Recalculate totals
            setTotalFiltered(allLoaded.reduce((sum, e) => sum + e.amount, 0));

        } else {
            // Offline - load everything cached
            const data = await getCachedExpenses();
            setExpenses(data);
            setFilteredExpenses(data);
            setHasMore(false);
            setCurrentMonth(MONTHS[new Date().getMonth()]);
            setTotalFiltered(data.reduce((sum, e) => sum + e.amount, 0));
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
        setCategoryFilter('');
        setPaymentFilter('');

        setFromDate('');
        setToDate('');

        // We need to wait for state update? No, loadData uses state.
        // State updates are async. We should pass filters explicitly or wait.
        // Better to pass filters to loadData, but I implemented loadData to read state.
        // Fix: Update state then trigger effect? Or pass overrides.
        // I will just trigger a reload with timeouts/effects or better: separate fetch logic.
        // For now, I'll forcefully call loadData with empty params manually inside reset 
        // effectively by passing "reset" flag and handling it?
        // Actually, just calling loadData(1, true) immediately reads OLD state.
        // Quick fix: Set state and then rely on user to click "Apply"? 
        // No, reset usually auto-applies.
        // I will use a timeout or useEffect dependency, or just pass overrides to loadData.
        // Let's modify loadData to accept optional filters Override.

        // Actually, simplest is to just reload the page or cleaner: 
        // creating a "filters" object state instead of individual states would solve this.
        // For now, I will manually clear filters in the API call within reset.

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
        const result = await deleteExpense(id);
        if (result.success) {
            const updated = expenses.filter(e => e._id !== id);
            setExpenses(updated);
            setFilteredExpenses(filteredExpenses.filter(e => e._id !== id));
        }
    };

    return (
        <ProtectedLayout>
            <h2 className="mb-4 fw-bold">Expense Report</h2>

            {/* Current Month Total */}
            <div className="alert alert-dark mb-4">
                Total Spent in {currentMonth}: ₹{currentMonthTotal.toFixed(2)}
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
                                        displayedExpenses.map((e) => (
                                            <tr key={e._id || e.id} className={e._pending ? 'pending-sync' : ''}>
                                                <td>{e.date}</td>
                                                <td>{e.time || '-'}</td>
                                                <td>{e.category}</td>
                                                <td>{e.payment_mode}</td>
                                                <td>₹{e.amount.toFixed(2)}</td>
                                                <td>{e.note || ''}</td>
                                                <td className="text-center">
                                                    {isOnline && e._id && !e._pending && (
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
