'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { getMyOrderById, getImageUrl, type OrderDetailResponse } from '../../lib/api';
import { formatPrice } from '../../lib/price';

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function normalizeStatus(status: string) {
  if (!status) return 'pending';
  const s = status.replace('wc-', '').toLowerCase();
  if (s.includes('complete')) return 'delivered';
  if (s.includes('process')) return 'processing';
  if (s.includes('ship')) return 'shipped';
  if (s.includes('pending')) return 'pending';
  return s;
}

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params?.orderId as string | undefined;
  const [data, setData] = useState<OrderDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    setLoading(true);
    setError('');
    setNeedsLogin(false);
    getMyOrderById(orderId)
      .then(res => {
        if (!active) return;
        setData(res);
      })
      .catch(err => {
        if (!active) return;
        const msg = err instanceof Error ? err.message : 'Failed to load order.';
        setError(msg);
        if (msg.includes('401') || msg.toLowerCase().includes('login')) {
          setNeedsLogin(true);
        }
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => { active = false; };
  }, [orderId]);

  const summary = useMemo(() => {
    if (!data?.order) return null;
    const order = data.order;
    const shipNameRaw = [order.ship_first_name, order.ship_last_name].filter(Boolean).join(' ').trim();
    const billingNameRaw = [order.billing_first_name, order.billing_last_name].filter(Boolean).join(' ').trim();
    const name = shipNameRaw || billingNameRaw || order.user_display_name || '';
    const email = order.billing_email || order.user_email || '';
    const phone = order.ship_phone || order.billing_phone || '';
    const shipAddress = [
      order.ship_address_1,
      order.ship_address_2,
      order.ship_city,
      order.ship_state,
      order.ship_postcode,
      order.ship_country,
    ].filter(Boolean).join(', ');
    const billingAddress = [
      order.billing_address_1,
      order.billing_address_2,
      order.billing_city,
      order.billing_state,
      order.billing_postcode,
      order.billing_country,
    ].filter(Boolean).join(', ');
    return {
      id: Number(order.order_id),
      status: normalizeStatus(order.order_status || ''),
      dateLabel: formatDate(order.order_date || ''),
      totalLabel: order.total ? formatPrice(Number(order.total)) : formatPrice(0),
      subtotalLabel: order.subtotal ? formatPrice(Number(order.subtotal)) : formatPrice(0),
      shippingLabel: order.shipping ? formatPrice(Number(order.shipping)) : formatPrice(0),
      payment: order.payment_method || 'cod',
      couponCode: order.coupon_code || null,
      discountLabel: order.coupon_discount ? formatPrice(Number(order.coupon_discount)) : null,
      name,
      email,
      phone,
      address: shipAddress || billingAddress,

      awb: order.awb_code || '',
      courier: order.courier_name || '',
      shippingStatus: order.shipping_status || '',
      shipmentId: order.shipment_id || '',
    };
  }, [data]);

  const statusSteps = useMemo(() => {
    const current = summary?.status || 'pending';
    const all = ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'];
    const map = {
      pending: 0,
      confirmed: 0,
      processing: 1,
      shipped: 2,
      out_for_delivery: 3,
      delivered: 4,
    } as Record<string, number>;
    const activeIndex = map[current] ?? 0;
    return all.map((step, i) => ({
      key: step,
      label: step.replace(/_/g, ' '),
      active: i <= activeIndex,
    }));
  }, [summary]);

  return (
    <>
      <Header />
      <div className="dima-main order-detail-page">
        <nav className="cart-breadcrumb">
          <Link href="/" className="cart-breadcrumb-link">Home</Link>
          <span className="cart-breadcrumb-separator">›</span>
          <Link href="/orders" className="cart-breadcrumb-link">Orders</Link>
          <span className="cart-breadcrumb-separator">›</span>
          <span className="cart-breadcrumb-current">Order #{orderId}</span>
        </nav>
        <div className="order-detail-container">
          <div className="order-detail-wrap">
            <Link href="/orders" className="order-back">{'<- Back to Orders'}</Link>

            {loading && <div className="order-detail-empty">Loading order...</div>}

            {!loading && needsLogin && (
              <div className="order-detail-empty">
                Please log in to view this order.
                <div>
                  <Link className="orders-cta btn-view-product btn-view-product--inline" href="/my-account">Login / Register</Link>
                </div>
              </div>
            )}

            {!loading && !needsLogin && error && (
              <div className="order-detail-error">{error}</div>
            )}

            {!loading && !error && summary && (
              <div className="order-detail-grid">
                <div className="order-detail-main">
                  <div className="order-detail-card order-hero">
                    <div className="order-detail-header">
                      <div>
                        <h1 className="order-detail-title">Order #{summary.id}</h1>
                        <div className="order-detail-meta">Placed on {summary.dateLabel}</div>
                      </div>
                      <span className={`order-detail-status ${summary.status}`}>{summary.status}</span>
                    </div>
                    <div className="order-timeline">
                      {statusSteps.map(step => (
                        <div key={step.key} className={`timeline-step${step.active ? ' active' : ''}`}>
                          <span className="timeline-dot" />
                          <span className="timeline-label">{step.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="order-detail-card">
                    <h3 className="order-detail-subtitle">Items</h3>
                    <div className="order-items-list">
                      {data!.items.map(item => (
                        <div key={item.order_item_id} className="order-item">
                          <div className="order-item-thumb">
                            {item.thumbnail_url ? (
                              <img src={getImageUrl(item.thumbnail_url)} alt={item.order_item_name} />
                            ) : (
                              <span>{(item.order_item_name || 'Item').slice(0, 1).toUpperCase()}</span>
                            )}
                          </div>
                          <div className="order-item-body">
                            <div className="order-item-name">{item.order_item_name}</div>
                            <div className="order-item-meta">
                              Qty: {item.qty ?? 1}
                              {item.color ? ` · Color: ${item.color}` : ''}
                              {item.size ? ` · Size: ${item.size}` : ''}
                            </div>
                          </div>
                          <div className="order-item-price">
                            {formatPrice(Number(item.line_total || 0))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="order-detail-side">
                  <div className="order-detail-card">
                    <h3 className="order-detail-subtitle">Delivery details</h3>
                    <div className="order-summary-grid">
                      <div><strong>Name:</strong> {summary.name || '-'}</div>
                      <div><strong>Phone:</strong> {summary.phone || '-'}</div>
                      <div><strong>Address:</strong> {summary.address || '-'}</div>
                      <div><strong>Email:</strong> {summary.email || '-'}</div>
                    </div>
                  </div>

                  <div className="order-detail-card">
                    <h3 className="order-detail-subtitle">Price details</h3>
                    <div className="order-summary-grid">
                      <div><strong>Subtotal:</strong> {summary.subtotalLabel}</div>
                      <div><strong>Shipping:</strong> {summary.shippingLabel}</div>
                      <div><strong>Total:</strong> {summary.totalLabel}</div>
                      <div><strong>Payment:</strong> {summary.payment}</div>
                    </div>
                  </div>


                  <div className="order-detail-card">
                    <h3 className="order-detail-subtitle">Shipping Details</h3>

                    <div className="order-summary-grid">
                      <div>
                        <strong>Shipping Status:</strong>{' '}
                        <span className={`shipping-badge ${summary.shippingStatus}`}>
                          {summary.shippingStatus || 'Pending'}
                        </span>
                      </div>

                      <div>
                        <strong>Courier:</strong>{' '}
                        {summary.courier || '-'}
                      </div>

                      <div>
                        <strong>AWB Number:</strong>{' '}
                        {summary.awb || '-'}
                      </div>

                      <div>
                        <strong>Shipment ID:</strong>{' '}
                        {summary.shipmentId || '-'}
                      </div>
                    </div>

                    {summary.awb && (
                      <a
                        href={`https://shiprocket.co/tracking/${summary.awb}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="track-order-btn btn-view-product btn-view-product--inline na-view-all-btn mt-3"
                      >
                        Track Order
                      </a>
                    )}
                  </div>

                  
                </div>
              </div>
            )}

              <div className="order-detail-side">
                <div className="order-detail-card">
                  <h3 className="order-detail-subtitle">Delivery details</h3>
                  <div className="order-summary-grid">
                    <div><strong>Name:</strong> {summary.name || '-'}</div>
                    <div><strong>Phone:</strong> {summary.phone || '-'}</div>
                    <div><strong>Address:</strong> {summary.address || '-'}</div>
                    <div><strong>Email:</strong> {summary.email || '-'}</div>
                  </div>
                </div>

                <div className="order-detail-card">
                  <h3 className="order-detail-subtitle">Price details</h3>
                  <div className="order-summary-grid">
                    <div><strong>Subtotal:</strong> {summary.subtotalLabel}</div>
                    {summary.couponCode && summary.discountLabel && (
                      <div className="order-discount-row">
                        <strong>Discount ({summary.couponCode}):</strong>
                        <span>−{summary.discountLabel}</span>
                      </div>
                    )}
                    <div><strong>Shipping:</strong> {summary.shippingLabel}</div>
                    <div><strong>Total:</strong> {summary.totalLabel}</div>
                    <div><strong>Payment:</strong> {summary.payment}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
