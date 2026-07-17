import { createFileRoute } from '@tanstack/react-router'
import {
  createPublicStartpageResponse,
} from '#/lib/public-startpage'
import { loadStartpageData } from '#/lib/startpage-data'

export const Route = createFileRoute('/api/startpage')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const data = await loadStartpageData(false)
        return createPublicStartpageResponse(data, request)
      },
    },
  },
})
