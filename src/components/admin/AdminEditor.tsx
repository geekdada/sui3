import {
  closestCenter,
  DndContext,
  DragOverlay,
  getFirstCollision,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '#/lib/cn'
import {
  createAppFn,
  createCategoryFn,
  deleteAppFn,
  deleteCategoryFn,
  reorderLayoutFn,
  updateAppFn,
  updateCategoryFn,
} from '#/lib/apps.functions'
import type {
  AdminCategory,
  AppFormValues,
  CategoryVisibility,
  DecoratedApp,
} from '#/lib/types'
import AppIcon from '../AppIcon'
import { useConfirmDialog } from '../ConfirmDialog'
import FeatherIcon from '../FeatherIcon'
import SortableCategory from './SortableCategory'

const inputClass =
  'rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary'

export default function AdminEditor({
  categories,
}: {
  categories: AdminCategory[]
}) {
  const queryClient = useQueryClient()
  const refreshData = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin'] }),
        queryClient.invalidateQueries({ queryKey: ['startpage'] }),
      ]),
    [queryClient],
  )
  const { confirm: confirmDialog, dialog: confirmDialogElement } =
    useConfirmDialog()
  const reorder = useServerFn(reorderLayoutFn)
  const createCategory = useServerFn(createCategoryFn)
  const updateCategory = useServerFn(updateCategoryFn)
  const removeCategory = useServerFn(deleteCategoryFn)
  const createApp = useServerFn(createAppFn)
  const updateApp = useServerFn(updateAppFn)
  const removeApp = useServerFn(deleteAppFn)

  const [cats, setCatsState] = useState<AdminCategory[]>(categories)
  const catsRef = useRef(cats)
  const setCats = useCallback(
    (
      updater:
        | AdminCategory[]
        | ((prev: AdminCategory[]) => AdminCategory[]),
    ) => {
      const next =
        typeof updater === 'function' ? updater(catsRef.current) : updater
      catsRef.current = next
      setCatsState(next)
    },
    [],
  )

  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)
  const [activeType, setActiveType] = useState<'category' | 'app' | null>(null)
  const activeIdRef = useRef<UniqueIdentifier | null>(null)
  const activeTypeRef = useRef<'category' | 'app' | null>(null)
  const lastOverId = useRef<UniqueIdentifier | null>(null)
  const recentlyMovedToNewContainer = useRef(false)

  // Server data is the source of truth; reset local state whenever it changes.
  useEffect(() => setCats(categories), [categories, setCats])
  useEffect(() => {
    recentlyMovedToNewContainer.current = false
  }, [cats])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const findContainer = useCallback((id: UniqueIdentifier): string | null => {
    const current = catsRef.current
    if (current.some((c) => c.id === id)) return id as string
    const cat = current.find((c) => c.apps.some((a) => a.id === id))
    return cat ? cat.id : null
  }, [])

  const collisionDetection: CollisionDetection = useCallback((args) => {
    if (activeTypeRef.current === 'category') {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (c) => c.data.current?.type === 'category',
        ),
      })
    }
    const pointerCollisions = pointerWithin(args)
    const intersections =
      pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args)
    let overId = getFirstCollision(intersections, 'id')
    if (overId != null) {
      const container = catsRef.current.find((c) => c.id === overId)
      if (container && container.apps.length > 0) {
        const appIds = new Set(container.apps.map((a) => a.id))
        const closest = closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter(
            (c) => c.id !== overId && appIds.has(c.id as string),
          ),
        })[0]?.id
        if (closest != null) overId = closest
      }
      lastOverId.current = overId
      return [{ id: overId }]
    }
    if (recentlyMovedToNewContainer.current) {
      lastOverId.current = activeIdRef.current
    }
    return lastOverId.current != null ? [{ id: lastOverId.current }] : []
  }, [])

  function handleDragStart({ active }: DragStartEvent) {
    const type = (active.data.current?.type as 'category' | 'app') ?? null
    activeIdRef.current = active.id
    activeTypeRef.current = type
    setActiveId(active.id)
    setActiveType(type)
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (activeTypeRef.current !== 'app' || !over) return
    const activeContainer = findContainer(active.id)
    const overContainer = findContainer(over.id)
    if (
      !activeContainer ||
      !overContainer ||
      activeContainer === overContainer
    ) {
      return
    }

    setCats((prev) => {
      const activeC = prev.findIndex((c) => c.id === activeContainer)
      const overC = prev.findIndex((c) => c.id === overContainer)
      if (activeC < 0 || overC < 0) return prev
      const activeApps = prev[activeC].apps
      const overApps = prev[overC].apps
      const activeIndex = activeApps.findIndex((a) => a.id === active.id)
      if (activeIndex < 0) return prev
      const moved = activeApps[activeIndex]

      let newIndex: number
      if (over.id === overContainer) {
        newIndex = overApps.length
      } else {
        const overIndex = overApps.findIndex((a) => a.id === over.id)
        if (overIndex < 0) {
          newIndex = overApps.length
        } else {
          const translated = active.rect.current.translated
          const isBelow =
            translated != null &&
            translated.top > over.rect.top + over.rect.height / 2
          newIndex = overIndex + (isBelow ? 1 : 0)
        }
      }

      const next = prev.map((c) => ({ ...c, apps: [...c.apps] }))
      next[activeC].apps.splice(activeIndex, 1)
      next[overC].apps.splice(newIndex, 0, moved)
      return next
    })
    recentlyMovedToNewContainer.current = true
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const type = activeTypeRef.current
    resetActive()
    if (!over) return

    if (type === 'category') {
      if (active.id !== over.id) {
        const from = catsRef.current.findIndex((c) => c.id === active.id)
        const to = catsRef.current.findIndex((c) => c.id === over.id)
        if (from >= 0 && to >= 0 && from !== to) {
          const next = arrayMove(catsRef.current, from, to)
          setCats(next)
          void persist(next)
        }
      }
      return
    }

    const overContainer = findContainer(over.id)
    if (!overContainer) return
    const current = catsRef.current
    const c = current.findIndex((cat) => cat.id === overContainer)
    if (c < 0) return
    const apps = current[c].apps
    const from = apps.findIndex((a) => a.id === active.id)
    if (from < 0) {
      void persist(current)
      return
    }
    let to =
      over.id === overContainer
        ? apps.length - 1
        : apps.findIndex((a) => a.id === over.id)
    if (to < 0) to = apps.length - 1
    const next =
      from === to
        ? current
        : current.map((cat, i) =>
            i === c ? { ...cat, apps: arrayMove(cat.apps, from, to) } : cat,
          )
    setCats(next)
    void persist(next)
  }

  function handleDragCancel() {
    resetActive()
    setCats(categories)
  }

  function resetActive() {
    activeIdRef.current = null
    activeTypeRef.current = null
    setActiveId(null)
    setActiveType(null)
  }

  const persist = useCallback(
    async (next: AdminCategory[]) => {
      const payload = {
        categories: next.map((c, i) => ({ id: c.id, sort_order: i })),
        apps: next.flatMap((c) =>
          c.apps.map((a, i) => ({
            id: a.id,
            category_id: c.id,
            sort_order: i,
          })),
        ),
      }
      setError(null)
      try {
        await reorder({ data: payload })
        await refreshData()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Reorder failed')
        setCats(categories)
      }
    },
    [reorder, refreshData, categories, setCats],
  )

  const run = useCallback(
    async (fn: () => Promise<unknown>): Promise<boolean> => {
      setError(null)
      try {
        await fn()
        await refreshData()
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
        return false
      }
    },
    [refreshData],
  )

  const renameCategory = (cat: AdminCategory, name: string) =>
    run(() =>
      updateCategory({
        data: {
          id: cat.id,
          name,
          visibility: cat.visibility,
          sort_order: cat.sort_order,
        },
      }),
    )

  const setCategoryVisibility = (
    cat: AdminCategory,
    visibility: CategoryVisibility,
  ) =>
    run(() =>
      updateCategory({
        data: {
          id: cat.id,
          name: cat.name,
          visibility,
          sort_order: cat.sort_order,
        },
      }),
    )

  const deleteCategory = async (cat: AdminCategory) => {
    const ok = await confirmDialog({
      title: 'Delete category',
      description: `Delete “${cat.name}” and all of its apps? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return false
    return run(() => removeCategory({ data: { id: cat.id } }))
  }

  const addApp = (categoryId: string, values: AppFormValues) =>
    run(() => createApp({ data: { category_id: categoryId, ...values } }))

  const editApp = (app: DecoratedApp, values: AppFormValues) =>
    run(() =>
      updateApp({
        data: {
          id: app.id,
          category_id: app.category_id,
          sort_order: app.sort_order,
          ...values,
        },
      }),
    )

  const deleteApp = async (app: DecoratedApp) => {
    const ok = await confirmDialog({
      title: 'Delete app',
      description: `Delete app “${app.name}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return false
    return run(() => removeApp({ data: { id: app.id } }))
  }

  const [addingCat, setAddingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatVis, setNewCatVis] = useState<CategoryVisibility>('auth')

  async function addCategory() {
    if (!newCatName.trim()) return
    const ok = await run(() =>
      createCategory({ data: { name: newCatName.trim(), visibility: newCatVis } }),
    )
    if (ok) {
      setNewCatName('')
      setNewCatVis('auth')
      setAddingCat(false)
    }
  }

  const activeApp =
    activeType === 'app' && activeId != null
      ? cats.flatMap((c) => c.apps).find((a) => a.id === activeId)
      : null
  const activeCategory =
    activeType === 'category' && activeId != null
      ? cats.find((c) => c.id === activeId)
      : null

  return (
    <div>
      {error ? <p className="mb-3 text-sm text-match">{error}</p> : null}
      {confirmDialogElement}

      <DndContext
        id="admin-editor-dnd"
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={cats.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-3">
            {cats.map((cat) => (
              <SortableCategory
                key={cat.id}
                category={cat}
                onRename={renameCategory}
                onVisibility={setCategoryVisibility}
                onDelete={deleteCategory}
                onAddApp={addApp}
                onEditApp={editApp}
                onDeleteApp={deleteApp}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeCategory ? (
            <div className="rounded-lg border border-primary bg-card px-3 py-2 text-sm font-semibold tracking-wide text-foreground uppercase shadow-lg">
              {activeCategory.name}
            </div>
          ) : activeApp ? (
            <div className="flex items-center gap-2 rounded-md border border-primary bg-card px-2 py-1.5 shadow-lg">
              <AppIcon icon={activeApp.icon} className="text-muted-foreground" />
              <span className="text-sm font-medium">{activeApp.name}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {cats.length === 0 && !addingCat ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No categories yet. Add one or import below.
        </p>
      ) : null}

      <div className="mt-3">
        {addingCat ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addCategory()
                if (e.key === 'Escape') setAddingCat(false)
              }}
              placeholder="Category name"
              className={cn(inputClass, 'flex-1')}
              aria-label="New category name"
              autoFocus
            />
            <select
              value={newCatVis}
              onChange={(e) => setNewCatVis(e.target.value as CategoryVisibility)}
              className={inputClass}
              aria-label="New category visibility"
            >
              <option value="auth">private</option>
              <option value="public">public</option>
            </select>
            <button
              type="button"
              onClick={addCategory}
              className="rounded-md border border-border bg-card px-2.5 py-2 text-sm text-muted-foreground transition hover:border-primary hover:text-foreground"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setAddingCat(false)}
              className="rounded-md border border-border bg-card px-2.5 py-2 text-sm text-muted-foreground transition hover:border-primary hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingCat(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground transition hover:border-primary hover:text-foreground"
          >
            <FeatherIcon name="Plus" size={15} />
            Add category
          </button>
        )}
      </div>
    </div>
  )
}
