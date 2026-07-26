import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { startRegistration } from '@simplewebauthn/browser'
import { useState } from 'react'
import { beginSetupFn, finishSetupFn } from '#/lib/auth.functions'
import { authStatusQueryOptions } from '#/lib/queries'

export const Route = createFileRoute('/setup')({
  loader: async ({ context }) => {
    const status = await context.queryClient.fetchQuery(
      authStatusQueryOptions(),
    )
    if (status.enrolled) throw redirect({ to: status.authenticated ? '/' : '/login' })
  },
  component: SetupPage,
})

function SetupPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [setupToken, setSetupToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <main className="page max-w-md py-16">
      <h1 className="m-0 text-3xl font-bold tracking-[-0.03em]">
        Setup
      </h1>
      <span aria-hidden className="mt-3 block h-[3px] w-24 bg-stroke" />
      <p className="mt-3 text-sm text-muted-foreground">
        Enter the setup token from your deployment, then enroll the only
        passkey for this service.
      </p>
      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          try {
            const { options, challengeId } = await beginSetupFn({
              data: { setupToken },
            })
            const response = await startRegistration({ optionsJSON: options })
            await finishSetupFn({
              data: { setupToken, challengeId, response },
            })
            // The "/" loader uses ensureQueryData, which reuses cached data —
            // auth must be refetched before navigating or it loads the
            // public startpage for the newly enrolled user.
            await queryClient.fetchQuery(authStatusQueryOptions())
            await queryClient.invalidateQueries({ queryKey: ['startpage'] })
            router.navigate({ to: '/' })
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Setup failed')
          } finally {
            setBusy(false)
          }
        }}
      >
        <label className="block text-sm">
          <span className="label-brut mb-1.5 block text-xs text-foreground">
            Setup token
          </span>
          <input
            type="password"
            value={setupToken}
            onChange={(e) => setSetupToken(e.target.value)}
            className="w-full border-2 border-foreground bg-card px-3 py-2 font-mono outline-none focus-visible:ring-3 focus-visible:ring-ring"
            required
            autoComplete="off"
          />
        </label>
        {error ? (
          <p className="border-l-[6px] border-l-stroke bg-muted px-3 py-2 text-sm font-medium text-foreground">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="border-2 border-foreground bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-shadow hover:shadow-brut-stroke active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-40"
        >
          {busy ? 'Enrolling…' : 'Enroll passkey'}
        </button>
      </form>
    </main>
  )
}
