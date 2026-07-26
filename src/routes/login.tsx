import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { startAuthentication } from '@simplewebauthn/browser'
import { useState } from 'react'
import { beginLoginFn, finishLoginFn } from '#/lib/auth.functions'
import { authStatusQueryOptions } from '#/lib/queries'

export const Route = createFileRoute('/login')({
  loader: async ({ context }) => {
    const status = await context.queryClient.fetchQuery(
      authStatusQueryOptions(),
    )
    if (!status.enrolled) throw redirect({ to: '/setup' })
    if (status.authenticated) throw redirect({ to: '/' })
  },
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <main className="page max-w-md py-16">
      <h1 className="m-0 text-3xl font-bold tracking-[-0.03em]">
        Log in
      </h1>
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
        className="mt-6 border-2 border-foreground bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-shadow hover:shadow-brut-stroke active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-40"
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            const { options, challengeId } = await beginLoginFn()
            const response = await startAuthentication({ optionsJSON: options })
            await finishLoginFn({ data: { challengeId, response } })
            // The "/" loader uses ensureQueryData, which reuses cached data —
            // auth must be refetched before navigating or it loads the
            // public startpage for the now-authenticated user.
            await queryClient.fetchQuery(authStatusQueryOptions())
            await queryClient.invalidateQueries({ queryKey: ['startpage'] })
            router.navigate({ to: '/' })
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed')
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Waiting for passkey…' : 'Continue with passkey'}
      </button>
    </main>
  )
}
