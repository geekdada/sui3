import { z } from 'zod'

export const tailscaleSettingsSchema = z.object({
  clientId: z.string().trim().min(1, 'Client ID is required').max(256),
  clientSecret: z.string().max(2048),
  tailnetDnsNameFallback: z.string().trim().max(253, 'Must be 253 characters or less'),
})

export const appFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  url: z.string().trim().min(1, 'URL is required'),
  icon: z.string().trim().min(1, 'Icon is required'),
})
