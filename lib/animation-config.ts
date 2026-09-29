import type { CSSProperties } from 'react';
import type { Variants } from 'motion/react';

const easingPresets = {
  smooth: { motion: [0.22, 1, 0.36, 1] as [number, number, number, number], css: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  standard: { motion: [0.2, 0, 0, 1] as [number, number, number, number], css: 'cubic-bezier(0.2, 0, 0, 1)' },
  exit: { motion: [0.4, 0, 1, 1] as [number, number, number, number], css: 'cubic-bezier(0.4, 0, 1, 1)' },
  linear: { motion: 'linear' as const, css: 'linear' },
};

export type EasingPreset = keyof typeof easingPresets;

type AnimationFrame = {
  opacity: number;
  x?: number;
  y?: number;
  scale?: number;
};

type AnimationStage = {
  from: AnimationFrame;
  to: AnimationFrame;
  duration: number;
  ease: EasingPreset;
};

type SurfaceAnimation = {
  enter: AnimationStage;
  exit: AnimationStage;
};

type AuthFormAnimation = {
  panel: AnimationStage;
  cascade: {
    gapAfterPanel: number;
    stagger: number;
    itemDuration: number;
    itemOffsetY: number;
    itemEase: EasingPreset;
    optionDelay: number;
    optionStagger: number;
    setupActionDelay: number;
  };
};

type AnimationStyle = CSSProperties & Record<`--${string}`, string | number | undefined>;

const dialogAnimation: SurfaceAnimation = {
  enter: {
    from: { opacity: 0, y: 10, scale: 0.97 },
    to: { opacity: 1, y: 0, scale: 1 },
    duration: 0.2,
    ease: 'smooth',
  },
  exit: {
    from: { opacity: 1, y: 0, scale: 1 },
    to: { opacity: 0, y: 4, scale: 0.98 },
    duration: 0.14,
    ease: 'exit',
  },
};

// Durations are in seconds; each surface can tune entry, exit, and easing independently.
export const animationConfig = {
  page: {
    enter: {
      from: { opacity: 0, y: 12 },
      to: { opacity: 1, y: 0 },
      duration: 0.24,
      ease: 'smooth',
    },
    exit: {
      from: { opacity: 1, y: 0 },
      to: { opacity: 0, y: -8 },
      duration: 0.16,
      ease: 'exit',
    },
  },
  dialog: dialogAnimation,
  confirmation: {
    enter: { ...dialogAnimation.enter, duration: 0.18 },
    exit: { ...dialogAnimation.exit, duration: 0.12 },
  },
  authForm: {
    panel: {
      from: { opacity: 0, y: 12, scale: 0.985 },
      to: { opacity: 1, y: 0, scale: 1 },
      duration: 0.24,
      ease: 'smooth',
    },
    cascade: {
      gapAfterPanel: 0.02,
      stagger: 0.065,
      itemDuration: 0.18,
      itemOffsetY: 8,
      itemEase: 'standard',
      optionDelay: 0.02,
      optionStagger: 0.05,
      setupActionDelay: 0.38,
    },
  },
} satisfies {
  page: SurfaceAnimation;
  dialog: SurfaceAnimation;
  confirmation: SurfaceAnimation;
  authForm: AuthFormAnimation;
};

function toVariant(stage: AnimationStage) {
  return {
    ...stage.to,
    transition: {
      duration: stage.duration,
      ease: easingPresets[stage.ease].motion,
    },
  };
}

export const pageTransitionVariants: Variants = {
  initial: animationConfig.page.enter.from,
  animate: toVariant(animationConfig.page.enter),
  exit: toVariant(animationConfig.page.exit),
};

export const authFormPanelVariants: Variants = {
  initial: animationConfig.authForm.panel.from,
  animate: toVariant(animationConfig.authForm.panel),
};

export const authFormCascadeVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: animationConfig.authForm.panel.duration + animationConfig.authForm.cascade.gapAfterPanel,
      staggerChildren: animationConfig.authForm.cascade.stagger,
    },
  },
};

export const authFormOptionsVariants: Variants = {
  hidden: {
    opacity: 0,
    y: animationConfig.authForm.cascade.itemOffsetY,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: animationConfig.authForm.cascade.itemDuration,
      ease: easingPresets[animationConfig.authForm.cascade.itemEase].motion,
      delayChildren: animationConfig.authForm.cascade.optionDelay,
      staggerChildren: animationConfig.authForm.cascade.optionStagger,
      when: 'beforeChildren',
    },
  },
};

export const authFormItemVariants: Variants = {
  hidden: { opacity: 0, y: animationConfig.authForm.cascade.itemOffsetY },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: animationConfig.authForm.cascade.itemDuration,
      ease: easingPresets[animationConfig.authForm.cascade.itemEase].motion,
    },
  },
};

export const authFormSetupActionVariants: Variants = {
  hidden: { opacity: 0, y: animationConfig.authForm.cascade.itemOffsetY },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: animationConfig.authForm.cascade.itemDuration,
      delay: animationConfig.authForm.cascade.setupActionDelay,
      ease: easingPresets[animationConfig.authForm.cascade.itemEase].motion,
    },
  },
};

export function getDialogAnimationStyle(surface: 'dialog' | 'confirmation'): AnimationStyle {
  const { enter, exit } = animationConfig[surface];

  return {
    '--dialog-enter-duration': `${enter.duration}s`,
    '--dialog-enter-easing': easingPresets[enter.ease].css,
    '--dialog-enter-from-opacity': String(enter.from.opacity),
    '--dialog-enter-to-opacity': String(enter.to.opacity),
    '--dialog-enter-from-x': `${enter.from.x ?? 0}px`,
    '--dialog-enter-to-x': `${enter.to.x ?? 0}px`,
    '--dialog-enter-from-y': `${enter.from.y ?? 0}px`,
    '--dialog-enter-to-y': `${enter.to.y ?? 0}px`,
    '--dialog-enter-from-scale': String(enter.from.scale ?? 1),
    '--dialog-enter-to-scale': String(enter.to.scale ?? 1),
    '--dialog-exit-duration': `${exit.duration}s`,
    '--dialog-exit-easing': easingPresets[exit.ease].css,
    '--dialog-exit-from-opacity': String(exit.from.opacity),
    '--dialog-exit-to-opacity': String(exit.to.opacity),
    '--dialog-exit-from-x': `${exit.from.x ?? 0}px`,
    '--dialog-exit-to-x': `${exit.to.x ?? 0}px`,
    '--dialog-exit-from-y': `${exit.from.y ?? 0}px`,
    '--dialog-exit-to-y': `${exit.to.y ?? 0}px`,
    '--dialog-exit-from-scale': String(exit.from.scale ?? 1),
    '--dialog-exit-to-scale': String(exit.to.scale ?? 1),
  } as AnimationStyle;
}
