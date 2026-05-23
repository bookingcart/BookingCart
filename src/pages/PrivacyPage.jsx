import { useEffect } from 'react';
import { useLegacyScripts } from '../hooks/useLegacyScripts.js';
import { HeaderAuthCluster } from '../components/HeaderAuthCluster.jsx';
import { FlightFooter } from '../components/FlightFooter.jsx';
const SCRIPTS = ['/js/loading-ui.js','/js/auth.js'];

export default function PrivacyPage() {
  useEffect(() => { document.title = 'BookingCart — Privacy'; }, []);
  useLegacyScripts(SCRIPTS, 'privacy');
  return (
    <>
          <main className="flex-1 container mx-auto px-6 py-16 max-w-4xl">
      
              <h1 className="text-4xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
              <p className="text-sm text-slate-400 mb-10">Last updated: February 28, 2026</p>
      
              <div className="space-y-10 text-slate-700 leading-relaxed">
      
                  <section>
                      <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Introduction</h2>
                      <p>Welcome to BookingCart. We respect your privacy and are committed to protecting the personal
                          information you share with us. This Privacy Policy explains how we collect, use, disclose, and
                          safeguard your information when you use our flight booking platform.</p>
                  </section>
      
                  <section>
                      <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Information We Collect</h2>
                      <p className="mb-3">We may collect the following types of information:</p>
                      <ul className="list-disc list-inside space-y-2 pl-2">
                          <li><strong>Personal Information:</strong> Name, email address, phone number, and payment details
                              when you make a booking.</li>
                          <li><strong>Account Data:</strong> Information provided via Google Sign-In, such as your name,
                              email, and profile picture.</li>
                          <li><strong>Usage Data:</strong> Browser type, IP address, pages visited, and interaction data
                              collected automatically.</li>
                          <li><strong>Cookies:</strong> Small data files stored on your device to enhance your experience.
                          </li>
                      </ul>
                  </section>
      
                  <section>
                      <h2 className="text-xl font-semibold text-slate-900 mb-3">3. How We Use Your Information</h2>
                      <ul className="list-disc list-inside space-y-2 pl-2">
                          <li>To process and manage flight bookings.</li>
                          <li>To personalize your experience and remember your preferences.</li>
                          <li>To communicate important booking updates and confirmations.</li>
                          <li>To improve our platform through analytics.</li>
                          <li>To comply with legal obligations.</li>
                      </ul>
                  </section>
      
                  <section>
                      <h2 className="text-xl font-semibold text-slate-900 mb-3">4. Data Sharing</h2>
                      <p>We do not sell your personal data. We may share information with:</p>
                      <ul className="list-disc list-inside space-y-2 pl-2 mt-3">
                          <li><strong>Airline Partners:</strong> To fulfil your booking.</li>
                          <li><strong>Payment Processors:</strong> To securely process transactions.</li>
                          <li><strong>Service Providers:</strong> Third-party tools that help us operate our platform (e.g.,
                              analytics, hosting).</li>
                      </ul>
                  </section>
      
                  <section>
                      <h2 className="text-xl font-semibold text-slate-900 mb-3">5. Data Security</h2>
                      <p>We implement industry-standard security measures to protect your data, including encryption in
                          transit (HTTPS) and secure storage practices. However, no method of electronic storage is 100%
                          secure.</p>
                  </section>
      
                  <section>
                      <h2 className="text-xl font-semibold text-slate-900 mb-3">6. Your Rights</h2>
                      <p>Depending on your jurisdiction, you may have the right to:</p>
                      <ul className="list-disc list-inside space-y-2 pl-2 mt-3">
                          <li>Access, correct, or delete your personal data.</li>
                          <li>Withdraw consent for data processing.</li>
                          <li>Request a copy of your data in a portable format.</li>
                          <li>Object to certain types of processing.</li>
                      </ul>
                  </section>
      
                  <section>
                      <h2 className="text-xl font-semibold text-slate-900 mb-3">7. Cookies</h2>
                      <p>We use cookies and similar technologies to improve site functionality and analyze usage. You can
                          manage cookie preferences through your browser settings.</p>
                  </section>
      
                  <section>
                      <h2 className="text-xl font-semibold text-slate-900 mb-3">8. Contact Us</h2>
                      <p>If you have any questions about this Privacy Policy, please contact us at:</p>
                      <p className="mt-3 font-semibold text-green-700">bookingcart.business@gmail.com</p>
                  </section>
      
              </div>
          </main>
      
          
          <FlightFooter />
    </>
  );
}
