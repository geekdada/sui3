import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState, type FormEvent } from 'react'
import FeatherIcon from '#/components/FeatherIcon'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from '#/components/ui/field'
import { Input } from '#/components/ui/input'
import { Separator } from '#/components/ui/separator'
import { Spinner } from '#/components/ui/spinner'
import {
  deleteTailscaleSettingsFn,
  refreshTailscaleServicesFn,
  saveTailscaleSettingsFn,
} from '#/lib/tailscale.functions'
import { getTailnetDnsDiscoveryErrorMessage } from '#/lib/tailscale-errors'
import type { TailscaleSettingsSummary } from '#/lib/tailscale-service'

type PendingAction = 'save' | 'refresh' | 'disconnect'
type Notice = { kind: 'success' | 'error'; text: string }

function formatUtc(timestamp: number | null): string {
  if (timestamp === null) return 'Never'
  return `${new Date(timestamp * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

export default function TailscaleSettingsPanel({
  settings,
}: {
  settings: TailscaleSettingsSummary
}) {
  const router = useRouter()
  const saveSettings = useServerFn(saveTailscaleSettingsFn)
  const refreshServices = useServerFn(refreshTailscaleServicesFn)
  const deleteSettings = useServerFn(deleteTailscaleSettingsFn)
  const [clientId, setClientId] = useState(settings.clientId)
  const [clientSecret, setClientSecret] = useState('')
  const [tailnetDnsNameFallback, setTailnetDnsNameFallback] = useState('')
  const [showTailnetFallback, setShowTailnetFallback] = useState(
    getTailnetDnsDiscoveryErrorMessage(settings.lastSyncError ?? '') !== null,
  )
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    setClientId(settings.clientId)
  }, [settings.clientId])

  async function run(
    action: PendingAction,
    operation: () => Promise<unknown>,
    success: string,
  ) {
    setPending(action)
    setNotice(null)
    try {
      await operation()
      if (action === 'save') {
        setClientSecret('')
        setTailnetDnsNameFallback('')
        setShowTailnetFallback(false)
      }
      await router.invalidate()
      setNotice({ kind: 'success', text: success })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Tailscale request failed'
      const discoveryError = getTailnetDnsDiscoveryErrorMessage(message)
      if (action === 'save' && discoveryError !== null) {
        setShowTailnetFallback(true)
      }
      setNotice({
        kind: 'error',
        text: discoveryError ?? message,
      })
    } finally {
      setPending(null)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void run(
      'save',
      () =>
        saveSettings({
          data: {
            clientId,
            clientSecret: clientSecret || undefined,
            tailnetDnsNameFallback: tailnetDnsNameFallback || undefined,
          },
        }),
      'Credentials verified and services refreshed.',
    )
  }

  function disconnect() {
    if (!confirm('Disconnect Tailscale and remove the cached services?')) return
    void run(
      'disconnect',
      async () => {
        await deleteSettings()
        setClientId('')
        setClientSecret('')
        setTailnetDnsNameFallback('')
        setShowTailnetFallback(false)
      },
      'Tailscale disconnected.',
    )
  }

  const storedDiscoveryError = getTailnetDnsDiscoveryErrorMessage(
    settings.lastSyncError ?? '',
  )
  const shownError =
    notice?.kind === 'error'
      ? notice.text
      : (storedDiscoveryError ?? settings.lastSyncError)

  return (
    <section className="mt-10">
      <Separator className="mb-6" />
      <div className="mb-4 flex flex-wrap items-baseline gap-2">
        <h2 className="m-0 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Tailscale
        </h2>
        <span className="text-xs text-muted-foreground">
          OAuth client · read-only Services sync
        </span>
      </div>

      <form onSubmit={submit} className="flex max-w-2xl flex-col gap-5">
        <FieldSet disabled={pending !== null}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="tailscale-client-id">Client ID</FieldLabel>
              <Input
                id="tailscale-client-id"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                autoComplete="off"
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="tailscale-client-secret">
                Client secret
              </FieldLabel>
              <Input
                id="tailscale-client-secret"
                type="password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                autoComplete="new-password"
                required={!settings.configured}
                placeholder={
                  settings.configured
                    ? 'Leave blank to keep the current secret'
                    : undefined
                }
              />
              <FieldDescription>
                Stored encrypted. Create the OAuth client with the{' '}
                <a
                  href="https://tailscale.com/docs/reference/trust-credentials"
                  target="_blank"
                  rel="noreferrer"
                >
                  all:read scope
                </a>
                . The tailnet DNS name is discovered automatically from an
                internal device.
              </FieldDescription>
            </Field>

            {showTailnetFallback ? (
              <Field>
                <FieldLabel htmlFor="tailscale-dns-name-fallback">
                  Tailnet DNS name fallback
                </FieldLabel>
                <Input
                  id="tailscale-dns-name-fallback"
                  value={tailnetDnsNameFallback}
                  onChange={(event) =>
                    setTailnetDnsNameFallback(event.target.value)
                  }
                  autoComplete="off"
                  placeholder="tail1234.ts.net"
                />
                <FieldDescription>
                  Automatic discovery failed. Enter the MagicDNS suffix without
                  a protocol, path, or port, or retry discovery later.
                </FieldDescription>
              </Field>
            ) : null}
          </FieldGroup>
        </FieldSet>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending !== null}>
            {pending === 'save' ? <Spinner data-icon="inline-start" /> : null}
            Save and test
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!settings.configured || pending !== null}
            onClick={() =>
              void run(
                'refresh',
                () => refreshServices(),
                'Tailscale services refreshed.',
              )
            }
          >
            {pending === 'refresh' ? <Spinner data-icon="inline-start" /> : null}
            Refresh now
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!settings.configured || pending !== null}
            onClick={disconnect}
          >
            {pending === 'disconnect' ? (
              <Spinner data-icon="inline-start" />
            ) : null}
            Disconnect
          </Button>
        </div>
      </form>

      {settings.configured ? (
        <dl className="mt-5 grid max-w-2xl grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd className="m-0 font-medium">Configured</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Services</dt>
            <dd className="m-0 font-mono tabular-nums">{settings.serviceCount}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Tailnet DNS name</dt>
            <dd className="m-0 font-mono text-xs">
              {settings.tailnetDnsName}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Last sync</dt>
            <dd className="m-0 font-mono text-xs tabular-nums">
              {formatUtc(settings.lastSyncAt)}
            </dd>
          </div>
        </dl>
      ) : null}

      {shownError ? (
        <Alert variant="destructive" className="mt-4 max-w-2xl">
          <FeatherIcon name="AlertCircle" />
          <AlertDescription>{shownError}</AlertDescription>
        </Alert>
      ) : notice?.kind === 'success' ? (
        <Alert className="mt-4 max-w-2xl">
          <FeatherIcon name="CheckCircle" />
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      ) : null}
    </section>
  )
}
