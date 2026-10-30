import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useAuth } from '../context/AuthContext.jsx';
import {
  cameraErrorMessage, cameraLabel, cameraUnavailableReason, isExternalCamera, listVideoInputs, pickBestCamera,
} from '../lib/camera.js';
import { useHardwareScanner } from '../hooks/useHardwareScanner.js';

export default function TicketValidationPanel({ operatorType }) {
  const { authHeaders } = useAuth();
  const [ticketNumber, setTicketNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [scanning, setScanning] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [activeCameraId, setActiveCameraId] = useState('');
  const [deviceNotice, setDeviceNotice] = useState('');
  const scannerRef = useRef(null);
  const knownCamerasRef = useRef(new Set());

  // Stop scanner when component unmounts
  useEffect(() => {
    return () => stopScanner();
  }, []);

  // A camera or scanner gun plugged in after the page loaded is picked up here,
  // so the gate clerk never has to reload the dashboard mid-queue.
  useEffect(() => {
    let cancelled = false;
    let firstLook = true;
    const refresh = async () => {
      const devices = await listVideoInputs();
      if (cancelled || !devices.length) return;
      const added = firstLook ? [] : devices.filter((device) => !knownCamerasRef.current.has(device.id));
      firstLook = false;
      knownCamerasRef.current = new Set(devices.map((device) => device.id));
      setCameras(devices);
      if (!added.length) return;
      setDeviceNotice(isExternalCamera(added[0])
        ? `External scanner connected: ${cameraLabel(added[0])}. Pick it in the camera list to scan with it.`
        : `New camera available: ${cameraLabel(added[0])}.`);
    };
    refresh();
    const media = navigator.mediaDevices;
    if (!media?.addEventListener) return () => { cancelled = true; };
    media.addEventListener('devicechange', refresh);
    return () => {
      cancelled = true;
      media.removeEventListener('devicechange', refresh);
    };
  }, []);

  // Keyboard-wedge scanners type the code and press Enter; validate it straight away.
  useHardwareScanner((value) => {
    stopScanner();
    setTicketNumber(value);
    validateTicket(value);
  });

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.warn("Failed to stop scanner", err);
      }
      scannerRef.current = null;
    }
    setScanning(false);
    setPreviewReady(false);
  };

  const startScanner = async () => {
    setError(null);
    const blocked = cameraUnavailableReason();
    if (blocked) {
      setError(blocked);
      return;
    }
    try {
      const devices = await Html5Qrcode.getCameras();
      if (!devices.length) {
        setError('No camera was found on this device. Use an external scanner or type the ticket number.');
        return;
      }
      setCameras(devices);
      knownCamerasRef.current = new Set(devices.map((device) => device.id));
      const camera = pickBestCamera(devices, activeCameraId);
      const index = Math.max(0, devices.findIndex((device) => device.id === camera.id));
      setActiveCameraId(camera.id);
      setDeviceNotice(isExternalCamera(camera)
        ? `Scanning with external device: ${cameraLabel(camera, index)}.`
        : `Scanning with ${cameraLabel(camera, index)}.`);
      setScanning(true);
      // The preview box only exists once `scanning` is true, so the reader is
      // attached a tick later — html5-qrcode measures that box when it starts.
      setTimeout(() => initializeScanner(camera.id), 120);
    } catch (err) {
      setError(cameraErrorMessage(err));
      setScanning(false);
    }
  };

  /** Re-read the device list so a camera or scanner plugged in just now shows up. */
  const refreshDevices = async () => {
    const devices = await listVideoInputs();
    if (!devices.length) {
      setDeviceNotice('No camera detected. Plug in a USB camera or scanner, then refresh.');
      return;
    }
    knownCamerasRef.current = new Set(devices.map((device) => device.id));
    setCameras(devices);
    setDeviceNotice(`${devices.length} camera${devices.length === 1 ? '' : 's'} found.`);
  };

  const initializeScanner = (cameraId) => {
    if (!scannerRef.current) {
      scannerRef.current = new Html5Qrcode("qr-reader");
    }
    scannerRef.current.start(
      cameraId,
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        stopScanner();
        setTicketNumber(decodedText);
        validateTicket(decodedText);
      },
      (errorMessage) => {
        // Ignored, continuous scanning
      }
    ).then(() => setPreviewReady(true)).catch(err => {
      setError(cameraErrorMessage(err));
      setPreviewReady(false);
    });
  };

  const switchCamera = (cameraId) => {
    const index = Math.max(0, cameras.findIndex((camera) => camera.id === cameraId));
    setDeviceNotice(`Switching to ${cameraLabel(cameras[index], index)}.`);
    stopScanner().then(() => {
      setActiveCameraId(cameraId);
      setScanning(true);
      setTimeout(() => initializeScanner(cameraId), 120);
    });
  };

  const validateTicket = async (ref = ticketNumber) => {
    if (!ref.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/ticket-validation', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'validate', operatorType, ticketNumber: ref })
      });
      const data = await res.json();
      if (data.ok || data.result === 'rejected') {
        setResult(data);
      } else {
        setError(data.error || 'Validation failed.');
      }
    } catch (err) {
      setError('Network error during validation.');
    } finally {
      setLoading(false);
    }
  };

  const processAction = async (targetAction, overrideReason = '', countToAdmit = 1) => {
    if (!result || !result.ticketNumber) return;
    setLoading(true);
    try {
      const res = await fetch('/api/ticket-validation', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'process-action', 
          operatorType, 
          ticketNumber: result.ticketNumber,
          targetAction,
          overrideReason,
          countToAdmit
        })
      });
      const data = await res.json();
      if (data.ok) {
        // Re-validate to get updated status
        await validateTicket(result.ticketNumber);
        alert(data.message || 'Action completed successfully');
      } else {
        alert(data.error || 'Failed to process action');
      }
    } catch (err) {
      alert('Network error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
        <h2 className="text-xl font-black text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <i className="ph ph-qr-code text-amber-500" />
          Ticket Validation
        </h2>

        {error && (
          <div className="mb-4 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-bold flex gap-2 items-start">
            <i className="ph ph-warning-circle text-lg mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <input 
              type="text"
              value={ticketNumber}
              onChange={(e) => setTicketNumber(e.target.value)}
              placeholder="Enter Ticket Number or Booking Ref"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              onKeyDown={(e) => e.key === 'Enter' && validateTicket()}
            />
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => validateTicket()}
              disabled={loading || !ticketNumber.trim()}
              className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? <i className="ph ph-spinner-gap animate-spin" /> : <i className="ph ph-check-circle" />}
              Validate
            </button>
            <button 
              onClick={scanning ? stopScanner : startScanner}
              className={`${scanning ? 'bg-rose-500 hover:bg-rose-600' : 'bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600'} text-white px-4 py-3 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2`}
            >
              <i className={scanning ? 'ph ph-x' : 'ph ph-camera'} />
              {scanning ? 'Stop' : 'Scan QR'}
            </button>
          </div>
        </div>

        {deviceNotice && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">
            <i className="ph ph-plug mt-0.5 text-sm" />
            <span className="flex-1">{deviceNotice}</span>
            <button
              type="button"
              onClick={() => setDeviceNotice('')}
              className="text-sky-600 hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-200"
              aria-label="Dismiss notice"
            >
              <i className="ph ph-x" />
            </button>
          </div>
        )}

        {/* The reader is mounted only while scanning: html5-qrcode measures this
            box when it starts, so it must already have a real size. */}
        {scanning && (
          <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-700 dark:bg-slate-800">
            <div className="relative mx-auto aspect-[4/3] w-full max-w-[380px] overflow-hidden rounded-xl bg-black">
              <div id="qr-reader" className="h-full w-full" />
              {!previewReady && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-xs font-bold text-white">
                  <i className="ph ph-circle-notch animate-spin text-2xl" />
                  Opening the camera…
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {cameras.length > 0 && (
                <select
                  value={activeCameraId}
                  onChange={(event) => switchCamera(event.target.value)}
                  aria-label="Camera or scanner device"
                  className="max-w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {cameras.map((cam, index) => (
                    <option key={cam.id} value={cam.id}>
                      {cameraLabel(cam, index)}{isExternalCamera(cam) ? ' · external' : ''}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={refreshDevices}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                <i className="ph ph-arrows-clockwise" /> Refresh devices
              </button>
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Position the QR code within the frame.</p>
          </div>
        )}

        {!scanning && (
          <div className="rounded-2xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
              <i className="ph ph-usb text-base text-amber-500" /> External camera or scanner
            </p>
            <ul className="mt-2 space-y-1.5 text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
              <li>USB and Bluetooth barcode scanners type the ticket number and press Enter, so a scan is validated the moment it reads — nothing to set up.</li>
              <li>A USB webcam, document camera or HDMI capture card appears in the camera list above. Start the camera, then pick it from the list.</li>
              <li>On a phone the rear camera is chosen automatically; the front camera is never preferred.</li>
            </ul>
          </div>
        )}

        {/* Result Area */}
        {result && (
          <div className={`rounded-2xl border p-5 ${
            result.valid ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/50' : 
            'bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/50'
          }`}>
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl ${
                result.valid ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
              }`}>
                <i className={result.valid ? 'ph ph-check-circle' : 'ph ph-x-circle'} />
              </div>
              <div className="flex-1">
                <h3 className={`text-lg font-black ${result.valid ? 'text-emerald-800 dark:text-emerald-400' : 'text-rose-800 dark:text-rose-400'}`}>
                  {result.valid ? 'Valid Ticket' : 'Invalid Ticket'}
                </h3>
                
                {!result.valid && (
                  <p className="text-sm font-bold text-rose-700 dark:text-rose-300 mt-1">
                    {result.reason}
                  </p>
                )}

                {result.valid && result.warning && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                    <i className="ph ph-warning" aria-hidden="true" /> {result.warning}
                  </p>
                )}

                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3 mt-4 text-sm text-slate-700 dark:text-slate-300">
                  <div><span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase">Ticket Ref:</span> <br/><span className="font-mono">{result.ticketNumber}</span></div>
                  
                  {result.guestName && (
                    <div><span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase">Guest Name:</span> <br/><span className="font-semibold">{result.guestName}</span></div>
                  )}
                  
                  {result.serviceName && (
                    <div><span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase">Service:</span> <br/><span className="font-semibold">{result.serviceName}</span></div>
                  )}

                  {/* Operator specific fields */}
                  {operatorType === 'attraction' && result.valid && (
                    <>
                      <div><span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase">Ticket Type:</span> <br/><span className="font-semibold">{result.ticketType}</span></div>
                      <div><span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase">Admissions:</span> <br/>
                        <span className="font-semibold">Remaining: {result.admissionsRemaining} / Total: {result.quantity}</span>
                      </div>
                    </>
                  )}

                  {operatorType === 'stay' && result.valid && (
                    <>
                      <div><span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase">Room:</span> <br/><span className="font-semibold">{result.roomNumber} ({result.roomType})</span></div>
                      <div><span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase">Dates:</span> <br/>
                        <span className="font-semibold">{result.checkInDate?.split('T')[0]} to {result.checkOutDate?.split('T')[0]}</span>
                      </div>
                      <div><span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase">Guests:</span> <br/><span className="font-semibold">{result.numGuests}</span></div>
                    </>
                  )}

                  {operatorType === 'aviation' && result.valid && (
                    <>
                      <div><span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase">Flight:</span> <br/><span className="font-semibold">{result.flightNumber} ({result.origin} - {result.destination})</span></div>
                      <div><span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase">Seat:</span> <br/><span className="font-semibold">{result.seatNumber} ({result.cabinClass})</span></div>
                      <div><span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase">Travel Date:</span> <br/><span className="font-semibold">{result.departDate?.split('T')[0]}</span></div>
                    </>
                  )}

                  {operatorType === 'transport' && result.valid && (
                    <>
                      <div><span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase">Seat / Class:</span> <br/><span className="font-semibold">{result.seatLabel || 'General'} {result.fareClass ? `· ${result.fareClass}` : ''}</span></div>
                      <div><span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase">Departure:</span> <br/><span className="font-semibold">{result.travelDate} at {result.departTime}</span></div>
                      <div><span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase">Boarding:</span> <br/><span className="font-semibold">{result.boardingPoint || '—'}</span></div>
                      <div><span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase">Drop-off:</span> <br/><span className="font-semibold">{result.dropoffPoint || '—'}</span></div>
                      <div><span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase">Payment:</span> <br/><span className="font-semibold">{result.paymentStatus}</span></div>
                    </>
                  )}

                  {result.currentStatus && (
                    <div>
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase">Status:</span> <br/>
                      <span className="inline-block px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-xs font-bold rounded mt-1">
                        {result.currentStatus}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                {result.valid && (
                  <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800/50 flex flex-wrap gap-3">
                    {operatorType === 'attraction' && result.admissionsRemaining > 0 && (
                      <button 
                        onClick={() => processAction('admit', '', 1)}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2"
                      >
                        <i className="ph ph-user-check" />
                        Admit 1 Guest
                      </button>
                    )}

                    {operatorType === 'stay' && result.bookingStatus !== 'checked_in' && result.bookingStatus !== 'checked_out' && (
                      <button 
                        onClick={() => processAction('check_in')}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2"
                      >
                        <i className="ph ph-key" />
                        Check In
                      </button>
                    )}

                    {operatorType === 'stay' && result.bookingStatus === 'checked_in' && (
                      <button 
                        onClick={() => processAction('check_out')}
                        className="bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2"
                      >
                        <i className="ph ph-sign-out" />
                        Check Out
                      </button>
                    )}

                    {operatorType === 'aviation' && result.checkInStatus !== 'checked_in' && result.boardingStatus !== 'boarded' && (
                      <button 
                        onClick={() => processAction('check_in_passenger')}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2"
                      >
                        <i className="ph ph-briefcase" />
                        Check In
                      </button>
                    )}

                    {operatorType === 'aviation' && result.checkInStatus === 'checked_in' && result.boardingStatus !== 'boarded' && (
                      <button 
                        onClick={() => processAction('mark_boarded')}
                        className="bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2"
                      >
                        <i className="ph ph-airplane-takeoff" />
                        Board Passenger
                      </button>
                    )}

                    {operatorType === 'transport' && result.currentStatus !== 'Boarded' && (
                      <button
                        onClick={() => processAction('mark_boarded')}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2"
                      >
                        <i className="ph ph-user-check" />
                        Mark Boarded
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
