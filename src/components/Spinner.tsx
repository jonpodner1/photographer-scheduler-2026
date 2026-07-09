export default function Spinner({ className = '' }: { className?: string }) {
  return (
    <div
      className={`h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-primary ${className}`}
      role="status"
      aria-label="Loading"
    />
  )
}
