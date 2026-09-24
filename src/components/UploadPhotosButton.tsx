import { useRef } from 'react'
import { Upload } from 'lucide-react'
import { useUploads } from '../context/UploadContext'
import { PHOTO_ACCEPT } from '../services/photoUploads'
import type { ScheduleEvent } from '../types/models'
import { Button } from '@/components/ui/button'

/**
 * Opens the photo picker and starts uploading to this event. Renders nothing
 * unless the current user can upload here (see UploadState.canUpload).
 */
export default function UploadPhotosButton({ event }: { event: ScheduleEvent }) {
  const { canUpload, startUpload } = useUploads()
  const inputRef = useRef<HTMLInputElement>(null)

  if (!canUpload(event)) return null

  return (
    <>
      <Button onClick={() => inputRef.current?.click()}>
        <Upload /> Upload Photos
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={PHOTO_ACCEPT}
        className="hidden"
        aria-label={`Upload photos for ${event.eventName}`}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          // Reset so picking the same files again still fires onChange.
          e.target.value = ''
          if (files.length) startUpload(event, files)
        }}
      />
    </>
  )
}
