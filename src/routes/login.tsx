import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { startAuthentication } from '@simplewebauthn/browser'
import { useState } from 'react'
import {
  beginLoginFn,
  finishLoginFn,
  getAuthStatus,
} from '#/lib/auth.functions'

export const Route = createFileRoute('/login')({
  loader: async () => {
    const status = await getAuthStatus()
    if (!status.enrolled) throw redirect({ to: '/setup' })
    if (status.authenticated) throw redirect({ to: '/' })
    return status
  },
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <main className="page max-w-md py-16">
      <h1 className="m-0 text-2xl font-semibold tracking-tight">Log in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Authenticate with your enrolled passkey.
      </p>
      {error ? (
        <p className="mt-4 text-sm text-match">{error}</p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        className="mt-6 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            const { options, challengeId } = await beginLoginFn()
            const response = await startAuthentication({ optionsJSON: options })
            await finishLoginFn({ data: { challengeId, response } })
            await router.invalidate()
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
