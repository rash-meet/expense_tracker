'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { addSaving, checkHealth, getSettings } from '@/lib/api';
import { addToSyncQueue, addOfflineSaving, updateLocalMonthlyTotals } from '@/lib/offline';
import ProtectedLayout from '@/components/ProtectedLayout';

const DEFAULT_SAVING_MODES = ['Cash', 'Bank', 'Investment', 'Other'];

export default function AddSavingPage() {
    const router = useRouter();
    const [isOnline, setIsOnline] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [savingModes, setSavingModes] = useState<string[]>(DEFAULT_SAVING_MODES);

    const [formData, setFormData] = useState({
        amount: '',
        saving_mode: '',
        date: new Date().toISOString().split('T')[0],
        note: '',
    });

    useEffect(() => {
        const init = async () => {
            const healthy = await checkHealth();
            setIsOnline(healthy);
            try {
                const settings = await getSettings();
                if (settings?.saving_modes?.length) {
                    setSavingModes(settings.saving_modes);
                    setFormData(prev => ({
                        ...prev,
                        saving_mode: prev.saving_mode || settings.saving_modes[0],
                    }));
                } else {
                    setFormData(prev => ({
                        ...prev,
                        saving_mode: prev.saving_mode || DEFAULT_SAVING_MODES[0],
                    }));
                }
            } catch {
                setFormData(prev => ({
                    ...prev,
                    saving_mode: prev.saving_mode || DEFAULT_SAVING_MODES[0],
                }));
            }
        };
        init();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const saving = {
            amount: parseFloat(formData.amount),
            saving_mode: formData.saving_mode,
            date: formData.date,
            time: new Date().toTimeString().slice(0, 5),
            note: formData.note,
        };

        try {
            let submissionSuccess = false;

            if (isOnline) {
                try {
                    const result = await addSaving(saving);
                    if (result.success) {
                        submissionSuccess = true;
                    }
                } catch (error) {
                    console.error("Online submission failed, falling back to offline queue", error);
                }
            }

            // If offline OR online submission failed, add to sync queue and local cache
            if (!isOnline || !submissionSuccess) {
                await addToSyncQueue('saving', 'add', saving);
                await addOfflineSaving(saving); // Store locally for immediate display
                await updateLocalMonthlyTotals(saving.amount, 'saving');
                submissionSuccess = true;
            }

            if (submissionSuccess) {
                router.push('/savings');
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
                    <h2 className="card-title h4 mb-4 text-center text-white">Add Saving</h2>
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
                                {savingModes.map((mode) => (
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
                        <button
                            type="submit"
                            className="btn btn-success w-100 py-3 mt-3"
                            disabled={isSubmitting}
                        >
                            <i className="bi bi-save me-2"></i>
                            {isSubmitting ? 'Saving...' : 'Save Saving'}
                        </button>
                    </form>
                </div>
            </div>
        </ProtectedLayout>
    );
}
