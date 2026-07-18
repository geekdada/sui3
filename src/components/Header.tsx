import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { logoutFn } from '#/lib/auth.functions'
import FeatherIcon from './FeatherIcon'
import ServiceWorkerUpdate from './ServiceWorkerUpdate'
import ThemeToggle from './ThemeToggle'
import { Button, buttonVariants } from './ui/button'

export default function Header({
  authenticated,
  enrolled,
}: {
  authenticated: boolean
  enrolled: boolean
}) {
  const router = useRouter()
  const logout = useServerFn(logoutFn)

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-header-bg backdrop-blur">
      <nav className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1 text-sm font-semibold tracking-tight text-foreground no-underline"
        >
          <FeatherIcon name="Grid" size={15} className="text-muted-foreground" />
          SUI3
        </Link>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {authenticated ? (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await logout()
                await router.invalidate()
                router.navigate({ to: '/' })
              }}
            >
              <FeatherIcon name="LogOut" size={15} />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          ) : enrolled ? (
            <Link
              to="/login"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <FeatherIcon name="LogIn" size={15} />
              <span className="hidden sm:inline">Log in</span>
            </Link>
          ) : (
            <Link
              to="/setup"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <FeatherIcon name="Key" size={15} />
              <span className="hidden sm:inline">Setup</span>
            </Link>
          )}
          <ThemeToggle />
          <ServiceWorkerUpdate />
        </div>
      </nav>
    </header>
  )
}
