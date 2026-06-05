import { useEffect } from 'react';
import { StaysUnavailable } from '../components/StaysUnavailable.jsx';

export default function StaysDetailsPage() {
  useEffect(() => { document.title = 'Stays Details | BookingCart'; }, []);
  return <StaysUnavailable title="Stay details are unavailable" />;
}
