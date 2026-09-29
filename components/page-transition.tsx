'use client';

import { MotionConfig } from 'motion/react';

export function PageTransition({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
