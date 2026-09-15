import type { CSSProperties } from 'react'

const paths = {
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  rain: (
    <>
      <path d="M5 14a4 4 0 0 1 0-8 6 6 0 0 1 11-1 4.5 4.5 0 1 1 2 9M7 17l-1 3m6-3-1 3m6-3-1 3" />
    </>
  ),
  roads: (
    <>
      <path d="m6 3-3 18M18 3l3 18M12 3v3m0 4v4m0 4v3" />
    </>
  ),
  layers: (
    <>
      <path d="m3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-11v1" />
    </>
  ),
  pin: (
    <>
      <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
      <circle cx="12" cy="10" r="2" />
    </>
  ),
  home: (
    <>
      <path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7" />
    </>
  ),
  plus: <path d="M5 12h14M12 5v14" />,
  minus: <path d="M5 12h14" />,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  share: (
    <>
      <path d="M9 8 7 8a4 4 0 0 0 0 8h4m2-8h4a4 4 0 0 1 0 8h-2M8 12h8" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  play: <path d="m8 4 12 8-12 8Z" fill="currentColor" stroke="none" />,
  pause: <path d="M7 5v14M17 5v14" strokeWidth="4" />,
  replay: (
    <>
      <path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" />
    </>
  ),
  chevron: <path d="m8 5 7 7-7 7" />,
  north: <path d="m12 3 7 17-7-4-7 4Z" />,
} as const

export function Icon({ name, style }: { name: keyof typeof paths; style?: CSSProperties }) {
  return (
    <svg
      className="icon"
      style={style}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
