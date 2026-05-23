'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useCart } from '../lib/cartContext';
import {
  authGoogleLogin,
  authForgotPassword,
  authLogin,
  authResetPassword,
  authRegister,
  getRecentOrderAddresses,
  getActiveCoupon,
  applyCoupon,
  removeCoupon,
  type AuthUser,
  type AuthUserResponse,
  type RecentOrderAddress,
  type AppliedCoupon,
} from '../lib/api';
import { useAuth } from '../lib/authContext';
import { formatPrice } from '../lib/price';
import { usePlaceholderImage } from '../lib/siteSettingsContext';
import Script from 'next/script';
declare global {
  interface Window {
    Razorpay: RazorpayConstructor;
    google?: {
      accounts?: {
        id?: {
          initialize: (config: { client_id: string; callback: (response: { credential?: string }) => void }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
          prompt: () => void;
          cancel?: () => void;
        };
      };
    };
  }
}

interface RazorpayInstance {
  open: () => void;
}

interface RazorpayConstructor {
  new (options: Record<string, unknown>): RazorpayInstance;
}

const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

// ─── Types ────────────────────────────────────────────────────────────────────

type AddressFields = {
  firstName: string;
  lastName: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postcode: string;
  phone: string;
  email: string;
};

const emptyAddress: AddressFields = {
  firstName: '', lastName: '', company: '',
  address1: '', address2: '', city: '',
  state: '', postcode: '', phone: '', email: '',
};

const INDIA_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
];

// A "previous order address" card shown in the UI
type PreviousAddressCard = {
  key: string;
  name: string;
  phone: string;
  lines: string[];
  raw: Omit<AddressFields, 'email'>;
};

function recentToCard(row: RecentOrderAddress, index: number): PreviousAddressCard {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  const line1 = [row.address_line1, row.address_line2].filter(Boolean).join(', ').trim();
  const location = [row.city, row.state_name, row.zipcode].filter(Boolean).join(', ').trim();
  return {
    key: `${row.address_id}-${index}`,
    name,
    phone: row.phone || '',
    lines: [line1, location].filter(Boolean),
    raw: {
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      company: '',
      address1: row.address_line1 || '',
      address2: row.address_line2 || '',
      city: row.city || '',
      state: row.state_name || '',
      postcode: row.zipcode || '',
      phone: row.phone || '',
    },
  };
}

