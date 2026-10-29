import { useCallback, useEffect, useState } from 'react';
import { cinemaGet, cinemaPost } from '../../lib/cinemaClient.js';
import { Button, Card, EmptyState, Field, Notice, Pill, cx, inputCls } from './ui.jsx';

const FORMATS = ['2D', '3D', 'IMAX', '4DX', 'Dolby Atmos'];
const RATINGS = ['G', 'PG', 'PG-13', '12A', '15', '18', 'R', 'NC-17', 'U'];

const EMPTY_MOVIE = {
  id: 0, title: '', posterUrl: '', backdropUrl: '', synopsis: '', genre: '', durationMin: 120,
  ageRating: '', language: '', subtitles: '', releaseDate: '', director: '', castList: '',
  format: '2D', trailerUrl: '', status: 'active',
};

function MovieForm({ initial, busy, error, onCancel, onSave }) {
  const [form, setForm] = useState({ ...EMPTY_MOVIE, ...initial });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          ...form,
          title: form.title.trim(),
          durationMin: Number(form.durationMin) || 0,
          releaseDate: form.releaseDate || null,
        });
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <div>
          <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Poster</span>
          <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
            {form.posterUrl ? (
              <img src={form.posterUrl} alt="" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.opacity = 0.15; }} />
            ) : (
              <div className="flex h-full items-center justify-center text-2xl text-slate-300"><i className="ph ph-image" /></div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Field label="Title" required>
            <input required value={form.title} onChange={(event) => set('title', event.target.value)} className={inputCls} placeholder="Neon Horizon" />
          </Field>
          <Field label="Poster URL" hint="Portrait artwork, 2:3 works best">
            <input value={form.posterUrl} onChange={(event) => set('posterUrl', event.target.value)} className={inputCls} placeholder="https://…" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Duration (min)" required>
              <input type="number" min="1" max="600" required value={form.durationMin} onChange={(event) => set('durationMin', event.target.value)} className={inputCls} />
            </Field>
            <Field label="Age rating">
              <select value={form.ageRating} onChange={(event) => set('ageRating', event.target.value)} className={inputCls}>
                <option value="">Not rated</option>
                {RATINGS.map((rating) => <option key={rating} value={rating}>{rating}</option>)}
              </select>
            </Field>
            <Field label="Format">
              <select value={form.format} onChange={(event) => set('format', event.target.value)} className={inputCls}>
                {FORMATS.map((format) => <option key={format} value={format}>{format}</option>)}
              </select>
            </Field>
          </div>
        </div>
      </div>

      <Field label="Synopsis" hint="Shown on the venue page under the showtimes">
        <textarea rows={3} value={form.synopsis} onChange={(event) => set('synopsis', event.target.value)} className={cx(inputCls, 'resize-none')} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Genre">
          <input value={form.genre} onChange={(event) => set('genre', event.target.value)} className={inputCls} placeholder="Sci-fi / Thriller" />
        </Field>
        <Field label="Language">
          <input value={form.language} onChange={(event) => set('language', event.target.value)} className={inputCls} placeholder="English" />
        </Field>
        <Field label="Subtitles">
          <input value={form.subtitles} onChange={(event) => set('subtitles', event.target.value)} className={inputCls} placeholder="Swahili subs" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Release date">
          <input type="date" value={form.releaseDate || ''} onChange={(event) => set('releaseDate', event.target.value)} className={inputCls} />
        </Field>
        <Field label="Director">
          <input value={form.director} onChange={(event) => set('director', event.target.value)} className={inputCls} />
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={(event) => set('status', event.target.value)} className={inputCls}>
            <option value="active">Active</option>
            <option value="inactive">Archived</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cast" hint="Comma separated">
          <input value={form.castList} onChange={(event) => set('castList', event.target.value)} className={inputCls} />
        </Field>
        <Field label="Trailer URL">
          <input value={form.trailerUrl} onChange={(event) => set('trailerUrl', event.target.value)} className={inputCls} placeholder="https://youtube.com/…" />
        </Field>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" icon={busy ? 'ph-circle-notch' : 'ph-check'} disabled={busy} className={busy ? '[&>i]:animate-spin' : ''}>
          {busy ? 'Saving…' : 'Save movie'}
        </Button>
      </div>
    </form>
  );
}

