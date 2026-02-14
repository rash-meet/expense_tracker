'use client';

import { useState } from 'react';

export default function OfflineValidation() {
    const [status, setStatus] = useState<string>('');
    const [loading, setLoading] = useState(false);

    const checkDB = async () => {
        setLoading(true);
        setStatus('Checking Database...');

        try {
            const DB_NAME = 'finchest-db';
            const request = indexedDB.open(DB_NAME);

            request.onsuccess = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                const version = db.version;
                const stores = Array.from(db.objectStoreNames);

                let report = `DB Version: ${version}\nStores: ${stores.join(', ')}\n\n`;

                const checkStore = async (storeName: string) => {
                    return new Promise<string>((resolve) => {
                        if (!db.objectStoreNames.contains(storeName)) {
                            resolve(`${storeName}: MISSING\n`);
                            return;
                        }
                        const tx = db.transaction(storeName, 'readonly');
                        const store = tx.objectStore(storeName);
                        const countReq = store.count();
                        const indexNames = Array.from(store.indexNames);

                        countReq.onsuccess = () => {
                            resolve(`${storeName}: ${countReq.result} items. Indices: ${indexNames.join(', ')}\n`);
                        };
                        countReq.onerror = () => {
                            resolve(`${storeName}: Error counting\n`);
                        };
                    });
                };

                Promise.all([
                    checkStore('expenses'),
                    checkStore('savings'),
                    checkStore('monthly_totals')
                ]).then((results) => {
                    report += results.join('');
                    setStatus(report);
                    db.close();
                    setLoading(false);
                });
            };

            request.onerror = () => {
                setStatus('Error opening database.');
                setLoading(false);
            };
        } catch (e: any) {
            setStatus('Error: ' + e.message);
            setLoading(false);
        }
    };

    const resetDB = async () => {
        if (!confirm('This will wipe all offline data and reset the database. Continue?')) return;
        setLoading(true);
        setStatus('Deleting Database...');
        const DB_NAME = 'finchest-db';
        indexedDB.deleteDatabase(DB_NAME);
        setStatus('Database deleted. Please reload the page.');
        setLoading(false);
        window.location.reload();
    };

    return (
        <div className="alert alert-secondary mt-3">
            <h5>📢 Offline Debugger</h5>
            <div className="d-flex gap-2 mb-2">
                <button className="btn btn-sm btn-info" onClick={checkDB} disabled={loading}>
                    {loading ? 'Checking...' : 'Check DB Status'}
                </button>
                <button className="btn btn-sm btn-danger" onClick={resetDB} disabled={loading}>
                    Reset Database (Fix Caching)
                </button>
            </div>
            {status && <pre className="bg-dark text-white p-2 rounded" style={{ fontSize: '0.8rem' }}>{status}</pre>}
        </div>
    );
}
