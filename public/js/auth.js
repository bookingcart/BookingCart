// Shared authentication: Google Identity Services + profile UI
(function () {
  const STORAGE_USER = 'bookingcart_user';
  const STORAGE_TOKEN = 'bookingcart_google_id_token';
  const STORAGE_REDIRECT = 'bookingcart_post_auth_redirect';

  function isLoopbackIpHost(hostname) {
    return hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '::1';
  }

  if (typeof window !== 'undefined' && isLoopbackIpHost(window.location.hostname) && window.location.hostname !== 'localhost') {
    try {
      const canonical = new URL(window.location.href);
      canonical.hostname = 'localhost';
      window.location.replace(canonical.toString());
      return;
    } catch (e) {}
  }

  function getGoogleIdToken() {
    try {
      return localStorage.getItem(STORAGE_TOKEN) || '';
    } catch (e) {
      return '';
    }
  }

  function authHeaders() {
    const t = getGoogleIdToken();
    const h = { 'Content-Type': 'application/json' };
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  }

  function safeRedirectTarget(rawTarget) {
    const target = String(rawTarget || '').trim();
    if (!target) return '';

    try {
      const url = new URL(target, window.location.href);
      if (url.origin !== window.location.origin) return '';
      return url.pathname + url.search + url.hash;
    } catch (e) {
      return '';
    }
  }

  function getPostAuthRedirect() {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuery =
        params.get('redirect') ||
        params.get('returnTo') ||
        params.get('next') ||
        '';
      const fromSession = sessionStorage.getItem(STORAGE_REDIRECT) || '';
      return safeRedirectTarget(fromQuery) || safeRedirectTarget(fromSession);
    } catch (e) {
      return '';
    }
  }

  function clearPostAuthRedirect() {
    try {
      sessionStorage.removeItem(STORAGE_REDIRECT);
    } catch (e) {}
  }

  function navigateAfterSignIn() {
    const target = getPostAuthRedirect();
    clearPostAuthRedirect();

    window.setTimeout(function () {
      if (target) {
        window.location.replace(target);
        return;
      }
      window.location.reload();
    }, 150);
  }

  window.bookingcartAuth = {
    getGoogleIdToken,
    authHeaders,
    setPostAuthRedirect: function (target) {
      try {
        const safeTarget = safeRedirectTarget(target);
        if (safeTarget) {
          sessionStorage.setItem(STORAGE_REDIRECT, safeTarget);
        }
      } catch (e) {}
    },
    clearPostAuthRedirect
  };

  window.handleGoogleSignIn = async function (response) {
    try {
      if (!response || !response.credential) return;
      const base64Url = response.credential.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join('')
      );

      const payload = JSON.parse(jsonPayload);

      localStorage.setItem(STORAGE_USER, JSON.stringify(payload));
      localStorage.setItem(STORAGE_TOKEN, response.credential);

      applyAuthUI();

      if (typeof window.toast === 'function') {
        window.toast('Welcome back!', 'Signed in as ' + (payload.name || ''));
      }

      try {
        await fetch('/api/user', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            email: payload.email,
            state: {
              name: payload.name,
              email: payload.email,
              picture: payload.picture,
              signedUpAt: new Date().toISOString()
            }
          })
        }).catch(function () {});
      } catch (e) {}

      navigateAfterSignIn();
    } catch (err) {
      console.error('Google Sign-In error:', err);
      if (typeof window.toast === 'function') {
        window.toast('Authentication Error', 'Failed to complete sign-in');
      }
    }
  };

  function applyAuthUI() {
    const userStr = localStorage.getItem(STORAGE_USER);
    let user = null;
    if (userStr) {
      try {
        user = JSON.parse(userStr);
      } catch (e) {
        user = null;
      }
    }

    const displayName = user && (user.name || user.email || '').trim();
    const signedIn = !!(user && displayName);

    if (!signedIn) {
      // If not signed in, just ensure bootGoogle is called to render the button
      bootGoogle().catch(function() {});
      return;
    }

    const label = user.name || user.email || 'Account';

    const selectors = [
      '[data-profile-trigger]',
      '[data-profile-btn]',
      '[data-header-profile-btn]',
      'button img[alt="User Profile"]'
    ];

    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      els.forEach(function (el) {
        if (sel.indexOf('img') !== -1) {
          el.src =
            user.picture ||
            'https://ui-avatars.com/api/?name=' + encodeURIComponent(label);
          el.alt = label;
          el.title = label;
        } else {
          const url =
            user.picture ||
            'https://ui-avatars.com/api/?name=' + encodeURIComponent(label);
          const existing = el.querySelector('img');
          if (existing) {
            existing.src = url;
            existing.alt = label;
            existing.title = label;
            if (!String(existing.className || '').trim()) {
              existing.className = 'w-full h-full object-cover';
            }
          } else {
            while (el.firstChild) el.removeChild(el.firstChild);
            const img = document.createElement('img');
            img.src = url;
            img.alt = label;
            img.title = label;
            img.className = 'w-full h-full object-cover';
            el.appendChild(img);
          }
        }
      });
    }

    const accountLink = document.querySelector('[data-profile-menu] a:first-child');
    if (accountLink) {
      while (accountLink.firstChild) accountLink.removeChild(accountLink.firstChild);
      const ic = document.createElement('i');
      ic.className = 'ph ph-user-circle text-xl text-slate-400';
      accountLink.appendChild(ic);
      accountLink.appendChild(document.createTextNode(' ' + label));
    }
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // Trusted Types Policy for Google Identity Services compatibility
  if (window.trustedTypes && window.trustedTypes.createPolicy && !window.trustedTypes.defaultPolicy) {
    try {
      window.trustedTypes.createPolicy('default', {
        createHTML: (string) => string,
        createScriptURL: (string) => string,
        createScript: (string) => string,
      });
    } catch (e) {}
  }

  let googleInitDone = false;
  let googleClientIdCached = '';

  /**
   * Render the Google Sign-In button into .g_id_signin elements.
   * Safe to call multiple times (e.g. after SPA navigation re-mounts the div).
   */
  function renderGoogleSignInButton() {
    if (!window.google || !window.google.accounts || !window.google.accounts.id) return;
    var parent = document.querySelector('.g_id_signin');
    if (!parent) return;
    // Clear any stale content so the button re-renders cleanly
    parent.innerHTML = '';
    try {
      window.google.accounts.id.renderButton(parent, {
        type: 'standard',
        shape: 'pill',
        theme: 'outline',
        text: 'signin_with',
        size: 'large',
        logo_alignment: 'left'
      });
    } catch (err) {
      console.error('Google renderButton failed:', err);
    }
  }

  async function bootGoogle() {
    if (googleInitDone) {
      // SDK already loaded & initialized — just re-render the button
      renderGoogleSignInButton();
      return;
    }

    var googleClientId = '';
    try {
      var r = await fetch('/api/config');
      var j = await r.json();
      if (j && j.googleClientId) {
        googleClientId = String(j.googleClientId).trim();
      }
    } catch (e) {}

    window.bookingcartGoogleSignInAvailable = !!googleClientId;

    if (!googleClientId) {
      console.warn('Google Client ID not found in config.');
      return;
    }

    googleClientIdCached = googleClientId;

    if (!document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
      try {
        await loadScript('https://accounts.google.com/gsi/client');
      } catch (e) {
        console.warn('Could not load Google Sign-In script');
        return;
      }
    }

    // Initialize the SDK (one-time)
    if (window.google && window.google.accounts && window.google.accounts.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: window.handleGoogleSignIn,
          context: 'use',
          ux_mode: 'popup',
          auto_prompt: false
        });

        googleInitDone = true;

        // Render button into current DOM
        renderGoogleSignInButton();
      } catch (err) {
        console.error('Google ID initialization failed:', err);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      applyAuthUI();
    });
  } else {
    applyAuthUI();
  }

  bootGoogle().then(function () {
    applyAuthUI();
  });

  window.applyAuthUI = applyAuthUI;
  window.renderGoogleSignInButton = renderGoogleSignInButton;
  window.bootGoogle = bootGoogle;
})();
