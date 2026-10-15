import React from 'react';

// Minimal hand-drawn glyphs for the few controls where a text label does not work.
// 1.25px square-capped strokes in currentColor on a 12px grid.

interface GlyphProps {
  size?: number;
  className?: string;
}

const Svg: React.FC<GlyphProps & { children: React.ReactNode }> = ({ size = 11, className, children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.25}
    strokeLinecap="square"
    strokeLinejoin="miter"
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

export const GlyphClose: React.FC<GlyphProps> = (props) => (
  <Svg {...props}>
    <path d="M3 3L9 9M9 3L3 9" />
  </Svg>
);

export const GlyphChevron: React.FC<GlyphProps & { dir?: 'up' | 'down' | 'left' | 'right' }> = ({ dir = 'down', ...props }) => {
  const d = {
    down: 'M3 4.5L6 7.5L9 4.5',
    up: 'M3 7.5L6 4.5L9 7.5',
    left: 'M7.5 3L4.5 6L7.5 9',
    right: 'M4.5 3L7.5 6L4.5 9',
  }[dir];
  return (
    <Svg {...props}>
      <path d={d} />
    </Svg>
  );
};

export const GlyphGrip: React.FC<GlyphProps> = (props) => (
  <Svg {...props}>
    <path d="M4.5 2.5V2.5M7.5 2.5V2.5M4.5 6V6M7.5 6V6M4.5 9.5V9.5M7.5 9.5V9.5" strokeWidth={1.5} />
  </Svg>
);

export const GlyphSign: React.FC<GlyphProps & { sign: 'plus' | 'minus' }> = ({ sign, ...props }) => (
  <Svg {...props}>
    <path d={sign === 'plus' ? 'M2.5 6H9.5M6 2.5V9.5' : 'M2.5 6H9.5'} />
  </Svg>
);

export const GlyphCheck: React.FC<GlyphProps> = (props) => (
  <Svg {...props}>
    <path d="M2.5 6.5L5 9L9.5 3.5" />
  </Svg>
);

export const GlyphSound: React.FC<GlyphProps & { muted?: boolean }> = ({ muted, ...props }) => (
  <Svg {...props}>
    <path d="M1.5 4.5H3.5L6 2.5V9.5L3.5 7.5H1.5Z" />
    {muted ? <path d="M8 4.5L10.5 7M10.5 4.5L8 7" /> : <path d="M8 4.5C8.7 5.2 8.7 6.8 8 7.5M9.5 3C11 4.5 11 7.5 9.5 9" />}
  </Svg>
);
