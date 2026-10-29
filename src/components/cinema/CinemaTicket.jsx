// The cinema e-ticket: a poster keepsake in three bands — brand header, the
// movie poster with the seat facts on it, then a tear-off stub holding the
// attendee name and the QR the scanner reads.
import { useRef, useState } from 'react';
import { clockLabel, money } from '../../lib/cinemaClient.js';

const INK = '#0b0d0c';
const SHELL = '#161a18';
const ACCENT = '#22c55e';

function qrSrc(value, size = 300) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=ffffff&color=0b0d0c&margin=0`;
}

/** "23:59 · Screen 1" -> "11:59pm" */
function watchTime(ticket, order) {
  const raw = String(ticket.slotLabel || order.slotLabel || '');
  const time = raw.split('·')[0].trim();
  const label = clockLabel(time);
  return label === '—' ? '—' : label.replace(' ', '').toLowerCase();
}

function issueDate(ticket, order) {
  const source = ticket.createdAt || order.createdAt;
  const parsed = source ? new Date(source) : (ticket.showDate ? new Date(`${ticket.showDate}T00:00:00`) : null);
  if (!parsed || Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
}

function Fact({ label, children, accent = false, mono = false }) {
  return (
    <div className="min-w-0">
      <p className="text-[8.5px] font-black uppercase leading-none tracking-[0.1em]" style={{ color: ACCENT }}>{label}</p>
      {/* nowrap rather than truncate: html2canvas-pro measures letter-spacing
          differently from the browser and would cut the ticket number short. */}
      <p
        className={`mt-2 font-black leading-none ${mono ? 'whitespace-nowrap font-mono text-[10.5px] tracking-tight' : 'truncate text-[16px]'}`}
        style={{ color: accent ? ACCENT : '#ffffff' }}
      >
        {children}
      </p>
    </div>
  );
}

/**
 * The printable card. Kept free of page chrome so `downloadTicket` can capture
 * exactly this node and print CSS can repeat it one per page.
 */
export function CinemaTicketCard({ innerRef, ticket, order, cinema, notch = 'bg-slate-50 dark:bg-slate-950 print:bg-white' }) {
  const movieTitle = ticket.movieTitle || order.movieTitle || 'Feature presentation';
  const cinemaName = cinema?.name || order.attractionName || 'Cinema';
  const poster = order.moviePoster || '';
  const used = ticket.status === 'used' || Number(ticket.admissionsUsed || 0) >= Number(ticket.admissionsTotal || 1);
  const admissions = Number(ticket.admissionsTotal || 1);

  return (
    <article
      ref={innerRef}
      className="ct-ticket relative w-full max-w-[360px] overflow-hidden rounded-[22px] shadow-xl"
      style={{ backgroundColor: INK }}
    >
      {/* Brand band */}
      <header className="px-5 pb-3.5 pt-5 text-center" style={{ backgroundColor: SHELL }}>
        <div className="flex items-center justify-center gap-2">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[22px] w-[22px] shrink-0">
            <path d="M4 17c0-6 4.5-10.5 12-11.5C15 12 11 16 4 17Z" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinejoin="round" />
            <path d="M5.5 18.5c2-4 5-6.5 8.5-8" fill="none" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <p className="text-[24px] font-black italic leading-none tracking-tight">
            <span className="text-white">BOOKING</span>
            <span style={{ color: ACCENT }}>CART</span>
          </p>
        </div>
        <p className="mt-2 text-[8.5px] font-bold tracking-[0.3em] text-white/55">Compare. Book. instant</p>
      </header>

      {/* Poster + seat facts */}
      <div className="relative aspect-[4/5] w-full overflow-hidden" style={{ backgroundColor: '#111614' }}>
        {poster ? (
          <img src={poster} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(circle_at_30%_20%,#1d3b2c,#0b0d0c_70%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/0 to-black/95" />

        <div className="absolute inset-x-6 top-5">
          <p className="text-[21px] font-black leading-[1.1] text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.9)]">
            {cinemaName}
          </p>
        </div>

        <div className="absolute inset-x-6 bottom-5">
          <h2 className="line-clamp-2 text-center text-[21px] font-black uppercase leading-none tracking-[0.12em] text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.95)]">
            {movieTitle}
          </h2>

          <div className="mt-4 grid grid-cols-[auto_1fr_auto] items-end gap-x-4">
            <Fact label="Seat">{ticket.seatLabel || '—'}</Fact>
            <Fact label="Watch time">{watchTime(ticket, order)}</Fact>
            <Fact label="Ticket no:" accent mono>{ticket.ticketNo || '—'}</Fact>
          </div>
        </div>

        {used && (
          <span className="absolute right-3 top-3 -rotate-6 rounded-md border-2 border-white/70 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.2em] text-white/80">
            Scanned
          </span>
        )}
      </div>

      {/* Perforation */}
      <div className="relative h-0">
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-white/25" />
        <span className={`absolute -top-[11px] left-0 h-[22px] w-[22px] -translate-x-1/2 rounded-full ${notch}`} />
        <span className={`absolute -top-[11px] right-0 h-[22px] w-[22px] translate-x-1/2 rounded-full ${notch}`} />
      </div>

      {/* Tear-off stub */}
      <footer className="flex items-start justify-between gap-3 px-6 pb-5 pt-5">
        <div className="min-w-0 flex-1">
          <p className="text-[8px] font-black uppercase leading-none tracking-[0.12em] text-white/70">Clients name</p>
          <p className="mt-2 truncate text-[14px] font-black leading-none" style={{ color: ACCENT }}>
            {ticket.holderName || order.customerName || 'Guest'}
          </p>

          <p className="mt-4 text-[8px] font-black uppercase leading-none tracking-[0.12em] text-white/70">Issue date</p>
          <p className="mt-2 text-[12.5px] font-black leading-tight" style={{ color: ACCENT }}>
            {issueDate(ticket, order)}
          </p>
        </div>

        <div className="shrink-0 rounded-lg bg-white p-1.5">
          {ticket.qrToken ? (
            <img src={qrSrc(ticket.qrToken)} alt={`QR code for seat ${ticket.seatLabel}`} width="88" height="88" className="h-[88px] w-[88px]" />
          ) : (
            <div className="flex h-[88px] w-[88px] items-center justify-center text-center text-[7px] font-black uppercase leading-tight text-slate-400">
              QR issued on payment
            </div>
          )}
        </div>
      </footer>

      <div className="flex flex-wrap items-center gap-x-2 border-t border-white/10 px-6 py-2.5 text-[7.5px] font-bold uppercase tracking-[0.1em] text-white/45">
        <span>{ticket.screenName || order.screenName || 'Screen'}</span>
        <span className="text-white/20">/</span>
        <span>{ticket.seatCategory || 'standard'}</span>
        <span className="text-white/20">/</span>
        <span>Admit {admissions}</span>
        <span className="ml-auto">{money(ticket.unitPrice, ticket.currency || order.currency)}</span>
      </div>
    </article>
  );
}

async function waitForImages(node) {
  if (!node) return;
  const pending = [...node.querySelectorAll('img')].filter((img) => !img.complete);
  await Promise.all([
    document.fonts?.ready,
    ...pending.map((img) => new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    })),
  ]);
}

/** Capture the card as a 3× PNG so the poster stays sharp when shared. */
async function downloadTicketImage(node, filename) {
  if (!node) throw new Error('the ticket is not on screen yet');
  await waitForImages(node);
  // html2canvas-pro understands Tailwind's oklch() colours; the original build throws on them.
  const { default: html2canvas } = await import('html2canvas-pro');
  const canvas = await html2canvas(node, { scale: 3, useCORS: true, backgroundColor: INK, logging: false });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('the image could not be generated');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Card plus the screen-only actions that belong to one ticket. */
export default function CinemaTicket({ ticket, order, cinema, notch }) {
  const cardRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const download = async () => {
    setBusy(true);
    setError('');
    try {
      await downloadTicketImage(cardRef.current, `bookingcart-cinema-${ticket.ticketNo || ticket.id}.png`);
    } catch (err) {
      setError(err.message || 'unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="print-card flex flex-col items-center gap-2.5">
      <CinemaTicketCard innerRef={cardRef} ticket={ticket} order={order} cinema={cinema} notch={notch} />

      <div className="print-hide flex w-full max-w-[360px] items-center justify-center gap-2">
        <button
          type="button"
          onClick={download}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          <i className={`ph ${busy ? 'ph-circle-notch animate-spin' : 'ph-download-simple'}`} />
          {busy ? 'Preparing…' : 'Download'}
        </button>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Seat {ticket.seatLabel}
        </span>
      </div>

      {error && (
        <p className="print-hide max-w-[360px] text-center text-[10px] font-bold text-rose-500">
          Could not download this ticket ({error}) — use Print, then “Save as PDF”.
        </p>
      )}
    </div>
  );
}
