import { useState, useEffect, useRef } from 'react';

/* ── data ── */
const TABS = [
  { id: 'flights', label: 'Flights', icon: 'ph-airplane' },
  { id: 'hotels', label: 'Hotels & Homes', icon: 'ph-building' },
  { id: 'trains', label: 'Trains', icon: 'ph-train' },
  { id: 'attractions', label: 'Attractions & Tours', icon: 'ph-ticket' },
  { id: 'cars', label: 'Car Rentals', icon: 'ph-car' },
  { id: 'transfers', label: 'Airport Transfers', icon: 'ph-van' },
  { id: 'private', label: 'Private Tours', icon: 'ph-user-circle' },
  { id: 'group', label: 'Group Tours', icon: 'ph-users' },
];

const FAQS = {
  flights: [
    { id: 1, q: 'Are there any flight ticket promotions going on?', category: 'Booking & Price' },
    { id: 2, q: 'How do I change my ticket?', category: 'Ticketing & Payment' },
    { id: 3, q: 'How can I cancel my flight ticket?', category: 'Booking Query' },
    { id: 4, q: 'Have a different question? Chat with us now.', category: 'Hot Topics', isChat: true },
    { id: 5, q: 'What are the baggage allowance policies?', category: 'Passenger Information-related' },
    { id: 6, q: 'How do I request a refund?', category: 'Ticketing & Payment' },
    { id: 7, q: 'Can I select my seat after booking?', category: 'Booking & Price' },
    { id: 8, q: 'What documents do I need for check-in?', category: 'Passenger Information-related' },
  ],
  hotels: [
    { id: 1, q: 'How do I modify my hotel reservation?', category: 'Booking Query' },
    { id: 2, q: 'What is the cancellation policy?', category: 'Booking & Price' },
    { id: 3, q: 'How do I get a receipt for my hotel stay?', category: 'Ticketing & Payment' },
    { id: 4, q: 'Have a different question? Chat with us now.', category: 'Hot Topics', isChat: true },
  ],
  trains: [
    { id: 1, q: 'Can I change my train departure time?', category: 'Booking Query' },
    { id: 2, q: 'Are there any train ticket discounts?', category: 'Booking & Price' },
    { id: 3, q: 'How do I cancel a train ticket?', category: 'Ticketing & Payment' },
    { id: 4, q: 'Have a different question? Chat with us now.', category: 'Hot Topics', isChat: true },
  ],
  attractions: [
    { id: 1, q: 'Can I get a refund for attraction tickets?', category: 'Ticketing & Payment' },
    { id: 2, q: 'How do I redeem my tour voucher?', category: 'Booking Query' },
    { id: 3, q: 'Are child tickets available?', category: 'Passenger Information-related' },
    { id: 4, q: 'Have a different question? Chat with us now.', category: 'Hot Topics', isChat: true },
  ],
  cars: [
    { id: 1, q: 'What documents do I need to rent a car?', category: 'Passenger Information-related' },
    { id: 2, q: 'Can I modify my car rental dates?', category: 'Booking Query' },
    { id: 3, q: 'Is insurance included in my rental?', category: 'Booking & Price' },
    { id: 4, q: 'Have a different question? Chat with us now.', category: 'Hot Topics', isChat: true },
  ],
  transfers: [
    { id: 1, q: 'How early should I book a transfer?', category: 'Booking & Price' },
    { id: 2, q: 'Can I cancel my airport transfer?', category: 'Booking Query' },
    { id: 3, q: 'Are child seats available?', category: 'Passenger Information-related' },
    { id: 4, q: 'Have a different question? Chat with us now.', category: 'Hot Topics', isChat: true },
  ],
  private: [
    { id: 1, q: 'How do I customize my private tour?', category: 'Booking Query' },
    { id: 2, q: 'What is included in a private tour package?', category: 'Booking & Price' },
    { id: 3, q: 'Can I cancel a private tour booking?', category: 'Ticketing & Payment' },
    { id: 4, q: 'Have a different question? Chat with us now.', category: 'Hot Topics', isChat: true },
  ],
  group: [
    { id: 1, q: 'What is the minimum group size?', category: 'Passenger Information-related' },
    { id: 2, q: 'Are group discounts available?', category: 'Booking & Price' },
    { id: 3, q: 'How do I manage group bookings?', category: 'Booking Query' },
    { id: 4, q: 'Have a different question? Chat with us now.', category: 'Hot Topics', isChat: true },
  ],
};

