'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSettings, updateSettings, Settings, checkHealth } from '@/lib/api';
import ProtectedLayout from '@/components/ProtectedLayout';

export default function SettingsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isOnline, setIsOnline] = useState(true);
    const [categories, setCategories] = useState<string[]>([]);
    const [paymentModes, setPaymentModes] = useState<string[]>([]);
    const [savingModes, setSavingModes] = useState<string[]>([]);
    const [newCategory, setNewCategory] = useState('');
    const [newPaymentMode, setNewPaymentMode] = useState('');
    const [newSavingMode, setNewSavingMode] = useState('');
    const [editIndex, setEditIndex] = useState<{ section: string; idx: number } | null>(null);
    const [editValue, setEditValue] = useState('');
    const [toastMsg, setToastMsg] = useState('');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setLoading(true);
        const healthy = await checkHealth();
        setIsOnline(healthy);
        try {
            const settings = await getSettings();
            if (settings) {
                setCategories(settings.categories || []);
                setPaymentModes(settings.payment_modes || []);
                setSavingModes(settings.saving_modes || []);
            }
        } catch (err) {
            showToast('Failed to load settings');
        }
        setLoading(false);
    };

    const showToast = (msg: string) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(''), 3000);
    };

    const saveSettings = useCallback(async (cats: string[], pmodes: string[], smodes: string[]) => {
        setSaving(true);
        try {
            const result = await updateSettings({
                categories: cats,
                payment_modes: pmodes,
                saving_modes: smodes,
            });
            if (result.success) {
                showToast('Settings saved successfully!');
            } else {
                showToast('Failed to save settings');
            }
        } catch {
            showToast('Error saving settings');
        }
        setSaving(false);
    }, []);

    // --- Category Actions ---
    const addCategory = async () => {
        const trimmed = newCategory.trim();
        if (!trimmed) return;
        if (categories.includes(trimmed)) {
            showToast('Category already exists');
            return;
        }
        const updated = [...categories, trimmed];
        setCategories(updated);
        setNewCategory('');
        await saveSettings(updated, paymentModes, savingModes);
    };

    const deleteCategory = async (idx: number) => {
        if (!confirm(`Delete category "${categories[idx]}"? Existing data with this category will still be preserved.`)) return;
        const updated = categories.filter((_, i) => i !== idx);
        setCategories(updated);
        await saveSettings(updated, paymentModes, savingModes);
    };

    // --- Payment Mode Actions ---
    const addPaymentMode = async () => {
        const trimmed = newPaymentMode.trim();
        if (!trimmed) return;
        if (paymentModes.includes(trimmed)) {
            showToast('Payment mode already exists');
            return;
        }
        const updated = [...paymentModes, trimmed];
        setPaymentModes(updated);
        setNewPaymentMode('');
        await saveSettings(categories, updated, savingModes);
    };

    const deletePaymentMode = async (idx: number) => {
        if (!confirm(`Delete payment mode "${paymentModes[idx]}"? Existing data will still be preserved.`)) return;
        const updated = paymentModes.filter((_, i) => i !== idx);
        setPaymentModes(updated);
        await saveSettings(categories, updated, savingModes);
    };

    // --- Saving Mode Actions ---
    const addSavingMode = async () => {
        const trimmed = newSavingMode.trim();
        if (!trimmed) return;
        if (savingModes.includes(trimmed)) {
            showToast('Saving mode already exists');
            return;
        }
        const updated = [...savingModes, trimmed];
        setSavingModes(updated);
        setNewSavingMode('');
        await saveSettings(categories, paymentModes, updated);
    };

    const deleteSavingMode = async (idx: number) => {
        if (!confirm(`Delete saving mode "${savingModes[idx]}"? Existing data will still be preserved.`)) return;
        const updated = savingModes.filter((_, i) => i !== idx);
        setSavingModes(updated);
        await saveSettings(categories, paymentModes, updated);
    };

    // --- Edit (shared for all sections) ---
    const startEdit = (section: string, idx: number, currentValue: string) => {
        setEditIndex({ section, idx });
        setEditValue(currentValue);
    };

    const cancelEdit = () => {
        setEditIndex(null);
        setEditValue('');
    };

    const saveEdit = async () => {
        if (!editIndex) return;
        const trimmed = editValue.trim();
        if (!trimmed) return;

        const { section, idx } = editIndex;

        if (section === 'category') {
            if (categories.includes(trimmed) && categories[idx] !== trimmed) {
                showToast('Category already exists');
                return;
            }
            const updated = [...categories];
            updated[idx] = trimmed;
            setCategories(updated);
            await saveSettings(updated, paymentModes, savingModes);
        } else if (section === 'payment') {
            if (paymentModes.includes(trimmed) && paymentModes[idx] !== trimmed) {
                showToast('Payment mode already exists');
                return;
            }
            const updated = [...paymentModes];
            updated[idx] = trimmed;
            setPaymentModes(updated);
            await saveSettings(categories, updated, savingModes);
        } else if (section === 'saving') {
            if (savingModes.includes(trimmed) && savingModes[idx] !== trimmed) {
                showToast('Saving mode already exists');
                return;
            }
            const updated = [...savingModes];
            updated[idx] = trimmed;
            setSavingModes(updated);
            await saveSettings(categories, paymentModes, updated);
        }

        setEditIndex(null);
        setEditValue('');
    };

    const renderList = (
        items: string[],
        section: string,
        onDelete: (idx: number) => void
    ) => (
        <ul className="list-group list-group-flush">
            {items.map((item, idx) => {
                const isEditing = editIndex?.section === section && editIndex?.idx === idx;
                return (
                    <li key={idx} className="list-group-item d-flex justify-content-between align-items-center"
                        style={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' }}>
                        {isEditing ? (
                            <div className="d-flex gap-2 flex-grow-1 me-2">
                                <input
                                    type="text"
                                    className="form-control form-control-sm"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                                    autoFocus
                                    style={{ backgroundColor: '#0f172a', color: '#e2e8f0', border: '1px solid #4a8a80' }}
                                />
                                <button className="btn btn-sm btn-outline-success" onClick={saveEdit} disabled={saving}>
                                    <i className="bi bi-check-lg"></i>
                                </button>
                                <button className="btn btn-sm btn-outline-secondary" onClick={cancelEdit}>
                                    <i className="bi bi-x-lg"></i>
                                </button>
                            </div>
                        ) : (
                            <>
                                <span>{item}</span>
                                <div>
                                    <button
                                        className="btn btn-sm btn-outline-warning me-2"
                                        onClick={() => startEdit(section, idx, item)}
                                        disabled={saving || !isOnline}
                                        title="Edit"
                                    >
                                        <i className="bi bi-pencil"></i>
                                    </button>
                                    <button
                                        className="btn btn-sm btn-outline-danger"
                                        onClick={() => onDelete(idx)}
                                        disabled={saving || !isOnline}
                                        title="Delete"
                                    >
                                        <i className="bi bi-trash"></i>
                                    </button>
                                </div>
                            </>
                        )}
                    </li>
                );
            })}
        </ul>
    );

    return (
        <ProtectedLayout>
            <h2 className="mb-4 fw-bold">
                <i className="bi bi-gear me-2"></i>Settings
            </h2>

            {/* Toast */}
            {toastMsg && (
                <div className="alert alert-info alert-dismissible fade show mb-4" role="alert"
                    style={{ backgroundColor: '#0f4c75', borderColor: '#4a8a80', color: '#e2e8f0' }}>
                    {toastMsg}
                    <button type="button" className="btn-close" onClick={() => setToastMsg('')}></button>
                </div>
            )}

            {!isOnline && (
                <div className="alert alert-warning mb-4">
                    <i className="bi bi-wifi-off me-2"></i>
                    <strong>You are offline.</strong> Settings are shown from cache. Editing requires an internet connection.
                </div>
            )}

            {loading ? (
                <div className="text-center py-5">
                    <div className="spinner-border text-primary" role="status">
                        <span className="visually-hidden">Loading...</span>
                    </div>
                </div>
            ) : (
                <div className="row g-4">
                    {/* Expense Categories */}
                    <div className="col-12 col-md-4">
                        <div className="card" style={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}>
                            <div className="card-header d-flex align-items-center" style={{ backgroundColor: '#1a365d', borderBottom: '1px solid #334155' }}>
                                <i className="bi bi-tags me-2 text-warning"></i>
                                <strong style={{ color: '#e2e8f0' }}>Expense Categories</strong>
                            </div>
                            <div className="card-body">
                                {renderList(categories, 'category', deleteCategory)}
                                <div className="input-group mt-3">
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="New category..."
                                        value={newCategory}
                                        onChange={(e) => setNewCategory(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                                        style={{ backgroundColor: '#1e293b', color: '#e2e8f0', border: '1px solid #4a8a80' }}
                                    />
                                    <button className="btn btn-outline-success" onClick={addCategory} disabled={saving || !newCategory.trim() || !isOnline}>
                                        <i className="bi bi-plus-lg"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Payment Modes */}
                    <div className="col-12 col-md-4">
                        <div className="card" style={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}>
                            <div className="card-header d-flex align-items-center" style={{ backgroundColor: '#1a365d', borderBottom: '1px solid #334155' }}>
                                <i className="bi bi-credit-card me-2 text-info"></i>
                                <strong style={{ color: '#e2e8f0' }}>Payment Modes</strong>
                            </div>
                            <div className="card-body">
                                {renderList(paymentModes, 'payment', deletePaymentMode)}
                                <div className="input-group mt-3">
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="New payment mode..."
                                        value={newPaymentMode}
                                        onChange={(e) => setNewPaymentMode(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && addPaymentMode()}
                                        style={{ backgroundColor: '#1e293b', color: '#e2e8f0', border: '1px solid #4a8a80' }}
                                    />
                                    <button className="btn btn-outline-success" onClick={addPaymentMode} disabled={saving || !newPaymentMode.trim() || !isOnline}>
                                        <i className="bi bi-plus-lg"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Saving Modes */}
                    <div className="col-12 col-md-4">
                        <div className="card" style={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}>
                            <div className="card-header d-flex align-items-center" style={{ backgroundColor: '#1a365d', borderBottom: '1px solid #334155' }}>
                                <i className="bi bi-piggy-bank me-2 text-success"></i>
                                <strong style={{ color: '#e2e8f0' }}>Saving Modes</strong>
                            </div>
                            <div className="card-body">
                                {renderList(savingModes, 'saving', deleteSavingMode)}
                                <div className="input-group mt-3">
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="New saving mode..."
                                        value={newSavingMode}
                                        onChange={(e) => setNewSavingMode(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && addSavingMode()}
                                        style={{ backgroundColor: '#1e293b', color: '#e2e8f0', border: '1px solid #4a8a80' }}
                                    />
                                    <button className="btn btn-outline-success" onClick={addSavingMode} disabled={saving || !newSavingMode.trim() || !isOnline}>
                                        <i className="bi bi-plus-lg"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Info note */}
            <div className="alert mt-4" style={{ backgroundColor: '#1a365d', borderColor: '#4a8a80', color: '#94a3b8' }}>
                <i className="bi bi-info-circle me-2"></i>
                <strong>Note:</strong> Deleting a category, payment mode, or saving mode will <em>not</em> delete existing data.
                If you re-add a previously deleted item, all historical data will still be mapped to it.
            </div>

            {saving && (
                <div className="text-center mt-3">
                    <div className="spinner-border spinner-border-sm text-primary" role="status">
                        <span className="visually-hidden">Saving...</span>
                    </div>
                    <span className="ms-2 text-muted">Saving settings...</span>
                </div>
            )}
        </ProtectedLayout>
    );
}
