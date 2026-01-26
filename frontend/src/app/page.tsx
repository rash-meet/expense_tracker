'use client';

import Link from 'next/link';
import ProtectedLayout from '@/components/ProtectedLayout';

export default function HomePage() {
  const buttons = [
    { href: '/expenses/add', icon: 'plus-circle', label: 'Add Expense', btnClass: 'btn-primary' },
    { href: '/savings/add', icon: 'currency-rupee', label: 'Add Saving', btnClass: 'btn-success' },
    { href: '/expenses', icon: 'graph-up-arrow', label: 'Expense Report', btnClass: 'btn-info' },
    { href: '/savings', icon: 'graph-down-arrow', label: 'Saving Report', btnClass: 'btn-warning' },
  ];

  return (
    <ProtectedLayout>
      <div className="text-center my-4">
        <h1 className="mb-4 fw-bold">Expense Tracker</h1>
        <div className="row g-3 justify-content-center">
          {buttons.map((btn) => (
            <div key={btn.href} className="col-12 col-md-3">
              <Link
                href={btn.href}
                className={`btn ${btn.btnClass} btn-lg w-100 py-3 rounded-3 shadow-sm d-flex align-items-center justify-content-center`}
              >
                <i className={`bi bi-${btn.icon} me-2`}></i>
                <span>{btn.label}</span>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </ProtectedLayout>
  );
}
