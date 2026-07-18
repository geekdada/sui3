import { cn } from '#/lib/cn'

/**
 * Renders a feather icon from the `/api/icon/:name` endpoint as a CSS mask so
 * it inherits `currentColor` (stays theme-adaptive) without any client JS.
 */
export default function AppIcon({
  icon,
  className,
}: {
  icon: string
  className?: string
}) {
  const url = `/api/icon/${encodeURIComponent(icon)}`
  return (
    <span
      aria-hidden
      className={cn('inline-block h-4 w-4 shrink-0 bg-current', className)}
      style={{
        maskImage: `url("${url}")`,
        WebkitMaskImage: `url("${url}")`,
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
      }}
    />
  )
}
