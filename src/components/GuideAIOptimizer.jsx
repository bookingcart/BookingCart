// src/components/GuideAIOptimizer.jsx
// Rule-based AI suggestion engine shown on Step 14 of guide onboarding.
// Analyzes profile data and generates actionable recommendations.

const CATEGORY_SKILL_MAP = {
  'Safari Guide': ['Wildlife Tracking', 'Safari Planning', 'First Aid', 'Nature Interpretation'],
  'Wildlife Guide': ['Wildlife Tracking', 'Bird Identification', 'Nature Conservation', 'First Aid'],
  'Cultural Guide': ['Cultural Interpretation', 'Historical Storytelling', 'Cooking Experiences'],
  'Historical Guide': ['Historical Storytelling', 'Cultural Interpretation', 'Museum Tours'],
  'Adventure Guide': ['Hiking Leadership', 'First Aid', 'Camping', 'Adventure Activities'],
  'Food Tour Guide': ['Cooking Experiences', 'Food Experiences', 'Cultural Interpretation'],
  'Photography Guide': ['Photography Assistance', 'Nature Interpretation', 'Hiking Leadership'],
  'Birding Guide': ['Bird Identification', 'Wildlife Tracking', 'Nature Interpretation'],
  'Hiking Guide': ['Hiking Leadership', 'First Aid', 'Camping', 'Nature Interpretation'],
  'Luxury Guide': ['Luxury Travel Assistance', 'Cultural Interpretation', 'Photography Assistance'],
  'City Tour Guide': ['Historical Storytelling', 'Cultural Interpretation', 'Museum Tours'],
  'Museum Guide': ['Museum Tours', 'Historical Storytelling', 'Cultural Interpretation'],
  'Religious Tourism Guide': ['Cultural Interpretation', 'Historical Storytelling', 'Museum Tours'],
  'Marine Guide': ['Boat Tours', 'Nature Interpretation', 'First Aid'],
};

const REGION_LANGUAGE_MAP = {
  'Uganda': ['Swahili', 'Luganda'],
  'Kenya': ['Swahili', 'Maasai'],
  'Tanzania': ['Swahili'],
  'Morocco': ['Arabic', 'French', 'Berber'],
  'Egypt': ['Arabic', 'French'],
  'Ghana': ['Twi', 'French'],
  'Japan': ['Japanese', 'Chinese'],
  'Greece': ['Greek', 'Russian', 'German'],
  'Peru': ['Spanish', 'Quechua'],
  'France': ['French', 'Spanish', 'Italian'],
  'Germany': ['German', 'French'],
  'Italy': ['Italian', 'German', 'French'],
  'India': ['Hindi', 'Bengali', 'Tamil'],
};

const PRICING_BENCHMARKS = {
  'Africa': { perDay: 120, perHour: 20, halfDay: 65 },
  'Asia': { perDay: 150, perHour: 25, halfDay: 80 },
  'Europe': { perDay: 200, perHour: 35, halfDay: 110 },
  'Americas': { perDay: 180, perHour: 30, halfDay: 95 },
  'default': { perDay: 150, perHour: 25, halfDay: 80 },
};

const AFRICA_COUNTRIES = ['Uganda','Kenya','Tanzania','Morocco','Egypt','Ghana','Ethiopia','Rwanda','Senegal','Nigeria','South Africa','Zimbabwe','Zambia','Mozambique','Tunisia','Algeria','Cameroon','Ivory Coast'];
const ASIA_COUNTRIES = ['Japan','China','Thailand','Vietnam','India','Indonesia','Malaysia','Philippines','Sri Lanka','Nepal','Maldives','Jordan','Oman','UAE'];
const EUROPE_COUNTRIES = ['France','Germany','Italy','Greece','Spain','Portugal','UK','Netherlands','Poland','Austria','Switzerland','Czech Republic','Hungary','Croatia'];
const AMERICAS_COUNTRIES = ['Peru','Brazil','Mexico','Colombia','Argentina','Chile','Costa Rica','Ecuador','Bolivia'];

function getRegion(country) {
  if (AFRICA_COUNTRIES.includes(country)) return 'Africa';
  if (ASIA_COUNTRIES.includes(country)) return 'Asia';
  if (EUROPE_COUNTRIES.includes(country)) return 'Europe';
  if (AMERICAS_COUNTRIES.includes(country)) return 'Americas';
  return 'default';
}

