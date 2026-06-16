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
      var token = localStorage.getItem(STORAGE_TOKEN) || localStorage.getItem('bookingcart_jwt_token') || '';
      if (token && isExpiredToken(token)) {
        clearStoredAuth();
        return '';
      }
      return token;
    } catch (e) {
      return '';
    }
  }

  function decodeJwtPayload(token) {
    try {
      var payload = String(token || '').split('.')[1];
      if (!payload) return null;
      var base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      var jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  }

  function isExpiredToken(token) {
    var payload = decodeJwtPayload(token);
    if (!payload || !payload.exp) return false;
    return Number(payload.exp) * 1000 <= Date.now() + 30000;
  }

  function clearStoredAuth() {
    try {
      localStorage.removeItem(STORAGE_USER);
      localStorage.removeItem(STORAGE_TOKEN);
      localStorage.removeItem('bookingcart_jwt_token');
      localStorage.removeItem('bc_user');
      localStorage.removeItem('bookingcart_session_only');
    } catch (e) {}
  }

  function handleAuthFailure(status, error) {
    var message = String(error || '');
    if (Number(status) !== 401 && !/session expired|invalid authentication|missing or invalid authorization|missing id token/i.test(message)) {
      return false;
    }
    clearStoredAuth();
    applyAuthUI();
    return true;
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
    clearPostAuthRedirect,
    clearStoredAuth,
    handleAuthFailure
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

      localStorage.removeItem('bookingcart_jwt_token');
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
    const token = getGoogleIdToken();
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
    const signedIn = !!(token && user && displayName);

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

    const nameLabels = document.querySelectorAll('[data-profile-name-label]');
    nameLabels.forEach(el => {
      el.textContent = label;
    });
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
    console.log('🎯 renderGoogleSignInButton() called');
    console.log('  - window.google:', !!window.google);
    console.log('  - window.google.accounts:', !!window.google?.accounts);
    console.log('  - window.google.accounts.id:', !!window.google?.accounts?.id);
    
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      console.warn('⚠️  Google SDK not ready for button rendering');
      return false;
    }
    
    var parent = document.querySelector('.g_id_signin');
    console.log('📍 Parent element search:', !!parent);
    if (!parent) {
      console.warn('⚠️  Google Sign-In container element not found');
      return false;
    }
    
    console.log('📐 Parent element details:', {
      offsetWidth: parent.offsetWidth,
      offsetHeight: parent.offsetHeight,
      className: parent.className,
      innerHTML: parent.innerHTML.length > 0 ? 'Has content' : 'Empty'
    });
    
    // Clear any stale content so the button re-renders cleanly
    parent.innerHTML = '';
    
    try {
      console.log('🚀 Attempting to render Google button...');
      window.google.accounts.id.renderButton(parent, {
        type: 'standard',
        shape: 'pill',
        theme: 'outline',
        text: 'signin_with',
        size: 'large',
        logo_alignment: 'left'
      });
      
      // Check if button was actually rendered
      setTimeout(() => {
        const hasContent = parent.innerHTML.length > 0;
        const hasButton = parent.querySelector('div[role="button"]');
        console.log('✅ Button render check:', {
          hasContent,
          hasButton: !!hasButton,
          innerHTMLLength: parent.innerHTML.length
        });
        
        if (!hasContent && !hasButton) {
          console.error('❌ Button appears to have failed rendering silently');
        }
      }, 1000);
      
      console.log('✅ Google Sign-In button render initiated');
      return true;
    } catch (err) {
      console.error('❌ Google renderButton failed:', err);
      // Show error message to user
      parent.innerHTML = `
        <div style="padding: 8px 16px; border: 1px solid #dc3545; border-radius: 20px; background: #f8d7da; text-align: center; font-size: 14px; color: #721c24;">
          <i class="ph ph-warning-circle" style="margin-right: 4px;"></i>
          Sign-in error
        </div>
      `;
      return false;
    }
  }

  async function bootGoogle() {
    console.log('🔧 bootGoogle() called, googleInitDone:', googleInitDone);
    
    if (googleInitDone) {
      // SDK already loaded & initialized — just re-render the button
      const success = renderGoogleSignInButton();
      if (!success) {
        // If rendering failed, try to re-initialize
        console.log('🔄 Button rendering failed, re-initializing...');
        googleInitDone = false;
        return bootGoogle();
      }
      return;
    }

    var googleClientId = '';
    try {
      console.log('📡 Fetching Google config...');
      var r = await fetch('/api/config');
      console.log('📡 Config response status:', r.status);
      var j = await r.json();
      console.log('📡 Config response:', j);
      if (j && j.googleClientId) {
        googleClientId = String(j.googleClientId).trim();
        console.log('✅ Google Client ID retrieved:', googleClientId.substring(0, 20) + '...');
      }
    } catch (e) {
      console.error('❌ Failed to fetch Google config:', e);
    }

    window.bookingcartGoogleSignInAvailable = !!googleClientId;

    if (!googleClientId) {
      console.warn('Google Client ID not found in config. Please check environment variables.');
      // Show a fallback message or alternative auth method
      const signInContainer = document.querySelector('.g_id_signin');
      if (signInContainer) {
        signInContainer.innerHTML = `
          <div style="padding: 8px 16px; border: 1px solid #ccc; border-radius: 20px; background: #f8f9fa; text-align: center; font-size: 14px; color: #666;">
            <i class="ph ph-warning-circle" style="margin-right: 4px;"></i>
            Sign-in temporarily unavailable
          </div>
        `;
      }
      return;
    }

    googleClientIdCached = googleClientId;

    // Wait for the Google SDK to be fully loaded and available
    let retries = 0;
    const maxRetries = 50; // 5 seconds with 100ms intervals
    while (!window.google || !window.google.accounts || !window.google.accounts.id) {
      if (retries >= maxRetries) {
        console.warn('Google Sign-In SDK failed to load within 5 seconds.');
        return;
      }
      await new Promise(r => setTimeout(r, 100));
      retries++;
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
        console.log('Google Sign-In SDK initialized successfully');

        // Wait a bit for DOM to be ready, then render button
        setTimeout(() => {
          renderGoogleSignInButton();
        }, 100);
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
