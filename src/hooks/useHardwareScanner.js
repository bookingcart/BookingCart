import { useEffect, useRef } from 'react';

// Typing speed of a keyboard-wedge scanner: characters land a few milliseconds
// apart, then Enter. A person typing ticket numbers is far slower than this.
const WEDGE_GAP_MS = 80;
const MIN_LENGTH = 5;
const MAX_LENGTH = 160;

/**
 * USB and Bluetooth barcode/QR scanners behave like keyboards: they type the code
 * and press Enter. Listening at document level means a scan is picked up even when
 * no field has focus, while ordinary typing inside a field is left to the browser.
 */
export function useHardwareScanner(onScan, { enabled = true } = {}) {
  const handlerRef = useRef(onScan);
  handlerRef.current = onScan;

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined;
    let buffer = '';
    let lastAt = 0;

    const reset = () => {
      buffer = '';
      lastAt = 0;
    };

    const handleKeyDown = (event) => {
      const target = event.target;
      const tag = target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;

      if (event.key === 'Enter') {
        const value = buffer.trim();
        reset();
        if (typing || value.length < MIN_LENGTH) return;
        event.preventDefault();
        if (handlerRef.current) handlerRef.current(value);
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (typeof event.key !== 'string' || event.key.length !== 1) return;

      const now = Date.now();
      if (now - lastAt > WEDGE_GAP_MS) buffer = '';
      lastAt = now;
      buffer = (buffer + event.key).slice(-MAX_LENGTH);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}

export default useHardwareScanner;
