import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clockLabel, money, operatorGet, operatorPost, qrSrc, todayISO, transportGet, typeMeta,
} from '../../lib/transportClient.js';
import {
  Badge, Empty, ErrorNote, Field, Loading, Note, Panel, btn, inputCls,
} from './ConsoleKit.jsx';

const METHODS = ['cash', 'card', 'mobile_money', 'bank_transfer', 'agent_credit'];

/**
 * Counter sale. It reuses the public hold + booking transaction, so a seat sold
 * here is instantly unavailable to the website (and the other way round).
 */
export default function OperatorPosTab({ operatorId, headers, operator, role, staffName = '' }) {
  const [date, setDate] = useState(todayISO());
  const [departures, setDepartures] = useState([]);
  const [departureId, setDepartureId] = useState('');
  const [seatMap, setSeatMap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [selectedSeats, setSelectedSeats] = useState([]);
  const [passengers, setPassengers] = useState(['']);
  const [fareClass, setFareClass] = useState('');
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '' });
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentRef, setPaymentRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const authHeaders = useMemo(() => headers(), [headers]);

  const loadDepartures = useCallback(async () => {
    setLoading(true);
    const result = await operatorGet('departures', operatorId, { from: date, to: date, status: 'scheduled' }, authHeaders);
    setLoading(false);
    if (!result.ok) { setError(result.error || 'Could not load departures'); return; }
    setError('');
    const list = result.departures || [];
    setDepartures(list);
    setDepartureId((current) => (list.some((entry) => String(entry.id) === String(current)) ? current : ''));
  }, [operatorId, authHeaders, date]);

  useEffect(() => { loadDepartures(); }, [loadDepartures]);

  const loadSeats = useCallback(async (id) => {
    if (!id) { setSeatMap(null); return; }
    setLoading(true);
    const result = await transportGet('departure', { departureId: id });
    setLoading(false);
    if (!result.ok) { setError(result.error || 'Could not load the seat map'); setSeatMap(null); return; }
    setError('');
    setSeatMap(result);
    setFareClass(result.classes?.[0]?.code || '');
    setSelectedSeats([]);
    setPassengers(['']);
  }, []);

  useEffect(() => { loadSeats(departureId); }, [departureId, loadSeats]);

  const seating = seatMap?.departure?.seating || 'assigned';
  const seatsTotal = Number(seatMap?.departure?.seatsTotal || 0);
  const seatsAvailable = Number(seatMap?.departure?.seatsAvailable || 0);
  const currency = seatMap?.departure?.currency || operator?.currency || 'UGX';

  const selectedClass = useMemo(
    () => (seatMap?.classes || []).find((entry) => entry.code === fareClass) || seatMap?.classes?.[0],
    [seatMap, fareClass]
  );

  const quantity = seating === 'capacity' ? passengers.length : selectedSeats.length;
  const seatByLabel = useMemo(() => {
    const map = new Map();
    for (const seat of seatMap?.seats || []) map.set(seat.id, seat);
    return map;
  }, [seatMap]);

  const estimate = Number(selectedClass?.price || 0) * Math.max(1, quantity);

  const seatRows = useMemo(() => {
    const rows = new Map();
    for (const seat of seatMap?.seats || []) {
      const key = `${seat.carriage || ''}|${seat.rowLabel}`;
      if (!rows.has(key)) rows.set(key, { carriage: seat.carriage || '', rowLabel: seat.rowLabel, seats: [] });
      rows.get(key).seats.push(seat);
    }
    return [...rows.values()].map((row) => ({ ...row, seats: row.seats.sort((a, b) => Number(a.x) - Number(b.x)) }));
  }, [seatMap]);

  const toggleSeat = (seat) => {
    if (seat.status !== 'available') return;
    setSelectedSeats((current) => {
      const exists = current.includes(seat.id);
      const next = exists ? current.filter((id) => id !== seat.id) : [...current, seat.id];
      setPassengers((names) => {
        const wanted = Math.max(1, next.length);
        if (names.length === wanted) return names;
        if (names.length > wanted) return names.slice(0, wanted);
        return [...names, ...Array(wanted - names.length).fill('')];
      });
      return next;
    });
  };

  const setPassengerCount = (count) => {
    const wanted = Math.max(1, Math.min(seatsAvailable || 1, Number(count) || 1));
    setPassengers((names) => {
      if (names.length === wanted) return names;
      if (names.length > wanted) return names.slice(0, wanted);
      return [...names, ...Array(wanted - names.length).fill('')];
    });
  };

  const reset = () => {
    setSelectedSeats([]);
    setPassengers(['']);
    setCustomer({ name: '', email: '', phone: '' });
    setPaymentRef('');
    setReceipt(null);
  };

  const sell = async (event) => {
    event.preventDefault();
    setError('');
    if (!departureId) { setError('Choose a departure first.'); return; }
    if (seating === 'assigned' && selectedSeats.length === 0) { setError('Pick at least one seat.'); return; }
    if (!customer.name.trim()) { setError('Enter the passenger name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customer.email.trim())) { setError('Enter a valid email — the ticket is emailed there.'); return; }

    setBusy(true);
    const result = await operatorPost('pos-sell', operatorId, {
      departureId: Number(departureId),
      seatIds: selectedSeats,
      passengers: passengers.map((name, index) => ({ name: name.trim() || (index === 0 ? customer.name.trim() : `Passenger ${index + 1}`) })),
      customer,
      fareClass,
      paymentMethod,
      paymentRef,
      staffName,
      role,
    }, authHeaders);
    setBusy(false);

    if (!result.ok) { setError(result.error || 'The sale did not go through'); return; }
    setReceipt(result.order);
    setSelectedSeats([]);
    setPassengers(['']);
    setCustomer({ name: '', email: '', phone: '' });
    setPaymentRef('');
    await loadSeats(departureId);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <Panel
          title="Counter sale"
          subtitle="One inventory: a seat sold here disappears from the website immediately"
          actions={(
            <button type="button" className={btn.secondary} onClick={() => loadSeats(departureId)} disabled={!departureId}>
              <i className="ph ph-arrows-clockwise" aria-hidden="true" /> Reload seats
            </button>
          )}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Travel date">
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputCls} />
            </Field>
            <Field label="Departure" required className="sm:col-span-2">
              <select value={departureId} onChange={(event) => setDepartureId(event.target.value)} className={inputCls}>
                <option value="">Choose a departure…</option>
                {departures.map((departure) => (
                  <option key={departure.id} value={departure.id}>
                    {clockLabel(departure.departTime)} · {departure.routeName} · {departure.seatsAvailable} seats left
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {loading && <Loading label="Loading seats…" />}
          <ErrorNote message={error} />

          {!departureId && !loading && (
            <div className="mt-3">
              <Empty icon="ph-cash-register" title="Pick a departure" message="Only departures still on sale today can be sold at the counter." />
            </div>
          )}

          {seatMap && seating === 'assigned' && (
            <div className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                  {seatMap.departure.vehicleName || 'Seat map'} · {seatMap.departure.transportLabel}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-400">
                  <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-white ring-1 ring-slate-300" /> Free</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-emerald-500" /> Selected</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-slate-300" /> Taken</span>
                </div>
              </div>
              <div className="max-h-72 overflow-auto">
                <div className="space-y-1.5">
                  {seatRows.map((row) => (
                    <div key={`${row.carriage}-${row.rowLabel}`} className="flex items-center gap-1.5">
                      <span className="w-6 shrink-0 text-right text-[10px] font-black text-slate-400">{row.rowLabel}</span>
                      {row.seats.map((seat, index) => {
                        const selected = selectedSeats.includes(seat.id);
                        const taken = seat.status !== 'available';
                        return (
                          <span key={seat.id} className="flex items-center">
                            {index > 0 && Number(seat.x) - Number(row.seats[index - 1].x) > 1 && <span className="w-3" />}
                            <button
                              type="button"
                              onClick={() => toggleSeat(seat)}
                              disabled={taken}
                              title={`${seat.label} · ${seat.category} · ${seat.status}`}
                              aria-pressed={selected}
                              className={`h-7 w-7 rounded-md text-[10px] font-black transition-colors ${
                                selected
                                  ? 'bg-emerald-500 text-white'
                                  : taken
                                    ? 'cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-700'
                                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-emerald-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700'
                              }`}
                            >
                              {seat.label}
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {seatMap && seating === 'capacity' && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Passengers" hint={`${seatsAvailable} places left on this trip`}>
                <input
                  type="number"
                  min="1"
                  max={Math.max(1, seatsAvailable)}
                  value={passengers.length}
                  onChange={(event) => setPassengerCount(event.target.value)}
                  className={inputCls}
                />
              </Field>
              <div className="flex items-end">
                <Note>Capacity-based trip — no seat numbers are issued.</Note>
              </div>
            </div>
          )}
        </Panel>

        {seatMap && (
          <Panel title="Passengers & payment">
            <form className="space-y-3" onSubmit={sell}>
              <div className="grid gap-3 sm:grid-cols-3">
                {passengers.map((name, index) => (
                  <Field key={index} label={`Passenger ${index + 1}`}>
                    <input
                      value={name}
                      onChange={(event) => {
                        const next = [...passengers];
                        next[index] = event.target.value;
                        setPassengers(next);
                      }}
                      className={inputCls}
                      placeholder={index === 0 ? customer.name || 'Full name' : 'Full name'}
                    />
                  </Field>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Customer name" required>
                  <input value={customer.name} onChange={(event) => setCustomer((c) => ({ ...c, name: event.target.value }))} className={inputCls} />
                </Field>
                <Field label="Email" required hint="The ticket is emailed here">
                  <input type="email" value={customer.email} onChange={(event) => setCustomer((c) => ({ ...c, email: event.target.value }))} className={inputCls} />
                </Field>
                <Field label="Phone">
                  <input value={customer.phone} onChange={(event) => setCustomer((c) => ({ ...c, phone: event.target.value }))} className={inputCls} />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Fare class">
                  <select value={fareClass} onChange={(event) => setFareClass(event.target.value)} className={inputCls}>
                    {(seatMap.classes || []).map((entry) => (
                      <option key={entry.code} value={entry.code}>{entry.name} · {money(entry.price, currency)}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Payment method">
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className={inputCls}>
                    {METHODS.map((method) => <option key={method} value={method}>{method.replace(/_/g, ' ')}</option>)}
                  </select>
                </Field>
                <Field label="Payment reference">
                  <input value={paymentRef} onChange={(event) => setPaymentRef(event.target.value)} className={inputCls} placeholder="Receipt / txn id" />
                </Field>
                <div className="flex items-end">
                  <button type="submit" className={`${btn.primary} w-full justify-center`} disabled={busy}>
                    {busy ? <i className="ph ph-spinner-gap animate-spin" aria-hidden="true" /> : <i className="ph ph-cash-register" aria-hidden="true" />}
                    Sell {quantity > 0 ? `· ${money(estimate, currency)}` : ''}
                  </button>
                </div>
              </div>

              <p className="text-[11px] font-semibold text-slate-400">
                {seating === 'assigned'
                  ? `${selectedSeats.length} seat(s) selected${selectedClass ? ` · ${selectedClass.name}` : ''}.`
                  : `${passengers.length} passenger(s).`}
              </p>
            </form>
          </Panel>
        )}
      </div>

      <div className="space-y-4">
        <Panel title="Trip summary">
          {!seatMap ? (
            <p className="py-6 text-center text-xs font-semibold text-slate-400">Choose a departure to see the trip.</p>
          ) : (
            <dl className="space-y-2 text-xs">
              {[
                ['Route', seatMap.departure.routeName],
                ['Type', typeMeta(seatMap.departure.transportType).label],
                ['Vehicle', seatMap.departure.vehicleName || '—'],
                ['Departs', `${seatMap.departure.travelDate} · ${clockLabel(seatMap.departure.routeDepartTime)}`],
                ['Boarding', seatMap.departure.boardAt?.name || '—'],
                ['Drop-off', seatMap.departure.alightAt?.name || '—'],
                ['Seats left', `${seatsAvailable}/${seatsTotal}`],
                ['Fare', selectedClass ? money(selectedClass.price, currency) : '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3">
                  <dt className="font-bold uppercase tracking-wide text-slate-400">{label}</dt>
                  <dd className="text-right font-black text-slate-800 dark:text-slate-100">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>

        {receipt && (
          <Panel title="Sale complete" subtitle={receipt.bookingRef}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-slate-900 dark:text-white">{receipt.customerName}</p>
                  <p className="text-[11px] text-slate-400">{receipt.customerEmail}</p>
                </div>
                <Badge status={receipt.paymentStatus} />
              </div>
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                {receipt.routeName} · {receipt.travelDate} {clockLabel(receipt.departTime)}
              </p>
              <p className="text-lg font-black text-emerald-600">{money(receipt.total, receipt.currency)}</p>

              <ul className="space-y-2">
                {(receipt.tickets || []).map((ticket) => (
                  <li key={ticket.ticketNo} className="flex items-center gap-3 rounded-xl border border-slate-200 p-2 dark:border-slate-700">
                    <img src={qrSrc(ticket.qrToken, 90)} alt="" width="45" height="45" className="rounded" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black text-slate-900 dark:text-white">{ticket.passengerName}</p>
                      <p className="font-mono text-[11px] text-slate-400">{ticket.ticketNo}</p>
                      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Seat {ticket.seatLabel || 'general'}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="flex gap-2">
                <button type="button" className={btn.secondary} onClick={reset}><i className="ph ph-plus" aria-hidden="true" /> New sale</button>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
