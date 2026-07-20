import { useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { importDataFn } from '#/lib/apps.functions'
import { invalidateAppData } from '#/lib/queries'

export default function ImportPanel() {
  const queryClient = useQueryClient()
  const importData = useServerFn(importDataFn)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(
    null,
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
    <section className="mt-10 border-t border-border pt-6">
      <div className="mb-3">
        <h2 className="m-0 text-base font-semibold tracking-tight text-foreground">
          Import
        </h2>
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
        className="w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-muted-foreground transition hover:border-primary hover:text-foreground">
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
        <button
          type="button"
          onClick={submit}
          disabled={busy || text.trim().length < 2}
          className="rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-muted-foreground transition hover:border-primary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Importing…' : 'Import'}
        </button>
        {status ? (
          <span
            className={status.ok ? 'text-sm text-primary' : 'text-sm text-match'}
          >
            {status.text}
          </span>
        ) : null}
      </div>
    </section>
  )
}
