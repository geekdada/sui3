import FeatherIcon from "@/components/FeatherIcon"
import { cn } from "@/lib/utils"

function Spinner({
  className,
  ...props
}: Omit<React.ComponentProps<typeof FeatherIcon>, "name">) {
  return (
    <FeatherIcon
      name="Loader"
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn("animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
