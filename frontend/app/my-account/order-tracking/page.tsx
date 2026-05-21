'use client';

import { useState } from 'react';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import AccountSidebar from '../../components/AccountSidebar';
import { getMyOrderById } from '../../lib/api';
import { useAuth } from '../../lib/authContext';

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function normalizeStatus(status: string) {
  if (!status) return 'pending';
  const s = status.replace('wc-', '').toLowerCase();
  if (s.includes('complete')) return 'completed';
  if (s.includes('process')) return 'processing';
  if (s.includes('ship')) return 'shipped';
  if (s.includes('pending')) return 'pending';
  return s;
}

export default function OrderTrackingPage() {
  const { user, isLoggedIn, isLoading, logout } = useAuth();
  const [orderId, setOrderId] = useState('');
  const [billingEmail, setBillingEmail] = useState(user?.email || '');
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    id: number;
    status: string;
    dateLabel: string;
    totalLabel: string;
    billingEmail: string;
    name: string;
  } | null>(null);

  const accountHandle = user?.username ? `@${user.username}` : user?.email || '@account';

  const handleTrack = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!orderId.trim()) {
      setError('Please enter your order ID.');
      setResult(null);
      return;
    }
    if (!billingEmail.trim()) {
      setError('Please enter the billing email used during checkout.');
      setResult(null);
      return;
    }

    setLoadingTrack(true);
    setError('');
    setResult(null);

    try {
      const detail = await getMyOrderById(orderId.trim());
      const order = detail.order;
      const orderEmail = (order.billing_email || order.user_email || '').trim().toLowerCase();
      const submittedEmail = billingEmail.trim().toLowerCase();

      if (orderEmail && submittedEmail && orderEmail !== submittedEmail) {
        setError('The billing email does not match this order.');
        return;
      }

      const name = [order.ship_first_name, order.ship_last_name].filter(Boolean).join(' ').trim()
        || [order.billing_first_name, order.billing_last_name].filter(Boolean).join(' ').trim()
        || order.user_display_name
        || 'Customer';

      setResult({
        id: Number(order.order_id),
        status: normalizeStatus(order.order_status || ''),
        dateLabel: formatDate(order.order_date || ''),
        totalLabel: order.total ? `Rs. ${Number(order.total).toFixed(2)}` : 'Rs. 0.00',
        billingEmail: orderEmail || submittedEmail,
        name,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not track this order.');
    } finally {
      setLoadingTrack(false);
    }
  };

  return (
    <>
      <Header />
      <div className="dima-main tracking-page">
        <section className="section">
          <div className="page-section-content overflow-hidden">
            <div className="container">
              {isLoading ? (
              <p className="tracking-loading">Loading...</p>
              ) : !isLoggedIn || !user ? (
                <div className="tracking-message">
                  Please log in to track an order from your account.
                  <div className="tracking-login-action">
                    <Link href="/my-account" className="button fill uppercase">Login / Register</Link>
                  </div>
                </div>
              ) : (
                <div className="account-shell">
                  <div className="account-layout">
                    <AccountSidebar accountHandle={accountHandle} activeLink="order-tracking" onLogout={logout} />

                    <div className="tracking-main">
                        <div className="tracking-top">
                          <div style={{ width: '100%' }}>
                          <p className="tracking-copy">
                            To track your order please enter your Order ID in the box below and press the &quot;Track&quot; button.
                            This was given to you on your receipt and in the confirmation email you should have received.
                          </p>
                        </div>
                      </div>

                      <div className="tracking-panel">
                        <form className="tracking-form" onSubmit={handleTrack} noValidate>
                          <div className="tracking-field">
                            <label>Order ID</label>
                            <input
                              type="text"
                              placeholder="Found in your order confirmation email."
                              value={orderId}
                              onChange={(e) => setOrderId(e.target.value)}
                            />
                          </div>

                          <div className="tracking-field">
                            <label>Billing email</label>
                            <input
                              type="email"
                              placeholder="Email you used during checkout."
                              value={billingEmail}
                              onChange={(e) => setBillingEmail(e.target.value)}
                            />
                          </div>

                          <div className="tracking-action">
                            <button type="submit" className="button fill uppercase" disabled={loadingTrack}>
                              {loadingTrack ? 'Tracking...' : 'Track'}
                            </button>
                          </div>
                        </form>

                        {error && <div className="tracking-message error">{error}</div>}

                        {result && (
                          <div className="tracking-result">
                            <h3 className="tracking-result-title">Tracked Order #{result.id}</h3>

                            <div className="tracking-result-grid">
                              <div className="tracking-result-item">
                                <span>Status</span>
                                <strong className="tracking-result-status">{result.status}</strong>
                              </div>
                              <div className="tracking-result-item">
                                <span>Placed</span>
                                <strong>{result.dateLabel}</strong>
                              </div>
                              <div className="tracking-result-item">
                                <span>Total</span>
                                <strong>{result.totalLabel}</strong>
                              </div>
                              <div className="tracking-result-item">
                                <span>Billing Email</span>
                                <strong>{result.billingEmail || billingEmail}</strong>
                              </div>
                            </div>

                            <div className="tracking-result-actions">
                              <Link href={`/orders/${result.id}`} className="button fill uppercase">Open Order</Link>
                              <Link href="/orders" className="button stroke uppercase">View All Orders</Link>
                            </div>
                          </div>
                        )}
                      </div>
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
