'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { updateProfile } from '../../lib/api';
import { useAuth } from '../../lib/authContext';

export default function EditAccountPage() {
  const { user, isLoggedIn, isLoading, setUser, logout } = useAuth();

  const initialFields = useMemo(() => ({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    displayName: user?.displayName || user?.username || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  }), [user]);

  const [form, setForm] = useState(initialFields);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(initialFields);
  }, [initialFields]);

  const accountHandle = user?.username ? `@${user.username}` : user?.email || '@account';

  const setField = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((current) => ({ ...current, [key]: e.target.value }));
    };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    if (!form.displayName.trim()) {
      setError('Display name is required.');
      setSuccess('');
      return;
    }

    if (!/\S+@\S+\.\S+/.test(form.email)) {
      setError('Enter a valid email address.');
      setSuccess('');
      return;
    }

    // const wantsPasswordChange = !!(form.currentPassword || form.newPassword || form.confirmPassword);
    // if (wantsPasswordChange) {
    //   if (!form.currentPassword) {
    //     setError('Current password is required to change your password.');
    //     setSuccess('');
    //     return;
    //   }
    //   if (!form.newPassword) {
    //     setError('Enter a new password.');
    //     setSuccess('');
    //     return;
    //   }
    //   if (form.newPassword !== form.confirmPassword) {
    //     setError('New password and confirmation do not match.');
    //     setSuccess('');
    //     return;
    //   }
    // }

    setSaving(true);
    setError('');

    try {
      const result = await updateProfile({
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        firstName: form.firstName,
        lastName: form.lastName,
        // currentPassword: form.currentPassword || undefined,
        // newPassword: form.newPassword || undefined,
      });

      if (!result.success) {
        setError(result.message || 'Could not save profile.');
        return;
      }

      if (result.data) {
        setUser(result.data);
      }

      setForm((current) => ({
        ...current,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      }));

      setSuccess('Profile updated successfully.');
    } catch {
      setError('Could not connect to server.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Header />
      <div className="dima-main account-edit-page">
        <section className="section">
          <div className="page-section-content overflow-hidden">
            <div className="container">
              {isLoading ? (
              <p className="account-edit-loading">Loading...</p>
              ) : !isLoggedIn || !user ? (
                <div className="account-edit-login-box">
                  <p className="account-edit-login-text">Please log in to edit your account details.</p>
                  <div className="account-edit-login-action">
                    <Link href="/my-account" className="button fill uppercase">Go To My Account</Link>
                  </div>
                </div>
              ) : (
                <div className="account-edit-shell">
                  <div className="account-edit-layout">
                    <aside className="account-edit-sidebar">
                      <div className="account-edit-sidebar-inner">
                        <div className="account-edit-avatar" aria-hidden="true">
                          <svg width="78" height="78" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        </div>
                        <h3 className="account-edit-hello">Hello</h3>
                        <p className="account-edit-handle">{accountHandle}</p>

                        <nav className="account-edit-nav" aria-label="Account navigation">
                          <Link href="/my-account" className="account-edit-link">Dashboard</Link>
                          <Link href="/my-account/edit-account" className="account-edit-link active">Edit Profile</Link>
                          <Link href="/my-account/edit-address" className="account-edit-link">My Addresses</Link>
                          <Link href="/orders" className="account-edit-link">My Orders</Link>
                          <Link href="/wishlist" className="account-edit-link">Wishlist</Link>
                          <button className="account-edit-button" onClick={logout}>Logout</button>
                        </nav>
                      </div>
                    </aside>

                    <div className="account-edit-main">
                      <div className="account-edit-top" />

                      {error && <p className="account-edit-message error">{error}</p>}
                      {success && <p className="account-edit-message success">{success}</p>}

                      <form className="account-edit-form" onSubmit={handleSubmit} noValidate>
                        <div className="account-edit-field">
                          <label className="account-edit-label">First name</label>
                          <input className="account-edit-input" type="text" value={form.firstName} onChange={setField('firstName')} />
                        </div>

                        <div className="account-edit-field">
                          <label className="account-edit-label">Last name</label>
                          <input className="account-edit-input" type="text" value={form.lastName} onChange={setField('lastName')} />
                        </div>

                        <div className="account-edit-field">
                          <label className="account-edit-label required">Display name</label>
                          <input className="account-edit-input" type="text" value={form.displayName} readOnly />
                          <p className="account-edit-note">
                            This will be how your name will be displayed in the account section and in reviews.
                          </p>
                        </div>

                        <div className="account-edit-field">
                          <label className="account-edit-label required">Email address</label>
                          <input className="account-edit-input" type="email" value={form.email} readOnly />
                        </div>

                        {/* Password change — commented out
                        <h4 className="account-edit-subheading">Password change</h4>

                        <div className="account-edit-field">
                          <label className="account-edit-label">Current password (leave blank to leave unchanged)</label>
                          <input className="account-edit-input" type="password" value={form.currentPassword} onChange={setField('currentPassword')} />
                        </div>

                        <div className="account-edit-field">
                          <label className="account-edit-label">New password (leave blank to leave unchanged)</label>
                          <input className="account-edit-input" type="password" value={form.newPassword} onChange={setField('newPassword')} />
                        </div>

                        <div className="account-edit-field">
                          <label className="account-edit-label">Confirm new password</label>
                          <input className="account-edit-input" type="password" value={form.confirmPassword} onChange={setField('confirmPassword')} />
                        </div>
                        */}

                        <div className="account-edit-actions">
                          <button type="submit" className="btn-view-product btn-view-product--inline" disabled={saving}>
                            {saving ? 'Saving...' : 'Save Changes'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
      <Footer />
    </>
  );
}
