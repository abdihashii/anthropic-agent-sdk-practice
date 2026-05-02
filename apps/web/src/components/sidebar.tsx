import type { ReactNode } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { useMediaQuery } from '#/hooks/use-media-query'

interface SidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

export function Sidebar({ open, onOpenChange, children }: SidebarProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')

  if (isDesktop) {
    return (
      <aside className="w-64 shrink-0 border-r bg-background">
        {children}
      </aside>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 p-0" showCloseButton={false}>
        <SheetHeader className="sr-only">
          <SheetTitle>Threads</SheetTitle>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  )
}
