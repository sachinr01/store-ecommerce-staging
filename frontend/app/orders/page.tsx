'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Header from '../components/Header';
import Footer from '../components/Footer';
import AccountSidebar from '../components/AccountSidebar';
import { getMyOrders, type OrderSummary } from '../lib/api';
import { useAuth } from '../lib/authContext';
import { formatPrice } from '../lib/price';

type OrderCard = {
  id: number;
  status: string;
  statusLabel: string;
  dateLabel: string;
  totalLabel: string;
  items: string[];
};

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
  if (s.includes('pending')) return 'pending';
  return s;
}

function toTitleCase(value: string) {
  if (!value) return 'Pending';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function OrdersPage() {
  const { user, isLoggedIn, isLoading, logout } = useAuth();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    let active = true;
    const loadOrders = async () => {
      setLoading(true);
      setError('');
      setNeedsLogin(false);

      try {
        const data = await getMyOrders();
        if (!active) return;
        setOrders(data || []);
      } catch (err) {
        if (!active) return;
        const msg = err instanceof Error ? err.message : 'Failed to load orders.';
        setError(msg);
        if (msg.includes('401') || msg.toLowerCase().includes('login')) {
          setNeedsLogin(true);
        }
      } finally {
        if (!active) return;
        setLoading(false);
      }
    };

    void loadOrders();

    return () => {
      active = false;
    };
  }, []);

  const accountHandle = user?.username ? `@${user.username}` : user?.email || '@account';

  const cards: OrderCard[] = useMemo(() => (
    (orders || []).map((o) => {
      const status = normalizeStatus(o.order_status || '');
      return {
        id: Number(o.order_id),
        status,
        statusLabel: toTitleCase(status),
        dateLabel: formatDate(o.order_date || ''),
        totalLabel: o.total ? formatPrice(Number(o.total)) : formatPrice(0),
        items: (o.items || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      };
    })
  ), [orders]);

  return (
    <>
      <Header />
      <div className="dima-main orders-account-page">
        <section className="section">
          <div className="page-section-content overflow-hidden">
            <div className="container">
              {isLoading ? (
                <p className="orders-loading">Loading...</p>
              ) : !isLoggedIn || !user || needsLogin ? (
                <div className="orders-empty">
                  Please log in to view your orders.
                  <div className="orders-empty-actions">
                    <Link className="btn-view-product btn-view-product--inline" href="/my-account">Login / Register</Link>
                  </div>
                </div>
              ) : (
                <div className="account-shell">
                  <div className="account-layout">
                    <AccountSidebar accountHandle={accountHandle} activeLink="orders" onLogout={logout} />

                    <div className="orders-account-main">
                      <div className="orders-account-top" />

                      <div className="orders-section">
                        {cards.length > 0 && (
                          <>
                            <h3 className="orders-section-title">Orders</h3>
                            <p className="orders-section-copy">
                              You currently have {cards.length} order{cards.length === 1 ? '' : 's'} in your account.
                            </p>
                          </>
                        )}

                        {loading && <div className="orders-empty">Loading your orders...</div>}

                        {!loading && error && !needsLogin && (
                          <div className="orders-error">{error}</div>
                        )}

                        {!loading && !error && cards.length === 0 && (
                          <div className="orders-empty-panel">
                            <div className="orders-empty-text">No order has been made yet.</div>
                            <Link className="btn-view-product btn-view-product--inline" href="/shop">Browse Products</Link>
                          </div>
                        )}

                        {!loading && !error && cards.length > 0 && (
                          <div className="orders-table">
                            <div className="orders-head">
                              <div className="orders-head-item">Order</div>
                              <div className="orders-head-item">Date</div>
                              <div className="orders-head-item">Status</div>
                              <div className="orders-head-item">Total</div>
                              <div className="orders-head-item">Actions</div>
                            </div>

                            {cards.map((order) => {
                              const showPendingActions = order.status === 'pending';
                              return (
                                <div key={order.id} className="orders-row">
                                  <div className="orders-row-id">#{order.id}</div>
                                  <div className="orders-row-value">{order.dateLabel}</div>
                                  <div className={`orders-row-status ${order.status}`}>{order.statusLabel}</div>
                                  <div className="orders-row-value">
                                    {order.totalLabel} for {order.items.length || 1} item{order.items.length === 1 ? '' : 's'}
                                  </div>
                                  <div className="orders-actions">
                                    {showPendingActions && (
                                      <Link href={`/orders/${order.id}`} className="btn-view-product">Pay</Link>
                                    )}
                                    <Link href={`/orders/${order.id}`} className="btn-view-product">View</Link>
                                    {showPendingActions && (
                                      <Link href={`/orders/${order.id}`} className="btn-view-product">Cancel</Link>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
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
