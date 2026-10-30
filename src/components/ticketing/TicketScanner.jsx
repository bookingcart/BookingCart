import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { cameraErrorMessage, cameraLabel, cameraUnavailableReason, isExternalCamera, listVideoInputs, pickBestCamera } from '../../lib/camera.js';

/**
 * Camera QR reader. Decoded payloads are handed to `onScan`; the camera is
 * stopped before the callback so a single QR is not read twice.
 */
export default function TicketScanner({ onScan, onError, elementId = 'ticket-qr-reader' }) {
  const scannerRef = useRef(null);
  const lastScanRef = useRef({ text: '', at: 0 });
  const [scanning, setScanning] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
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
    setPreviewReady(false);
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
      setPreviewReady(true);
      setLocalError('');
    } catch (error) {
      scannerRef.current = null;
      report(cameraErrorMessage(error));
      setScanning(false);
      setPreviewReady(false);
    }
  };

  const begin = async () => {
    setLocalError('');
    const blocked = cameraUnavailableReason();
    if (blocked) {
      report(blocked);
      return;
    }
    try {
      const devices = await Html5Qrcode.getCameras();
      const camera = pickBestCamera(devices, activeCameraId);
      if (!camera) {
        report('No camera was found on this device. Use an external scanner or type the ticket number.');
        return;
      }
      setCameras(devices);
      setActiveCameraId(camera.id);
      setScanning(true);
      // The reader is mounted by the state change above; give React a frame before
      // html5-qrcode measures the box it draws into.
      setTimeout(() => start(camera.id), 120);
    } catch (error) {
      report(cameraErrorMessage(error));
    }
  };

  /** Re-read the device list so a camera plugged in just now shows up. */
  const refreshDevices = async () => {
    const devices = await listVideoInputs();
    if (!devices.length) {
      report('No camera detected. Plug in a USB camera or scanner, then refresh.');
      return;
    }
    setCameras(devices);
    setLocalError('');
  };

  const switchCamera = async (cameraId) => {
    await stop();
    setActiveCameraId(cameraId);
    setScanning(true);
    setTimeout(() => start(cameraId), 120);
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

      {/* Mounted only while scanning so html5-qrcode always measures a box that
          has a real size — a hidden container gives it a zero-pixel preview. */}
      {scanning && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="relative mx-auto aspect-[4/3] w-full max-w-[380px] overflow-hidden rounded-lg bg-black">
            <div id={elementId} className="h-full w-full" />
            {!previewReady && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-[11px] font-bold text-white">
                <i className="ph ph-circle-notch animate-spin text-xl" />
                Opening the camera…
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {cameras.length > 0 && (
              <select
                value={activeCameraId}
                onChange={(event) => switchCamera(event.target.value)}
                aria-label="Camera or scanner device"
                className="max-w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {cameras.map((camera, index) => (
                  <option key={camera.id} value={camera.id}>
                    {cameraLabel(camera, index)}{isExternalCamera(camera) ? ' · external' : ''}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={refreshDevices}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              <i className="ph ph-arrows-clockwise" /> Refresh devices
            </button>
          </div>
        </div>
      )}

      {!scanning && !localError && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Camera scanning is optional — you can always type the ticket number. A USB or Bluetooth scanner gun types the code and presses Enter, which validates it automatically.
        </p>
      )}
      {localError && (
        <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">{localError}</p>
      )}
    </div>
  );
}
