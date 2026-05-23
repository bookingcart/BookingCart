import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/app.css';
import { legacyHrefToRoute } from './lib/legacyRoutes.js';
import { AuthProvider } from './context/AuthContext.jsx';

window.__bcNavigate = (href) => {
  const path = legacyHrefToRoute(String(href || ''));
  window.location.assign(path);
};

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </AuthProvider>
);

// Dismiss the boot loader once React has painted
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    if (typeof window.__bcLoaderDone === 'function') {
      window.__bcLoaderDone();
    }
  });
});
