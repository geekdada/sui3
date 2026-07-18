import { createFileRoute } from '@tanstack/react-router'
import { createIconSvgResponse } from '#/lib/icons'

export const Route = createFileRoute('/api/icon/$name')({
  server: {
    handlers: {
      GET: async ({ params, request }) =>
        createIconSvgResponse(params.name, request),
    },
  },
})
