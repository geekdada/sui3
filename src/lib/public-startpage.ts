import { sha256Hex } from '#/lib/crypto'
import type { StartpageData } from '#/lib/types'

export const PUBLIC_STARTPAGE_PATH = '/api/startpage'

export async function createPublicStartpageResponse(
  data: StartpageData,
  request: Request,
): Promise<Response> {
  const body = JSON.stringify(data)
  const etag = `"${await sha256Hex(body)}"`
  const headers = {
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Content-Type': 'application/json; charset=utf-8',
    ETag: etag,
  }

  if (request.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304, headers })
  }

  return new Response(body, { status: 200, headers })
}

export async function fetchPublicStartpageData(
  signal?: AbortSignal,
): Promise<StartpageData> {
  const response = await fetch(PUBLIC_STARTPAGE_PATH, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) {
    throw new Error(`Unable to load the public startpage (${response.status})`)
  }
  return response.json() as Promise<StartpageData>
}
