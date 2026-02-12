'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/lib/auth';

export default function Navbar() {
    const { logout, daysLeft } = useAuth();
    const [isOpen, setIsOpen] = useState(false);

    const toggleMenu = () => {
        setIsOpen(!isOpen);
    };

    const closeMenu = () => {
        setIsOpen(false);
    };

    const menuItems = [
        { href: '/expenses/add', icon: 'bi-plus-circle', label: 'Add Expense' },
        { href: '/savings/add', icon: 'bi-currency-rupee', label: 'Add Saving' },
        { href: '/expenses', icon: 'bi-graph-up-arrow', label: 'Expense Report' },
        { href: '/savings', icon: 'bi-graph-down-arrow', label: 'Saving Report' },
        { href: '/manage-data', icon: 'bi-hdd-stack', label: 'Manage Data' },
        { href: '/settings', icon: 'bi-gear', label: 'Settings' },
    ];

    return (
        <>
            <nav className="navbar navbar-dark" style={{ backgroundColor: '#1a365d', borderBottom: '1px solid #4a8a80' }}>
                <div className="container d-flex justify-content-between align-items-center py-2">
                    <Link className="navbar-brand d-flex align-items-center text-white text-decoration-none" href="/" onClick={closeMenu}>
                        <Image src="/logo.png" alt="Finchest" width={52} height={52} className="me-2 rounded-circle" />
                        <span style={{ fontWeight: 700, fontSize: '1.35rem' }}>Finchest</span>
                    </Link>

                    {/* Desktop Navigation */}
                    <div className="d-none d-md-flex align-items-center gap-3">
                        {menuItems.map((item) => (
                            <Link
                                key={item.href}
                                className="nav-link text-white-50 text-decoration-none"
                                href={item.href}
                                style={{ fontSize: '0.9rem' }}
                            >
                                <i className={`bi ${item.icon} me-1`}></i> {item.label}
                            </Link>
                        ))}
                        <div className="d-flex align-items-center text-muted small me-2" title="Days until session expires">
                            <i className="bi bi-clock-history me-1"></i>
                            {daysLeft !== null ? `${daysLeft}d left` : ''}
                        </div>
                        <button
                            className="btn btn-link text-danger text-decoration-none p-0"
                            onClick={logout}
                            style={{ fontSize: '0.9rem' }}
                        >
                            <i className="bi bi-box-arrow-right me-1"></i> Logout
                        </button>
                    </div>

                    {/* Mobile Hamburger Button */}
                    <button
                        className="btn d-md-none p-2"
                        type="button"
                        onClick={toggleMenu}
                        aria-expanded={isOpen}
                        aria-label="Toggle navigation"
                        style={{ border: '1px solid #555', borderRadius: '4px' }}
                    >
                        <i className={`bi ${isOpen ? 'bi-x-lg' : 'bi-list'} text-white fs-5`}></i>
                    </button>
                </div>
            </nav>

            {/* Mobile Dropdown Menu - completely separate from navbar */}
            {isOpen && (
                <div
                    className="d-md-none"
                    style={{
                        backgroundColor: '#0f172a',
                        borderBottom: '1px solid #4a8a80',
                    }}
                >
                    <div className="container py-2">
                        {menuItems.map((item) => (
                            <Link
                                key={item.href}
                                className="d-block py-2 text-white text-decoration-none"
                                href={item.href}
                                onClick={closeMenu}
                                style={{ fontSize: '1rem' }}
                            >
                                <i className={`bi ${item.icon} me-2`}></i> {item.label}
                            </Link>
                        ))}
                        <button
                            className="d-block w-100 text-start py-2 btn btn-link text-danger text-decoration-none p-0"
                            onClick={() => {
                                closeMenu();
                                logout();
                            }}
                            style={{ fontSize: '1rem' }}
                        >
                            <i className="bi bi-box-arrow-right me-2"></i> Logout
                        </button>
                        {daysLeft !== null && (
                            <div className="text-secondary small mt-3 text-center border-top border-secondary pt-2">
                                <i className="bi bi-clock-history me-1"></i> Session expires in {daysLeft} days
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