function generateSuggestions(profileData) {
  const suggestions = [];
  const {
    step_personal: personal = {},
    step_categories: categories = {},
    step_areas: areas = {},
    step_languages: languages = {},
    step_skills: skills = {},
    step_certifications: certifications = [],
    step_experience: experience = {},
    step_pricing: pricing = {},
    step_gallery: gallery = [],
    step_availability: availability = {},
    step_booking_settings: bookingSettings = {},
    completeness = 0,
  } = profileData;

  const primaryCategory = categories.primary || (Array.isArray(categories.selected) && categories.selected[0]) || null;
  const selectedSkills = Array.isArray(skills.selected) ? skills.selected : [];
  const languageList = Array.isArray(languages.list) ? languages.list : [];
  const speakingLangs = languageList.map(l => l.lang);
  const country = areas.country || '';
  const region = getRegion(country);
  const benchmark = PRICING_BENCHMARKS[region] || PRICING_BENCHMARKS.default;

  // ── Skills suggestions ─────────────────────────────────────────────────
  if (primaryCategory && CATEGORY_SKILL_MAP[primaryCategory]) {
    const recommended = CATEGORY_SKILL_MAP[primaryCategory];
    const missing = recommended.filter(s => !selectedSkills.includes(s));
    if (missing.length > 0) {
      suggestions.push({
        type: 'skills',
        priority: 'high',
        icon: 'ph-star',
        color: 'amber',
        title: `Add key ${primaryCategory} skills`,
        body: `Guides who list these skills get 40% more bookings: ${missing.slice(0, 3).join(', ')}.`,
        action: `Add ${missing[0]} and ${missing.slice(1, 2).join(', ')} to your skills list.`,
      });
    }
  }

  // ── Language suggestions ───────────────────────────────────────────────
  if (country && REGION_LANGUAGE_MAP[country]) {
    const regional = REGION_LANGUAGE_MAP[country];
    const missing = regional.filter(l => !speakingLangs.includes(l) && l !== 'English');
    if (missing.length > 0) {
      suggestions.push({
        type: 'languages',
        priority: 'medium',
        icon: 'ph-translate',
        color: 'blue',
        title: 'Add regional languages',
        body: `Travelers to ${country} frequently request guides who speak ${missing[0]}. This can increase your visibility by 25%.`,
        action: `Consider adding ${missing[0]} even at Basic level to attract more bookings.`,
      });
    }
    if (!speakingLangs.includes('English')) {
      suggestions.push({
        type: 'languages',
        priority: 'high',
        icon: 'ph-globe',
        color: 'red',
        title: 'Add English language',
        body: '78% of international travelers prefer English-speaking guides. This is the single biggest factor for bookings.',
        action: 'Add English to your languages, even at Professional or Basic level.',
      });
    }
  }

  // ── Bio suggestions ────────────────────────────────────────────────────
  const bioLength = (personal.bio || '').trim().split(/\s+/).filter(Boolean).length;
  if (bioLength === 0) {
    suggestions.push({
      type: 'bio',
      priority: 'high',
      icon: 'ph-pencil-simple',
      color: 'red',
      title: 'Write your biography',
      body: 'Your bio is the first thing travelers read. Guides with detailed bios get 3x more profile views.',
      action: 'Write at least 100 words describing your experience, personality, and why you love guiding.',
    });
  } else if (bioLength < 50) {
    suggestions.push({
      type: 'bio',
      priority: 'medium',
      icon: 'ph-pencil-simple',
      color: 'amber',
      title: 'Expand your biography',
      body: `Your bio is only ${bioLength} words. Guides with 100+ word bios convert 60% better.`,
      action: 'Add more details about your specific expertise, personal style, and memorable tours.',
    });
  }

  // ── Pricing suggestions ────────────────────────────────────────────────
  const currentPerDay = parseFloat(pricing.perDay || 0);
  if (currentPerDay === 0) {
    suggestions.push({
      type: 'pricing',
      priority: 'high',
      icon: 'ph-currency-dollar',
      color: 'red',
      title: 'Set your pricing',
      body: 'Guides without pricing listed are hidden from most search results.',
      action: `Set your Day Rate. The average for ${region} guides is $${benchmark.perDay}/day.`,
    });
  } else if (currentPerDay < benchmark.perDay * 0.4) {
    suggestions.push({
      type: 'pricing',
      priority: 'medium',
      icon: 'ph-chart-line-up',
      color: 'green',
      title: 'Consider raising your rate',
      body: `Your rate ($${currentPerDay}/day) is well below the ${region} average of $${benchmark.perDay}/day. Very low rates can signal low quality to travelers.`,
      action: `Consider setting your rate between $${Math.round(benchmark.perDay * 0.6)} and $${benchmark.perDay}/day.`,
    });
  } else if (!pricing.halfDay) {
    suggestions.push({
      type: 'pricing',
      priority: 'low',
      icon: 'ph-clock-afternoon',
      color: 'blue',
      title: 'Add a Half-Day rate',
      body: '35% of bookings are half-day tours. Adding this option increases your booking potential.',
      action: `A typical half-day rate in ${region} is $${benchmark.halfDay}. Add it to attract more travelers.`,
    });
  }

  // ── Gallery suggestions ───────────────────────────────────────────────
  const galleryCount = Array.isArray(gallery) ? gallery.filter(g => g && g.url).length : 0;
  if (galleryCount === 0) {
    suggestions.push({
      type: 'gallery',
      priority: 'high',
      icon: 'ph-images',
      color: 'purple',
      title: 'Add gallery photos',
      body: 'Guides with photos get 5x more bookings. Travelers want to see your work before booking.',
      action: 'Add at least 4 high-quality photos of your tours, locations, and wildlife/culture encounters.',
    });
  } else if (galleryCount < 4) {
    suggestions.push({
      type: 'gallery',
      priority: 'medium',
      icon: 'ph-images',
      color: 'purple',
      title: `Add more photos (${galleryCount}/4 minimum)`,
      body: 'Guides with 6+ photos get significantly more inquiries. More photos = more trust.',
      action: 'Add at least 2 more photos showcasing different aspects of your tours.',
    });
  }

  // ── Availability suggestions ──────────────────────────────────────────
  const workingDays = Array.isArray(availability.workingDays) ? availability.workingDays : [];
  if (workingDays.length === 0) {
    suggestions.push({
      type: 'availability',
      priority: 'high',
      icon: 'ph-calendar',
      color: 'red',
      title: 'Set your availability',
      body: 'Without availability set, travelers cannot book you through the instant booking system.',
      action: 'Set your working days and hours in Step 11.',
    });
  } else if (workingDays.length < 4) {
    suggestions.push({
      type: 'availability',
      priority: 'medium',
      icon: 'ph-calendar-plus',
      color: 'amber',
      title: 'Increase your available days',
      body: `You've set ${workingDays.length} working days. Guides available 5+ days/week get 60% more bookings.`,
      action: 'Consider adding more available days to maximize your booking potential.',
    });
  }

  // ── Certification suggestions ──────────────────────────────────────────
  const certList = Array.isArray(certifications) ? certifications : [];
  if (certList.length === 0) {
    suggestions.push({
      type: 'certifications',
      priority: 'medium',
      icon: 'ph-certificate',
      color: 'amber',
      title: 'Add certifications',
      body: 'Certified guides earn the "Licensed Guide" badge and appear higher in search results.',
      action: 'Add your tour guide license, first aid certificate, or any national park permits.',
    });
  }

  // ── Instant booking ───────────────────────────────────────────────────
  if (!bookingSettings.instantBooking) {
    suggestions.push({
      type: 'booking',
      priority: 'low',
      icon: 'ph-lightning',
      color: 'green',
      title: 'Enable Instant Booking',
      body: 'Guides with instant booking get 45% more confirmed bookings. Travelers love immediate confirmation.',
      action: 'Enable instant booking in Step 12 to earn the ⚡ Fast Responder badge.',
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));

  return suggestions;
}

const COLOR_MAP = {
  amber: { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', icon: 'text-amber-600', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400' },
  red: { bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800', icon: 'text-red-600', badge: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400' },
  green: { bg: 'bg-green-50 dark:bg-green-950/30', border: 'border-green-200 dark:border-green-800', icon: 'text-green-600', badge: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400' },
  blue: { bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800', icon: 'text-blue-600', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-200 dark:border-purple-800', icon: 'text-purple-600', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400' },
};

export default function GuideAIOptimizer({ profileData = {}, onGoToStep }) {
  const suggestions = generateSuggestions(profileData);
  const highCount = suggestions.filter(s => s.priority === 'high').length;

  if (suggestions.length === 0) {
    return (
      <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-2xl p-6 text-center">
        <div className="w-16 h-16 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <i className="ph ph-check-circle text-white text-3xl" />
        </div>
        <h3 className="font-extrabold text-green-800 dark:text-green-300 text-lg mb-2">Profile Optimized! 🎉</h3>
        <p className="text-green-700 dark:text-green-400 text-sm">Your profile is comprehensive and ready for maximum visibility. You're ready to submit!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-4 border border-slate-700">
        <div className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center shrink-0">
          <i className="ph ph-robot text-white text-xl" />
        </div>
        <div>
          <p className="font-extrabold text-white text-sm">AI Profile Optimizer</p>
          <p className="text-slate-400 text-xs">
            {highCount > 0
              ? `${highCount} critical issue${highCount > 1 ? 's' : ''} found that could significantly impact bookings`
              : 'Profile looks good! A few tweaks to maximize visibility'}
          </p>
        </div>
        <div className="ml-auto shrink-0 bg-green-600/20 text-green-400 text-xs font-bold px-3 py-1 rounded-full border border-green-600/30">
          {suggestions.length} suggestions
        </div>
      </div>

      {/* Suggestions */}
      {suggestions.map((s, i) => {
        const cfg = COLOR_MAP[s.color] || COLOR_MAP.blue;
        const stepMap = { skills: 6, languages: 5, bio: 2, pricing: 9, gallery: 10, availability: 11, certifications: 7, booking: 12 };
        const targetStep = stepMap[s.type];
        return (
          <div key={i} className={`${cfg.bg} ${cfg.border} border rounded-xl p-4`}>
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cfg.badge}`}>
                <i className={`ph ${s.icon} text-lg`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="font-bold text-slate-900 dark:text-white text-sm">{s.title}</p>
                  <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${cfg.badge}`}>
                    {s.priority}
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed mb-2">{s.body}</p>
                <p className="text-slate-700 dark:text-slate-300 text-xs font-semibold">
                  <i className="ph ph-arrow-right text-green-500 mr-1" />
                  {s.action}
                </p>
              </div>
              {targetStep && onGoToStep && (
                <button
                  onClick={() => onGoToStep(targetStep)}
                  className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${cfg.badge}`}
                >
                  Fix →
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
