'use client';

import { useEffect, useState } from 'react';
import LiquidEther from '@/components/react-bits/liquid-ether';

export function LiquidEtherBackground() {
  const [motionAllowed, setMotionAllowed] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setMotionAllowed(!preference.matches);

    updatePreference();
    preference.addEventListener('change', updatePreference);
    return () => preference.removeEventListener('change', updatePreference);
  }, []);

  return (
    <div className="app-background" aria-hidden="true">
      {motionAllowed ? (
        <LiquidEther
          colors={['#0ea5e9', '#6366f1', '#a78bfa']}
          mouseForce={12}
          cursorSize={100}
          autoSpeed={0.32}
          autoIntensity={1.1}
          resolution={0.4}
        />
      ) : null}
    </div>
  );
}
