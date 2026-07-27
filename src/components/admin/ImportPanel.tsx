import { useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { Button, buttonVariants } from '#/components/ui/button'
import { importDataFn } from '#/lib/apps.functions'
import { cn } from '#/lib/cn'
import { invalidateAppData } from '#/lib/queries'

export default function ImportPanel() {
  const queryClient = useQueryClient()
  const importData = useServerFn(importDataFn)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(
    null
  )

  async function submit() {
    setBusy(true)
    setStatus(null)
    try {
      const result = await importData({ data: { json: text } })
      await invalidateAppData(queryClient)
      setStatus({
        ok: true,
        text: `Imported ${result.categories} categories, ${result.apps} apps`,
      })
    } catch (err) {
      setStatus({
        ok: false,
        text: err instanceof Error ? err.message : 'Import failed',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-10 border-t-1 border-border pt-6">
      <div className="mb-3">
        <h2 className="label-brut m-0 text-sm text-foreground">Import</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You can import your old SUI2 <code>data.json</code>. Only apps are
          imported.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder="Paste data.json"
        className="w-full border-1 border-border bg-card px-3 py-2 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'cursor-pointer'
          )}
        >
          Upload file
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setText(await file.text())
            }}
          />
        </label>
        <Button
          type="button"
          onClick={submit}
          disabled={busy || text.trim().length < 2}
        >
          {busy ? 'Importing…' : 'Import'}
        </Button>
        {status ? (
          <span
            className={cn(
              'border-l-[6px] px-3 py-1.5 text-sm font-medium text-foreground',
              status.ok
                ? 'border-l-foreground bg-muted'
                : 'border-l-stroke bg-muted'
            )}
          >
            {status.text}
          </span>
        ) : null}
      </div>
    </section>
  )
}
