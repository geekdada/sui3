import { createId } from '#/lib/crypto'
import { getDb } from '#/lib/env'
import type {
  AppItem,
  Category,
  CategoryVisibility,
  CategoryWithApps,
  Sui2ImportPayload,
} from '#/lib/types'

export async function listCategoriesWithApps(
  authenticated: boolean,
): Promise<CategoryWithApps[]> {
  const db = getDb()
  const categories = authenticated
    ? await db
        .prepare(
          `SELECT id, name, visibility, sort_order FROM categories
           ORDER BY sort_order ASC, name ASC`,
        )
        .all<Category>()
    : await db
        .prepare(
          `SELECT id, name, visibility, sort_order FROM categories
           WHERE visibility = 'public'
           ORDER BY sort_order ASC, name ASC`,
        )
        .all<Category>()

  const rows = categories.results ?? []
  if (rows.length === 0) return []

  const apps = await db
    .prepare(
      `SELECT id, category_id, name, url, icon, sort_order FROM apps
       ORDER BY sort_order ASC, name ASC`,
    )
    .all<AppItem>()

  const byCategory = new Map<string, AppItem[]>()
  for (const app of apps.results ?? []) {
    const list = byCategory.get(app.category_id) ?? []
    list.push(app)
    byCategory.set(app.category_id, list)
  }

  return rows.map((cat) => ({
    ...cat,
    apps: byCategory.get(cat.id) ?? [],
  }))
}

export async function createCategory(input: {
  name: string
  visibility: CategoryVisibility
}): Promise<Category> {
  const db = getDb()
  const id = createId()
  const max = await db
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) as m FROM categories`)
    .first<{ m: number }>()
  const sortOrder = (max?.m ?? -1) + 1
  await db
    .prepare(
      `INSERT INTO categories (id, name, visibility, sort_order) VALUES (?, ?, ?, ?)`,
    )
    .bind(id, input.name.trim(), input.visibility, sortOrder)
    .run()
  return {
    id,
    name: input.name.trim(),
    visibility: input.visibility,
    sort_order: sortOrder,
  }
}

export async function updateCategory(input: {
  id: string
  name: string
  visibility: CategoryVisibility
  sort_order: number
}): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE categories SET name = ?, visibility = ?, sort_order = ? WHERE id = ?`,
    )
    .bind(input.name.trim(), input.visibility, input.sort_order, input.id)
    .run()
}

export async function deleteCategory(id: string): Promise<void> {
  await getDb().prepare(`DELETE FROM categories WHERE id = ?`).bind(id).run()
}

export async function createApp(input: {
  category_id: string
  name: string
  url: string
  icon: string
}): Promise<AppItem> {
  const db = getDb()
  const id = createId()
  const max = await db
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1) as m FROM apps WHERE category_id = ?`,
    )
    .bind(input.category_id)
    .first<{ m: number }>()
  const sortOrder = (max?.m ?? -1) + 1
  const app: AppItem = {
    id,
    category_id: input.category_id,
    name: input.name.trim(),
    url: input.url.trim(),
    icon: input.icon.trim().replace(/^mdi:/, ''),
    sort_order: sortOrder,
  }
  await db
    .prepare(
      `INSERT INTO apps (id, category_id, name, url, icon, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(app.id, app.category_id, app.name, app.url, app.icon, app.sort_order)
    .run()
  return app
}

export async function updateApp(input: {
  id: string
  category_id: string
  name: string
  url: string
  icon: string
  sort_order: number
}): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE apps SET category_id = ?, name = ?, url = ?, icon = ?, sort_order = ?
       WHERE id = ?`,
    )
    .bind(
      input.category_id,
      input.name.trim(),
      input.url.trim(),
      input.icon.trim().replace(/^mdi:/, ''),
      input.sort_order,
      input.id,
    )
    .run()
}

export async function deleteApp(id: string): Promise<void> {
  await getDb().prepare(`DELETE FROM apps WHERE id = ?`).bind(id).run()
}

/**
 * Persist a full drag-and-drop layout in one transaction. App statements set
 * both `category_id` and `sort_order`, so this covers reordering within a
 * category and moving apps between categories.
 */
export async function reorderLayout(input: {
  categories: { id: string; sort_order: number }[]
  apps: { id: string; category_id: string; sort_order: number }[]
}): Promise<void> {
  const db = getDb()
  const statements: D1PreparedStatement[] = []
  for (const cat of input.categories) {
    statements.push(
      db
        .prepare(`UPDATE categories SET sort_order = ? WHERE id = ?`)
        .bind(cat.sort_order, cat.id),
    )
  }
  for (const app of input.apps) {
    statements.push(
      db
        .prepare(`UPDATE apps SET category_id = ?, sort_order = ? WHERE id = ?`)
        .bind(app.category_id, app.sort_order, app.id),
    )
  }
  if (statements.length === 0) return
  await db.batch(statements)
}

export async function importSui2Apps(payload: Sui2ImportPayload): Promise<{
  categories: number
  apps: number
}> {
  const sections = payload.apps ?? []
  if (!Array.isArray(sections)) {
    throw new Error('Invalid import: apps must be an array')
  }

  const db = getDb()
  // Overwrite existing data
  await db.prepare(`DELETE FROM apps`).run()
  await db.prepare(`DELETE FROM categories`).run()

  let appCount = 0
  let catIndex = 0

  for (const section of sections) {
    if (!section?.name || !Array.isArray(section.items)) continue
    const categoryId = createId()
    await db
      .prepare(
        `INSERT INTO categories (id, name, visibility, sort_order) VALUES (?, ?, 'auth', ?)`,
      )
      .bind(categoryId, section.name.trim(), catIndex)
      .run()

    let itemIndex = 0
    for (const item of section.items) {
      if (!item?.name || !item?.url || !item?.icon) continue
      await db
        .prepare(
          `INSERT INTO apps (id, category_id, name, url, icon, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          createId(),
          categoryId,
          item.name.trim(),
          item.url.trim(),
          item.icon.trim().replace(/^mdi:/, ''),
          itemIndex,
        )
        .run()
      itemIndex += 1
      appCount += 1
    }
    catIndex += 1
  }

  return { categories: catIndex, apps: appCount }
}
