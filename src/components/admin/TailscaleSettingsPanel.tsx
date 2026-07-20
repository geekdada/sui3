import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'
import { useConfirmDialog } from '#/components/ConfirmDialog'
import { FormField } from '#/components/FormField'
import FeatherIcon from '#/components/FeatherIcon'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { FieldGroup, FieldSet } from '#/components/ui/field'
import { Separator } from '#/components/ui/separator'
import { Spinner } from '#/components/ui/spinner'
import {
  deleteTailscaleSettingsFn,
  refreshTailscaleServicesFn,
  saveTailscaleSettingsFn,
} from '#/lib/tailscale.functions'
import { tailscaleSettingsSchema } from '#/lib/form-schemas'
import { invalidateAppData } from '#/lib/queries'
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
  const queryClient = useQueryClient()
  const saveSettings = useServerFn(saveTailscaleSettingsFn)
  const refreshServices = useServerFn(refreshTailscaleServicesFn)
  const deleteSettings = useServerFn(deleteTailscaleSettingsFn)
  const { confirm: confirmDialog, dialog: confirmDialogElement } =
    useConfirmDialog()

  const [pending, setPending] = useState<PendingAction | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [showTailnetFallback, setShowTailnetFallback] = useState(
    getTailnetDnsDiscoveryErrorMessage(settings.lastSyncError ?? '') !== null,
  )

  const form = useForm({
    defaultValues: {
      clientId: settings.clientId,
      clientSecret: '',
      tailnetDnsNameFallback: '',
    },
    validators: {
      onChange: tailscaleSettingsSchema,
      onSubmit: ({ value }) => {
        if (!settings.configured && !value.clientSecret?.trim()) {
          return {
            form: 'Please fill in all required fields',
            fields: {
              clientSecret: 'Client secret is required for initial setup',
            },
          }
        }
        return undefined
      },
    },
    onSubmit: async ({ value }) => {
      await run(
        'save',
        () =>
          saveSettings({
            data: {
              clientId: value.clientId.trim(),
              clientSecret: value.clientSecret?.trim() || undefined,
              tailnetDnsNameFallback:
                value.tailnetDnsNameFallback?.trim() || undefined,
            },
          }),
        'Credentials verified and services refreshed.',
      )
    },
  })

  useEffect(() => {
    form.setFieldValue('clientId', settings.clientId)
  }, [settings.clientId, form])

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
        form.reset()
        setShowTailnetFallback(false)
      }
      await invalidateAppData(queryClient)
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

  async function disconnect() {
    const ok = await confirmDialog({
      title: 'Disconnect Tailscale',
      description:
        'Disconnect Tailscale and remove the cached services? This cannot be undone.',
      confirmLabel: 'Disconnect',
      destructive: true,
    })
    if (!ok) return
    void run(
      'disconnect',
      async () => {
        await deleteSettings()
        form.reset()
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
      <div className="mb-4">
        <h2 className="m-0 text-base font-semibold tracking-tight text-foreground">
          Tailscale
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          List the services in your Tailnet in one place. The list is always
          private. Only services that expose 80/443 port are displayed.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
        className="flex max-w-2xl flex-col gap-5"
      >
        <FieldSet disabled={pending !== null}>
          <FieldGroup>
            <form.Field name="clientId">
              {(field) => (
                <FormField
                  field={field}
                  label="Client ID"
                  inputProps={{
                    id: 'tailscale-client-id',
                    autoComplete: 'off',
                    className: 'h-9',
                  }}
                />
              )}
            </form.Field>

            <form.Field name="clientSecret">
              {(field) => (
                <FormField
                  field={field}
                  label="Client secret"
                  description={
                    <>
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
                    </>
                  }
                  inputProps={{
                    id: 'tailscale-client-secret',
                    type: 'password',
                    autoComplete: 'new-password',
                    placeholder: settings.configured
                      ? 'Leave blank to keep the current secret'
                      : undefined,
                    className: 'h-9',
                  }}
                />
              )}
            </form.Field>

            {showTailnetFallback ? (
              <form.Field name="tailnetDnsNameFallback">
                {(field) => (
                  <FormField
                    field={field}
                    label="Tailnet DNS name fallback"
                    description="Automatic discovery failed. Enter the MagicDNS suffix without a protocol, path, or port, or retry discovery later."
                    inputProps={{
                      id: 'tailscale-dns-name-fallback',
                      autoComplete: 'off',
                      placeholder: 'tail1234.ts.net',
                      className: 'h-9',
                    }}
                  />
                )}
              </form.Field>
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
      {confirmDialogElement}
    </section>
  )
}
