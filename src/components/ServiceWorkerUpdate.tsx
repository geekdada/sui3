import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { useServiceWorkerUpdate } from './useServiceWorkerUpdate'

export default function ServiceWorkerUpdate() {
  const [open, setOpen] = useState(false)
  const { updateAvailable, applyUpdate } = useServiceWorkerUpdate(() =>
    setOpen(true),
  )

  if (!updateAvailable) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Update available</DialogTitle>
          <DialogDescription>
            A new version of SUI3 is ready. Reload to use the latest version.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton={false}>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Later
          </Button>
          <Button onClick={applyUpdate}>Reload now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
