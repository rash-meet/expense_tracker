'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import ProtectedLayout from '@/components/ProtectedLayout';
import { useAuth } from '@/lib/auth';

export default function HomePage() {
  const { expiresAt, daysLeft } = useAuth();
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number } | null>(null);

  useEffect(() => {
    if (!expiresAt) return;

    const updateTimer = () => {
      const diff = expiresAt - Date.now();
      if (diff <= 0) {
        setTimeLeft(null);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      setTimeLeft({ days, hours, minutes });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const buttons = [
    { href: '/expenses/add', icon: 'plus-circle', label: 'Add Expense', btnClass: 'btn-primary' },
    { href: '/savings/add', icon: 'currency-rupee', label: 'Add Saving', btnClass: 'btn-success' },
    { href: '/expenses', icon: 'graph-up-arrow', label: 'Expense Report', btnClass: 'btn-info' },
    { href: '/savings', icon: 'graph-down-arrow', label: 'Saving Report', btnClass: 'btn-warning' },
  ];

  return (
    <ProtectedLayout>
      <div className="text-center my-5">
        <div className="mb-4">
          {/* Logo with white circular background - EXACT Flask match */}
          <div
            className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3 shadow"
            style={{
              backgroundColor: 'white',
              width: '180px',
              height: '180px',
              padding: '20px'
            }}
          >
            <Image
              src="/logo.png"
              alt="Finchest"
              width={140}
              height={140}
              style={{ objectFit: 'contain' }}
            />
          </div>
          <h1 className="display-4 fw-bold" style={{ color: '#4a8a80' }}>Finchest</h1>
          <p className="text-secondary fs-5">Your Personal Finance Chest</p>
        </div>
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

        {timeLeft && (
          <div className="mt-5 d-flex justify-content-center">
            <div className={`card ${timeLeft.days <= 2 ? 'border-warning' : 'border-secondary'} bg-dark text-white`} style={{ maxWidth: '400px' }}>
              <div className="card-body">
                <h5 className="card-title h6 text-secondary mb-3">
                  <i className="bi bi-shield-lock me-2"></i> Session Status
                </h5>

                {timeLeft.days > 2 ? (
                  <div className="display-6 fw-bold text-success">
                    {daysLeft} <span className="fs-5 text-muted">days left</span>
                  </div>
                ) : (
                  <div>
                    <div className="text-warning mb-2 fw-bold">Expires Soon!</div>
                    <div className="d-flex justify-content-center gap-3 text-center">
                      <div>
                        <div className="h3 mb-0">{timeLeft.days}</div>
                        <div className="small text-muted">Days</div>
                      </div>
                      <div className="h3 mb-0">:</div>
                      <div>
                        <div className="h3 mb-0">{timeLeft.hours}</div>
                        <div className="small text-muted">Hours</div>
                      </div>
                      <div className="h3 mb-0">:</div>
                      <div>
                        <div className="h3 mb-0">{timeLeft.minutes}</div>
                        <div className="small text-muted">Mins</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-3 small text-muted">
                  Valid until {new Date(expiresAt!).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}
