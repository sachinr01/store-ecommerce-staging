'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useAuth } from './authContext';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WishlistItem {
  id: number;       // product_id
  title: string;
  price: number;
  image: string;
  inStock: boolean;
}

interface WishlistContextType {
  items: WishlistItem[];
  loading: boolean;
  addItem: (item: WishlistItem) => Promise<void>;
  removeItem: (id: number) => Promise<void>;
  hasItem: (id: number) => boolean;
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const LS_KEY   = 'wishlist_items';
const API_BASE = typeof window === 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/store/api')
  : '/store/api';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function lsLoad(): WishlistItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as WishlistItem[]) : [];
  } catch { return []; }
}

function lsSave(items: WishlistItem[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch {}
}

function lsClear() {
  try { localStorage.removeItem(LS_KEY); } catch {}
}

async function apiCall(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    credentials: 'include',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  let json: { success: boolean; message?: string; data?: unknown };
  try {
    json = await res.json();
  } catch {
    throw new Error(`Server error (${res.status})`);
  }

  if (!json.success) throw new Error(json.message || `Request failed (${res.status})`);
  return json;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const WishlistContext = createContext<WishlistContextType | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  const [items, setItems]     = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Track previous login state to detect login/logout transitions
  const prevLoggedIn = useRef<boolean | null>(null);

  // ── Load from DB (logged-in users) ─────────────────────────────────────────
  const loadFromDB = useCallback(async () => {
    setLoading(true);
    try {
      const json = await apiCall('/wishlist');
      const dbItems: WishlistItem[] = ((json.data as { product_id: number }[]) ?? []).map(row => ({
        id: row.product_id,
        title: '',
        price: 0,
        image: '',
        inStock: true,
      }));
      setItems(dbItems);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load from localStorage (guest users) ───────────────────────────────────
  const loadFromLS = useCallback(() => {
    setItems(lsLoad());
    setLoading(false);
  }, []);

  // ── React to auth state changes ────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;

    const justLoggedIn  = prevLoggedIn.current === false && isLoggedIn === true;
    const justLoggedOut = prevLoggedIn.current === true  && isLoggedIn === false;
    const isFirstLoad   = prevLoggedIn.current === null;

    // ── FIRST LOAD ────────────────────────────────────────────────────────────
    if (isFirstLoad) {
      prevLoggedIn.current = isLoggedIn;
      if (isLoggedIn) { loadFromDB(); } else { loadFromLS(); }
      return;
    }

    // ── LOGIN transition ──────────────────────────────────────────────────────
    if (justLoggedIn) {
      prevLoggedIn.current = true;
      let active = true; // FIX: unmount guard so stale async doesn't update state

      const run = async () => {
        const guestItems = lsLoad();
        if (guestItems.length > 0) {
          lsClear();
          try {
            await apiCall('/wishlist/sync', {
              method: 'POST',
              body: JSON.stringify({ product_ids: guestItems.map(i => i.id) }),
            });
          } catch {
            // Sync failed — non-fatal. User can re-add items manually.
          }
        }
        if (active) await loadFromDB(); // FIX: skip if component unmounted
      };

      run();
      return () => { active = false; }; // FIX: cleanup cancels pending setState
    }

    // ── LOGOUT transition ─────────────────────────────────────────────────────
    if (justLoggedOut) {
      prevLoggedIn.current = false;
      setItems([]);
      loadFromLS();
    }
  }, [isLoggedIn, authLoading, loadFromDB, loadFromLS]);

  // ── addItem ─────────────────────────────────────────────────────────────────
  const addItem = useCallback(async (item: WishlistItem) => {
    if (isLoggedIn) {
      setItems(prev => prev.find(i => i.id === item.id) ? prev : [...prev, item]);
      try {
        await apiCall('/wishlist/add', {
          method: 'POST',
          body: JSON.stringify({ product_id: item.id }),
        });
      } catch {
        setItems(prev => prev.filter(i => i.id !== item.id));
      }
    } else {
      setItems(prev => {
        if (prev.find(i => i.id === item.id)) return prev;
        const next = [...prev, item];
        lsSave(next);
        return next;
      });
    }
  }, [isLoggedIn]);

  // ── removeItem ──────────────────────────────────────────────────────────────
  const removeItem = useCallback(async (id: number) => {
    if (isLoggedIn) {
      setItems(prev => prev.filter(i => i.id !== id));
      try {
        await apiCall(`/wishlist/remove/${id}`, { method: 'DELETE' });
      } catch {
        loadFromDB();
      }
    } else {
      setItems(prev => {
        const next = prev.filter(i => i.id !== id);
        lsSave(next);
        return next;
      });
    }
  }, [isLoggedIn, loadFromDB]);

  // ── hasItem ─────────────────────────────────────────────────────────────────
  const hasItem = useCallback((id: number) => items.some(i => i.id === id), [items]);

  const count = items.length;

  return (
    <WishlistContext.Provider value={{ items, loading, addItem, removeItem, hasItem, count }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used inside WishlistProvider');
  return ctx;
}
