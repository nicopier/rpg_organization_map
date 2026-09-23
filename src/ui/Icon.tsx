// Íconos de trazo 24×24, estilo línea.
const PATHS: Record<string, string> = {
  select: 'M4 3l7 17 2.5-7.5L21 10z',
  hand: 'M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15',
  brush: 'M18.4 2.6a2 2 0 0 1 2.9 2.9L10 16.8 7.2 14zM7 14.9c-2 0-3.5 1.6-3.5 3.6 0 1.1-.6 2-1.5 2.5 3.8.5 7.5-1.2 7.5-4.3z',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  room: 'M3 3h11v7h7v11H3zM3 3v18',
  wall: 'M3 4h18v16H3zM3 9.3h18M3 14.6h18M9 4v5.3M15 9.3v5.3M9 14.6V20',
  eraser: 'M7 21h13M5.5 13.5l6-6 6 6-5 5a2 2 0 0 1-2.8 0l-4.2-4.2a.6.6 0 0 1 0-.8zM11.5 7.5l3-3a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8l-3 3',
  ruler: 'M21.3 15.3l-6 6a1 1 0 0 1-1.4 0L2.7 10.1a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0l11.2 11.2a1 1 0 0 1 0 1.4zM7.5 7.5l2 2M10.5 4.5l2 2M4.5 10.5l2 2M13.5 13.5l2 2M16.5 10.5l2 2',
  token: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M9.9 4.2A10 10 0 0 1 12 4c6.4 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.6 8 10 8a9.7 9.7 0 0 0 5.4-1.6M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.9-1',
  grid: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
  plus: 'M12 5v14M5 12h14',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M19 12l-7 7-7-7',
  file: 'M14 3H6v18h12V7zM14 3v4h4',
  folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  upload: 'M12 21V9M7 14l5-5 5 5M4 3h16',
  rotate: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  flip: 'M12 3v18M8 7L3 12l5 5zM16 7l5 5-5 5z',
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  sword: 'M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2',
  next: 'M5 4l10 8-10 8zM19 5v14',
  prev: 'M19 20L9 12l10-8zM5 19V5',
  dice: 'M4 4h16v16H4zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01',
  sort: 'M3 6h13M3 12h9M3 18h5M17 8v12M14 17l3 3 3-3',
  x: 'M18 6L6 18M6 6l12 12',
  note: 'M4 4h16v11l-5 5H4zM15 20v-5h5M8 9h8M8 13h4',
  hammer: 'M15 12l-8.5 8.5a2.1 2.1 0 0 1-3-3L12 9M17.6 15L22 10.6M20.9 11.7l-1.3-1.3a2 2 0 0 1-.6-1.4v-.9l-2.3-2.3a5.3 5.3 0 0 0-3.7-1.5H9.9l.9.9A6.4 6.4 0 0 1 12.7 9v1.6l2 2h1a2 2 0 0 1 1.4.6l1.3 1.3',
  dm: 'M12 2l2.9 6.9L22 9.3l-5.5 4.8L18.2 21 12 17.3 5.8 21l1.7-6.9L2 9.3l7.1-.4z',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  layers: 'M12 2l10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5',
}

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