export default function CinemaMoviesPanel({ attractionId, headers }) {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const payload = await cinemaGet('movies', { attractionId, includeArchived: true }, headers);
    if (payload.ok) { setMovies(payload.movies || []); setError(''); }
    else setError(payload.error || 'Could not load the movie library');
    setLoading(false);
  }, [attractionId, headers]);

  useEffect(() => { load(); }, [load]);

  const save = async (values) => {
    setSaving(true);
    const payload = await cinemaPost('movie-save', { attractionId, movie: values }, headers);
    setSaving(false);
    if (!payload.ok) { setFormError(payload.error || 'Could not save the movie'); return; }
    setFormError('');
    setEditing(null);
    setNotice(`${payload.movie.title} saved.`);
    load();
  };

  const toggleArchive = async (movie) => {
    const payload = await cinemaPost('movie-save', {
      attractionId,
      movie: { ...movie, status: movie.status === 'active' ? 'inactive' : 'active' },
    }, headers);
    if (!payload.ok) { setError(payload.error); return; }
    load();
  };

  const visible = movies.filter((movie) => showArchived || movie.status === 'active');
  const archivedCount = movies.filter((movie) => movie.status !== 'active').length;

  return (
    <div className="space-y-4">
      {notice && <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>}
      {error && <Notice tone="error" onClose={() => setError('')}>{error}</Notice>}

      {editing ? (
        <Card title={editing.id ? `Edit ${editing.title}` : 'Add a movie'} icon="ph-film-slate">
          <MovieForm
            initial={editing}
            busy={saving}
            error={formError}
            onCancel={() => { setEditing(null); setFormError(''); }}
            onSave={save}
          />
        </Card>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {visible.length} {visible.length === 1 ? 'title' : 'titles'}
            </p>
            {archivedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowArchived((value) => !value)}
                className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                {showArchived ? 'Hide archived' : `Show ${archivedCount} archived`}
              </button>
            )}
          </div>
          <Button icon="ph-plus" onClick={() => setEditing({ ...EMPTY_MOVIE })}>Add movie</Button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((key) => <div key={key} className="h-64 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800" />)}
        </div>
      ) : visible.length === 0 && !editing ? (
        <EmptyState
          icon="ph-film-slate"
          title={movies.length ? 'No active titles' : 'Your library is empty'}
          message="Add a movie with its runtime, then schedule screenings against it. Screenings need a runtime to block the right window."
          action={<Button icon="ph-plus" onClick={() => setEditing({ ...EMPTY_MOVIE })}>Add a movie</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((movie) => (
            <article key={movie.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="relative h-44 bg-slate-100 dark:bg-slate-800">
                {movie.posterUrl ? (
                  <img src={movie.posterUrl} alt={movie.title} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-3xl text-slate-300"><i className="ph ph-image" /></div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 to-transparent p-3">
                  <h4 className="truncate text-sm font-black text-white">{movie.title}</h4>
                  <p className="mt-0.5 flex items-center gap-2 text-[10px] font-bold text-white/70">
                    <span>{movie.durationMin} min</span>
                    <span className="rounded bg-white/20 px-1">{movie.format || '2D'}</span>
                    {movie.ageRating && <span className="rounded bg-white/20 px-1">{movie.ageRating}</span>}
                  </p>
                </div>
                {movie.status !== 'active' && (
                  <span className="absolute left-2 top-2"><Pill tone="slate">archived</Pill></span>
                )}
              </div>
              <div className="p-3">
                <p className="line-clamp-2 min-h-[2.2rem] text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {movie.synopsis || movie.genre || 'No synopsis yet.'}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="ghost" icon="ph-pencil" onClick={() => { setEditing(movie); setFormError(''); }}>Edit</Button>
                  <Button size="sm" variant="ghost" icon={movie.status === 'active' ? 'ph-archive' : 'ph-arrow-counter-clockwise'} onClick={() => toggleArchive(movie)}>
                    {movie.status === 'active' ? 'Archive' : 'Restore'}
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
