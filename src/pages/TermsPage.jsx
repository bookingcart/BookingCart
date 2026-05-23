import { useEffect } from 'react';
import { useLegacyScripts } from '../hooks/useLegacyScripts.js';
import { HeaderAuthCluster } from '../components/HeaderAuthCluster.jsx';
import { FlightFooter } from '../components/FlightFooter.jsx';
const SCRIPTS = ['/js/loading-ui.js','/js/auth.js'];

export default function TermsPage() {
  useEffect(() => { document.title = 'BookingCart — Terms'; }, []);
  useLegacyScripts(SCRIPTS, 'terms');
  return (
    <>
        <main className="flex-1 container mx-auto px-6 py-16 max-w-4xl">
      
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">Terms of Service</h1>
          <p className="text-sm text-slate-400 mb-10">Last updated: February 28, 2026</p>
      
          <div className="space-y-10 text-slate-700 dark:text-slate-300 leading-relaxed">
      
            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-3">1. Acceptance of Terms</h2>
              <p>By accessing or using BookingCart, you agree to be bound by these Terms of Service. If you do not agree with
                any part of these terms, you may not use our services.</p>
            </section>
      
            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-3">2. Use of Service</h2>
              <p className="mb-3">BookingCart provides a platform for searching and booking flights. When using our service, you
                agree to:</p>
              <ul className="list-disc list-inside space-y-2 pl-2">
                <li>Provide accurate and complete personal and payment information.</li>
                <li>Use the platform only for lawful purposes.</li>
                <li>Not attempt to interfere with platform operations or security.</li>
                <li>Not use automated tools to scrape or collect data from our service.</li>
              </ul>
            </section>
      
            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-3">3. Booking and Payments</h2>
              <ul className="list-disc list-inside space-y-2 pl-2">
                <li>All flight prices are displayed in the currency indicated at the time of search.</li>
                <li>Prices are subject to change until a booking is confirmed and payment is processed.</li>
                <li>BookingCart acts as an intermediary between you and the airline. The airline's own terms and conditions
                  also apply to your booking.</li>
                <li>Payment is processed securely through our third-party payment provider.</li>
              </ul>
            </section>
      
            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-3">4. Cancellations and Refunds</h2>
              <p>Cancellation and refund policies are determined by the airline operating the flight. BookingCart will assist
                in facilitating refund requests, but the final decision rests with the airline. Please review the airline's
                cancellation policy before completing your booking.</p>
            </section>
      
            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-3">5. User Accounts</h2>
              <p>If you create an account or sign in via Google, you are responsible for maintaining the confidentiality of
                your login credentials. You agree to notify us immediately of any unauthorized use of your account.</p>
            </section>
      
            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-3">6. Intellectual Property</h2>
              <p>All content on BookingCart, including text, graphics, logos, and software, is the property of BookingCart or
                its licensors and is protected by intellectual property laws. You may not reproduce, distribute, or create
                derivative works without prior written consent.</p>
            </section>
      
            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-3">7. Limitation of Liability</h2>
              <p>BookingCart is provided "as is" without warranties of any kind. We are not liable for any indirect,
                incidental, or consequential damages arising from your use of our service, including but not limited to missed
                flights, booking errors by airlines, or service disruptions.</p>
            </section>
      
            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-3">8. Changes to Terms</h2>
              <p>We reserve the right to modify these Terms of Service at any time. Continued use of the platform after
                changes are posted constitutes your acceptance of the updated terms.</p>
            </section>
      
            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-3">9. Contact Us</h2>
              <p>For questions about these Terms, please reach out to us at:</p>
              <p className="mt-3 font-semibold text-green-700">bookingcart.business@gmail.com</p>
            </section>
      
          </div>
        </main>
      
        
        <FlightFooter />
    </>
  );
}
