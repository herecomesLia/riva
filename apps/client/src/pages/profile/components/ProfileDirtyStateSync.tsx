import { useEffect } from "react"

export function ProfileDirtyStateSync({
  isDirty,
  onDirtyChange,
}: {
  isDirty: boolean
  onDirtyChange: (isDirty: boolean) => void
}) {
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange])
  return null
}
