import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { useConfirmDialog } from '#/components/ConfirmDialog'
import FeatherIcon from '#/components/FeatherIcon'
import { FormField } from '#/components/FormField'
import { Alert, AlertDescription } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from '#/components/ui/field'
import { Spinner } from '#/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import { trmnlSettingsSchema } from '#/lib/form-schemas'
import { invalidateAppData } from '#/lib/queries'
import {
  deleteTrmnlSettingsFn,
  forceRefreshTrmnlFn,
  saveTrmnlSettingsFn,
} from '#/lib/trmnl.functions'
import type { TrmnlMode, TrmnlSettingsSummary } from '#/lib/trmnl-service'

type PendingAction = 'save' | 'refresh' | 'disconnect'
type Notice = { kind: 'success' | 'error'; text: string }
type FormValues = { deviceApiKey: string; mode: TrmnlMode }

const MODE_LABELS: Record<TrmnlMode, string> = {
  mirror: 'Mirror',
  device: 'Device',
}

const MODE_DESCRIPTIONS: Record<TrmnlMode, string> = {
  mirror:
    'Show whatever your physical TRMNL device is currently displaying. Read-only — it never advances a playlist.',
  device:
    'SUI3 acts as its own TRMNL device and advances its own playlist on every refresh.',
}

function formatUtc(timestamp: number | null): string {
  if (timestamp === null) return 'Never'
  return `${new Date(timestamp * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

export default function TrmnlSettingsPanel({
  settings,
}: {
  settings: TrmnlSettingsSummary
}) {
  const queryClient = useQueryClient()
  const saveSettings = useServerFn(saveTrmnlSettingsFn)
  const forceRefresh = useServerFn(forceRefreshTrmnlFn)
  const deleteSettings = useServerFn(deleteTrmnlSettingsFn)
  const { confirm: confirmDialog, dialog: confirmDialogElement } =
    useConfirmDialog()

  const [pending, setPending] = useState<PendingAction | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const form = useForm({
    defaultValues: {
      deviceApiKey: '',
      mode: settings.mode ?? 'mirror',
    } satisfies FormValues,
    validators: {
      onChange: trmnlSettingsSchema,
      onSubmit: ({ value }) => {
        if (!settings.configured && !value.deviceApiKey?.trim()) {
          return {
            form: 'Please fill in all required fields',
            fields: {
              deviceApiKey: 'Device API key is required for initial setup',
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
              deviceApiKey: value.deviceApiKey?.trim() || undefined,
              mode: value.mode,
            },
          }),
        'Device key verified and image cached.',
        // `defaultValues` is captured on first render, so a bare reset() would
        // snap the mode toggle back to its pre-save value.
        { deviceApiKey: '', mode: value.mode }
      )
    },
  })

  async function run(
    action: PendingAction,
    operation: () => Promise<unknown>,
    success: string,
    nextDefaults?: FormValues
  ) {
    setPending(action)
    setNotice(null)
    try {
      await operation()
      if (nextDefaults) form.reset(nextDefaults)
      await invalidateAppData(queryClient)
      await queryClient.invalidateQueries({ queryKey: ['trmnl'] })
      setNotice({ kind: 'success', text: success })
    } catch (error) {
      setNotice({
        kind: 'error',
        text: error instanceof Error ? error.message : 'TRMNL request failed',
      })
    } finally {
      setPending(null)
    }
  }

  async function disconnect() {
    const ok = await confirmDialog({
      title: 'Disconnect TRMNL',
      description:
        'Disconnect TRMNL and remove the cached image? This cannot be undone.',
      confirmLabel: 'Disconnect',
      destructive: true,
    })
    if (!ok) return
    void run('disconnect', () => deleteSettings(), 'TRMNL disconnected.', {
      deviceApiKey: '',
      mode: 'mirror',
    })
  }

  const shownError = notice?.kind === 'error' ? notice.text : settings.lastError

  return (
    <section className="mt-10 border-t-1 border-border pt-6">
      <div className="mb-4">
        <h2 className="label-brut m-0 text-sm text-foreground">TRMNL</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Show a TRMNL screen on the startpage — either mirroring a physical
          device or acting as one. Only visible when logged in.
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
            <form.Field name="mode">
              {(field) => (
                <Field className="w-full">
                  {/* A ToggleGroup is not a labelable element, so no htmlFor
                      target exists; the group carries its own aria-label. */}
                  <FieldLabel>Mode</FieldLabel>
                  <ToggleGroup
                    value={[field.state.value]}
                    onValueChange={(values) => {
                      const next = values[0]
                      if (next === 'mirror' || next === 'device') {
                        field.handleChange(next)
                      }
                    }}
                    variant="outline"
                    size="sm"
                    spacing={0}
                    aria-label="TRMNL mode"
                    className="w-fit"
                  >
                    <ToggleGroupItem value="mirror">
                      {MODE_LABELS.mirror}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="device">
                      {MODE_LABELS.device}
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <FieldDescription>
                    {MODE_DESCRIPTIONS[field.state.value]}
                  </FieldDescription>
                </Field>
              )}
            </form.Field>
            <form.Field name="deviceApiKey">
              {(field) => (
                <FormField
                  field={field}
                  label="Device API Key"
                  description={
                    <>
                      Stored encrypted. Find it in your{' '}
                      <a
                        href="https://trmnl.com/account"
                        target="_blank"
                        rel="noreferrer"
                      >
                        TRMNL account
                      </a>{' '}
                      (developer edition device).
                    </>
                  }
                  inputProps={{
                    id: 'trmnl-device-api-key',
                    type: 'password',
                    autoComplete: 'new-password',
                    placeholder: settings.configured
                      ? 'Leave blank to keep the current key'
                      : undefined,
                    className: 'h-9',
                  }}
                />
              )}
            </form.Field>
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
                () => forceRefresh(),
                'TRMNL image refreshed.'
              )
            }
          >
            {pending === 'refresh' ? (
              <Spinner data-icon="inline-start" />
            ) : null}
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
            <dd className="m-0 font-medium">
              {settings.hasImage ? 'Image cached' : 'Waiting for image'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Mode</dt>
            <dd className="m-0 font-medium">
              {settings.mode ? MODE_LABELS[settings.mode] : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Refresh rate</dt>
            <dd className="m-0 font-mono tabular-nums">
              {settings.refreshRate !== null ? `${settings.refreshRate}s` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Last fetch</dt>
            <dd className="m-0 font-mono text-xs tabular-nums">
              {formatUtc(settings.fetchedAt)}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Image expires</dt>
            <dd className="m-0 font-mono text-xs tabular-nums">
              {formatUtc(settings.expiresAt)}
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
