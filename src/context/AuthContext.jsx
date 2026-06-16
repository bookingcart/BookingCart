import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_USER         = 'bookingcart_user';
const STORAGE_GOOGLE_TOKEN = 'bookingcart_google_id_token';
const STORAGE_JWT_TOKEN    = 'bookingcart_jwt_token';
const STORAGE_SESSION_ONLY = 'bookingcart_session_only';

const AuthContext = createContext(null);

function decodeJwtPayload(token) {
  try {
    const payload = String(token || '').split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((char) => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`)
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isExpiredToken(token, skewSeconds = 30) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  return Number(payload.exp) * 1000 <= Date.now() + skewSeconds * 1000;
}

function clearStoredAuth() {
  try {
    localStorage.removeItem(STORAGE_USER);
    localStorage.removeItem(STORAGE_GOOGLE_TOKEN);
    localStorage.removeItem(STORAGE_JWT_TOKEN);
    localStorage.removeItem('bc_user');
    localStorage.removeItem(STORAGE_SESSION_ONLY);
  } catch {}
}

function readStoredToken() {
  try {
    const token = localStorage.getItem(STORAGE_GOOGLE_TOKEN) || localStorage.getItem(STORAGE_JWT_TOKEN) || '';
    if (token && isExpiredToken(token)) {
      clearStoredAuth();
      return '';
    }
    return token;
  } catch {
    return '';
  }
}

function readStoredUser() {
  if (!readStoredToken()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function isAuthFailure(status, error = '') {
  return status === 401 || /session expired|invalid authentication|missing or invalid authorization|missing id token/i.test(String(error || ''));
}

export function AuthProvider({ children }) {
  const [tick, setTick] = useState(0);
  const validatedTokenRef = useRef('');
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  /** Returns the best available token (Google ID token or our JWT) */
  const getToken = useCallback(() => {
    return readStoredToken();
  }, [tick]);

  /** Alias kept for backward compat with legacy JS that calls getGoogleIdToken() */
  const getGoogleIdToken = getToken;

  const authHeaders = useCallback(() => {
    const t = getToken();
    const h = { 'Content-Type': 'application/json' };
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  }, [getToken]);

  const user = useMemo(() => {
    return readStoredUser();
  }, [tick]);

  const clearAuth = useCallback(() => {
    validatedTokenRef.current = '';
    clearStoredAuth();
    refresh();
    if (typeof window.applyAuthUI === 'function') window.applyAuthUI();
  }, [refresh]);

  const handleAuthFailure = useCallback((status, error = '') => {
    if (!isAuthFailure(status, error)) return false;
    validatedTokenRef.current = '';
    clearStoredAuth();
    refresh();
    if (typeof window.applyAuthUI === 'function') window.applyAuthUI();
    return true;
  }, [refresh]);

  /** Login: stores user and token, updates UI */
  const login = useCallback(async ({ email, token, user: userData, rememberMe = false }) => {
    try {
      localStorage.removeItem(STORAGE_GOOGLE_TOKEN);
      localStorage.setItem(STORAGE_USER, JSON.stringify(userData || { email }));
      if (token) {
        localStorage.setItem(STORAGE_JWT_TOKEN, token);
      }
      // Set expiry if not remembering
      if (!rememberMe) {
        localStorage.setItem(STORAGE_SESSION_ONLY, 'true');
      } else {
        localStorage.removeItem(STORAGE_SESSION_ONLY);
      }
    } catch {}
    refresh();
    if (typeof window.applyAuthUI === 'function') window.applyAuthUI();
    return userData;
  }, [refresh]);

  /** Register: stores user and token, updates UI */
  const register = useCallback(async ({ email, token, user: userData }) => {
    return login({ email, token, user: userData, rememberMe: false });
  }, [login]);

  /** Sign out: clears all tokens and user data, updates UI */
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      await fetch('/api/better-auth/sign-out', { method: 'POST' }).catch(() => {});
    } catch {}
    validatedTokenRef.current = '';
    clearStoredAuth();
    refresh();
    if (typeof window.applyAuthUI === 'function') window.applyAuthUI();
  }, [refresh]);

  useEffect(() => {
    const token = getToken();
    if (!token) return undefined;
    if (validatedTokenRef.current === token) return undefined;
    validatedTokenRef.current = token;

    let cancelled = false;
    fetch('/api/auth/session', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (resp) => {
        const data = await resp.json().catch(() => ({}));
        if (cancelled) return;
        if (!resp.ok || !data.ok) {
          handleAuthFailure(resp.status, data.error);
          return;
        }
        if (data.user?.email) {
          try {
            const existing = readStoredUser() || {};
            localStorage.setItem(STORAGE_USER, JSON.stringify({ ...existing, ...data.user }));
            refresh();
          } catch {}
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [getToken, handleAuthFailure, refresh]);

  const isAuthenticated = useMemo(() => !!user && !!getToken(), [getToken, tick, user]);

  const value = useMemo(
    () => ({ getGoogleIdToken, getToken, authHeaders, user, refresh, logout, login, register, isAuthenticated, clearAuth, handleAuthFailure }),
    [getGoogleIdToken, getToken, authHeaders, user, refresh, logout, login, register, isAuthenticated, clearAuth, handleAuthFailure]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
