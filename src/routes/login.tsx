import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { startAuthentication } from '@simplewebauthn/browser'
import { useState } from 'react'
import { beginLoginFn, devLoginFn, finishLoginFn } from '#/lib/auth.functions'
import { authStatusQueryOptions } from '#/lib/queries'

export const Route = createFileRoute('/login')({
  loader: async ({ context }) => {
    const status = await context.queryClient.fetchQuery(
      authStatusQueryOptions()
    )
    // In dev the page stays reachable without a passkey so the dev login
    // below works against a freshly migrated database.
    if (!status.enrolled && !import.meta.env.DEV) {
      throw redirect({ to: '/setup' })
    }
    if (status.authenticated) throw redirect({ to: '/' })
    return { enrolled: status.enrolled }
  },
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { enrolled } = Route.useLoaderData()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // The "/" loader uses ensureQueryData, which reuses cached data —
  // auth must be refetched before navigating or it loads the
  // public startpage for the now-authenticated user.
  async function completeLogin() {
    await queryClient.fetchQuery(authStatusQueryOptions())
    await queryClient.invalidateQueries({ queryKey: ['startpage'] })
    router.navigate({ to: '/' })
  }

  async function runLogin(login: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await login()
      await completeLogin()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page max-w-md py-16">
      <h1 className="m-0 text-3xl font-bold tracking-[-0.03em]">Log in</h1>
      <span aria-hidden className="mt-3 block h-[3px] w-24 bg-stroke" />
      <p className="mt-3 text-sm text-muted-foreground">
        Authenticate with your enrolled passkey.
      </p>
      {error ? (
        <p className="mt-4 border-l-[6px] border-l-stroke bg-muted px-3 py-2 text-sm font-medium text-foreground">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        className="mt-6 border border-foreground bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-shadow hover:shadow-brut-stroke active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-40"
        onClick={() =>
          runLogin(async () => {
            const { options, challengeId } = await beginLoginFn()
            const response = await startAuthentication({ optionsJSON: options })
            await finishLoginFn({ data: { challengeId, response } })
          })
        }
      >
        {busy ? 'Waiting for passkey…' : 'Continue with passkey'}
      </button>
      {import.meta.env.DEV ? (
        <div className="mt-8 border-t border-dashed pt-6">
          <p className="label-brut text-xs text-muted-foreground">Dev only</p>
          <button
            type="button"
            disabled={busy}
            className="mt-3 flex w-full items-center justify-center gap-1.5 border border-dashed px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
            onClick={() =>
              runLogin(async () => {
                await devLoginFn()
              })
            }
          >
            Skip passkey and log in
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            {enrolled
              ? 'Issues a real session without the passkey ceremony. Stripped from production builds.'
              : 'No passkey is enrolled yet, so the button above will fail. Use this instead, or enroll one at /setup.'}
          </p>
        </div>
      ) : null}
    </main>
  )
}
