import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { logoutFn } from '#/lib/auth.functions'
import CacheActivity from './CacheActivity'
import FeatherIcon from './FeatherIcon'
import ThemeToggle from './ThemeToggle'

const ACTION_CLASS =
  'inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-muted-foreground no-underline transition hover:border-primary hover:text-foreground'

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
            <button
              type="button"
              className={ACTION_CLASS}
              onClick={async () => {
                await logout()
                await router.invalidate()
                router.navigate({ to: '/' })
              }}
            >
              <FeatherIcon name="LogOut" size={15} />
              <span className="hidden sm:inline">Log out</span>
            </button>
          ) : enrolled ? (
            <Link to="/login" className={ACTION_CLASS}>
              <FeatherIcon name="LogIn" size={15} />
              <span className="hidden sm:inline">Log in</span>
            </Link>
          ) : (
            <Link to="/setup" className={ACTION_CLASS}>
              <FeatherIcon name="Key" size={15} />
              <span className="hidden sm:inline">Setup</span>
            </Link>
          )}
          <CacheActivity
            authenticated={authenticated}
            className={ACTION_CLASS}
          />
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
