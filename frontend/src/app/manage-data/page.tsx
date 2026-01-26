'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { checkHealth, bulkDelete, getStats } from '@/lib/api';
import ProtectedLayout from '@/components/ProtectedLayout';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function ManageDataPage() {
    const { isAuthenticated } = useAuth();
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<'expense' | 'saving'>('expense');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

    // Filters
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [category, setCategory] = useState(''); // for expenses
    const [paymentMode, setPaymentMode] = useState(''); // for expenses
    const [savingMode, setSavingMode] = useState(''); // for savings

    // Lists for dropdowns
    const [categories, setCategories] = useState<string[]>([]);
    const [paymentModes, setPaymentModes] = useState<string[]>([]);
    const [savingModes, setSavingModes] = useState<string[]>([]);

    // Password Modal
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [password, setPassword] = useState('');

    useEffect(() => {
        if (!isAuthenticated) return;

        // Load stats to populate dropdowns
        const loadInitialData = async () => {
            const stats = await getStats();
            if (stats) {
                setCategories(stats.categories);
                setPaymentModes(stats.payment_modes);
                setSavingModes(stats.saving_modes);
            }
        };

        loadInitialData();
    }, [isAuthenticated]);

    const handleDeleteClick = () => {
        setMessage(null);
        setShowPasswordModal(true);
    };

    const handleConfirmDelete = async () => {
        if (!password) {
            setMessage({ text: 'Password is required', type: 'error' });
            return;
        }

        setLoading(true);
        try {
            const filters: any = {};
            if (fromDate) filters.from_date = fromDate;
            if (toDate) filters.to_date = toDate;

            if (activeTab === 'expense') {
                if (category) filters.category = category;
                if (paymentMode) filters.payment_mode = paymentMode;
            } else {
                if (savingMode) filters.saving_mode = savingMode;
            }

            const result = await bulkDelete(activeTab, filters, password);

            if (result.success) {
                setMessage({ text: result.message, type: 'success' });
                setShowPasswordModal(false);
                setPassword('');
                // Reset filters? Maybe user wants to delete more.
            } else {
                setMessage({ text: result.message, type: 'error' });
            }
        } catch (error) {
            setMessage({ text: 'An unexpected error occurred', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <ProtectedLayout>
            <h2 className="mb-4 fw-bold">Manage Data</h2>

            <div className="card bg-dark border-secondary">
                <div className="card-header border-secondary">
                    <ul className="nav nav-tabs card-header-tabs">
                        <li className="nav-item">
                            <button
                                className={`nav-link ${activeTab === 'expense' ? 'active bg-secondary text-white' : 'text-muted'}`}
                                onClick={() => setActiveTab('expense')}
                            >
                                Expenses
                            </button>
                        </li>
                        <li className="nav-item">
                            <button
                                className={`nav-link ${activeTab === 'saving' ? 'active bg-secondary text-white' : 'text-muted'}`}
                                onClick={() => setActiveTab('saving')}
                            >
                                Savings
                            </button>
                        </li>
                    </ul>
                </div>
                <div className="card-body">
                    <h5 className="card-title text-danger mb-3">Bulk Delete {activeTab === 'expense' ? 'Expenses' : 'Savings'}</h5>
                    <p className="card-text text-muted mb-4">
                        Select filters to delete specific records. <strong className="text-danger">Warning: This action cannot be undone.</strong>
                        <br />
                        <span className="text-warning">Leave filters empty to delete ALL records of this type.</span>
                    </p>

                    {message && (
                        <div className={`alert alert-${message.type === 'success' ? 'success' : 'danger'} mb-4`}>
                            {message.text}
                        </div>
                    )}

                    <div className="row g-3">
                        <div className="col-md-6">
                            <label className="form-label">From Date</label>
                            <input
                                type="date"
                                className="form-control bg-dark text-white border-secondary"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                            />
                        </div>
                        <div className="col-md-6">
                            <label className="form-label">To Date</label>
                            <input
                                type="date"
                                className="form-control bg-dark text-white border-secondary"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                            />
                        </div>

                        {activeTab === 'expense' ? (
                            <>
                                <div className="col-md-6">
                                    <label className="form-label">Category</label>
                                    <select
                                        className="form-select bg-dark text-white border-secondary"
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                    >
                                        <option value="">All Categories</option>
                                        {categories.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-md-6">
                                    <label className="form-label">Payment Mode</label>
                                    <select
                                        className="form-select bg-dark text-white border-secondary"
                                        value={paymentMode}
                                        onChange={(e) => setPaymentMode(e.target.value)}
                                    >
                                        <option value="">All Modes</option>
                                        {paymentModes.map(p => (
                                            <option key={p} value={p}>{p}</option>
                                        ))}
                                    </select>
                                </div>
                            </>
                        ) : (
                            <div className="col-md-12">
                                <label className="form-label">Saving Mode</label>
                                <select
                                    className="form-select bg-dark text-white border-secondary"
                                    value={savingMode}
                                    onChange={(e) => setSavingMode(e.target.value)}
                                >
                                    <option value="">All Modes</option>
                                    {savingModes.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="col-12 mt-4">
                            <button
                                className="btn btn-danger w-100 py-2"
                                onClick={handleDeleteClick}
                                disabled={loading}
                            >
                                <i className="bi bi-trash me-2"></i>Delete Matching Data
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Password Modal */}
            {showPasswordModal && (
                <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content bg-dark border-secondary">
                            <div className="modal-header border-secondary">
                                <h5 className="modal-title text-danger">Confirm Deletion</h5>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    onClick={() => setShowPasswordModal(false)}
                                ></button>
                            </div>
                            <div className="modal-body">
                                <p>Please enter your password to confirm this action.</p>
                                <input
                                    type="password"
                                    className="form-control bg-dark text-white border-secondary"
                                    placeholder="Enter Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                            <div className="modal-footer border-secondary">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setShowPasswordModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-danger"
                                    onClick={handleConfirmDelete}
                                    disabled={loading}
                                >
                                    {loading ? 'Deleting...' : 'Confirm Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </ProtectedLayout>
    );
}
