import type { CSSProperties } from "react";

const paths = {
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z",
  pin: "m9 3 6 0-1 6 4 4H6l4-4-1-6M12 13v8",
  thumbUp:"M7 10H3v11h4M7 20h11l3-10h-7l1-6-3-1-5 8v9",thumbDown:"M7 14H3V3h4M7 4h11l3 10h-7l1 6-3 1-5-8V4",
  copy: "M9 9h12v12H9zM15 9V3H3v12h6",external: "M14 3h7v7M21 3 10 14M10 3H3v18h18v-7",
  plus: "M12 5v14M5 12h14", search: "m20 20-4-4M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  panel: "M9 3v18M4 3h16v18H4z", chevron: "m9 5 7 7-7 7", down: "m6 9 6 6 6-6",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-3-6.7M21 3v6h-6", folder: "M3 7h7l2-3h9v15H3z", file: "M6 3h8l4 4v14H6zM14 3v4h4", upload: "M12 16V4M7 9l5-5 5 5M4 20h16", paperclip: "m20 11.5-8.4 8.4a5.2 5.2 0 0 1-7.4-7.4l8.6-8.6a3.5 3.5 0 0 1 5 5l-8.6 8.6a1.7 1.7 0 0 1-2.5-2.5l7.9-7.9", trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  computer: "M3 4h18v13H3zM8 21h8M12 17v4M8 8v3M12 8v3", automation: "M12 3a9 9 0 1 0 9 9M12 7v5l3 2M19 2v6M16 5h6",
  artifact: "M3 5h18v14H3zM8 5v14M8 10h13", settings: "m12 3 9 5v8l-9 5-9-5V8zM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  lock: "M6 10h12v11H6zM8 10V7a4 4 0 0 1 8 0v3M12 14v3", arrow: "M12 19V5M5 12l7-7 7 7",
  microphone: "M9 4a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0zM6 10v2a6 6 0 0 0 12 0v-2M12 18v4M9 22h6",
  close: "m6 6 12 12M6 18 18 6", more: "M5 12h.01M12 12h.01M19 12h.01",
  menu: "M4 6h16M4 12h16M4 18h16", user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2",
  link: "m9 15 6-6M7 13l-2 2a4 4 0 0 0 6 6l3-3M10 6l3-3a4 4 0 0 1 6 6l-2 2", check: "m5 12 4 4L19 6",
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
export function ResearchMark() {
  return <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 6h13a6 6 0 0 1 6 6v5a6 6 0 0 1-6 6h-5l-7 5v-6a6 6 0 0 1-5-6v-4a6 6 0 0 1 4-6ZM11 12h8M11 17h5"/>
  </svg>;
}
