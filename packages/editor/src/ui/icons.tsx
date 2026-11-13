import type { ReactNode } from "react";

function Svg({ size = 16, children, fill = false }: { size?: number; children: ReactNode; fill?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

type P = { size?: number };

export const Icon = {
  play: (p: P) => <Svg {...p} fill><path d="M4.5 2.7v10.6a.6.6 0 0 0 .92.5l8.2-5.3a.6.6 0 0 0 0-1L5.42 2.2a.6.6 0 0 0-.92.5Z" /></Svg>,
  stop: (p: P) => <Svg {...p} fill><rect x="3.5" y="3.5" width="9" height="9" rx="2" /></Svg>,
  restart: (p: P) => <Svg {...p}><path d="M2.8 8a5.2 5.2 0 1 0 1.6-3.75M2.6 2.4v2.6h2.6" /></Svg>,
  send: (p: P) => <Svg {...p}><path d="M8 12.5v-9M4.2 7.2 8 3.4l3.8 3.8" strokeWidth="1.9" /></Svg>,
  undo: (p: P) => <Svg {...p}><path d="M5.6 3.2 2.8 6l2.8 2.8M3 6h6.2a3.6 3.6 0 0 1 0 7.2H6.4" /></Svg>,
  redo: (p: P) => <Svg {...p}><path d="M10.4 3.2 13.2 6l-2.8 2.8M13 6H6.8a3.6 3.6 0 0 0 0 7.2h2.8" /></Svg>,
  cursor: (p: P) => <Svg {...p}><path d="M3.6 2.6 6.9 13l1.7-4.3L13 7 3.6 2.6Z" /></Svg>,
  brush: (p: P) => <Svg {...p}><path d="M13.3 2.7a1.4 1.4 0 0 0-2 0L6.4 7.6l2 2 4.9-4.9a1.4 1.4 0 0 0 0-2ZM5.6 8.6c-1.5.1-2.3 1-2.5 2.2-.1.8-.4 1.5-1 1.9 1.7.5 4.4.3 5.2-1.6.3-.8.1-1.5-.4-2-.4-.3-.8-.5-1.3-.5Z" /></Svg>,
  plus: (p: P) => <Svg {...p}><path d="M8 3.2v9.6M3.2 8h9.6" strokeWidth="1.7" /></Svg>,
  sun: (p: P) => <Svg {...p}><circle cx="8" cy="8" r="2.7" /><path d="M8 1.6v1.5M8 12.9v1.5M1.6 8h1.5M12.9 8h1.5M3.5 3.5l1 1M11.5 11.5l1 1M3.5 12.5l1-1M11.5 4.5l1-1" /></Svg>,
  bulb: (p: P) => <Svg {...p}><path d="M5.9 11.1c-1.2-.8-2-2.1-2-3.6a4.1 4.1 0 0 1 8.2 0c0 1.5-.8 2.8-2 3.6v1.3H5.9v-1.3ZM6.4 14.3h3.2" /></Svg>,
  bulbOff: (p: P) => <Svg {...p}><path d="M5.9 11.1c-1.2-.8-2-2.1-2-3.6 0-.7.2-1.4.5-2M6 3.9a4.1 4.1 0 0 1 6.1 3.6c0 .9-.3 1.7-.8 2.4M10.1 12.4H5.9v-1.3M6.4 14.3h3.2M2.4 2.4l11.2 11.2" /></Svg>,
  fit: (p: P) => <Svg {...p}><path d="M2.8 6V3.6c0-.5.4-.8.8-.8H6M10 2.8h2.4c.5 0 .8.4.8.8V6M13.2 10v2.4c0 .5-.4.8-.8.8H10M6 13.2H3.6a.8.8 0 0 1-.8-.8V10" /></Svg>,
  search: (p: P) => <Svg {...p}><circle cx="7.1" cy="7.1" r="4.2" /><path d="m10.3 10.3 3 3" /></Svg>,
  sidebar: (p: P) => <Svg {...p}><rect x="2.2" y="3" width="11.6" height="10" rx="2.2" /><path d="M6.2 3v10" /></Svg>,
  trash: (p: P) => <Svg {...p}><path d="M3 4.4h10M6.3 4.4V3.2c0-.3.3-.6.6-.6h2.2c.3 0 .6.3.6.6v1.2M4.3 4.4l.5 8.1c0 .5.5.9 1 .9h4.4c.5 0 1-.4 1-.9l.5-8.1" /></Svg>,
  copy: (p: P) => <Svg {...p}><rect x="5.4" y="5.4" width="7.8" height="7.8" rx="1.8" /><path d="M10.6 5.4V4.2c0-.8-.6-1.4-1.4-1.4h-5c-.8 0-1.4.6-1.4 1.4v5c0 .8.6 1.4 1.4 1.4h1.2" /></Svg>,
  sparkle: (p: P) => <Svg {...p} fill><path d="M7 1.8c.2 2.9 1.4 4.1 4.3 4.3-2.9.2-4.1 1.4-4.3 4.3C6.800 7.5 5.6 6.300 2.7 6.100 5.6 5.900 6.800 4.700 7 1.800ZM11.900 9.300c.1 1.500.8 2.200 2.300 2.300-1.500.1-2.200.8-2.300 2.300-.1-1.500-.8-2.200-2.300-2.300 1.500-.1 2.200-.8 2.300-2.300Z" /></Svg>,
  warn: (p: P) => <Svg {...p}><path d="M8 2.6 1.9 13h12.200L8 2.600ZM8 6.600v3M8 11.300v.1" /></Svg>,
  x: (p: P) => <Svg {...p}><path d="m4.200 4.200 7.600 7.600M11.800 4.200l-7.600 7.600" /></Svg>,
  scene: (p: P) => <Svg {...p}><path d="M2.4 11.800 6 7.400l2.400 2.800 1.800-2 3.400 3.600M2.400 3.600h11.200v8.800H2.400z" /><circle cx="10.600" cy="5.800" r="0.900" /></Svg>,
  chat: (p: P) => <Svg {...p}><path d="M2.600 7.600c0-2.700 2.400-4.800 5.400-4.800s5.400 2.100 5.400 4.800-2.400 4.800-5.400 4.800c-.600 0-1.200-.100-1.800-.300L3.400 13.200l.500-2.300c-.800-.900-1.300-2-1.300-3.300Z" /></Svg>,
  file: (p: P) => <Svg {...p}><path d="M4.200 2.600h4.600l3 3v7c0 .400-.400.800-.800.800H4.200a.800.800 0 0 1-.800-.800V3.400c0-.400.400-.800.800-.800ZM8.600 2.800v3h3" /></Svg>,
  moon: (p: P) => <Svg {...p}><path d="M13 9.600A5.400 5.400 0 0 1 6.400 3a5.400 5.400 0 1 0 6.600 6.600Z" /></Svg>,
  flip: (p: P) => <Svg {...p}><path d="M8 2.400v11.200M5.600 4.800 2.400 8l3.200 3.200M10.400 4.800 13.600 8l-3.200 3.200" /></Svg>,
  target: (p: P) => <Svg {...p}><circle cx="8" cy="8" r="5" /><circle cx="8" cy="8" r="1.400" /></Svg>,
};
