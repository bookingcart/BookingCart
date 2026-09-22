import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const DETAILED_RATINGS = [
  { key: 'knowledge', label: 'Guide Knowledge' },
  { key: 'communication', label: 'Communication' },
  { key: 'friendliness', label: 'Friendliness' },
  { key: 'punctuality', label: 'Punctuality' },
  { key: 'value', label: 'Value for Money' },
  { key: 'safety', label: 'Safety' },
  { key: 'organization', label: 'Organization' }
];

const TRAVELER_TYPES = ['Solo Traveler', 'Couple', 'Family', 'Group', 'Business Traveler', 'Backpacker', 'Luxury Traveler'];

const TAGS = ['Knowledgeable', 'Friendly', 'Professional', 'Flexible', 'Great Photographer', 'Great Storyteller', 'Family Friendly', 'Good Value', 'Wildlife Expert', 'Food Expert', 'Punctual', 'Local Expert'];

function StarInput({ value, onChange, size = 'text-3xl' }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className={`focus:outline-none transition-colors ${size} ${value >= star ? 'text-amber-400' : 'text-slate-300 dark:text-slate-700 hover:text-amber-200'}`}
        >
          <i className="ph-fill ph-star" />
        </button>
      ))}
    </div>
  );
}

export default function GuideReviewFormPage() {
  const { bookingRef } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [booking, setBooking] = useState(null);
  const [guide, setGuide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Form State
  const [rating, setRating] = useState(0);
  const [detailed, setDetailed] = useState({});
  const [text, setText] = useState('');
  const [recommend, setRecommend] = useState('');
  const [travelerType, setTravelerType] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [photos, setPhotos] = useState([]);
  
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    document.title = 'Leave a Review | BookingCart';
    if (!user) {
      navigate('/auth?redirect=' + encodeURIComponent(window.location.pathname));
      return;
    }
    
    async function loadData() {
      try {
        // Fetch Booking
        const bRes = await fetch(`/api/guide-bookings?ref=${bookingRef}`);
        const bData = await bRes.json();
        if (!bData.ok || !bData.booking) throw new Error('Booking not found');
        
        // Check if user owns it
        if (bData.booking.contactEmail.toLowerCase() !== user.email.toLowerCase()) {
          throw new Error('You do not have permission to review this booking.');
        }
        setBooking(bData.booking);
        
        // Fetch Guide details
        const gRes = await fetch(`/api/guides?slug=${bData.booking.guideId}`);
        const gData = await gRes.json();
        if (gData.ok && gData.guide) setGuide(gData.guide);
        
      } catch (err) {
        setError(err.message || 'Failed to load booking details.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [bookingRef, user, navigate]);

  const handleDetailedChange = (key, val) => setDetailed(prev => ({ ...prev, [key]: val }));
  
  const toggleTag = (tag) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files);
    if (photos.length + files.length > 10) {
      alert("You can upload a maximum of 10 photos.");
      return;
    }
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPhotos(prev => [...prev, ev.target.result]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0) return alert("Please provide an overall rating.");
    if (text.length < 20) return alert("Your review must be at least 20 characters.");
    if (text.length > 1000) return alert("Your review cannot exceed 1000 characters.");
    
    setSubmitting(true);
    try {
      const reviewPayload = {
        guideId: guide.slug,
        bookingRef,
        authorName: user.name || user.email.split('@')[0],
        authorEmail: user.email,
        rating,
        detailedRatings: detailed,
        text,
        photos,
        recommendation: recommend,
        travelerType,
        tags: selectedTags
      };
      
      const res = await fetch('/api/guide-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', review: reviewPayload })
      });
      
      const data = await res.json();
      if (data.ok) {
        setSuccess(true);
      } else {
        alert(data.error || 'Failed to submit review.');
      }
    } catch (err) {
      alert('Network error while submitting review.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <i className="ph ph-spinner-gap text-4xl text-green-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 flex flex-col items-center justify-center">
        <i className="ph ph-warning-circle text-5xl text-red-500 mb-4" />
        <h2 className="text-xl font-bold mb-4">{error}</h2>
        <button onClick={() => navigate('/my-bookings')} className="bg-slate-200 dark:bg-slate-800 px-6 py-2 rounded-lg font-bold">Go Back</button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6">
          <i className="ph-fill ph-check-circle text-4xl text-green-600" />
        </div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-2">Thank you!</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-md mx-auto">
          Your review has been submitted and is pending moderation. It helps future travelers make great decisions.
        </p>
        <button onClick={() => navigate(`/tour-guides/${guide?.slug}`)} className="bg-green-600 text-white font-bold px-8 py-3 rounded-xl shadow-lg shadow-green-600/20">
          View Guide Profile
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <button onClick={() => navigate(-1)} className="text-sm font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 mb-4">
            <i className="ph ph-arrow-left" /> Back
          </button>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-2">Rate your experience</h1>
          <p className="text-slate-600 dark:text-slate-400">
            Tell us about your tour with <strong className="text-slate-900 dark:text-white">{guide?.name}</strong> in {guide?.city}.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* ── Overall Rating ── */}
          <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Overall Experience *</h2>
            <div className="flex flex-col items-center py-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
              <StarInput value={rating} onChange={setRating} size="text-5xl" />
              <div className="mt-4 text-sm font-bold text-slate-500 uppercase tracking-wider">
                {rating === 1 && 'Poor'}
                {rating === 2 && 'Fair'}
                {rating === 3 && 'Good'}
                {rating === 4 && 'Very Good'}
                {rating === 5 && 'Excellent'}
                {rating === 0 && 'Select a rating'}
              </div>
            </div>
          </section>

          {/* ── Detailed Ratings ── */}
          <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Detailed Ratings</h2>
            <p className="text-sm text-slate-500 mb-6">Rate specific aspects of your tour (optional).</p>
            <div className="grid md:grid-cols-2 gap-y-4 gap-x-8">
              {DETAILED_RATINGS.map(item => (
                <div key={item.key} className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{item.label}</span>
                  <StarInput value={detailed[item.key] || 0} onChange={(v) => handleDetailedChange(item.key, v)} size="text-xl" />
                </div>
              ))}
            </div>
          </section>

          {/* ── Written Review ── */}
          <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Written Review *</h2>
            <p className="text-sm text-slate-500 mb-4">Share the details of your experience. What made it special?</p>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="e.g., Sarah was extremely knowledgeable about the history..."
              className="w-full h-32 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
            <div className={`text-right text-xs font-semibold mt-2 ${text.length < 20 || text.length > 1000 ? 'text-red-500' : 'text-slate-400'}`}>
              {text.length} / 1000 (Min 20)
            </div>
          </section>

          {/* ── Recommendation & Traveler Type ── */}
          <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Would you recommend?</h2>
                <div className="flex gap-3">
                  {['Yes', 'No', 'Maybe'].map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setRecommend(opt)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${recommend === opt ? 'bg-green-600 border-green-600 text-white' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Who did you travel with?</h2>
                <select
                  value={travelerType}
                  onChange={e => setTravelerType(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 font-semibold"
                >
                  <option value="">Select traveler type</option>
                  {TRAVELER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* ── Tags ── */}
          <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">What stood out? (Optional)</h2>
            <div className="flex flex-wrap gap-2">
              {TAGS.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`px-4 py-2 rounded-full text-sm font-bold transition-all border ${
                    selectedTags.includes(tag)
                      ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-800'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                  }`}
                >
                  {selectedTags.includes(tag) && <i className="ph-fill ph-check mr-1" />} {tag}
                </button>
              ))}
            </div>
          </section>

          {/* ── Photos ── */}
          <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Add Photos (Optional)</h2>
            <p className="text-sm text-slate-500 mb-4">Upload up to 10 photos of your experience.</p>
            
            <div className="flex flex-wrap gap-4">
              {photos.map((p, i) => (
                <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden group border border-slate-200 dark:border-slate-700">
                  <img src={p} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 bg-black/60 text-white w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <i className="ph ph-x text-xs" />
                  </button>
                </div>
              ))}
              {photos.length < 10 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <i className="ph ph-camera text-2xl mb-1" />
                  <span className="text-[10px] font-bold uppercase">Add Photo</span>
                </button>
              )}
            </div>
            <input type="file" ref={fileInputRef} accept="image/*" multiple onChange={handlePhotoUpload} className="hidden" />
          </section>

          {/* ── Submit ── */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-black text-lg px-12 py-4 rounded-xl shadow-lg shadow-green-600/20 transition-all flex items-center justify-center gap-2 mx-auto"
            >
              {submitting ? <i className="ph ph-spinner-gap animate-spin" /> : <i className="ph ph-paper-plane-tilt" />}
              {submitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
