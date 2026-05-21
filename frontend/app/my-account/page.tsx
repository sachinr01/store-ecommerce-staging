'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import Header from '../components/Header';
import Footer from '../components/Footer';
import AccountSidebar from '../components/AccountSidebar';
import { authGoogleLogin, authLogin, authRegister, authForgotPassword, type AuthUser } from '../lib/api';
import { useCart } from '../lib/cartContext';
import { useAuth } from '../lib/authContext';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
          prompt: () => void;
          cancel?: () => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

type GoogleButtonText = 'signin_with' | 'signup_with';

export default function MyAccountPage() {
  const { user, isLoggedIn, isLoading, setUser, logout } = useAuth();
  const { refresh } = useCart();

  const loginGoogleRef = useRef<HTMLDivElement | null>(null);
  const registerGoogleRef = useRef<HTMLDivElement | null>(null);

  const [login, setLogin] = useState({ username: '', password: '', remember: false });
  const [reg, setReg] = useState({ username: '', email: '', password: '' });
  const [loginErr, setLoginErr] = useState('');
  const [regErr, setRegErr] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regSuccess, setRegSuccess] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [googleScriptReady, setGoogleScriptReady] = useState(false);
  const [googleError, setGoogleError] = useState('');

  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  const setL = (k: keyof typeof login) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setLogin((f) => ({
        ...f,
        [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
      }) as typeof login);

  const setR = (k: keyof typeof reg) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setReg((f) => ({ ...f, [k]: e.target.value }));

  const syncLoggedInUser = useCallback(async (fallbackUser: AuthUser) => {
    try {
      const me = await fetch('/store/api/auth/me', { credentials: 'include' }).then((r) => r.json());
      if (me.success && me.data?.isLoggedIn && me.data.user) {
        setUser(me.data.user);
      } else {
        setUser(fallbackUser);
      }
      await refresh();
    } catch {
      setUser(fallbackUser);
      await refresh();
    }
  }, [refresh, setUser]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!login.username || !login.password) {
      setLoginErr('Please enter username and password.');
      return;
    }

    setLoginErr('');
    setLoginLoading(true);

    try {
      const res = await authLogin(login.username, login.password);
      if (res.success && res.data) {
        await syncLoggedInUser(res.data.user);
      } else {
        setLoginErr(res.message || 'Login failed.');
      }
    } catch {
      setLoginErr('Could not connect to server.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!reg.username || !reg.email || !reg.password) {
      setRegErr('All fields are required.');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(reg.email)) {
      setRegErr('Enter a valid email address.');
      return;
    }

    setRegErr('');
    setRegLoading(true);

    try {
      const res = await authRegister(reg.username, reg.email, reg.password);
      if (res.success) {
        setReg({ username: '', email: '', password: '' });
        const me = await fetch('/store/api/auth/me', { credentials: 'include' }).then((r) => r.json());
        if (me.success && me.data?.isLoggedIn && me.data.user) {
          setUser(me.data.user);
          await refresh();
        } else {
          setRegSuccess('Account created! You can now log in.');
        }
      } else {
        setRegErr(res.message || 'Registration failed.');
      }
    } catch {
      setRegErr('Could not connect to server.');
    } finally {
      setRegLoading(false);
    }
  };

  const handleGoogleCredential = useCallback(async (credential: string) => {
    if (!credential) {
      setGoogleError('Google did not return a sign-in credential.');
      return;
    }

    setGoogleError('');

    try {
      const res = await authGoogleLogin(credential);
      if (res.success && res.data) {
        await syncLoggedInUser(res.data.user);
      } else {
        setGoogleError(res.message || 'Google sign-in failed.');
      }
    } catch {
      setGoogleError('Could not complete Google sign-in.');
    }
  }, [syncLoggedInUser]);

  const renderGoogleButton = useCallback((container: HTMLDivElement | null, text: GoogleButtonText) => {
    if (!container) return false;
    if (!GOOGLE_CLIENT_ID) {
      setGoogleError('Google sign-in is not configured for this environment.');
      return false;
    }

    const google = window.google?.accounts?.id;
    if (!google) return false;

    const width = container.offsetWidth || 400;
    container.innerHTML = '';
    setGoogleError('');

    try {
      google.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: { credential?: string }) => {
          if (response.credential) {
            void handleGoogleCredential(response.credential);
          } else {
            setGoogleError('Google sign-in did not return a credential.');
          }
        },
      });

      google.renderButton(container, {
        theme: 'outline',
        size: 'large',
        text,
        shape: 'rectangular',
        width,
        logo_alignment: 'left',
      });
      return true;
    } catch {
      setGoogleError('Google sign-in could not be initialized.');
      return false;
    }
  }, [handleGoogleCredential]);

  useEffect(() => {
    if (showRegister) return;

    const container = loginGoogleRef.current;
    if (!container) return;

    if (!GOOGLE_CLIENT_ID) {
      setGoogleError('Google sign-in is not configured for this environment.');
      return;
    }

    const tryRender = () => renderGoogleButton(container, 'signin_with');

    if (googleScriptReady) {
      if (!tryRender()) {
        const interval = setInterval(() => {
          if (window.google?.accounts?.id) {
            clearInterval(interval);
            tryRender();
          }
        }, 200);
        return () => clearInterval(interval);
      }
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
      container.innerHTML = '';
    };
  }, [googleScriptReady, renderGoogleButton, showRegister]);

  useEffect(() => {
    if (!showRegister) return;

    const container = registerGoogleRef.current;
    if (!container) return;

    if (!GOOGLE_CLIENT_ID) {
      setGoogleError('Google sign-in is not configured for this environment.');
      return;
    }

    const tryRender = () => renderGoogleButton(container, 'signup_with');

    if (googleScriptReady) {
      if (!tryRender()) {
        const interval = setInterval(() => {
          if (window.google?.accounts?.id) {
            clearInterval(interval);
            tryRender();
          }
        }, 200);
        return () => clearInterval(interval);
      }
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
      container.innerHTML = '';
    };
  }, [googleScriptReady, renderGoogleButton, showRegister]);

  const openForgotModal = () => {
    setForgotIdentifier(login.username.trim());
    setForgotError('');
    setForgotSuccess('');
    setShowForgotModal(true);
  };

  const closeForgotModal = () => {
    setShowForgotModal(false);
    setForgotIdentifier('');
    setForgotLoading(false);
    setForgotError('');
    setForgotSuccess('');
  };

  const handleForgotPassword = async () => {
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

  const accountName = user?.displayName || user?.username || 'Guest';
  const accountHandle = user?.username ? `@${user.username}` : user?.email || '@account';
  const googleNotice = GOOGLE_CLIENT_ID
    ? googleError
    : 'Google sign-in is not configured for this environment.';

  return (
    <>
      <Header />
      <div className="dima-main account-page">
        <section className="section">
          <div className="page-section-content overflow-hidden">
            <div className="container">
              {isLoading ? (
                <p className="account-loading">Loading...</p>
              ) : isLoggedIn && user ? (
                <div className="account-shell">
                  <div className="account-layout">
                    <AccountSidebar accountHandle={accountHandle} activeLink="dashboard" onLogout={logout} />

                    <div className="account-main">
                      <div className="account-top">
                        <div className="account-copy">
                          <p className="account-greeting">
                            Hello {accountName} (not {accountName}? <button className="account-inline-action" onClick={logout}>Log out</button>)
                          </p>
                          <p className="account-description">
                            From your account dashboard you can view your recent orders, manage your shipping and billing addresses,
                            and edit your password and account details.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="account-auth-grid">
                  {!showRegister ? (
                    <div className="account-auth-card">
                      <h4 className="box-titel">Login</h4>
                      <form className="form-small form" onSubmit={handleLogin} noValidate>
                        <div className="field">
                          <label className="required">Username or Email</label>
                          <input type="text" placeholder="Username or email" value={login.username} onChange={setL('username')} />
                        </div>
                        <div className="field">
                          <label className="required">Password</label>
                          <input type="password" placeholder="Password" value={login.password} onChange={setL('password')} />
                        </div>
                        {loginErr && <p className="account-err">{loginErr}</p>}
                        <div className="field last">
                          <button type="submit" className="btn-view-product btn-view-product--inline" disabled={loginLoading}>
                            {loginLoading ? 'Logging in...' : 'Login'}
                          </button>
                          <button type="button" className="lost-pass" onClick={openForgotModal}>
                            Lost Password?
                          </button>
                        </div>
                      </form>

                      <div className="checkout-google-wrap">
                        <div className="checkout-auth-divider">or</div>
                        <div ref={loginGoogleRef} className="checkout-google-button" />
                        {googleNotice && <p className="account-err">{googleNotice}</p>}
                      </div>

                      <p className="account-switch-hint">
                        Don&apos;t have an account?{' '}
                        <button
                          type="button"
                          onClick={() => setShowRegister(true)}
                          className="account-switch-btn"
                        >
                          Create New Account
                        </button>
                      </p>
                    </div>
                  ) : (
                    <div className="account-auth-card">
                      <h4 className="box-titel">Register</h4>
                      <form className="form-small form" onSubmit={handleRegister} noValidate>
                        <div className="field">
                          <label className="required">Username</label>
                          <input type="text" placeholder="Username" value={reg.username} onChange={setR('username')} />
                        </div>
                        <div className="field">
                          <label className="required">Email</label>
                          <input type="email" placeholder="Email" value={reg.email} onChange={setR('email')} />
                        </div>
                        <div className="field">
                          <label className="required">Password</label>
                          <input type="password" placeholder="Password" value={reg.password} onChange={setR('password')} />
                        </div>
                        {regErr && <p className="account-err">{regErr}</p>}
                        {regSuccess && <p className="account-success">{regSuccess}</p>}
                        <div className="field last">
                          <button type="submit" className="btn-view-product btn-view-product--inline" disabled={regLoading}>
                            {regLoading ? 'Registering...' : 'Register'}
                          </button>
                        </div>
                      </form>

                      <div className="checkout-google-wrap">
                        <div className="checkout-auth-divider">or</div>
                        <div ref={registerGoogleRef} className="checkout-google-button" />
                        {googleNotice && <p className="account-err">{googleNotice}</p>}
                      </div>

                      <p className="account-switch-hint">
                        Already have an account?{' '}
                        <button
                          type="button"
                          onClick={() => setShowRegister(false)}
                          className="account-switch-btn"
                        >
                          Back to Login
                        </button>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {GOOGLE_CLIENT_ID && (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={() => setGoogleScriptReady(true)}
          onError={() => {
            setGoogleError('Google sign-in could not be loaded right now. Please try again later.');
          }}
        />
      )}
      {showForgotModal && (
        <div className="register-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeForgotModal(); }}>
          <div className="register-modal">
            <button type="button" className="register-modal-close" onClick={closeForgotModal} aria-label="Close">&#x2715;</button>
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
                onKeyDown={(e) => { if (e.key === 'Enter') void handleForgotPassword(); }}
              />
            </div>
            {forgotError && <p className="register-modal-err">{forgotError}</p>}
            {forgotSuccess && <p className="register-modal-success">{forgotSuccess}</p>}
            <button
              type="button"
              className="btn-view-product checkout-recovery-submit"
              onClick={() => void handleForgotPassword()}
              disabled={forgotLoading}
            >
              {forgotLoading ? 'Sending...' : 'Send Reset Link'}
            </button>
            <div className="reset-password-foot">
              <button type="button" className="reset-password-foot-link" onClick={closeForgotModal}>
                Back to login
              </button>
            </div>
          </div>
        </div>
      )}
      <Footer />
    </>
  );
}
