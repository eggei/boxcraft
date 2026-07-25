import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Each tooltip carries its own provider rather than relying on one at the app
 * root, so a button can be dropped anywhere — including into a test that
 * renders a single component on its own — without a provider ancestor.
 */
function Tooltip({
  delayDuration = 250,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipPrimitive.Provider>
  )
}

function TooltipTrigger(
  props: React.ComponentProps<typeof TooltipPrimitive.Trigger>,
) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground shadow-raised z-50 max-w-[15rem] rounded-md border px-2.5 py-1.5 text-xs text-balance",
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

/**
 * The shape every call site actually wants: one interactive child, one hint.
 * `asChild` makes the child itself the trigger, so the button keeps its own
 * element, styles and accessible name — the tip is only ever a description.
 */
function WithTooltip({
  tip,
  side,
  children,
}: {
  tip: React.ReactNode
  side?: React.ComponentProps<typeof TooltipPrimitive.Content>["side"]
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{tip}</TooltipContent>
    </Tooltip>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, WithTooltip }
