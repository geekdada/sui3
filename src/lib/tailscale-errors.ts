export const TAILNET_DNS_DISCOVERY_ERROR_CODE =
  'TAILNET_DNS_DISCOVERY_FAILED'

const ERROR_PREFIX = `${TAILNET_DNS_DISCOVERY_ERROR_CODE}: `

export function createTailnetDnsDiscoveryError(cause: unknown): Error {
  const detail =
    cause instanceof Error
      ? cause.message
      : 'Unable to determine Tailscale tailnet DNS name'
  return new Error(`${ERROR_PREFIX}${detail}`)
}

export function getTailnetDnsDiscoveryErrorMessage(
  message: string,
): string | null {
  return message.startsWith(ERROR_PREFIX)
    ? message.slice(ERROR_PREFIX.length)
    : null
}
