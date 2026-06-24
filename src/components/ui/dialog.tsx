import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Minimal dependency-free modal. Renders an overlay + centered (or bottom-sheet)
 * panel when `open`. Closes on overlay click and Escape. Locks body scroll while
 * open. Intentionally small — we avoid pulling in @radix-ui for one dialog.
 */
export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: React.ReactNode
  /** 'sheet' anchors to the bottom (mobile-first); 'center' centers it. */
  variant?: 'sheet' | 'center'
  className?: string
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  variant = 'center',
  className,
}: DialogProps) {
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex bg-black/50',
        variant === 'sheet' ? 'items-end justify-center' : 'items-center justify-center p-4',
      )}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={cn(
          'relative max-h-[90dvh] w-full overflow-y-auto border bg-background p-4 shadow-lg',
          variant === 'sheet'
            ? 'max-w-2xl rounded-t-2xl'
            : 'max-w-sm rounded-lg',
          className,
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-accent"
        >
          <X className="h-4 w-4" />
        </button>
        {title && <h2 className="pr-6 text-base font-semibold">{title}</h2>}
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
        <div className={cn(title || description ? 'mt-4' : '')}>{children}</div>
      </div>
    </div>
  )
}
