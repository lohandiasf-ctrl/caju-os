'use client';

import { MotionConfig } from 'motion/react';

// Toda animação do `motion` respeita "reduzir movimento" do sistema:
// transform/escala somem e ficam só as trocas de opacidade.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
