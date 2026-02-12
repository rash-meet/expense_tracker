'use client';

import { useState, useEffect } from 'react';
import { addExpense, checkHealth, getSettings } from '@/lib/api';
import { addToSyncQueue, addOfflineExpense, updateLocalMonthlyTotals } from '@/lib/offline';
import ProtectedLayout from '@/components/ProtectedLayout';

const DEFAULT_CATEGORIES = ['Travel', 'Food', 'Shopping', 'Mazze', 'Other'];
const DEFAULT_PAYMENT_MODES = ['UPI', 'Cash', 'Card'];

export default function AddExpensePage() {
    const [isOnline, setIsOnline] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
    const [paymentModes, setPaymentModes] = useState<string[]>(DEFAULT_PAYMENT_MODES);

    const [formData, setFormData] = useState({
        amount: '',
        category: '',
        payment_mode: '',
        date: new Date().toISOString().split('T')[0],
        time: '',
        note: '',
    });

    useEffect(() => {
        const init = async () => {
            const healthy = await checkHealth();
            setIsOnline(healthy);
            try {
                const settings = await getSettings();
                if (settings) {
                    if (settings.categories?.length) setCategories(settings.categories);
                    if (settings.payment_modes?.length) setPaymentModes(settings.payment_modes);
                    setFormData(prev => ({
                        ...prev,
                        category: prev.category || (settings.categories?.[0] || DEFAULT_CATEGORIES[0]),
                        payment_mode: prev.payment_mode || (settings.payment_modes?.[0] || DEFAULT_PAYMENT_MODES[0]),
                    }));
                } else {
                    setFormData(prev => ({
                        ...prev,
                        category: prev.category || DEFAULT_CATEGORIES[0],
                        payment_mode: prev.payment_mode || DEFAULT_PAYMENT_MODES[0],
                    }));
                }
            } catch {
                setFormData(prev => ({
                    ...prev,
                    category: prev.category || DEFAULT_CATEGORIES[0],
                    payment_mode: prev.payment_mode || DEFAULT_PAYMENT_MODES[0],
                }));
            }
        };
        init();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setSuccess(false);

        const expense = {
            amount: parseFloat(formData.amount),
            category: formData.category,
            payment_mode: formData.payment_mode,
            date: formData.date,
            time: formData.time || new Date().toTimeString().slice(0, 5),
            note: formData.note,
        };

        try {
            let submissionSuccess = false;

            if (isOnline) {
                try {
                    const result = await addExpense(expense);
                    if (result.success) {
                        submissionSuccess = true;
                    }
                } catch (error) {
                    console.error("Online submission failed, falling back to offline queue", error);
                }
            }

            // If offline OR online submission failed, add to sync queue and local cache
            if (!isOnline || !submissionSuccess) {
                await addToSyncQueue('expense', 'add', expense);
                await addOfflineExpense(expense); // Store locally for immediate display
                await updateLocalMonthlyTotals(expense.amount, 'expense');
                submissionSuccess = true;
            }

            if (submissionSuccess) {
                setSuccess(true);
                setFormData({
                    amount: '',
                    category: 'Travel',
                    payment_mode: 'UPI',
                    date: new Date().toISOString().split('T')[0],
                    time: '',
                    note: '',
                });
            }
        } catch (err) {
            console.error(err);
        }

        setIsSubmitting(false);
    };

    return (
        <ProtectedLayout>
            <div className="card card-dark mb-4 shadow-sm" style={{ backgroundColor: '#1f1f1f', border: 'none' }}>
                <div className="card-body">
                    <h2 className="card-title h4 mb-4 text-center text-white">Add Expense</h2>

                    {success && (
                        <div className="alert alert-success">
                            <i className="bi bi-check-circle me-2"></i>
                            Expense saved successfully!
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div className="mb-3">
                            <label className="form-label">Amount (₹)</label>
                            <input
                                type="number"
                                name="amount"
                                step="0.01"
                                className="form-control"
                                value={formData.amount}
                                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                required
                            />
                        </div>
                        <div className="mb-3">
                            <label className="form-label">Category</label>
                            <select
                                name="category"
                                className="form-select"
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                required
                            >
                                {categories.map((cat) => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mb-3">
                            <label className="form-label">Payment Mode</label>
                            <select
                                name="payment_mode"
                                className="form-select"
                                value={formData.payment_mode}
                                onChange={(e) => setFormData({ ...formData, payment_mode: e.target.value })}
                                required
                            >
                                {paymentModes.map((mode) => (
                                    <option key={mode} value={mode}>{mode}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mb-3">
                            <label className="form-label">Date</label>
                            <input
                                type="date"
                                name="date"
                                className="form-control"
                                value={formData.date}
                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                required
                            />
                        </div>
                        <div className="mb-3">
                            <label className="form-label">Time (Optional)</label>
                            <input
                                type="time"
                                name="time"
                                className="form-control"
                                value={formData.time}
                                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                            />
                        </div>
                        <div className="mb-3">
                            <label className="form-label">Note</label>
                            <input
                                type="text"
                                name="note"
                                className="form-control"
                                value={formData.note}
                                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                            />
                        </div>
                        <button
                            type="submit"
                            className="btn btn-success w-100 py-3 mt-3"
                            disabled={isSubmitting}
                        >
                            <i className="bi bi-save me-2"></i>
                            {isSubmitting ? 'Saving...' : 'Save Expense'}
                        </button>
                    </form>
                </div>
            </div>
        </ProtectedLayout>
    );
}
