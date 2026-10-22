import type { CSSProperties } from "react";

const paths = {
  plus: "M12 5v14M5 12h14", search: "m20 20-4-4M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  panel: "M9 3v18M4 3h16v18H4z", chevron: "m9 5 7 7-7 7", down: "m6 9 6 6 6-6",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-3-6.7M21 3v6h-6", folder: "M3 7h7l2-3h9v15H3z",
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
  return <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
    <path d="M14 2v24M5 5l18 18M23 5 5 23M4 10h20v12L14 12 4 22V10Zm1-5 9 7 9-7v18l-9-7-9 7V5Z" />
  </svg>;
}
