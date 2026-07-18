export type CategoryVisibility = 'public' | 'auth'

export type Category = {
  id: string
  name: string
  visibility: CategoryVisibility
  sort_order: number
}

export type AppItem = {
  id: string
  category_id: string
  name: string
  url: string
  icon: string
  sort_order: number
}

export type CategoryWithApps = Category & {
  apps: AppItem[]
}

/** App decorated with a display domain (loader output); the icon is rendered
 * from `icon` via the `/api/icon/:name` endpoint. */
export type DecoratedApp = AppItem & {
  domain: string
}

export type AdminCategory = Category & {
  apps: DecoratedApp[]
}

export type StartpageData = {
  authenticated: boolean
  categories: AdminCategory[]
}

/** Editable app fields shared by the admin add/edit forms. */
export type AppFormValues = {
  name: string
  url: string
  icon: string
}

export type Sui2ImportPayload = {
  apps?: Array<{
    name: string
    items: Array<{
      name: string
      url: string
      icon: string
    }>
  }>
  bookmarks?: unknown
}

export type Env = {
  DB: D1Database
  SETUP_TOKEN: string
  WEBAUTHN_RP_ID: string
  WEBAUTHN_ORIGIN: string
  ACCESS_TOKEN_TTL_DAYS?: string
  CREDENTIAL_ENCRYPTION_KEY?: string
}
