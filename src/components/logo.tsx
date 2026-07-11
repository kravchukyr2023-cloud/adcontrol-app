export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="#14171C" strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M3 11.5V7a4 4 0 0 1 4-4h4.5" />
        <path d="M29 11.5V7a4 4 0 0 0-4-4h-4.5" />
        <path d="M3 20.5V25a4 4 0 0 0 4 4h4.5" />
        <path d="M29 20.5V25a4 4 0 0 1-4 4h-4.5" />
      </g>
      <rect x="11.5" y="11.5" width="9" height="9" rx="2.4" fill="#0C6B41" />
    </svg>
  );
}
