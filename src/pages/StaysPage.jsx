import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function StaysPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to home page with Stays mode active. We don't need a whole duplicate standalone page.
    navigate('/?mode=stays', { replace: true });
  }, [navigate]);

  return null;
}