// Deduplicate address cards by address1+city+postcode
function deduplicateCards(cards: PreviousAddressCard[]): PreviousAddressCard[] {
  const seen = new Set<string>();
  return cards.filter((c) => {
    const sig = `${c.raw.address1}|${c.raw.city}|${c.raw.postcode}`.toLowerCase();
    if (!sig.replace(/\|/g, '').trim()) return false; // drop blank cards immediately
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}

export default function CheckoutPage() {
  const { items, total, clearCart, refresh } = useCart();
  const router = useRouter();
  const { isLoggedIn, setUser } = useAuth();
  const PLACEHOLDER = usePlaceholderImage();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const regGoogleRef = useRef<HTMLDivElement | null>(null);

  // ─── UI state ───────────────────────────────────────────────────────────────
  const [showLogin, setShowLogin] = useState(false);
  const [showCoupon, setShowCoupon] = useState(false);
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleScriptReady, setGoogleScriptReady] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [showForgotRecovery, setShowForgotRecovery] = useState(false);
  const [showResetRecovery, setShowResetRecovery] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');

  // ─── Register modal state ────────────────────────────────────────────────────
  const [showRegister, setShowRegister] = useState(false);
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  // ─── Coupon state ────────────────────────────────────────────────────────────
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponMsg, setCouponMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [showPayment, setShowPayment] = useState(false);
  const [terms, setTerms] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ─── Previous order addresses ───────────────────────────────────────────────
  const [prevShippingCards, setPrevShippingCards] = useState<PreviousAddressCard[]>([]);
  const [prevBillingCards, setPrevBillingCards] = useState<PreviousAddressCard[]>([]);
  const [loadingPrev, setLoadingPrev] = useState(false);
  // null = "enter new address" / no card selected
  const [selectedShippingKey, setSelectedShippingKey] = useState<string | null>(null);
  const [selectedBillingKey, setSelectedBillingKey] = useState<string | null>(null);

  // ─── Form state ─────────────────────────────────────────────────────────────
  const [contactFirstName, setContactFirstName] = useState('');
  const [contactLastName, setContactLastName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [shipForm, setShipForm] = useState<AddressFields>({ ...emptyAddress });
  const [billForm, setBillForm] = useState<AddressFields>({ ...emptyAddress });

  // added by sumit
  const [shippingCost, setShippingCost] = useState(0);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [deliveryDays, setDeliveryDays] = useState("");


  const handleLoginSuccess = useCallback(async (payload: AuthUser | AuthUserResponse | null | undefined) => {
    setUser(payload ?? null);
    await refresh();
    setLoginError('');
    setLoginUsername('');
    setLoginPassword('');
    setShowLogin(false);
  }, [refresh, setUser]);

  const closeForgotRecovery = useCallback(() => {
    setShowForgotRecovery(false);
    setForgotIdentifier('');
    setForgotLoading(false);
    setForgotError('');
    setForgotSuccess('');
  }, []);

  const closeResetRecovery = useCallback(() => {
    setShowResetRecovery(false);
    setResetToken('');
    setResetNewPassword('');
    setResetConfirmPassword('');
    setResetLoading(false);
    setResetError('');
    setResetSuccess('');
  }, []);

  const openForgotRecovery = useCallback(() => {
    setShowLogin(true);
    setShowForgotRecovery(true);
    setShowResetRecovery(false);
    setForgotIdentifier(loginUsername.trim());
    setForgotError('');
    setForgotSuccess('');
    setResetError('');
    setResetSuccess('');
  }, [loginUsername]);

  const handleRegister = async () => {
    setRegError('');
    setRegSuccess('');
    if (!regUsername.trim() || !regEmail.trim() || !regPassword.trim()) {
      setRegError('All fields are required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim())) {
      setRegError('Please enter a valid email address.');
      return;
    }
    if (regPassword.length < 6) {
      setRegError('Password must be at least 6 characters.');
      return;
    }
    setRegLoading(true);
    try {
      const res = await authRegister(regUsername.trim(), regEmail.trim(), regPassword);
      if (res.success) {
        // Fetch the actual session user so AuthContext reflects the new login
        const me = await fetch('/store/api/auth/me', { credentials: 'include' }).then(r => r.json());
        if (me.success && me.data?.isLoggedIn && me.data.user) {
          setUser(me.data.user);
        }
        await refresh();
        setRegSuccess('Account created! You are now logged in.');
        setRegUsername('');
        setRegEmail('');
        setRegPassword('');
        setTimeout(() => {
          setShowRegister(false);
          setRegSuccess('');
        }, 1500);
      } else {
        setRegError(res.message || 'Registration failed.');
      }
    } catch {
      setRegError('Could not connect to the server.');
    } finally {
      setRegLoading(false);
    }
  };

  const handleForgotRecovery = async () => {
    const value = forgotIdentifier.trim();
    if (!value) {
      setForgotError('Please enter your username or email address.');
      return;
    }

    setForgotLoading(true);
    setForgotError('');
    setForgotSuccess('');

    try {
      const res = await authForgotPassword(value);
      if (res.success) {
        setForgotSuccess(res.message || 'A password reset link has been sent.');
        setForgotIdentifier('');
      } else {
        setForgotError(res.message || 'Unable to process your request.');
      }
    } catch {
      setForgotError('Could not connect to the server.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetRecovery = async () => {
    if (!resetToken) {
      setResetError('This reset link is invalid or missing its token.');
      return;
    }
    if (!resetNewPassword || !resetConfirmPassword) {
      setResetError('Please enter and confirm your new password.');
      return;
    }
    if (resetNewPassword.length < 6) {
      setResetError('Password must be at least 6 characters long.');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setResetError('Passwords do not match.');
      return;
    }

    setResetLoading(true);
    setResetError('');
    setResetSuccess('');

    try {
      const res = await authResetPassword(resetToken, resetNewPassword, resetConfirmPassword);
      if (res.success) {
        setResetSuccess(res.message || 'Password updated successfully.');
        setResetNewPassword('');
        setResetConfirmPassword('');
        setTimeout(() => {
          closeResetRecovery();
          router.replace('/checkout?login=1');
        }, 1800);
      } else {
        setResetError(res.message || 'Unable to reset password.');
      }
    } catch {
      setResetError('Could not connect to the server.');
    } finally {
      setResetLoading(false);
    }
  };

  const handlePasswordLogin = async () => {
    if (!loginUsername.trim() || !loginPassword.trim()) {
      setLoginError('Please enter your username/email and password.');
      return;
    }

    setLoginLoading(true);
    setLoginError('');

    try {
      const res = await authLogin(loginUsername.trim(), loginPassword);
      if (res.success && res.data) {
        await handleLoginSuccess(res.data);
      } else {
        setLoginError(res.message || 'Login failed.');
      }
    } catch {
      setLoginError('Could not connect to the server.');
    } finally {
      setLoginLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === '1') {
      setShowLogin(true);
    }
    const resetParam = params.get('reset')?.trim() || '';
    if (resetParam) {
      setShowLogin(true);
      setShowResetRecovery(true);
      setResetToken(resetParam);
      setShowForgotRecovery(false);
      return;
    }
    if (params.get('forgot') === '1') {
      setShowLogin(true);
      setShowForgotRecovery(true);
    }
  }, []);

  const handleGoogleLogin = useCallback(async (credential: string) => {
    if (!credential) {
      setLoginError('Google did not return a sign-in credential.');
      return;
    }

    setGoogleLoading(true);
    setLoginError('');

    try {
      const res = await authGoogleLogin(credential);
      if (res.success && res.data) {
        await handleLoginSuccess(res.data);
      } else {
        setLoginError(res.message || 'Google sign-in failed.');
      }
    } catch {
      setLoginError('Could not complete Google sign-in.');
    } finally {
      setGoogleLoading(false);
    }
  }, [handleLoginSuccess]);

  // ─── Google button for login panel ──────────────────────────────────────────
  useEffect(() => {
    if (!showLogin) return;
    if (!GOOGLE_CLIENT_ID) {
      setLoginError('Google sign-in is not configured for this environment.');
      return;
    }

    const tryRender = () => {
      if (!googleButtonRef.current || !window.google?.accounts?.id) return false;
      const w = googleButtonRef.current.offsetWidth || 400;
      const google = window.google.accounts.id;
      googleButtonRef.current.innerHTML = '';
      google.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: { credential?: string }) => {
          if (response.credential) {
            void handleGoogleLogin(response.credential);
          } else {
            setLoginError('Google sign-in did not return a credential.');
          }
        },
      });
      google.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        width: w,
        logo_alignment: 'left',
      });
      return true;
    };

    if (googleScriptReady) {
      tryRender();
    } else {
      // Script not ready yet — poll until it is
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          tryRender();
        }
      }, 200);
      return () => clearInterval(interval);
    }

    return () => {
      if (googleButtonRef.current) googleButtonRef.current.innerHTML = '';
    };
  }, [showLogin, googleScriptReady, handleGoogleLogin]);

  // Load previous order addresses for logged-in users
  useEffect(() => {
    if (!isLoggedIn) return;
    let active = true;

    const load = async () => {
      setLoadingPrev(true);
      try {
        const rows = await getRecentOrderAddresses();
        if (!active) return;

        const shippingRows = rows.filter((r) => r.address_billing !== 'yes');
        const billingRows = rows.filter((r) => r.address_billing === 'yes');

        const shippingCards = deduplicateCards(shippingRows.map((r, i) => recentToCard(r, i)));
        const billingCards = deduplicateCards(billingRows.map((r, i) => recentToCard(r, i)));

        // Only set cards that actually have address data (filter out empty rows)
        const validShipping = shippingCards.filter((c) => c.raw.address1.trim());
        const validBilling = billingCards.filter((c) => c.raw.address1.trim());

        setPrevShippingCards(validShipping);
        setPrevBillingCards(validBilling);

        // Auto-select the most recent if available
        if (validShipping.length > 0) setSelectedShippingKey(validShipping[0].key);
        if (validBilling.length > 0) setSelectedBillingKey(validBilling[0].key);
      } catch {
        // No previous orders — first-time user — show blank forms
      } finally {
        if (active) setLoadingPrev(false);
      }
    };

    void load();
    return () => { active = false; };
  }, [isLoggedIn]);

  // ─── Load active coupon — re-runs whenever cart items change ─────────────────
  // This ensures the discount shown is always live: if the user removes a product
  // that was the only eligible item for the coupon, the discount clears instantly
  // instead of staying stale until Place Order fails server-side.
  useEffect(() => {
    getActiveCoupon().then((c) => {
      if (c) {
        setAppliedCoupon(c);
        setCouponInput(c.code);
        setShowCoupon(true);
      } else {
        // Server said coupon is no longer valid for the current cart — clear it
        setAppliedCoupon(null);
      }
    }).catch(() => { });
  }, [items]); // <-- re-run on every cart change

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponLoading(true);
    setCouponMsg(null);
    const data = await applyCoupon(couponInput.trim());
    setCouponLoading(false);
    if (data.success && data.data) {
      setAppliedCoupon(data.data);
      setCouponMsg({ text: `Coupon "${data.data.code}" applied!`, ok: true });
    } else {
      setAppliedCoupon(null);
      setCouponMsg({ text: data.message || 'Invalid coupon.', ok: false });
    }
  };

  const handleRemoveCoupon = async () => {
    await removeCoupon();
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponMsg(null);
  };

  // ─── Discount calculation ────────────────────────────────────────────────────
  // When include_categories is set, the server returns an eligibleSubtotal
  // (sum of matching items only). We calculate the discount on that base so
  // the Order Summary shows the correct partial discount amount.
  const discount = appliedCoupon?.discount ?? 0;

  // shippingCost added by sumit
  const orderTotal = Math.max(0, total - discount + shippingCost);

  // ─── Resolved addresses ─────────────────────────────────────────────────────
  const resolvedShipping = useMemo<AddressFields>(() => {
    if (selectedShippingKey) {
      const card = prevShippingCards.find((c) => c.key === selectedShippingKey);
      if (card) return { ...card.raw, email: contactEmail, phone: card.raw.phone || contactPhone };
    }
    return { ...shipForm, email: contactEmail, phone: shipForm.phone || contactPhone };
  }, [selectedShippingKey, prevShippingCards, shipForm, contactEmail, contactPhone]);

  const resolvedBilling = useMemo<AddressFields>(() => {
    if (billingSameAsShipping) return resolvedShipping;
    if (selectedBillingKey) {
      const card = prevBillingCards.find((c) => c.key === selectedBillingKey);
      if (card) return { ...card.raw, email: contactEmail, phone: card.raw.phone || contactPhone };
    }
    return { ...billForm, email: contactEmail, phone: billForm.phone || contactPhone };
  }, [billingSameAsShipping, selectedBillingKey, prevBillingCards, billForm, resolvedShipping, contactEmail, contactPhone]);

  // ─── Validation ─────────────────────────────────────────────────────────────
  const validate = (withTerms = true) => {
    const e: Record<string, string> = {};

    if (!contactFirstName.trim()) e.contactFirstName = 'Required';
    if (!contactLastName.trim()) e.contactLastName = 'Required';
    if (!contactEmail.trim()) {
      e.contactEmail = 'Required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      e.contactEmail = 'Enter a valid email address';
    }
    if (!contactPhone.trim()) {
      e.contactPhone = 'Required';
    } else if (contactPhone.replace(/\D/g, '').length < 10) {
      e.contactPhone = 'Enter a valid 10-digit phone number';
    }

    // Shipping validation
    if (selectedShippingKey) {
      if (!prevShippingCards.find((c) => c.key === selectedShippingKey)) {
        e.shipping = 'Please select a valid shipping address.';
      }
    } else {
      if (!shipForm.firstName.trim()) e.shipFirstName = 'Required';
      if (!shipForm.lastName.trim()) e.shipLastName = 'Required';
      if (!shipForm.phone.trim()) e.shipPhone = 'Required';
      if (!shipForm.address1.trim()) e.shipAddress = 'Required';
      if (!shipForm.city.trim()) e.shipCity = 'Required';
      if (!shipForm.state.trim()) e.shipState = 'Required';
      if (!shipForm.postcode.trim()) e.shipZip = 'Required';
    }

    if (!billingSameAsShipping) {
      if (selectedBillingKey) {
        if (!prevBillingCards.find((c) => c.key === selectedBillingKey)) {
          e.billing = 'Please select a valid billing address.';
        }
      } else {
        if (!billForm.firstName.trim()) e.billFirstName = 'Required';
        if (!billForm.lastName.trim()) e.billLastName = 'Required';
        if (!billForm.phone.trim()) e.billPhone = 'Required';
        if (!billForm.address1.trim()) e.billAddress = 'Required';
        if (!billForm.city.trim()) e.billCity = 'Required';
        if (!billForm.state.trim()) e.billState = 'Required';
        if (!billForm.postcode.trim()) e.billZip = 'Required';
      }
    }

    if (withTerms && !terms) e.terms = 'You must accept the terms & conditions';

    setErrors(e);
    if (Object.keys(e).length > 0) {
      setTimeout(() => {
        document.querySelector('[data-error]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
    return Object.keys(e).length === 0;
  };

  // added by sumit 
  const getShippingRate = useCallback(async () => {
    try {
      const postcode = resolvedShipping.postcode?.trim();

      // Don't call API until valid pincode exists
      if (!postcode || postcode.length < 6) {
        setShippingCost(0);
        return;
      }

      setShippingLoading(true);

      // Calculate total package details from cart items
      const totalWeight = items.reduce((sum, item) => {
        const weight = parseFloat(item.weight || "0");
        return sum + (weight * item.quantity);
      }, 0);

      const maxLength = Math.max(
        ...items.map(item =>
          parseFloat(item.length || "0")
        ),
        1
      );

      const maxBreadth = Math.max(
        ...items.map(item =>
          parseFloat(item.breadth || "0")
        ),
        1
      );

      const totalHeight = items.reduce((sum, item) => {
        const height = parseFloat(item.height || "0");
        return sum + (height * item.quantity);
      }, 0);

      const response = await fetch(
        '/store/api/shipping-rate',
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pincode: postcode,
            weight: totalWeight || 0.5,
            length: maxLength,
            breadth: maxBreadth,
            height: totalHeight || 1,
            cod: paymentMethod === 'cod' ? 1 : 0
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setShippingCost(
          parseFloat(data.rate || "0")
        );

        setDeliveryDays(
            data.etd || ""
        );

      } else {
        setShippingCost(0);
        console.log("Shipping Error:", data.message);
      }

    } catch (err) {
      console.error(
        "Shipping calculation error:",
        err
      );
      setShippingCost(0);
    } finally {
      setShippingLoading(false);
    }
  }, [
      resolvedShipping.postcode,
      items,
      paymentMethod
  ]);

  useEffect(() => {
    getShippingRate();
  }, [getShippingRate]);

  // ─── Place order ────────────────────────────────────────────────────────────
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setPlacing(true);
    setOrderError(null);

    try {
      const shipping = {
        first_name: resolvedShipping.firstName,
        last_name: resolvedShipping.lastName,
        phone: resolvedShipping.phone,
        address: resolvedShipping.address1,
        address_2: resolvedShipping.address2,
        city: resolvedShipping.city,
        state: resolvedShipping.state,
        postcode: resolvedShipping.postcode,
        company: resolvedShipping.company,
      };

      const billing = {
        first_name: resolvedBilling.firstName,
        last_name: resolvedBilling.lastName,
        email: resolvedBilling.email,
        phone: resolvedBilling.phone,
        address: resolvedBilling.address1,
        address_2: resolvedBilling.address2,
        city: resolvedBilling.city,
        state: resolvedBilling.state,
        postcode: resolvedBilling.postcode,
        company: resolvedBilling.company,
      };

      const res = await fetch('/store/api/orders/place', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing,
          shipping,
          payment_method: paymentMethod,
          shipping_cost: shippingCost,
          notes,
          cart_item_ids: items.map((item) => item.cartItemId),
        }),
      });

      const data = await res.json();

      if (data.razorpay) {

        const options = {
          key: data.key,
          amount: data.amount,
          currency: data.currency,
          order_id: data.razorpayOrderId,

          handler: async function (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
            razorpay_signature: string;
          }) {

            const verifyRes = await fetch('/store/api/orders/place', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                billing,
                shipping,
                payment_method: 'razorpay',
                shipping_cost: shippingCost,
                notes,
                cart_item_ids: items.map((item) => item.cartItemId),

                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature
              })
            });

            const verifyData = await verifyRes.json();

            if (verifyData.success) {
              router.push(`/checkout/success?order=${verifyData.data.orderId}`);
            }
          }
        };

        const razor = new window.Razorpay(options);
        razor.open();

        setPlacing(false);
        return;
      }


      if (!res.ok || !data.success) {
        // Coupon was invalidated server-side — show error in coupon box, not near Place Order
        if (data.coupon_error) {
          setAppliedCoupon(null);
          setCouponInput('');
          setCouponMsg({ text: data.message, ok: false });
          setShowCoupon(true);
          setPlacing(false);
          setTimeout(() => {
            document.querySelector('.checkout-coupon-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 50);
          return;
        }
        throw new Error(data.message || 'Order placement failed.');
      }

      try { await clearCart(); } catch { }
      const orderId = data?.data?.orderId;
      router.push(orderId ? `/checkout/success?order=${orderId}` : '/checkout/success');
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'Order placement failed.');
    } finally {
      setPlacing(false);
    }
  };

  // Google button in register modal
  useEffect(() => {
    if (!showRegister || !GOOGLE_CLIENT_ID) return;

    const tryRender = () => {
      if (!regGoogleRef.current || !window.google?.accounts?.id) return false;
      const w = regGoogleRef.current.offsetWidth || 400;
      const google = window.google.accounts.id;
      regGoogleRef.current.innerHTML = '';
      google.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: { credential?: string }) => {
          if (response.credential) {
            void handleGoogleLogin(response.credential);
            setShowRegister(false);
          }
        },
      });
      google.renderButton(regGoogleRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signup_with',
        shape: 'rectangular',
        width: w,
        logo_alignment: 'left',
      });
      return true;
    };

    if (googleScriptReady) {
      tryRender();
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval);
          tryRender();
        }
      }, 200);
      return () => clearInterval(interval);
    }

    return () => {
      if (regGoogleRef.current) regGoogleRef.current.innerHTML = '';
    };
  }, [showRegister, googleScriptReady, handleGoogleLogin]);

  const showCardDetails = false;

  if (items.length === 0 && !placing) {
    return (
      <>
        <Header />
        <div className="dima-main checkout-page">
          <nav className="cart-breadcrumb">
            <Link href="/">Home</Link>
            <span className="cart-breadcrumb-separator">›</span>
            <Link href="/shop">Shop</Link>
            <span className="cart-breadcrumb-separator">›</span>
            <span className="cart-breadcrumb-current">Checkout</span>
          </nav>
          <section className="section">
            <div className="page-section-content overflow-hidden checkout-content">
              <div className="checkout-container checkout-empty">
                <p className="checkout-empty-msg">Your cart is empty.</p>
                <Link href="/shop" className="btn-view-product btn-view-product--inline">Go to Shop</Link>
              </div>
            </div>
          </section>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
      />
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setGoogleScriptReady(true)}
        onError={() => { setLoginError('Google sign-in could not load right now.'); }}
      />
      <Header />
      <div className="dima-main checkout-page">
        <nav className="cart-breadcrumb">
          <Link href="/">Home</Link>
          <span className="cart-breadcrumb-separator">›</span>
          <Link href="/shop">Shop</Link>
          <span className="cart-breadcrumb-separator">›</span>
          <span className="cart-breadcrumb-current">Checkout</span>
        </nav>

        <section className="section">
          <div className="page-section-content overflow-hidden checkout-content">
            <div className="checkout-container">
              <div className="dima-alert dima-alert-info fade in checkout-alert">
                <i className="fa fa-info" />
                <p>Returning customer? <a href="#" onClick={(e) => { e.preventDefault(); setShowLogin((v) => !v); }}>Click here to login</a></p>
              </div>

              <div className="dima-alert dima-alert-info fade in checkout-alert">
                <i className="fa fa-tag" />
                <p>Have a coupon? <a href="#" onClick={(e) => { e.preventDefault(); setShowCoupon((v) => !v); }}>Click here to enter your code</a></p>
              </div>

              {showCoupon && (
                <div className="checkout-coupon-box checkout-box">
                  <div className="checkout-coupon-grid">
                    <div className="field last">
                      <label>Coupon Code</label>
                      <input
                        type="text"
                        placeholder="Coupon Code"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value)}
                        disabled={!!appliedCoupon}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleApplyCoupon(); } }}
                      />
                    </div>
                    {appliedCoupon ? (
                      <button
                        type="button"
                        className="btn-view-product btn-view-product--inline"
                        onClick={handleRemoveCoupon}
                      >
                        Remove
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-view-product btn-view-product--inline"
                        onClick={() => void handleApplyCoupon()}
                        disabled={couponLoading}
                      >
                        {couponLoading ? '...' : 'Apply Coupon'}
                      </button>
                    )}
                  </div>
                  {couponMsg && (
                    <p className={`checkout-coupon-msg ${couponMsg.ok ? 'ok' : 'err'}`}>
                      {couponMsg.text}
                    </p>
                  )}
                </div>
              )}

              {showLogin && (
                <div className="checkout-login-box checkout-box">
                  <p>If you have shopped with us before, please enter your details below. If you are a new customer, continue to the billing and shipping section.</p>
                  <div className="checkout-inline-row">
                    <div className="field">
                      <label>Username or Email</label>
                      <input type="text" placeholder="Username or email" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Password</label>
                      <input type="password" placeholder="Password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
                    </div>
                  </div>
                  <div className="checkout-login-actions">
                    <button type="button" className="btn-view-product btn-view-product--inline" onClick={() => void handlePasswordLogin()} disabled={loginLoading}>
                      {loginLoading ? 'Logging in...' : 'Login'}
                    </button>
                    <button
                      type="button"
                      className="lost-pass"
                      onClick={() => {
                        openForgotRecovery();
                      }}
                    >
                      Lost Password?
                    </button>
                  </div>
                  {loginError && <p className="checkout-auth-feedback error">{loginError}</p>}
                  <div className="checkout-google-wrap">
                    <div className="checkout-auth-divider"><span>or</span></div>
                    <p className="checkout-google-hint">
                      Sign in with Google to reuse your saved account and checkout details.
                    </p>
                    <div ref={googleButtonRef} className="checkout-google-button" />
                    {googleLoading && <p className="checkout-auth-feedback">Completing Google sign-in...</p>}
                  </div>
                </div>
              )}

              <form onSubmit={handlePlaceOrder} noValidate className="form-small form">
                <div className="checkout-grid">
                  <div className="checkout-main">

                    {/* ── Contact Information ──────────────────────────────── */}
                    <h4 className="checkout-section-title">Contact Information</h4>
                    <div className="checkout-inline-row">
                      <div className="field">
                        <label className="required">First Name</label>
                        <input type="text" placeholder="First Name *" value={contactFirstName} onChange={(e) => setContactFirstName(e.target.value)} aria-label="First Name" />
                        {errors.contactFirstName && <span data-error className="csp-field-error">{errors.contactFirstName}</span>}
                      </div>
                      <div className="field">
                        <label className="required">Last Name</label>
                        <input type="text" placeholder="Last Name *" value={contactLastName} onChange={(e) => setContactLastName(e.target.value)} aria-label="Last Name" />
                        {errors.contactLastName && <span data-error className="csp-field-error">{errors.contactLastName}</span>}
                      </div>
                    </div>
                    <div className="field">
                      <label className="required">Email Address</label>
                      <input type="email" placeholder="Email Address *" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} aria-label="Email Address" />
                      {errors.contactEmail && <span data-error className="csp-field-error">{errors.contactEmail}</span>}
                    </div>
                    <div className="checkout-inline-row">
                      <div className="field">
                        <label className="required">Mobile</label>
                        <input type="tel" placeholder="Mobile *" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} aria-label="Mobile" />
                        {errors.contactPhone && <span data-error className="csp-field-error">{errors.contactPhone}</span>}
                      </div>
                      <div className="field csp-otp-hint">
                        Verify your contact details with simple OTP for smooth delivery process.
                      </div>
                    </div>
                    {!isLoggedIn && (
                    <div className="field">
                      <button
                        type="button"
                        className="checkout-toggle-label"
                        onClick={() => { setShowRegister(true); setRegError(''); setRegSuccess(''); }}
                      >
                        <div className="ck-box" />
                        Create an account?
                      </button>
                    </div>
                    )}

                    {/* ── Shipping Address ─────────────────────────────────── */}
                    <h4 className="checkout-subsection-title">Shipping Address</h4>

                    {isLoggedIn && loadingPrev && (
                      <p className="address-help">Loading your previous addresses...</p>
                    )}

                    {/* Previous order address cards — only shown if user has past orders */}
                    {isLoggedIn && !loadingPrev && prevShippingCards.length > 0 && (
                      <>
                        <p className="address-help">Select a previously used address or enter a new one below.</p>
                        <div className="checkout-prev-addr-grid">
                          {prevShippingCards.map((card) => (
                            <button
                              key={card.key}
                              type="button"
                              className={`address-card ${selectedShippingKey === card.key ? 'selected' : ''}`}
                              onClick={() => setSelectedShippingKey(card.key)}
                            >
                              <span className="address-card-tag">Used before</span>
                              {card.name && <div className="address-card-name">{card.name}</div>}
                              {card.lines.map((line, i) => (
                                <div key={i} className="address-card-line">{line}</div>
                              ))}
                              {card.phone && <div className="address-card-phone">{card.phone}</div>}
                            </button>
                          ))}
                          <button
                            type="button"
                            className={`address-card add-new ${selectedShippingKey === null ? 'selected' : ''}`}
                            onClick={() => setSelectedShippingKey(null)}
                          >
                            <span>+ Enter new address</span>
                          </button>
                        </div>
                      </>
                    )}

                    {errors.shipping && <span data-error className="csp-field-error">{errors.shipping}</span>}

                    {/* Show shipping form when: no previous cards, or user clicked "new address" */}
                    {(!isLoggedIn || (!loadingPrev && (prevShippingCards.length === 0 || selectedShippingKey === null))) && (
                      <>
                        <div className="checkout-inline-row">
                          <div className="field">
                            <label className="required">First Name</label>
                            <input type="text" placeholder="First Name *" value={shipForm.firstName} onChange={(e) => setShipForm((f) => ({ ...f, firstName: e.target.value }))} aria-label="Shipping First Name" />
                            {errors.shipFirstName && <span data-error className="csp-field-error">{errors.shipFirstName}</span>}
                          </div>
                          <div className="field">
                            <label className="required">Last Name</label>
                            <input type="text" placeholder="Last Name *" value={shipForm.lastName} onChange={(e) => setShipForm((f) => ({ ...f, lastName: e.target.value }))} aria-label="Shipping Last Name" />
                            {errors.shipLastName && <span data-error className="csp-field-error">{errors.shipLastName}</span>}
                          </div>
                        </div>
                        <div className="checkout-inline-row">
                          <div className="field">
                            <label>Phone No.</label>
                            <input type="tel" placeholder="Phone No. *" value={shipForm.phone} onChange={(e) => setShipForm((f) => ({ ...f, phone: e.target.value }))} aria-label="Shipping Phone" />
                            {errors.shipPhone && <span data-error className="csp-field-error">{errors.shipPhone}</span>}
                          </div>
                          <div className="field">
                            <label>Company Name</label>
                            <input type="text" placeholder="Company Name (optional)" value={shipForm.company} onChange={(e) => setShipForm((f) => ({ ...f, company: e.target.value }))} />
                          </div>
                        </div>
                        <div className="field">
                          <label className="required">Address</label>
                          <input type="text" placeholder="Address *" value={shipForm.address1} onChange={(e) => setShipForm((f) => ({ ...f, address1: e.target.value }))} aria-label="Address" />
                          {errors.shipAddress && <span data-error className="csp-field-error">{errors.shipAddress}</span>}
                        </div>
                        <div className="field">
                          <input type="text" placeholder="Apartment, suite, unit etc. (optional)" value={shipForm.address2} onChange={(e) => setShipForm((f) => ({ ...f, address2: e.target.value }))} aria-label="Address line 2" />
                        </div>
                        <div className="field">
                          <label className="required">Town / City</label>
                          <input type="text" placeholder="Town / City *" value={shipForm.city} onChange={(e) => setShipForm((f) => ({ ...f, city: e.target.value }))} aria-label="Town / City" />
                          {errors.shipCity && <span data-error className="csp-field-error">{errors.shipCity}</span>}
                        </div>
                        <div className="checkout-inline-row">
                          <div className="field">
                            <label className="required">State</label>
                            <select
                              value={shipForm.state}
                              onChange={(e) => setShipForm((f) => ({ ...f, state: e.target.value }))}
                              aria-label="State"
                            >
                              <option value="">Select State *</option>
                              {INDIA_STATES.map((state) => (
                                <option key={state} value={state}>
                                  {state}
                                </option>
                              ))}
                            </select>
                            {errors.shipState && <span data-error className="csp-field-error">{errors.shipState}</span>}
                          </div>
                          <div className="field">
                            <label className="required">Postcode / Zip</label>
                            <input type="text" placeholder="Postcode / Zip *" value={shipForm.postcode} onChange={(e) => setShipForm((f) => ({ ...f, postcode: e.target.value }))} aria-label="Postcode / Zip" />
                            {errors.shipZip && <span data-error className="csp-field-error">{errors.shipZip}</span>}
                          </div>
                        </div>
                      </>
                    )}

                    {/* ── Billing same as shipping ──────────────────────────── */}
                    <div className="field csp-billing-toggle">
                      <div
                        className="checkout-toggle-label"
                        onClick={() => setBillingSameAsShipping(v => !v)}
                      >
                        <div className={`ck-box ${billingSameAsShipping ? 'checked' : ''}`} />
                        Same as shipping address
                      </div>
                    </div>

                    {/* ── Billing Address ──────────────────────────────────── */}
                    {!billingSameAsShipping && (
                      <div className="checkout-shipping-box">
                        <h5 className="csp-billing-title">Billing Address</h5>

                        {isLoggedIn && !loadingPrev && prevBillingCards.length > 0 && (
                          <>
                            <p className="address-help">Select a previously used billing address or enter a new one.</p>
                            <div className="checkout-prev-addr-grid">
                              {prevBillingCards.map((card) => (
                                <button
                                  key={card.key}
                                  type="button"
                                  className={`address-card ${selectedBillingKey === card.key ? 'selected' : ''}`}
                                  onClick={() => setSelectedBillingKey(card.key)}
                                >
                                  <span className="address-card-tag">Used before</span>
                                  {card.name && <div className="address-card-name">{card.name}</div>}
                                  {card.lines.map((line, i) => (
                                    <div key={i} className="address-card-line">{line}</div>
                                  ))}
                                  {card.phone && <div className="address-card-phone">{card.phone}</div>}
                                </button>
                              ))}
                              <button
                                type="button"
                                className={`address-card add-new ${selectedBillingKey === null ? 'selected' : ''}`}
                                onClick={() => setSelectedBillingKey(null)}
                              >
                                <span>+ Enter new billing address</span>
                              </button>
                            </div>
                          </>
                        )}

                        {errors.billing && <span data-error className="csp-field-error">{errors.billing}</span>}

                        {(!isLoggedIn || (!loadingPrev && (prevBillingCards.length === 0 || selectedBillingKey === null))) && (
                          <>
                            <div className="checkout-inline-row">
                              <div className="field">
                                <label className="required">First Name</label>
                                <input type="text" placeholder="First Name *" value={billForm.firstName} onChange={(e) => setBillForm((f) => ({ ...f, firstName: e.target.value }))} aria-label="Billing First Name" />
                                {errors.billFirstName && <span data-error className="csp-field-error">{errors.billFirstName}</span>}
                              </div>
                              <div className="field">
                                <label className="required">Last Name</label>
                                <input type="text" placeholder="Last Name *" value={billForm.lastName} onChange={(e) => setBillForm((f) => ({ ...f, lastName: e.target.value }))} aria-label="Billing Last Name" />
                                {errors.billLastName && <span data-error className="csp-field-error">{errors.billLastName}</span>}
                              </div>
                            </div>
                            <div className="checkout-inline-row">
                              <div className="field">
                                <label>Phone No.</label>
                                <input type="tel" placeholder="Phone No. *" value={billForm.phone} onChange={(e) => setBillForm((f) => ({ ...f, phone: e.target.value }))} aria-label="Billing Phone" />
                                {errors.billPhone && <span data-error className="csp-field-error">{errors.billPhone}</span>}
                              </div>
                              <div className="field">
                                <label>Company Name</label>
                                <input type="text" placeholder="Company Name (optional)" value={billForm.company} onChange={(e) => setBillForm((f) => ({ ...f, company: e.target.value }))} />
                              </div>
                            </div>
                            <div className="field">
                              <label className="required">Address</label>
                              <input type="text" placeholder="Address *" value={billForm.address1} onChange={(e) => setBillForm((f) => ({ ...f, address1: e.target.value }))} aria-label="Billing Address" />
                              {errors.billAddress && <span data-error className="csp-field-error">{errors.billAddress}</span>}
                            </div>
                            <div className="field">
                              <input type="text" placeholder="Apartment, suite, unit etc. (optional)" value={billForm.address2} onChange={(e) => setBillForm((f) => ({ ...f, address2: e.target.value }))} aria-label="Billing Address line 2" />
                            </div>
                            <div className="field">
                              <label className="required">Town / City</label>
                              <input type="text" placeholder="Town / City *" value={billForm.city} onChange={(e) => setBillForm((f) => ({ ...f, city: e.target.value }))} aria-label="Billing Town / City" />
                              {errors.billCity && <span data-error className="csp-field-error">{errors.billCity}</span>}
                            </div>
                            <div className="checkout-inline-row">
                              <div className="field">
                                <label className="required">State</label>
                                <select
                                  value={billForm.state}
                                  onChange={(e) => setBillForm((f) => ({ ...f, state: e.target.value }))}
                                  aria-label="Billing State"
                                >
                                  <option value="">Select State *</option>
                                  {INDIA_STATES.map((state) => (
                                    <option key={state} value={state}>
                                      {state}
                                    </option>
                                  ))}
                                </select>
                                {errors.billState && <span data-error className="csp-field-error">{errors.billState}</span>}
                              </div>
                              <div className="field">
                                <label className="required">Postcode / Zip</label>
                                <input type="text" placeholder="Postcode / Zip *" value={billForm.postcode} onChange={(e) => setBillForm((f) => ({ ...f, postcode: e.target.value }))} aria-label="Billing Postcode / Zip" />
                                {errors.billZip && <span data-error className="csp-field-error">{errors.billZip}</span>}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    <div className="field last csp-notes-field">
                      <label>Order Notes</label>
                      <textarea rows={4} placeholder="Order notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Order Notes" />
                    </div>
                  </div>

                  {/* ── Side: Order summary + payment ───────────────────────── */}
                  <div className="checkout-side">
                    <div className="box order-products dima-box">
                      <div className="checkout-summary-card">
                        <h4 className="checkout-summary-title">Order Summary</h4>
                        <div className="checkout-summary-row">
                          <span>Cart Subtotal</span>
                          <strong>{formatPrice(total)}</strong>
                        </div>
                        {discount > 0 && (
                          <div className="checkout-summary-row csp-discount-row">
                            <span>Discount ({appliedCoupon?.code})</span>
                            <strong>−{formatPrice(discount)}</strong>
                          </div>
                        )}
                        <div className="checkout-summary-row">
                          <span>Shipping &amp; Handling</span>
                          <strong className="csp-free-shipping"> 
                              {shippingLoading
                                ? 'Calculating...'
                                : shippingCost > 0
                                    ? formatPrice(shippingCost)
                                    : 'Free'}
                          </strong>
                        </div>
                        <div className="checkout-summary-total">
                          <span>Order Total</span>
                          <span>{formatPrice(orderTotal)}</span>
                        </div>
                        

                              {deliveryDays && (
                                  <div className='mt-2'
                                    style={{
                                        fontSize:'12px',
                                        color:'#16a34a'
                                    }}
                                  >
                                      Delivery in {deliveryDays}
                                  </div>
                              )}
                      </div>

                      <div className="checkout-order-items-card">
                        <h4 className="checkout-subsection-title checkout-order-items-title">Your Items</h4>
                        <div className="checkout-order-items">
                          {items.map((item) => (
                            <div key={item.cartItemId} className="checkout-order-item">
                              <img
                                src={item.image || PLACEHOLDER}
                                alt={item.title}
                                className="checkout-order-thumb"
                              />
                              <div className="checkout-order-meta">
                                {item.title}
                                {(item.color || item.size) && (
                                  <span>{[item.color, item.size].filter(Boolean).join(' / ')}</span>
                                )}
                                <span>Qty: {item.quantity}</span>
                              </div>
                              <div className="checkout-order-price">
                                &#8377;{(item.price * item.quantity).toFixed(2)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="checkout-cta">
                        <button
                          type="button"
                          className="btn-view-product btn-view-product--inline"
                          onClick={() => { if (!validate(false)) return; if (!showPayment) setPaymentMethod('cod'); setShowPayment(true); }}
                        >
                          Continue to Payment
                        </button>
                      </div>

                      {showPayment && (
                        <>
                          <h4 className="checkout-subsection-title csp-payment-title">Payment Method</h4>
                          <div className="checkout-payment-list">
                            <div className={`checkout-payment-item ${paymentMethod === 'cod' ? 'selected' : ''}`}>
                              <label className="checkout-payment-label">
                                <input type="radio" name="payment" value="cod" checked={paymentMethod === 'cod'} onChange={(e) => setPaymentMethod(e.target.value)} />
                                <span><strong>Cash on Delivery</strong></span>
                              </label>
                            </div>
                            <div className={`checkout-payment-item ${paymentMethod === 'razorpay' ? 'selected' : ''}`}>
                              <label className="checkout-payment-label">
                                <input
                                  type="radio"
                                  name="payment"
                                  value="razorpay"
                                  checked={paymentMethod === 'razorpay'}
                                  onChange={(e) => setPaymentMethod(e.target.value)}
                                />
                                <span><strong>Razorpay</strong></span>
                              </label>
                            </div>
                          </div>

                          <button type="submit" className="button fill uppercase checkout-submit" disabled={placing}>
                            {placing ? 'Placing Order...' : 'Place Order'}
                          </button>

                          {orderError && <div className="csp-order-error">{orderError}</div>}

                          <div className="field checkout-terms">
                            <div
                              className="csp-terms-row"
                              onClick={() => setTerms(v => !v)}
                            >
                              <div className={`ck-box ${terms ? 'checked' : ''}`} />
                              <span className="csp-terms-link">
                                I&apos;ve read and accept the <a href="#" onClick={e => e.stopPropagation()}>terms &amp; conditions</a>
                              </span>
                            </div>
                            {errors.terms && <span data-error className="csp-field-error csp-terms-error">{errors.terms}</span>}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </section>
      </div>
      {showRegister && (
        <div className="register-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowRegister(false); setRegError(''); setRegSuccess(''); setRegUsername(''); setRegEmail(''); setRegPassword(''); } }}>
          <div className="register-modal">
            <button type="button" className="register-modal-close" onClick={() => { setShowRegister(false); setRegError(''); setRegSuccess(''); setRegUsername(''); setRegEmail(''); setRegPassword(''); }} aria-label="Close">&#x2715;</button>
            <p className="register-modal-title">Register</p>
            <p className="register-modal-sub">Create your account to save details and track orders.</p>
            <div className="register-modal-field">
              <label className="register-modal-label">Username <span>*</span></label>
              <input className="register-modal-input" type="text" placeholder="Username" value={regUsername} onChange={(e) => setRegUsername(e.target.value)} autoComplete="username" />
            </div>
            <div className="register-modal-field">
              <label className="register-modal-label">Email <span>*</span></label>
              <input className="register-modal-input" type="email" placeholder="Email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="register-modal-field">
              <label className="register-modal-label">Password <span>*</span></label>
              <input className="register-modal-input" type="password" placeholder="Password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} autoComplete="new-password" onKeyDown={(e) => { if (e.key === 'Enter') void handleRegister(); }} />
            </div>
            {regError && <p className="register-modal-err">{regError}</p>}
            {regSuccess && <p className="register-modal-success">{regSuccess}</p>}
            <button
              type="button"
              className="btn-view-product register-modal-submit"
              onClick={() => void handleRegister()}
              disabled={regLoading}
            >
              {regLoading ? 'Registering...' : 'Register'}
            </button>
            {GOOGLE_CLIENT_ID && (
              <>
                <div className="register-modal-divider"><span>or</span></div>
                <div ref={regGoogleRef} className="register-modal-google" />
                {googleLoading && <p className="register-modal-google-msg">Completing Google sign-in...</p>}
              </>
            )}
          </div>
        </div>
      )}
      {showForgotRecovery && (
        <div className="register-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { closeForgotRecovery(); } }}>
          <div className="register-modal">
            <button type="button" className="register-modal-close" onClick={closeForgotRecovery} aria-label="Close">&#x2715;</button>
            <p className="register-modal-title">Lost Password?</p>
            <p className="register-modal-sub">Enter your username or email address and we&apos;ll send a secure reset link to your registered email.</p>

            <div className="register-modal-field">
              <label className="register-modal-label">Username or Email <span>*</span></label>
              <input
                className="register-modal-input"
                type="text"
                placeholder="Username or email"
                value={forgotIdentifier}
                onChange={(e) => setForgotIdentifier(e.target.value)}
                autoComplete="username"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleForgotRecovery();
                }}
              />
            </div>

            {forgotError && <p className="register-modal-err">{forgotError}</p>}
            {forgotSuccess && <p className="register-modal-success">{forgotSuccess}</p>}

            <button
              type="button"
              className="btn-view-product checkout-recovery-submit"
              onClick={() => void handleForgotRecovery()}
              disabled={forgotLoading}
            >
              {forgotLoading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <div className="reset-password-foot">
              <button type="button" className="reset-password-foot-link" onClick={closeForgotRecovery}>
                Back to checkout login
              </button>
            </div>
          </div>
        </div>
      )}
      {showResetRecovery && (
        <div className="register-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { closeResetRecovery(); } }}>
          <div className="register-modal">
            <button type="button" className="register-modal-close" onClick={closeResetRecovery} aria-label="Close">&#x2715;</button>
            <p className="register-modal-title">Set a new password</p>
            <p className="register-modal-sub">Choose a strong password and confirm it below. Once saved, you can log in with the new password.</p>

            {!resetToken ? (
              <div className="reset-password-alert">
                This reset link is invalid or incomplete. Please request a new password reset from the checkout page.
              </div>
            ) : (
              <div>
                <div className="register-modal-field">
                  <label className="register-modal-label">New Password <span>*</span></label>
                  <input
                    className="register-modal-input"
                    type="password"
                    placeholder="Enter new password"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    autoComplete="new-password"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleResetRecovery();
                    }}
                  />
                </div>
                <div className="register-modal-field">
                  <label className="register-modal-label">Confirm Password <span>*</span></label>
                  <input
                    className="register-modal-input"
                    type="password"
                    placeholder="Confirm new password"
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleResetRecovery();
                    }}
                  />
                </div>

                {resetError && <p className="register-modal-err">{resetError}</p>}
                {resetSuccess && <p className="register-modal-success">{resetSuccess}</p>}

                <button
                  type="button"
                  className="btn-view-product checkout-recovery-submit"
                  onClick={() => void handleResetRecovery()}
                  disabled={resetLoading}
                >
                  {resetLoading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            )}

            <div className="reset-password-foot">
              <button type="button" className="reset-password-foot-link" onClick={closeResetRecovery}>
                Back to checkout login
              </button>
            </div>
          </div>
        </div>
      )}
      <Footer />
    </>
  );
}
