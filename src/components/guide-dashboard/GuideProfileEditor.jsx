import { useState } from 'react';

const CATEGORY_OPTIONS = [
  'Safari Guide', 'Wildlife Guide', 'Birding Guide', 'Food Tour Guide', 
  'Hiking & Trekking', 'Cultural & History', 'Photography Guide', 
  'Boat & River Safari', 'Gorilla Trekking', 'Mountain Climbing'
];

const SKILL_OPTIONS = [
  'Wildlife Tracking', 'First Aid & Safety', 'Photography & Composition',
  'Storytelling & History', 'Culinary & Wine', 'Navigation & GPS',
  'Wilderness Survival', 'Bird Identification', 'Botanical Knowledge', 'Child Friendly'
];

const LANGUAGE_OPTIONS = ['English', 'French', 'German', 'Spanish', 'Swahili', 'Italian', 'Dutch', 'Chinese', 'Japanese'];
const PROFICIENCY_LEVELS = ['Native', 'Fluent', 'Professional', 'Intermediate', 'Basic'];

export default function GuideProfileEditor({ profile, onSave, onLogActivity }) {
  const [activeSubTab, setActiveSubTab] = useState('personal');
  const [savedMsg, setSavedMsg] = useState('');
  const [saving, setSaving] = useState(false);

  // Profile data states
  const [personal, setPersonal] = useState({
    name: profile?.step_personal?.fullName || profile?.name || '',
    bio: profile?.step_personal?.bio || profile?.bio || '',
    phone: profile?.step_personal?.phone || profile?.phone || '',
    photo: profile?.step_personal?.photo || profile?.photo || '',
    city: profile?.step_personal?.city || profile?.city || '',
    yearsExp: profile?.step_experience?.yearsExp || profile?.yearsExp || 5,
    emergencyContact: profile?.step_personal?.emergencyContact || ''
  });

  const [categories, setCategories] = useState(
    Array.isArray(profile?.step_categories?.selected) ? profile.step_categories.selected : (profile?.categories || ['Safari Guide', 'Wildlife Guide'])
  );

  const [areas, setAreas] = useState({
    country: profile?.step_areas?.country || profile?.country || 'Uganda',
    cities: Array.isArray(profile?.step_areas?.cities) ? profile.step_areas.cities : ['Kampala', 'Entebbe', 'Jinja', 'Murchison Falls'],
    attractions: Array.isArray(profile?.step_areas?.attractions) ? profile.step_areas.attractions : ['Bwindi Impenetrable Forest', 'Queen Elizabeth Park']
  });
  const [newCity, setNewCity] = useState('');
  const [newAttraction, setNewAttraction] = useState('');

  const [languages, setLanguages] = useState(
    Array.isArray(profile?.step_languages?.list) ? profile.step_languages.list : [
      { name: 'English', level: 'Native' },
      { name: 'Swahili', level: 'Fluent' }
    ]
  );
  const [newLangName, setNewLangName] = useState('French');
  const [newLangLevel, setNewLangLevel] = useState('Fluent');

  const [skills, setSkills] = useState(
    Array.isArray(profile?.step_skills?.selected) ? profile.step_skills.selected : (profile?.skills || ['Wildlife Tracking', 'First Aid & Safety', 'Storytelling & History'])
  );
  const [customSkill, setCustomSkill] = useState('');

  const [pricing, setPricing] = useState({
    hourlyRate: profile?.step_pricing?.perHour || profile?.pricing?.perHour || 25,
    halfDayRate: profile?.step_pricing?.halfDay || profile?.pricing?.halfDay || 90,
    fullDayRate: profile?.step_pricing?.perDay || profile?.pricing?.perDay || 150,
    multiDayRate: profile?.step_pricing?.multiDay || profile?.pricing?.multiDay || 135,
    customPricingNotes: profile?.step_pricing?.customNotes || ''
  });

  const rawGallery = Array.isArray(profile?.step_gallery) && profile.step_gallery.length > 0
    ? profile.step_gallery
    : (Array.isArray(profile?.gallery) ? profile.gallery : []);
  const normalizedGallery = rawGallery.map(item => (typeof item === 'string' ? item : item?.url || item?.src || '')).filter(Boolean);

  const [gallery, setGallery] = useState(normalizedGallery);

  const [certifications, setCertifications] = useState(
    Array.isArray(profile?.step_certifications) ? profile.step_certifications : [
      { name: 'Licensed National Tour Guide', issuer: 'Ministry of Tourism', year: '2021', verified: true },
      { name: 'Wilderness First Aid & CPR', issuer: 'Red Cross', year: '2023', verified: true }
    ]
  );
  const [newCert, setNewCert] = useState({ name: '', issuer: '', year: new Date().getFullYear().toString() });

  // Photo Upload Handler (Local Device File Pick)
  const handlePhotoFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPersonal(prev => ({ ...prev, photo: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  // Gallery Upload Handler (Local Device File Pick)
  const handleGalleryFilesChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const readAsDataURL = (file) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });

    const newUrls = await Promise.all(files.map(readAsDataURL));
    const updatedGallery = [...gallery, ...newUrls];
    setGallery(updatedGallery);
    await saveSection('Gallery Management', updatedGallery);
  };

  const saveSection = async (sectionName, payload) => {
    setSaving(true);
    setSavedMsg('');
    try {
      if (onSave) await onSave(sectionName, payload);
      if (onLogActivity) onLogActivity(`Updated ${sectionName.replace('_', ' ')}`);
      setSavedMsg(`✅ ${sectionName.replace('_', ' ')} saved successfully!`);
      setTimeout(() => setSavedMsg(''), 4000);
    } catch (err) {
      console.error(err);
      setSavedMsg('❌ Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      {/* Toast Notification */}
      {savedMsg && (
        <div className="bg-emerald-500 text-white px-6 py-3 font-bold text-sm flex items-center justify-between animate-fade-in">
          <span>{savedMsg}</span>
          <button onClick={() => setSavedMsg('')} className="font-black hover:opacity-80">&times;</button>
        </div>
      )}

      {/* Sub-navigation tabs */}
      <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-800 px-4 pt-4 gap-2 scrollbar-none">
        {[
          { id: 'personal', label: 'Personal Info', icon: 'ph-user' },
          { id: 'categories', label: 'Categories', icon: 'ph-compass' },
          { id: 'areas', label: 'Areas Covered', icon: 'ph-map-pin' },
          { id: 'languages', label: 'Languages', icon: 'ph-translate' },
          { id: 'skills', label: 'Skills & Certs', icon: 'ph-certificate' },
          { id: 'pricing', label: 'Pricing', icon: 'ph-currency-dollar' },
          { id: 'gallery', label: 'Gallery', icon: 'ph-image' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold shrink-0 flex items-center gap-1.5 transition-colors ${
              activeSubTab === tab.id
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <i className={`ph ${tab.icon} text-base`} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-6 md:p-8">
        {/* 1. PERSONAL INFORMATION */}
        {activeSubTab === 'personal' && (
          <form onSubmit={(e) => { e.preventDefault(); saveSection('Personal Information', personal); }} className="space-y-6 max-w-2xl">
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <i className="ph-fill ph-user-circle text-emerald-500 text-xl" />
              Personal Information
            </h3>

            <div className="flex items-center gap-6 pb-4 border-b border-slate-100 dark:border-slate-800">
              <img
                src={personal.photo || (Array.isArray(gallery) && (gallery[0]?.url || gallery[0])) || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'}
                alt="Profile"
                className="w-20 h-20 rounded-full object-cover border-2 border-emerald-500 shadow-md shrink-0"
              />
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Profile Photo</label>
                <div className="flex gap-3 items-center">
                  <label className="cursor-pointer px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl transition-colors inline-flex items-center gap-2">
                    <i className="ph ph-upload-simple text-sm" /> Pick Image from Device
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoFileChange} />
                  </label>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Recommended square image, at least 400x400px.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={personal.name}
                  onChange={e => setPersonal({ ...personal, name: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={personal.phone}
                  onChange={e => setPersonal({ ...personal, phone: e.target.value })}
                  placeholder="+256 700 000 000"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Base City</label>
                <input
                  type="text"
                  value={personal.city}
                  onChange={e => setPersonal({ ...personal, city: e.target.value })}
                  placeholder="e.g. Kampala"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Years of Experience</label>
                <input
                  type="number"
                  min="0"
                  value={personal.yearsExp}
                  onChange={e => setPersonal({ ...personal, yearsExp: parseInt(e.target.value) || 0 })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Emergency Contact</label>
              <input
                type="text"
                value={personal.emergencyContact}
                onChange={e => setPersonal({ ...personal, emergencyContact: e.target.value })}
                placeholder="Name & Phone Number (e.g. Jane Doe +256 780 123 456)"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Biography / About You</label>
              <textarea
                rows={5}
                value={personal.bio}
                onChange={e => setPersonal({ ...personal, bio: e.target.value })}
                placeholder="Tell travelers about your passion, tour style, expertise, and what makes your tours unique..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
              />
              <p className="text-[11px] text-slate-400 mt-1">Minimum 50 words recommended for higher traveler engagement.</p>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl transition-all shadow-md flex items-center gap-2"
            >
              <i className="ph ph-floppy-disk text-base" /> {saving ? 'Saving...' : 'Save Personal Info'}
            </button>
          </form>
        )}

        {/* 2. CATEGORIES */}
        {activeSubTab === 'categories' && (
          <div className="space-y-6 max-w-2xl">
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <i className="ph-fill ph-compass text-emerald-500 text-xl" />
              Tour Categories
            </h3>
            <p className="text-xs text-slate-500">Select all categories that apply to your expertise. Changes update immediately upon saving.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CATEGORY_OPTIONS.map(cat => {
                const isSelected = categories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      if (isSelected) setCategories(categories.filter(c => c !== cat));
                      else setCategories([...categories, cat]);
                    }}
                    className={`p-3.5 rounded-2xl border text-left font-bold text-xs transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-800 dark:text-emerald-300 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <span>{cat}</span>
                    <i className={`ph ${isSelected ? 'ph-check-circle-fill text-emerald-600 text-lg' : 'ph-circle text-slate-300'}`} />
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => saveSection('Categories', categories)}
              disabled={saving}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl transition-all shadow-md flex items-center gap-2"
            >
              <i className="ph ph-floppy-disk text-base" /> {saving ? 'Saving...' : 'Save Categories'}
            </button>
          </div>
        )}

        {/* 3. AREAS COVERED */}
        {activeSubTab === 'areas' && (
          <div className="space-y-6 max-w-2xl">
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <i className="ph-fill ph-map-pin text-emerald-500 text-xl" />
              Areas Covered
            </h3>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Primary Country</label>
              <input
                type="text"
                value={areas.country}
                onChange={e => setAreas({ ...areas, country: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Cities Covered</label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  placeholder="e.g. Kampala, Jinja"
                  value={newCity}
                  onChange={e => setNewCity(e.target.value)}
                  className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newCity.trim() && !areas.cities.includes(newCity.trim())) {
                      setAreas({ ...areas, cities: [...areas.cities, newCity.trim()] });
                      setNewCity('');
                    }
                  }}
                  className="px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl"
                >
                  Add City
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {areas.cities.map(c => (
                  <span key={c} className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-2 border border-slate-200 dark:border-slate-700">
                    {c}
                    <button onClick={() => setAreas({ ...areas, cities: areas.cities.filter(x => x !== c) })} className="hover:text-rose-500 font-black">&times;</button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Attractions / Parks</label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  placeholder="e.g. Murchison Falls, Queen Elizabeth"
                  value={newAttraction}
                  onChange={e => setNewAttraction(e.target.value)}
                  className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newAttraction.trim() && !areas.attractions.includes(newAttraction.trim())) {
                      setAreas({ ...areas, attractions: [...areas.attractions, newAttraction.trim()] });
                      setNewAttraction('');
                    }
                  }}
                  className="px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl"
                >
                  Add Park
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {areas.attractions.map(a => (
                  <span key={a} className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-2 border border-emerald-200 dark:border-emerald-800">
                    {a}
                    <button onClick={() => setAreas({ ...areas, attractions: areas.attractions.filter(x => x !== a) })} className="hover:text-rose-500 font-black">&times;</button>
                  </span>
                ))}
              </div>
            </div>

            <button
              onClick={() => saveSection('Areas Covered', areas)}
              disabled={saving}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl transition-all shadow-md flex items-center gap-2"
            >
              <i className="ph ph-floppy-disk text-base" /> {saving ? 'Saving...' : 'Save Areas Covered'}
            </button>
          </div>
        )}

        {/* 4. LANGUAGES */}
        {activeSubTab === 'languages' && (
          <div className="space-y-6 max-w-2xl">
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <i className="ph-fill ph-translate text-emerald-500 text-xl" />
              Languages Spoken
            </h3>

            <div className="space-y-3">
              {languages.map((lang, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <div className="font-bold text-sm text-slate-900 dark:text-white">{lang.name}</div>
                  <div className="flex items-center gap-3">
                    <select
                      value={lang.level}
                      onChange={e => {
                        const updated = [...languages];
                        updated[i].level = e.target.value;
                        setLanguages(updated);
                      }}
                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold"
                    >
                      {PROFICIENCY_LEVELS.map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
                    </select>
                    <button onClick={() => setLanguages(languages.filter((_, idx) => idx !== i))} className="text-rose-500 hover:text-rose-700 font-black px-2">&times;</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2 items-center">
              <select
                value={newLangName}
                onChange={e => setNewLangName(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold"
              >
                {LANGUAGE_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <select
                value={newLangLevel}
                onChange={e => setNewLangLevel(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold"
              >
                {PROFICIENCY_LEVELS.map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
              </select>
              <button
                type="button"
                onClick={() => {
                  if (!languages.some(l => l.name === newLangName)) {
                    setLanguages([...languages, { name: newLangName, level: newLangLevel }]);
                  }
                }}
                className="px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl"
              >
                Add Language
              </button>
            </div>

            <button
              onClick={() => saveSection('Languages', languages)}
              disabled={saving}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl transition-all shadow-md flex items-center gap-2"
            >
              <i className="ph ph-floppy-disk text-base" /> {saving ? 'Saving...' : 'Save Languages'}
            </button>
          </div>
        )}

        {/* 5. SKILLS & CERTS */}
        {activeSubTab === 'skills' && (
          <div className="space-y-6 max-w-2xl">
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <i className="ph-fill ph-certificate text-emerald-500 text-xl" />
              Skills & Certifications
            </h3>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Select Skills</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {SKILL_OPTIONS.map(s => {
                  const isSelected = skills.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        if (isSelected) setSkills(skills.filter(x => x !== s));
                        else setSkills([...skills, s]);
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {isSelected && '✓ '} {s}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add custom skill..."
                  value={customSkill}
                  onChange={e => setCustomSkill(e.target.value)}
                  className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs font-semibold"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customSkill.trim() && !skills.includes(customSkill.trim())) {
                      setSkills([...skills, customSkill.trim()]);
                      setCustomSkill('');
                    }
                  }}
                  className="px-4 py-2 bg-slate-800 text-white font-bold text-xs rounded-xl"
                >
                  Add Custom
                </button>
              </div>
            </div>

            {/* Certifications list */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Certifications & Licenses</h4>
              <div className="space-y-2 mb-4">
                {certifications.map((c, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <div>
                      <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                        {c.name}
                        {c.verified && <i className="ph-fill ph-seal-check text-emerald-500 text-xs" title="Verified by Admin" />}
                      </div>
                      <div className="text-[11px] text-slate-400">{c.issuer} · {c.year}</div>
                    </div>
                    <button onClick={() => setCertifications(certifications.filter((_, idx) => idx !== i))} className="text-rose-500 font-black">&times;</button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Cert Name (e.g. First Aid)"
                  value={newCert.name}
                  onChange={e => setNewCert({ ...newCert, name: e.target.value })}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  placeholder="Issuer (e.g. Red Cross)"
                  value={newCert.issuer}
                  onChange={e => setNewCert({ ...newCert, issuer: e.target.value })}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newCert.name.trim()) {
                      setCertifications([...certifications, { ...newCert, verified: false }]);
                      setNewCert({ name: '', issuer: '', year: new Date().getFullYear().toString() });
                    }
                  }}
                  className="bg-emerald-600 text-white font-bold text-xs rounded-xl py-2"
                >
                  Add Cert
                </button>
              </div>
            </div>

            <button
              onClick={() => saveSection('Skills & Certifications', { skills, certifications })}
              disabled={saving}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl transition-all shadow-md flex items-center gap-2"
            >
              <i className="ph ph-floppy-disk text-base" /> {saving ? 'Saving...' : 'Save Skills & Certs'}
            </button>
          </div>
        )}

        {/* 6. PRICING */}
        {activeSubTab === 'pricing' && (
          <form onSubmit={(e) => { e.preventDefault(); saveSection('Pricing Rates', pricing); }} className="space-y-6 max-w-2xl">
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <i className="ph-fill ph-currency-dollar text-emerald-500 text-xl" />
              Tour Pricing & Rates ($ USD)
            </h3>
            <p className="text-xs text-slate-500">Set your rates. The platform records rate changes automatically.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Hourly Rate ($)</label>
                <input
                  type="number"
                  min="0"
                  value={pricing.hourlyRate}
                  onChange={e => setPricing({ ...pricing, hourlyRate: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Half-Day Rate (4 Hours) ($)</label>
                <input
                  type="number"
                  min="0"
                  value={pricing.halfDayRate}
                  onChange={e => setPricing({ ...pricing, halfDayRate: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Full-Day Rate (8 Hours) ($)</label>
                <input
                  type="number"
                  min="0"
                  value={pricing.fullDayRate}
                  onChange={e => setPricing({ ...pricing, fullDayRate: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Multi-Day Rate (Per Day) ($)</label>
                <input
                  type="number"
                  min="0"
                  value={pricing.multiDayRate}
                  onChange={e => setPricing({ ...pricing, multiDayRate: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Custom Pricing Notes</label>
              <textarea
                rows={3}
                placeholder="e.g. Group discounts, equipment included, custom expedition rates..."
                value={pricing.customPricingNotes}
                onChange={e => setPricing({ ...pricing, customPricingNotes: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-semibold"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl transition-all shadow-md flex items-center gap-2"
            >
              <i className="ph ph-floppy-disk text-base" /> {saving ? 'Saving...' : 'Save Pricing Rates'}
            </button>
          </form>
        )}

        {/* 7. GALLERY */}
        {activeSubTab === 'gallery' && (
          <div className="space-y-6 max-w-3xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <i className="ph-fill ph-image text-emerald-500 text-xl" />
                  Gallery Management
                </h3>
                <p className="text-xs text-slate-500">Upload photos from your device, reorder, or set your featured photo.</p>
              </div>

              <label className="cursor-pointer px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-md inline-flex items-center gap-2 shrink-0">
                <i className="ph ph-upload-simple text-base" /> Upload Photos from Device
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryFilesChange} />
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {gallery.map((imgUrl, i) => (
                <div key={i} className="group relative aspect-[4/3] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shadow-sm">
                  <img src={imgUrl} alt={`Gallery ${i}`} className="w-full h-full object-cover" />
                  {i === 0 && (
                    <span className="absolute top-2 left-2 bg-emerald-500 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full shadow-sm">
                      Featured Main
                    </span>
                  )}
                  <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    {i !== 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...gallery];
                          const [moved] = updated.splice(i, 1);
                          updated.unshift(moved);
                          setGallery(updated);
                        }}
                        className="px-2.5 py-1 bg-white text-slate-900 font-extrabold text-[10px] rounded-lg shadow"
                      >
                        Set Featured
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setGallery(gallery.filter((_, idx) => idx !== i))}
                      className="p-1.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700"
                    >
                      <i className="ph ph-trash text-sm" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => saveSection('Gallery Management', gallery)}
              disabled={saving}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl transition-all shadow-md flex items-center gap-2"
            >
              <i className="ph ph-floppy-disk text-base" /> {saving ? 'Saving...' : 'Save Gallery'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
