import { createFileRoute } from '@tanstack/react-router'
import { getSession } from '#/lib/session'
import { getTrmnlImagePayload } from '#/lib/trmnl.server'

export const Route = createFileRoute('/api/trmnl/display')({
  server: {
    handlers: {
      GET: async () => {
        const session = await getSession()
        if (!session) {
          return new Response('Unauthorized', { status: 401 })
        }
        const image = await getTrmnlImagePayload()
        if (!image) {
          return new Response('No TRMNL image cached', { status: 404 })
        }
        const headers = new Headers({
          'Content-Type': image.contentType,
          'Cache-Control': 'no-store',
          'X-Trmnl-Fetched-At': String(image.fetchedAt),
        })
        if (image.expiresAt !== null) {
          headers.set('X-Trmnl-Expires-At', String(image.expiresAt))
        }
        return new Response(image.bytes, { status: 200, headers })
      },
    },
  },
})
