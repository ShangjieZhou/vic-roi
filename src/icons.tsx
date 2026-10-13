export function LockIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path
        fillRule="evenodd"
        d="M10 1.5a4 4 0 0 0-4 4V8H5.5A1.5 1.5 0 0 0 4 9.5v7A1.5 1.5 0 0 0 5.5 18h9a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 14.5 8H14V5.5a4 4 0 0 0-4-4Zm2.5 6.5V5.5a2.5 2.5 0 0 0-5 0V8h5Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function CheckIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function CoffeeIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9Z" />
      <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8 2.5c-.8 1 .8 1.6 0 3M11.5 2.5c-.8 1 .8 1.6 0 3" />
      <path d="M4 21.5h14" />
    </svg>
  )
}
