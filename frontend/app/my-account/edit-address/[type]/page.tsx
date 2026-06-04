'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import { getProfileAddresses, updateProfileAddress, type ProfileAddressForm } from '../../../lib/api';
import { useAuth } from '../../../lib/authContext';

const EMPTY_FORM: ProfileAddressForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  company: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  postcode: '',
};

export default function EditAddressTypePage() {
  const params = useParams<{ type: string }>();
  const router = useRouter();
  const { user, isLoggedIn, isLoading, logout } = useAuth();
  const type = params?.type === 'billing' || params?.type === 'shipping' ? params.type : '';
  const isBilling = type === 'billing';

  const [form, setForm] = useState<ProfileAddressForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pageError, setPageError] = useState('');
  const [pageSuccess, setPageSuccess] = useState('');
  const [loadingForm, setLoadingForm] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!type) {
      router.replace('/my-account/edit-address');
    }
  }, [router, type]);

  useEffect(() => {
    if (!isLoggedIn || !user || !type) {
      setLoadingForm(false);
      return;
    }

    let active = true;

    const load = async () => {
      setLoadingForm(true);
      setPageError('');

      try {
        const addresses = await getProfileAddresses();
        if (!active) return;
        setForm(addresses[type]);
      } catch {
        if (!active) return;
        setPageError('Unable to load your saved address right now.');
      } finally {
        if (!active) return;
        setLoadingForm(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [isLoggedIn, type, user]);

  const accountHandle = user?.username ? `@${user.username}` : user?.email || '@account';
  const title = useMemo(() => isBilling ? 'Edit Address' : 'Edit Shipping Address', [isBilling]);
  const description = useMemo(
    () => isBilling
      ? 'Update the address details used for future checkout.'
      : 'Update the shipping address details used for future checkout.',
    [isBilling]
  );

  const setField = (key: keyof ProfileAddressForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value;
      setForm((current) => ({ ...current, [key]: value }));
      setErrors((current) => {
        if (!current[key]) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
    };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!type) return;

    setSaving(true);
    setPageError('');
    setPageSuccess('');

    try {
      const result = await updateProfileAddress(type, form);
      if (!result.success) {
        setErrors(result.errors || {});
        setPageError(result.message || 'Could not save address.');
        return;
      }

      setErrors({});
      setPageSuccess(result.message || 'Address updated successfully.');
      if (result.data) {
        setForm(result.data[type]);
      }
    } catch {
      setPageError('Could not save address.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Header />
      <div className="dima-main account-address-page">
        <section className="section">
          <div className="page-section-content overflow-hidden">
            <div className="container">
              {isLoading ? (
              <p className="account-address-loading">Loading...</p>
              ) : !isLoggedIn || !user ? (
                <div className="account-address-login-box">
                  <p className="account-address-login-text">Please log in to edit your saved addresses.</p>
                  <div className="account-address-login-action">
                    <Link href="/my-account" className="button fill uppercase">Go To My Account</Link>
                  </div>
                </div>
              ) : (
                <div className="account-address-shell">
                  <div className="account-address-layout">
                    <aside className="account-address-sidebar">
                      <div className="account-address-sidebar-inner">
                        <div className="account-address-avatar" aria-hidden="true">
                          <svg width="78" height="78" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        </div>
                        <h3 className="account-address-hello">Hello</h3>
                        <p className="account-address-handle">{accountHandle}</p>

                        <nav className="account-address-nav" aria-label="Account navigation">
                          <Link href="/my-account" className="account-address-link">Dashboard</Link>
                          <Link href="/my-account/edit-account" className="account-address-link">Edit Profile</Link>
                          <Link href="/my-account/edit-address" className="account-address-link active">My Addresses</Link>
                          <Link href="/orders" className="account-address-link">My Orders</Link>
                          <Link href="/wishlist" className="account-address-link">Wishlist</Link>
                          <button className="account-address-button" onClick={logout}>Logout</button>
                        </nav>
                      </div>
                    </aside>

                    <div className="account-address-main">
                      <div className="account-address-top">
                        <Link href="/my-account/edit-address" className="account-address-back">
                          <span>{'<-'}</span>
                          <span>Back to addresses</span>
                        </Link>
                        <h4 className="account-address-title">{title}</h4>
                        <p className="account-address-copy">{description}</p>
                      </div>

                      {pageError && <p className="account-address-message error">{pageError}</p>}
                      {pageSuccess && <p className="account-address-message success">{pageSuccess}</p>}
                      {loadingForm ? (
                        <p className="account-address-message">Loading saved address...</p>
                      ) : (
                        <form className="account-address-form" onSubmit={handleSubmit} noValidate>
                          <div className="account-address-field">
                            <label htmlFor="address1">Address</label>
                            <input id="address1" type="text" value={form.address1} onChange={setField('address1')} />
                            {errors.address1 && <span className="account-address-field-error">{errors.address1}</span>}
                          </div>

                          <div className="account-address-field">
                            <label htmlFor="address2">Apartment, suite, unit etc. (optional)</label>
                            <input id="address2" type="text" value={form.address2} onChange={setField('address2')} />
                          </div>

                          <div className="account-address-field">
                            <label htmlFor="city">Town / City</label>
                            <input id="city" type="text" value={form.city} onChange={setField('city')} />
                            {errors.city && <span className="account-address-field-error">{errors.city}</span>}
                          </div>

                          <div className="account-address-row">
                            <div className="account-address-field">
                              <label htmlFor="state">State / County</label>
                              <input id="state" type="text" value={form.state} onChange={setField('state')} />
                              {errors.state && <span className="account-address-field-error">{errors.state}</span>}
                            </div>
                            <div className="account-address-field">
                              <label htmlFor="postcode">Postcode / Zip</label>
                              <input id="postcode" type="text" value={form.postcode} onChange={setField('postcode')} />
                              {errors.postcode && <span className="account-address-field-error">{errors.postcode}</span>}
                            </div>
                          </div>

                          <div className="account-address-actions">
                            <button type="submit" className="btn-view-product btn-view-product--inline" disabled={saving}>
                              {saving ? 'Saving...' : `Save ${isBilling ? '' : 'Shipping '}Address`}
                            </button>
                            <Link href="/my-account/edit-address" className="account-address-cancel">
                              Cancel
                            </Link>
                          </div>
                        </form>
                      )}
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
