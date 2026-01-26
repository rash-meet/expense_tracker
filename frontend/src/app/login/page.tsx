'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const { checkAuth } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        const result = await login(username, password);

        if (result) {
            checkAuth(); // Update auth state immediately
            router.push('/');
        } else {
            setError('Invalid username or password. Please try again.');
        }

        setIsLoading(false);
    };

    return (
        <div className="min-vh-100 d-flex align-items-center justify-content-center bg-dark">
            <div className="container">
                <div className="row justify-content-center">
                    <div className="col-12 col-md-6 col-lg-4">
                        <div className="text-center mb-4">
                            <i className="bi bi-wallet2 display-1 text-primary"></i>
                            <h1 className="h3 mt-3 text-white">Expense Tracker</h1>
                            <p className="text-muted">Sign in to continue</p>
                        </div>

                        <div className="card card-dark shadow" style={{ backgroundColor: '#1f1f1f', border: 'none' }}>
                            <div className="card-body p-4">
                                {error && (
                                    <div className="alert alert-danger d-flex align-items-center" role="alert">
                                        <i className="bi bi-exclamation-triangle-fill me-2"></i>
                                        <div>{error}</div>
                                    </div>
                                )}

                                <form onSubmit={handleSubmit}>
                                    <div className="mb-3">
                                        <label htmlFor="username" className="form-label text-white">Username</label>
                                        <input
                                            type="text"
                                            id="username"
                                            className="form-control"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            placeholder="Enter your username"
                                            required
                                            autoComplete="username"
                                        />
                                    </div>

                                    <div className="mb-3">
                                        <label htmlFor="password" className="form-label text-white">Password</label>
                                        <div className="input-group">
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                id="password"
                                                className="form-control"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="Enter your password"
                                                required
                                                autoComplete="current-password"
                                            />
                                            <button
                                                type="button"
                                                className="btn btn-outline-secondary"
                                                onClick={() => setShowPassword(!showPassword)}
                                                style={{ borderColor: '#444' }}
                                            >
                                                <i className={`bi bi-eye${showPassword ? '-slash' : ''}`}></i>
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        className="btn btn-primary w-100 py-2 mt-3"
                                        disabled={isLoading}
                                    >
                                        {isLoading ? (
                                            <>
                                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                                Signing in...
                                            </>
                                        ) : (
                                            <>
                                                <i className="bi bi-box-arrow-in-right me-2"></i>
                                                Sign In
                                            </>
                                        )}
                                    </button>
                                </form>

                                <p className="text-muted text-center mt-3 mb-0 small">
                                    Session expires after 4 hours
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
