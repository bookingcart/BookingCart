import { useRef, useState } from 'react';
import { uploadArtwork } from '../../lib/artworkImage.js';
import { Button, inputClass } from './TicketingShared.jsx';

export const ARTWORK_FITS = [
  { value: 'cover', label: 'Fill the panel' },
  { value: 'contain', label: 'Fit inside' },
];

/**
 * Upload / replace / remove the artwork printed in one panel of a ticket.
 * Shared by the admin company panel and each client's ticket design form.
 */
export default function ArtworkUpload({
  value = '',
  onChange,
  fit = 'cover',
  onFitChange,
  headers,
  hint,
  emptyLabel = 'No artwork yet',
  previewHeight = 'h-32',
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const url = await uploadArtwork(file, headers);
      onChange(url);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-artwork-field className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
      <div className={`relative ${previewHeight} bg-slate-100 dark:bg-slate-800 flex items-center justify-center`}>
        {value ? (
          <img
            src={value}
            alt="Ticket artwork preview"
            className={`w-full h-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
          />
        ) : (
          <div className="text-center text-slate-400">
            <i className="ph ph-image text-2xl" />
            <p className="text-[11px] font-black uppercase tracking-wide mt-1">{emptyLabel}</p>
          </div>
        )}
      </div>

      <div className="p-3 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={pick}
          className="hidden"
        />
        <Button
          size="sm"
          icon={busy ? 'ph-circle-notch' : 'ph-upload-simple'}
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? 'Uploading…' : value ? 'Replace artwork' : 'Upload artwork'}
        </Button>
        {value && (
          <Button size="sm" variant="ghost" icon="ph-trash" onClick={() => onChange('')} disabled={busy}>
            Remove
          </Button>
        )}
        {onFitChange && value && (
          <select
            value={fit}
            onChange={(event) => onFitChange(event.target.value)}
            className={`${inputClass} !w-auto !py-1.5 !text-xs`}
            aria-label="How the artwork fills the panel"
          >
            {ARTWORK_FITS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="px-3 pb-3 text-[11px] font-bold text-rose-600">{error}</p>}
      {hint && !error && <p className="px-3 pb-3 text-[11px] font-semibold text-slate-400">{hint}</p>}
    </div>
  );
}
