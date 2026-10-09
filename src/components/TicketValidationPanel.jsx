import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useAuth } from '../context/AuthContext.jsx';

export default function TicketValidationPanel({ operatorType }) {
  const { authHeaders } = useAuth();
  const [ticketNumber, setTicketNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [scanning, setScanning] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [activeCameraId, setActiveCameraId] = useState('');
  const scannerRef = useRef(null);

  // Stop scanner when component unmounts
  useEffect(() => {
    return () => stopScanner();
  }, []);

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
  };

  const startScanner = async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        setCameras(devices);
        const cameraId = devices[0].id;
        setActiveCameraId(cameraId);
        setScanning(true);
        setTimeout(() => initializeScanner(cameraId), 100);
      } else {
        setError('No cameras found on your device.');
      }
    } catch (err) {
      setError('Camera access denied or failed. Please allow camera permissions.');
    }
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
    ).catch(err => {
      setError('Failed to start scanner: ' + err.message);
      setScanning(false);
    });
  };

  const switchCamera = (cameraId) => {
    stopScanner().then(() => {
      setActiveCameraId(cameraId);
      setScanning(true);
      setTimeout(() => initializeScanner(cameraId), 100);
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

        {/* QR Scanner Area */}
        <div className={`overflow-hidden transition-all duration-300 ${scanning ? 'h-auto opacity-100 mb-6' : 'h-0 opacity-0 m-0'}`}>
          <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
            <div id="qr-reader" className="mx-auto max-w-[300px] sm:max-w-[400px] overflow-hidden rounded-xl bg-black"></div>
            {cameras.length > 1 && (
              <div className="mt-4 flex justify-center gap-2 flex-wrap">
                {cameras.map(cam => (
                  <button 
                    key={cam.id} 
                    onClick={() => switchCamera(cam.id)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg ${activeCameraId === cam.id ? 'bg-amber-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}
                  >
                    {cam.label || 'Camera'}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-3 font-semibold">Position the QR code within the frame.</p>
          </div>
        </div>

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
