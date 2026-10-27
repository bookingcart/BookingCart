import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

/**
 * Camera QR reader. Decoded payloads are handed to `onScan`; the camera is
 * stopped before the callback so a single QR is not read twice.
 */
export default function TicketScanner({ onScan, onError, elementId = 'ticket-qr-reader' }) {
  const scannerRef = useRef(null);
  const lastScanRef = useRef({ text: '', at: 0 });
  const [scanning, setScanning] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [activeCameraId, setActiveCameraId] = useState('');
  const [localError, setLocalError] = useState('');

  const report = (message) => {
    setLocalError(message);
    if (onError) onError(message);
  };

  const stop = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        await scanner.stop();
        scanner.clear();
      } catch {
        /* already stopped */
      }
    }
    setScanning(false);
  };

  useEffect(() => () => { stop(); }, []);

  const start = async (cameraId) => {
    const scanner = new Html5Qrcode(elementId);
    scannerRef.current = scanner;
    try {
      await scanner.start(
        cameraId,
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded) => {
          const now = Date.now();
          const last = lastScanRef.current;
          if (last.text === decoded && now - last.at < 2500) return;
          lastScanRef.current = { text: decoded, at: now };
          stop();
          if (onScan) onScan(decoded);
        },
        () => { /* no code in frame */ }
      );
      setScanning(true);
      setLocalError('');
    } catch (error) {
      scannerRef.current = null;
      report(`Failed to start the camera: ${error.message || 'unknown error'}`);
      setScanning(false);
    }
  };

  const begin = async () => {
    setLocalError('');
    try {
      const devices = await Html5Qrcode.getCameras();
      if (!devices || !devices.length) {
        report('No camera was found on this device. Enter the ticket number instead.');
        return;
      }
      setCameras(devices);
      const preferred = devices[devices.length - 1].id;
      setActiveCameraId(preferred);
      setScanning(true);
      setTimeout(() => start(preferred), 80);
    } catch {
      report('Camera access was blocked. Allow camera permission or enter the ticket number.');
    }
  };

  const switchCamera = async (cameraId) => {
    await stop();
    setActiveCameraId(cameraId);
    setScanning(true);
    setTimeout(() => start(cameraId), 80);
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-black text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <i className="ph ph-camera text-green-600" /> Scan the ticket QR code
        </p>
        <button
          type="button"
          onClick={scanning ? stop : begin}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-colors ${
            scanning ? 'bg-rose-500 hover:bg-rose-600 text-white' : 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-700'
          }`}
        >
          <i className={`ph ${scanning ? 'ph-x' : 'ph-camera'}`} />
          {scanning ? 'Stop camera' : 'Start camera'}
        </button>
      </div>

      <div id={elementId} className={`mt-3 mx-auto max-w-[380px] overflow-hidden rounded-xl bg-black ${scanning ? 'block' : 'hidden'}`} />

      {!scanning && !localError && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Camera scanning is optional — you can always type the ticket number.
        </p>
      )}
      {localError && (
        <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">{localError}</p>
      )}
      {scanning && cameras.length > 1 && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {cameras.map((camera) => (
            <button
              key={camera.id}
              type="button"
              onClick={() => switchCamera(camera.id)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${
                activeCameraId === camera.id
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
              }`}
            >
              {camera.label || 'Camera'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
