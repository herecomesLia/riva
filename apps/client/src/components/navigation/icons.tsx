type IconProps = {
  className?: string
}

export function HomeIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10.8 12 4l8 6.8V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9.2Z" />
    </svg>
  )
}

export function ProfileIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3h10a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2-2-1.4V5a2 2 0 0 1 2-2Zm2 6h6V7H9v2Zm0 4h6v-2H9v2Zm0 4h4v-2H9v2Z" />
    </svg>
  )
}

export function RoleIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 4h6a2 2 0 0 1 2 2v2h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h3V6a2 2 0 0 1 2-2Zm1 4h4V6h-4v2Zm-6 4v2h16v-2H4Z" />
    </svg>
  )
}

export function PracticeIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4h10a4 4 0 0 1 4 4v10h-2a4 4 0 0 0-4-4H4V4Zm2 2v6h6a5.9 5.9 0 0 1 4 1.5V8a2 2 0 0 0-2-2H6Zm12 3h2v11H9v-2h9V9Z" />
    </svg>
  )
}

export function InterviewIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-4.6L7 20v-5a3 3 0 0 1-3-3V5Zm3-1a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2v2.4l2.6-2.4H17a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7Z" />
    </svg>
  )
}

export function HistoryIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3a9 9 0 1 1-8.5 12h2.2A7 7 0 1 0 5 12H2l4-4 4 4H7a5 5 0 1 1 1.5 3.6l1.4-1.4A3 3 0 1 0 9 12H7a5 5 0 0 1 5-5v6l4 2-.9 1.8L10 14.2V3.2c.6-.1 1.3-.2 2-.2Z" />
    </svg>
  )
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 22a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 12 22Zm7-6-2-2.2V10a5 5 0 0 0-4-4.9V3h-2v2.1A5 5 0 0 0 7 10v3.8L5 16v2h14v-2Z" />
    </svg>
  )
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.5 4a6.5 6.5 0 0 1 5.1 10.5l4 4-1.4 1.4-4-4A6.5 6.5 0 1 1 10.5 4Zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z" />
    </svg>
  )
}