const FILTER_TAGS = ['Hot Topics', 'Booking & Price', 'Ticketing & Payment', 'Booking Query', 'Passenger Information-related'];

const SMART_REPLIES = {
  cancel: 'Would you like to cancel your booking now? I can guide you through the process step by step.',
  change: 'Here are the available rebooking options for your ticket. Which date works best?',
  refund: 'I can help you process a refund. Please share your booking reference to get started.',
  promotion: 'We currently have several promotions active! Check out our deals section for the latest offers.',
};

function detectIntent(msg) {
  const m = msg.toLowerCase();
  if (m.includes('cancel')) return 'cancel';
  if (m.includes('change') || m.includes('modify') || m.includes('rebok')) return 'change';
  if (m.includes('refund')) return 'refund';
  if (m.includes('promo') || m.includes('deal') || m.includes('discount')) return 'promotion';
  return null;
}

/* ── Chat Widget ── */
const SUPPORT_KEY = 'bc_support_messages';
function loadThreads() { try { return JSON.parse(localStorage.getItem(SUPPORT_KEY) || '[]'); } catch { return []; } }
function saveThreads(t) { localStorage.setItem(SUPPORT_KEY, JSON.stringify(t)); }

function ChatWidget({ open, onClose, initialMessage }) {
  const [messages, setMessages] = useState([
    { from: 'bot', text: "Hi! I'm your BookingCart support assistant. How can I help you today?", ts: Date.now() },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef(null);
  const sentRef = useRef(false);
  const threadIdRef = useRef(`thread_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const userEmail = useRef(window.bookingcartUser?.email || 'Guest');

  useEffect(() => {
    if (open && initialMessage && !sentRef.current) {
      sentRef.current = true;
      sendMessage(initialMessage);
    }
  }, [open, initialMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  function persistMessage(msg, reply) {
    const threads = loadThreads();
    const existing = threads.find(t => t.id === threadIdRef.current);
    const userMsg = { from: 'user', text: msg, ts: Date.now() };
    const botMsg = reply ? { from: 'bot', text: reply, ts: Date.now() + 1200 } : null;
    if (existing) {
      existing.messages.push(userMsg);
      if (botMsg) existing.messages.push(botMsg);
      existing.updatedAt = Date.now();
    } else {
      threads.unshift({
        id: threadIdRef.current,
        email: userEmail.current,
        topic: msg.slice(0, 60),
        status: 'open',
        adminRead: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [userMsg, ...(botMsg ? [botMsg] : [])],
      });
    }
    saveThreads(threads);
  }

  function sendMessage(text) {
    const msg = text || input.trim();
    if (!msg) return;
    setInput('');
    setMessages(prev => [...prev, { from: 'user', text: msg }]);
    setTyping(true);
    setTimeout(() => {
      const intent = detectIntent(msg);
      const reply = intent
        ? SMART_REPLIES[intent]
        : "Thanks for reaching out! Our team will respond shortly. In the meantime, check our FAQ below for quick answers.";
      setMessages(prev => [...prev, { from: 'bot', text: reply }]);
      setTyping(false);
      persistMessage(msg, reply);
    }, 1200);
  }

  if (!open) return null;

  return (
    <div className="fixed bottom-6 right-6 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col z-50 overflow-hidden"
      style={{ maxHeight: '70vh' }}>
      {/* header */}
      <div className="bg-gradient-to-r from-teal-600 to-green-600 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <i className="ph ph-headset text-white text-lg" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">BookingCart Support</p>
            <p className="text-white/70 text-xs flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-300 rounded-full inline-block" />
              Online · Avg reply ~30s
            </p>
          </div>
        </div>
        <button onClick={() => { onClose(); sentRef.current = false; }}
          className="text-white/70 hover:text-white transition-colors">
          <i className="ph ph-x text-lg" />
        </button>
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.from === 'bot' && (
              <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center mr-2 shrink-0 mt-1">
                <i className="ph ph-robot text-teal-600 text-sm" />
              </div>
            )}
            <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-snug shadow-sm
              ${m.from === 'user'
                ? 'bg-teal-600 text-white rounded-br-sm'
                : 'bg-white text-slate-700 rounded-bl-sm border border-slate-100'}`}>
              {m.text}
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center mr-2 shrink-0">
              <i className="ph ph-robot text-teal-600 text-sm" />
            </div>
            <div className="bg-white border border-slate-100 px-4 py-2 rounded-2xl rounded-bl-sm shadow-sm flex gap-1 items-center">
              {[0, 0.2, 0.4].map((d, i) => (
                <span key={i} className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${d}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div className="p-3 border-t border-slate-100 bg-white flex gap-2">
        <input
          className="flex-1 bg-slate-50 rounded-xl px-3 py-2 text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-400"
          placeholder="Type your message…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
        />
        <button onClick={() => sendMessage()}
          className="w-9 h-9 rounded-xl bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center transition-colors">
          <i className="ph ph-paper-plane-tilt text-lg" />
        </button>
      </div>
    </div>
  );
}

/* ── Phone modal ── */
function PhoneModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-slate-900 text-lg">Call Us</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <i className="ph ph-x text-xl" />
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-4">Our support team is available 24/7.</p>
        {[
          { region: 'Global (English)', number: '+1 800 BOOKING', flag: '🌍' },
          { region: 'East Africa', number: '+256 800 000 123', flag: '🇺🇬' },
          { region: 'UK & Europe', number: '+44 20 0000 0000', flag: '🇬🇧' },
          { region: 'UAE & Middle East', number: '+971 4 000 0000', flag: '🇦🇪' },
        ].map(({ region, number, flag }) => (
          <a key={region} href={`tel:${number.replace(/\s/g, '')}`}
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-teal-50 transition-colors group mb-2">
            <span className="text-2xl">{flag}</span>
            <div className="flex-1">
              <p className="text-xs text-slate-400 font-medium">{region}</p>
              <p className="font-semibold text-slate-900 group-hover:text-teal-700 transition-colors">{number}</p>
            </div>
            <i className="ph ph-phone text-teal-600 text-xl" />
          </a>
        ))}
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function CustomerSupportPage() {
  useEffect(() => { document.title = 'Customer Support | BookingCart'; }, []);

  const [activeTab, setActiveTab] = useState('flights');
  const [activeFilter, setActiveFilter] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsg, setChatMsg] = useState('');
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState(null);

  const faqs = FAQS[activeTab] || FAQS.flights;
  const filteredFaqs = activeFilter ? faqs.filter(f => f.category === activeFilter) : faqs.slice(0, 4);

  function openChat(question) {
    setChatMsg(question || '');
    setChatOpen(true);
  }

  function handleFaqClick(faq) {
    if (faq.isChat) { openChat(''); return; }
    setExpandedFaq(prev => prev === faq.id ? null : faq.id);
  }

  return (
    <>
      {/* ── Hero header ── */}
      <div className="bg-gradient-to-br from-teal-700 via-teal-600 to-green-600 pt-28 pb-16 px-4 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        <div className="max-w-4xl mx-auto relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 bg-green-300 rounded-full animate-pulse" />
              <span className="text-green-200 text-sm font-medium">Online — we're here to help</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-2">Customer Support</h1>
            <p className="text-teal-100 flex items-center gap-2 text-base font-medium">
              <i className="ph ph-check-circle text-green-300 text-xl" />
              Support in approx. 30s
            </p>
          </div>
          {/* agent illustration */}
          <div className="hidden sm:flex w-32 h-32 rounded-full bg-white/10 border border-white/20 items-center justify-center text-7xl shrink-0">
            🎧
          </div>
        </div>
      </div>

      <div className="bg-slate-100 min-h-screen -mt-4">
        <div className="max-w-4xl mx-auto px-4 pt-8 pb-16">

          {/* ── Service chat card ── */}
          <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-6 sm:p-8 mb-4">
            {/* card header */}
            <div className="flex items-center gap-2 mb-5">
              <span className="w-3 h-3 bg-teal-500 rounded-full animate-pulse" />
              <h2 className="text-lg font-bold text-slate-900">Service chat</h2>
            </div>

            {/* scrollable tab bar */}
            <div className="overflow-x-auto -mx-2 px-2 pb-1 mb-6">
              <div className="flex gap-1 w-max">
                {TABS.map(tab => (
                  <button key={tab.id}
                    onClick={() => { setActiveTab(tab.id); setActiveFilter(null); setExpandedFaq(null); }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all
                      ${activeTab === tab.id
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    <i className={`ph ${tab.icon} text-base`} />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* FAQ 2-column grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {filteredFaqs.map(faq => (
                <div key={faq.id}>
                  <button
                    onClick={() => handleFaqClick(faq)}
                    className={`w-full text-left flex items-center justify-between gap-2 px-4 py-3.5 rounded-xl border transition-all
                      ${faq.isChat
                        ? 'border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-700'
                        : 'border-slate-100 bg-slate-50 hover:bg-teal-50 hover:border-teal-200 text-slate-700'}`}>
                    <span className="text-sm font-medium leading-snug">{faq.q}</span>
                    <i className={`ph ${faq.isChat ? 'ph-chat-dots text-teal-500' : 'ph-caret-right text-slate-400'} text-base shrink-0`} />
                  </button>
                  {expandedFaq === faq.id && (
                    <div className="mt-1 px-4 py-3 bg-teal-50 border border-teal-100 rounded-xl text-sm text-slate-600">
                      <p className="mb-2">Here's how to help with: <span className="font-semibold text-teal-700">"{faq.q}"</span></p>
                      <p>Please visit your <strong>My Bookings</strong> page or click "Chat with us" for personalized assistance from our team.</p>
                      <button onClick={() => openChat(faq.q)}
                        className="mt-3 text-xs font-semibold text-teal-700 underline underline-offset-2 hover:text-teal-900 transition-colors">
                        Chat about this →
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* More FAQ label */}
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              More {TABS.find(t => t.id === activeTab)?.label} FAQ
            </p>

            {/* pill filters */}
            <div className="flex flex-wrap gap-2">
              {FILTER_TAGS.map(tag => (
                <button key={tag}
                  onClick={() => setActiveFilter(prev => prev === tag ? null : tag)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all
                    ${activeFilter === tag
                      ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-teal-400 hover:text-teal-700'}`}>
                  {tag}
                </button>
              ))}
              <button onClick={() => setActiveFilter(null)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold border border-slate-200 text-slate-400 hover:text-slate-600 transition-colors">
                ···
              </button>
            </div>
          </div>

          {/* ── Contact options row ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { icon: 'ph-chat-dots', label: 'Chat', color: 'teal', action: () => openChat('') },
              { icon: 'ph-phone', label: 'Call us', color: 'blue', action: () => setPhoneOpen(true) },
              { icon: 'ph-question', label: 'FAQ', color: 'violet', action: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
              { icon: 'ph-siren', label: 'Emergency assistance', color: 'red', action: () => openChat('I need emergency travel assistance') },
            ].map(({ icon, label, color, action }) => (
              <button key={label} onClick={action}
                className={`bg-white border border-slate-100 rounded-2xl p-4 flex flex-col items-center gap-2 shadow-sm hover:shadow-md hover:border-${color}-200 hover:-translate-y-0.5 transition-all group`}>
                <div className={`w-11 h-11 rounded-xl bg-${color}-50 flex items-center justify-center group-hover:bg-${color}-100 transition-colors`}>
                  <i className={`ph ${icon} text-${color}-600 text-2xl`} />
                </div>
                <span className="text-xs font-semibold text-slate-700 text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>

          {/* ── Guarantee banner ── */}
          <div className="bg-white rounded-2xl border border-teal-100 shadow-sm p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
              <i className="ph ph-shield-check text-teal-600 text-2xl" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-slate-900 mb-1">Travel worry-free with our reliable support</h3>
              <p className="text-sm text-slate-500">Your booking is protected against unexpected issues. Our team is available 24/7 to resolve any problems.</p>
            </div>
            <button className="shrink-0 text-sm font-semibold text-teal-700 border border-teal-200 px-4 py-2 rounded-xl hover:bg-teal-50 transition-colors whitespace-nowrap">
              Learn more
            </button>
          </div>

          {/* ── Easy help banner ── */}
          <div className="mt-4 bg-gradient-to-r from-teal-600 to-green-600 rounded-2xl p-6 text-white">
            <h3 className="font-extrabold text-lg mb-1">It's easy to get help on BookingCart</h3>
            <p className="text-teal-100 text-sm mb-4">Browse answers, chat live, or call us anytime — we've got you covered.</p>
            <button onClick={() => openChat('')}
              className="bg-white text-teal-700 font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-teal-50 transition-colors shadow-sm">
              Start a chat now
            </button>
          </div>

        </div>
      </div>

      {/* ── Chat widget ── */}
      <ChatWidget open={chatOpen} onClose={() => setChatOpen(false)} initialMessage={chatMsg} />
      {/* ── Phone modal ── */}
      <PhoneModal open={phoneOpen} onClose={() => setPhoneOpen(false)} />
    </>
  );
}
