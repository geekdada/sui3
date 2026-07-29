import { waitUntil } from 'cloudflare:workers'

/** Run a task after the response is sent, without blocking it. */
export function runInBackground(task: Promise<unknown>): void {
  waitUntil(
    task.catch((error) => {
      console.error(
        `[background] task failed: ${error instanceof Error ? error.message : 'unknown'}`,
      )
    }),
  )
}
