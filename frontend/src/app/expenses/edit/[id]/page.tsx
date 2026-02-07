'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { updateExpense, getExpenses } from '@/lib/api';
import ProtectedLayout from '@/components/ProtectedLayout';

const CATEGORIES = ['Travel', 'Food', 'Shopping', 'Mazze', 'Other'];
const PAYMENT_MODES = ['UPI', 'Cash', 'Card'];

export default function EditExpensePage() {
    const params = useParams();
    const router = useRouter();
    const expenseId = params.id as string;

    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const [formData, setFormData] = useState({
        amount: '',
        category: 'Travel',
        payment_mode: 'UPI',
        date: '',
        time: '',
        note: '',
    });

    useEffect(() => {
        const loadExpense = async () => {
            try {
                // Fetch expenses and find the one with matching ID
                const response = await getExpenses(1, 1000);
                const expense = response.data.find(e => e._id === expenseId);

                if (expense) {
                    setFormData({
                        amount: expense.amount.toString(),
                        category: expense.category || 'Travel',
                        payment_mode: expense.payment_mode || 'UPI',
                        date: expense.date || '',
                        time: expense.time || '',
                        note: expense.note || '',
                    });
                } else {
                    setError('Expense not found');
                }
            } catch (err) {
                console.error(err);
                setError('Failed to load expense');
            }
            setLoading(false);
        };

        if (expenseId) {
            loadExpense();
        }
    }, [expenseId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');

        try {
            const expense = {
                amount: parseFloat(formData.amount),
                category: formData.category,
                payment_mode: formData.payment_mode,
                date: formData.date,
                time: formData.time,
                note: formData.note,
            };

            const result = await updateExpense(expenseId, expense);

            if (result.success) {
                router.push('/expenses');
            } else {
                setError('Failed to update expense');
            }
        } catch (err) {
            console.error(err);
            setError('Failed to update expense');
        }

        setIsSubmitting(false);
    };

    if (loading) {
        return (
            <ProtectedLayout>
                <div className="text-center py-5">
                    <div className="spinner-border text-primary" role="status">
                        <span className="visually-hidden">Loading...</span>
                    </div>
                </div>
            </ProtectedLayout>
        );
    }

    return (
        <ProtectedLayout>
            <div className="card card-dark mb-4 shadow-sm" style={{ backgroundColor: '#1f1f1f', border: 'none' }}>
                <div className="card-body">
                    <h2 className="card-title h4 mb-4 text-center text-white">Edit Expense</h2>

                    {error && (
                        <div className="alert alert-danger">
                            <i className="bi bi-exclamation-triangle me-2"></i>
                            {error}
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
                                {CATEGORIES.map((cat) => (
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
                                {PAYMENT_MODES.map((mode) => (
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
                            <label className="form-label">Time</label>
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
                        <div className="d-flex gap-2">
                            <button
                                type="submit"
                                className="btn btn-primary flex-grow-1 py-3"
                                disabled={isSubmitting}
                            >
                                <i className="bi bi-save me-2"></i>
                                {isSubmitting ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary py-3"
                                onClick={() => router.push('/expenses')}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </ProtectedLayout>
    );
}
