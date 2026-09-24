import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import { useUploads } from '../context/UploadContext'
import type { UploadJobView } from '../services/photoUploadQueue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const photos = (n: number) => `${n} ${n === 1 ? 'photo' : 'photos'}`

/**
 * Floating progress for photo uploads. Photographers only ever see a progress
 * bar and counts — never where the files go or what they're named.
 */
export default function UploadProgressPanel() {
  const { jobs } = useUploads()
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelHeight, setPanelHeight] = useState(0)
  const visible = jobs.length > 0

  // The panel floats over the page; a matching spacer lets the page scroll
  // far enough that it never hides the last card's buttons.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const observer = new ResizeObserver(() => setPanelHeight(panel.offsetHeight))
    observer.observe(panel)
    return () => observer.disconnect()
  }, [visible])

  if (!visible) return null

  return (
    <>
      <div aria-hidden style={{ height: panelHeight }} className="print:hidden" />
      <div
        ref={panelRef}
        className="fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 sm:left-auto sm:w-96 print:hidden"
        aria-live="polite"
      >
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>
    </>
  )
}

function JobCard({ job }: { job: UploadJobView }) {
  const { cancel, retry, dismiss } = useUploads()
  const running = job.state === 'running'
  const allDone = job.state === 'finished' && job.failed === 0

  let title: string
  if (running) title = `Uploading ${photos(job.total)}`
  else if (job.state === 'cancelled') {
    title = job.done ? `Cancelled: ${job.done} of ${photos(job.total)} uploaded` : 'Upload cancelled'
  }
  else if (job.total === 0) title = 'Nothing new to upload'
  else if (allDone) title = `${photos(job.done)} uploaded`
  else title = `${job.done} of ${photos(job.total)} uploaded`

  const notes: string[] = []
  if (job.alreadyUploaded) notes.push(`${photos(job.alreadyUploaded)} already uploaded, skipped`)
  if (job.skipped) {
    notes.push(`${job.skipped} ${job.skipped === 1 ? 'file' : 'files'} skipped (not a photo, or over 2 GB)`)
  }

  const problem =
    job.state === 'finished' && job.failed > 0
      ? (job.error ?? `${photos(job.failed)} couldn't upload. Check your connection and retry.`)
      : null

  return (
    <Card className="gap-2 p-4 shadow-lg">
      <div className="flex items-start gap-2">
        {allDone && job.total > 0 && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{job.eventName}</p>
        </div>
        {!running && (
          <Button variant="ghost" size="icon-xs" onClick={() => dismiss(job.id)} aria-label="Dismiss">
            <X />
          </Button>
        )}
      </div>

      {job.total > 0 && (
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`Uploading photos for ${job.eventName}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={job.percent}
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-300',
              problem ? 'bg-amber-500' : allDone ? 'bg-green-600' : 'bg-primary',
            )}
            style={{ width: `${job.percent}%` }}
          />
        </div>
      )}

      {running && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {job.done} of {job.total} · {job.percent}%
          </span>
          <Button variant="ghost" size="xs" onClick={() => cancel(job.id)}>
            Cancel
          </Button>
        </div>
      )}

      {problem && <p className="text-xs text-destructive">{problem}</p>}
      {notes.map((note) => (
        <p key={note} className="text-xs text-muted-foreground">
          {note}
        </p>
      ))}

      {problem && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => retry(job.id)}>
            Retry
          </Button>
        </div>
      )}
    </Card>
  )
}
