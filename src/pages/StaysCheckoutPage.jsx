import { useEffect } from 'react';
import { StaysUnavailable } from '../components/StaysUnavailable.jsx';

export default function StaysCheckoutPage() {
  useEffect(() => { document.title = 'Stays Checkout | BookingCart'; }, []);
  return <StaysUnavailable title="Stays checkout is unavailable" />;
}
