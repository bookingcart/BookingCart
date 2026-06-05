import { useEffect } from 'react';
import { StaysUnavailable } from '../components/StaysUnavailable.jsx';

export default function StaysConfirmationPage() {
  useEffect(() => { document.title = 'Stays Confirmation | BookingCart'; }, []);
  return <StaysUnavailable title="Stays confirmation is unavailable" />;
}
