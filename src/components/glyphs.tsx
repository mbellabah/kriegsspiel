import React from 'react';

// Minimal in-house glyphs: 1.5px strokes on a 16px grid, drawn only where a symbol reads faster than text.
interface GlyphProps {
  size?: number;
  className?: string;
  fill?: string;
  strokeWidth?: number;
}

const Glyph: React.FC<GlyphProps & { children: React.ReactNode }> = ({ size = 12, className, children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="square"
    className={className}
    aria-hidden
  >
    {children}
  </svg>
);

export const X: React.FC<GlyphProps> = (p) => (
  <Glyph {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Glyph>
);

export const Play: React.FC<GlyphProps> = (p) => (
  <Glyph {...p}>
    <path d="M5 3.5v9l7-4.5z" fill="currentColor" stroke="none" />
  </Glyph>
);

export const Pause: React.FC<GlyphProps> = (p) => (
  <Glyph {...p}>
    <path d="M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z" fill="currentColor" stroke="none" />
  </Glyph>
);

export const ChevronDown: React.FC<GlyphProps> = (p) => (
  <Glyph {...p}>
    <path d="M4.5 6.5L8 10l3.5-3.5" strokeLinecap="butt" />
  </Glyph>
);

export const ChevronRight: React.FC<GlyphProps> = (p) => (
  <Glyph {...p}>
    <path d="M6.5 4.5L10 8l-3.5 3.5" strokeLinecap="butt" />
  </Glyph>
);

export const ChevronLeft: React.FC<GlyphProps> = (p) => (
  <Glyph {...p}>
    <path d="M9.5 4.5L6 8l3.5 3.5" strokeLinecap="butt" />
  </Glyph>
);

export const Check: React.FC<GlyphProps> = (p) => (
  <Glyph {...p}>
    <path d="M3.5 8.5l3 3 6-7" strokeLinecap="butt" />
  </Glyph>
);

export const Grip: React.FC<GlyphProps> = (p) => (
  <Glyph {...p}>
    <path d="M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01" strokeWidth={2.2} strokeLinecap="round" />
  </Glyph>
);

export const Reset: React.FC<GlyphProps> = (p) => (
  <Glyph {...p}>
    <path d="M4 8a4 4 0 1 0 1.2-2.85M4 3.5v2.5h2.5" strokeLinecap="butt" />
  </Glyph>
);
