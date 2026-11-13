import { useEffect, useState } from 'react'
import { Share } from 'lucide-react'
import { WithTooltip } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { copySceneHtml, downloadScene, openSceneInNewTab } from './sceneExport'

/** How long the "copied" note stays up after a copy. */
const COPY_NOTE_MS = 2000

type CopyNote = 'copied' | 'failed' | null

/**
 * One scene's way out: download it as an `.html` file, copy its HTML, or open
 * it on its own in a new tab. The same menu sits on the feed's centered card
 * and in the editor's header, so a scene leaves the same way from either.
 */
export function SceneExportMenu({
  title,
  source,
}: {
  title: string
  source: string
}) {
  const [copyNote, setCopyNote] = useState<CopyNote>(null)

  useEffect(
    function dismissCopyNote() {
      if (!copyNote) return
      const timer = setTimeout(() => setCopyNote(null), COPY_NOTE_MS)
      return () => clearTimeout(timer)
    },
    [copyNote],
  )

  function copy() {
    copySceneHtml(source).then(
      () => setCopyNote('copied'),
      () => setCopyNote('failed'),
    )
  }

  return (
    <div className="flex items-center gap-2">
      {/* Said beside the trigger rather than in the menu: picking an item
          closes the menu, so a note inside it would never be seen. */}
      {copyNote && (
        <span role="status" className="text-muted-foreground text-xs">
          {copyNote === 'copied' ? 'HTML copied' : "Couldn't copy"}
        </span>
      )}
      <DropdownMenu>
        <WithTooltip tip="Take this scene out as a standalone HTML page">
          <DropdownMenuTrigger
            aria-label="Export scene"
            className="hover:bg-muted text-muted-foreground rounded-md border p-2"
          >
            <Share className="size-4" />
          </DropdownMenuTrigger>
        </WithTooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => downloadScene(title, source)}>
            Download .html
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={copy}>Copy HTML</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openSceneInNewTab(source)}>
            Open in new tab
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
