// Line icons in the SpaceX style shared with the gravity and poland apps:
// a 16×16 grid, one hairline stroke (1.3) in currentColor, no fills, square
// ends. They replace emoji, which clash with the technical look and render
// differently on every platform.
import type { SVGProps } from 'react'

const P: Record<string, string> = {
  today: 'M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  recipes: 'M3 2.5h7.5a2 2 0 0 1 2 2v9H5a2 2 0 0 1-2-2v-9ZM3 11.5a2 2 0 0 1 2-2h7.5M6 5.5h4',
  plan: 'M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3M5 9h1.5M9.5 9H11M5 11.5h1.5',
  shopping: 'M1.5 2.5h2l1.6 7.5h7.4l1.5-5.5H4.3M6 13.5h.01M12 13.5h.01',
  pantry: 'M4.5 2.5h7M4 4.5h8v9H4zM4 7.5h8',
  tracking: 'M2.5 13.5h11M4 11V8M7 11V4.5M10 11V6.5M13 11V9',
  budzet: 'M2.5 4.5h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-10zM2.5 4.5l8-2v2M10.5 9h3',
  supplements: 'M5.6 10.4 10.4 5.6M3.9 12.1a2.4 2.4 0 0 1 0-3.4l4.8-4.8a2.4 2.4 0 0 1 3.4 3.4l-4.8 4.8a2.4 2.4 0 0 1-3.4 0Z',
  reminders: 'M4 11V7a4 4 0 0 1 8 0v4l1.5 1.5h-11ZM6.5 14h3',
  chores: 'M9.5 1.5 7 7M4.5 7.5h5l1.5 6.5H3z',
  todos: 'M2.5 2.5h11v11h-11zM5 8l2 2 4-4',
  ideas: 'M6 12.5h4M6.5 14.5h3M8 1.5a4.5 4.5 0 0 0-2.5 8.2v1.3h5V9.7A4.5 4.5 0 0 0 8 1.5Z',
  habits: 'M2.5 8a5.5 5.5 0 0 1 9.7-3.5M13.5 8a5.5 5.5 0 0 1-9.7 3.5M12.5 1.5v3h-3M3.5 14.5v-3h3',
  blocks: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM3.4 3.4l9.2 9.2',
  notes: 'M6 2.5a2 2 0 0 1 4 0v5a2 2 0 0 1-4 0zM3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5',
  help: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1V10M8 12h.01',
  settings: 'M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7M9 3v3M12 3v3M4 10v3M7 10v3',
  admin: 'M8 1.5 13.5 4v4c0 3.2-2.4 5.6-5.5 6.5C4.9 13.6 2.5 11.2 2.5 8V4Z',
  menu: 'M2 4.5h12M2 8h12M2 11.5h12',
  sun: 'M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1',
  moon: 'M13.5 9.5A5.5 5.5 0 1 1 6.5 2.5a4.5 4.5 0 0 0 7 7Z',
  install: 'M8 1.5v8M5 6.5l3 3 3-3M2.5 11v2.5h11V11',
  close: 'M3.5 3.5l9 9M12.5 3.5l-9 9',
  lock: 'M3.5 7.5h9v6.5h-9zM5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5',
  bell: 'M4 11V7a4 4 0 0 1 8 0v4l1.5 1.5h-11ZM6.5 14h3',
  check: 'M3 8.5l3 3 7-7',
  x: 'M4 4l8 8M12 4l-8 8',
  plus: 'M8 2.5v11M2.5 8h11',
  minus: 'M2.5 8h11',
  drop: 'M8 1.5S3.5 6.5 3.5 9.5a4.5 4.5 0 0 0 9 0C12.5 6.5 8 1.5 8 1.5Z',
  flame: 'M8 14.5a4.5 4.5 0 0 0 4.5-4.5C12.5 6 8 1.5 8 1.5S9 5 6.5 7c0 0-1-1-1-2.5-1.3 1.3-2 3-2 5.5A4.5 4.5 0 0 0 8 14.5Z',
  copy: 'M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3',
  chat: 'M2.5 3h11v8H7l-3 2.5V11H2.5z',
  import: 'M8 1.5v8M5 6.5l3 3 3-3M2.5 11v2.5h11V11',
  edit: 'M10.5 2.5l3 3-8 8h-3v-3z',
  trash: 'M2.5 4.5h11M6 4.5v-2h4v2M4 4.5l.7 9h6.6l.7-9',
  share: 'M11.5 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM4.5 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM11.5 15a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6.3 7.1l3.4-2M6.3 8.9l3.4 2',
  print: 'M4.5 5.5v-3h7v3M4.5 11.5h-2v-6h11v6h-2M4.5 9.5h7v4h-7z',
  search: 'M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM10.5 10.5l3 3',
  star: 'M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6Z',
  bolt: 'M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z',
  play: 'M5 3v10l8-5z',
  pause: 'M5 3v10M11 3v10',
  arrowRight: 'M2.5 8h11M9.5 4l4 4-4 4',
  arrowLeft: 'M13.5 8h-11M6.5 4l-4 4 4 4',
  chevronDown: 'M4 6l4 4 4-4',
  external: 'M9.5 2.5h4v4M13.5 2.5 7 9M11.5 9.5v4h-9v-9h4',
  calendar: 'M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3',
  clock: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM8 4.5V8l2.5 1.5',
  user: 'M8 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM2.5 14.5a5.5 5.5 0 0 1 11 0',
  heart: 'M8 13.5S2 10 2 6a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 7.5-6 7.5Z',
  info: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM8 7v4.5M8 4.5h.01',
  warning: 'M8 1.5 14.5 13.5h-13ZM8 6v3.5M8 11.5h.01',
  fish: 'M11 8C9 4.5 4 4.5 1.5 8 4 11.5 9 11.5 11 8ZM11 8l3.5-2.5v5ZM4.5 7.5h.01',
  home: 'M1.5 7.5 8 2l6.5 5.5M3.5 6v7.5h9V6M6.5 13.5v-4h3v4',
}

export type IconName = keyof typeof P

export const ICON_NAMES = Object.keys(P) as IconName[]

export default function Icon({ name, size = 16, className, ...rest }:
  { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true"
      className={className} {...rest}>
      <path d={P[name]} stroke="currentColor" strokeWidth={1.3} strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  )
}
