/** Distinctive ERCMP mark — response arcs + crew node. Uses currentColor. */
export function ErcmpLogo({ className, title = 'ERCMP' }: { className?: string; title?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      width="40"
      height="40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      {/* Outer chassis */}
      <path
        d="M12 3.5h16l7.5 7.5v16L28 34.5H12L4.5 27V11L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        opacity="0.9"
      />
      {/* Inner bevel */}
      <path
        d="M14.2 7.2h11.6l5 5v11.6l-5 5H14.2l-5-5V12.2l5-5Z"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.35"
      />
      {/* Response arcs (SW → NE sweep) */}
      <path
        d="M11.5 24.5c3.2 3.4 7.8 4.6 12.2 3.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.45"
      />
      <path
        d="M13.2 20.8c2.4 2.6 5.9 3.5 9.2 2.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M15 17.2c1.6 1.7 3.9 2.3 6.1 1.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* Vector tip */}
      <path
        d="M21.2 16.2l5.4-5.4M26.6 10.8h-4.2M26.6 10.8v4.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Crew node */}
      <circle cx="16.2" cy="23.2" r="2.35" fill="currentColor" />
      <circle cx="16.2" cy="23.2" r="4.2" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      {/* Instrument ticks */}
      <path d="M20 3.5v2.2M20 34.3v2.2M3.5 20h2.2M34.3 20h2.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
    </svg>
  )
}
