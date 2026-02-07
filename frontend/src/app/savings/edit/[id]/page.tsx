'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { updateSaving, getSavings } from '@/lib/api';
import ProtectedLayout from '@/components/ProtectedLayout';

const SAVING_MODES = ['Mpokket', 'Cash', 'Fi', 'Other'];

export default function EditSavingPage() {
    const params = useParams();
    const router = useRouter();
    const savingId = params.id as string;

    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const [formData, setFormData] = useState({
        amount: '',
        saving_mode: 'Mpokket',
        date: '',
        note: '',
    });

    useEffect(() => {
        const loadSaving = async () => {
            try {
                // Fetch savings and find the one with matching ID
                const response = await getSavings(1, 1000);
                const saving = response.data.find(s => s._id === savingId);

                if (saving) {
                    setFormData({
                        amount: saving.amount.toString(),
                        saving_mode: saving.saving_mode || 'Mpokket',
                        date: saving.date || '',
                        note: saving.note || '',
                    });
                } else {
                    setError('Saving not found');
                }
            } catch (err) {
                console.error(err);
                setError('Failed to load saving');
            }
            setLoading(false);
        };

        if (savingId) {
            loadSaving();
        }
    }, [savingId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');

        try {
            const saving = {
                amount: parseFloat(formData.amount),
                saving_mode: formData.saving_mode,
                date: formData.date,
                note: formData.note,
            };

            const result = await updateSaving(savingId, saving);

            if (result.success) {
                router.push('/savings');
            } else {
                setError('Failed to update saving');
            }
        } catch (err) {
            console.error(err);
            setError('Failed to update saving');
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
                    <h2 className="card-title h4 mb-4 text-center text-white">Edit Saving</h2>

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
                            <label className="form-label">Saving Mode</label>
                            <select
                                name="saving_mode"
                                className="form-select"
                                value={formData.saving_mode}
                                onChange={(e) => setFormData({ ...formData, saving_mode: e.target.value })}
                                required
                            >
                                {SAVING_MODES.map((mode) => (
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
                                className="btn btn-success flex-grow-1 py-3"
                                disabled={isSubmitting}
                            >
                                <i className="bi bi-save me-2"></i>
                                {isSubmitting ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary py-3"
                                onClick={() => router.push('/savings')}
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
