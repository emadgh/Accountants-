'use client';

// Adapted from React Bits ElectricBorder, inspired by @BalintFerenczy.
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useWorkspacePreferences } from '@/hooks/use-workspace-preferences';
import './electric-border.css';

type ElectricBorderProps = {
  children?: ReactNode;
  color?: string;
  speed?: number;
  chaos?: number;
  borderRadius?: number;
  className?: string;
  style?: CSSProperties;
};

function random(x: number) {
  return (Math.sin(x * 12.9898) * 43758.5453) % 1;
}

function noise2D(x: number, y: number) {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return random(i + j * 57) * (1 - ux) * (1 - uy)
    + random(i + 1 + j * 57) * ux * (1 - uy)
    + random(i + (j + 1) * 57) * (1 - ux) * uy
    + random(i + 1 + (j + 1) * 57) * ux * uy;
}

function octavedNoise(x: number, time: number, seed: number) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 10;
  for (let octave = 0; octave < 4; octave++) {
    value += amplitude * noise2D(frequency * x + seed * 100, time * frequency * 0.3);
    amplitude *= 0.7;
    frequency *= 1.6;
  }
  return value;
}

function roundedRectPoint(t: number, left: number, top: number, width: number, height: number, radius: number) {
  const straightWidth = width - 2 * radius;
  const straightHeight = height - 2 * radius;
  const arcLength = Math.PI * radius / 2;
  const distance = t * (2 * straightWidth + 2 * straightHeight + 4 * arcLength);
  let offset = 0;
  if (distance <= (offset += straightWidth)) return { x: left + radius + distance, y: top };
  if (distance <= (offset += arcLength)) {
    const angle = -Math.PI / 2 + (distance - offset + arcLength) / arcLength * Math.PI / 2;
    return { x: left + width - radius + radius * Math.cos(angle), y: top + radius + radius * Math.sin(angle) };
  }
  if (distance <= (offset += straightHeight)) return { x: left + width, y: top + radius + distance - offset + straightHeight };
  if (distance <= (offset += arcLength)) {
    const angle = (distance - offset + arcLength) / arcLength * Math.PI / 2;
    return { x: left + width - radius + radius * Math.cos(angle), y: top + height - radius + radius * Math.sin(angle) };
  }
  if (distance <= (offset += straightWidth)) return { x: left + width - radius - (distance - offset + straightWidth), y: top + height };
  if (distance <= (offset += arcLength)) {
    const angle = Math.PI / 2 + (distance - offset + arcLength) / arcLength * Math.PI / 2;
    return { x: left + radius + radius * Math.cos(angle), y: top + height - radius + radius * Math.sin(angle) };
  }
  if (distance <= (offset += straightHeight)) return { x: left, y: top + height - radius - (distance - offset + straightHeight) };
  const angle = Math.PI + (distance - offset) / arcLength * Math.PI / 2;
  return { x: left + radius + radius * Math.cos(angle), y: top + radius + radius * Math.sin(angle) };
}

export default function ElectricBorder({ children, color = '#5227FF', speed = 1, chaos = 0.12, borderRadius = 24, className = '', style }: ElectricBorderProps) {
  const { preferences } = useWorkspacePreferences();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !container || !ctx) return;

    const padding = 20;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let previousFrame = 0;
    let time = 0;

    const draw = (timestamp: number) => {
      if (previousFrame && timestamp - previousFrame < 32 && !reducedMotion.matches) {
        frame = requestAnimationFrame(draw);
        return;
      }
      const elapsed = previousFrame ? Math.min(timestamp - previousFrame, 100) : 0;
      previousFrame = timestamp;
      time += elapsed / 1000 * speed;

      const rect = container.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (!width || !height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const canvasWidth = Math.ceil((width + 2 * padding) * dpr);
      const canvasHeight = Math.ceil((height + 2 * padding) * dpr);
      if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        canvas.style.width = `${width + 2 * padding}px`;
        canvas.style.height = `${height + 2 * padding}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width + 2 * padding, height + 2 * padding);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      const radius = Math.max(0, Math.min(borderRadius, width / 2, height / 2));
      const perimeter = 2 * (width + height - 4 * radius) + 2 * Math.PI * radius;
      const samples = Math.max(64, Math.min(1200, Math.floor(perimeter / 3)));
      ctx.beginPath();
      for (let index = 0; index <= samples; index++) {
        const progress = index / samples;
        const point = roundedRectPoint(progress, padding, padding, width, height, radius);
        const x = point.x + octavedNoise(progress * 8, time, 0) * 35 * chaos;
        const y = point.y + octavedNoise(progress * 8, time, 1) * 35 * chaos;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      if (!reducedMotion.matches && !preferences.reducedEffects) frame = requestAnimationFrame(draw);
    };

    const resizeObserver = new ResizeObserver(() => {
      if (reducedMotion.matches || preferences.reducedEffects) draw(0);
    });
    resizeObserver.observe(container);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [color, speed, chaos, borderRadius, preferences.reducedEffects]);

  return <div ref={containerRef} className={`electric-border ${className}`} style={{ '--electric-border-color': color, borderRadius, ...style } as CSSProperties} aria-hidden="true">
    <div className="eb-canvas-container"><canvas ref={canvasRef} className="eb-canvas" /></div>
    <div className="eb-layers"><div className="eb-glow-1" /><div className="eb-glow-2" /><div className="eb-background-glow" /></div>
    <div className="eb-content">{children}</div>
  </div>;
}
