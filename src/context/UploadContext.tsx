import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { listenPhotoUploadsEnabled } from '../services/photoUploads'
import { PhotoUploadQueue, type UploadJobView } from '../services/photoUploadQueue'
import { isSignedUpBy, type ScheduleEvent } from '../types/models'

interface UploadState {
  /** Admin switch on the Settings page (scheduler_settings/photoUploads). */
  enabled: boolean
  jobs: UploadJobView[]
  /** Uploads on, event not cancelled, and the current user is signed up for it. */
  canUpload: (event: ScheduleEvent) => boolean
  startUpload: (event: ScheduleEvent, files: File[]) => void
  cancel: (jobId: number) => void
  retry: (jobId: number) => void
  dismiss: (jobId: number) => void
}

const UploadContext = createContext<UploadState | null>(null)

/**
 * Owns the photo upload queue for the signed-in session. Lives in Layout, so
 * uploads keep going while the photographer moves between pages.
 */
export function UploadProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [queue] = useState(() => new PhotoUploadQueue())
  const [enabled, setEnabled] = useState(false)
  const jobs = useSyncExternalStore(queue.subscribe, queue.getSnapshot)
  const uploading = jobs.some((j) => j.state === 'running')

  useEffect(() => listenPhotoUploadsEnabled(setEnabled), [])

  // Signing out unmounts the layout — stop sending on the old account's links.
  useEffect(() => () => queue.cancelAll(), [queue])

  // Closing or reloading the tab would kill the uploads — ask first.
  useEffect(() => {
    if (!uploading) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uploading])

  const canUpload = (event: ScheduleEvent) =>
    enabled && !!profile && event.status !== 'cancelled' && isSignedUpBy(event, profile.uid)

  const value: UploadState = {
    enabled,
    jobs,
    canUpload,
    startUpload: (event, files) => {
      if (profile) queue.start(profile.uid, event, files)
    },
    cancel: (id) => queue.cancel(id),
    retry: (id) => queue.retry(id),
    dismiss: (id) => queue.dismiss(id),
  }

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>
}

export function useUploads(): UploadState {
  const ctx = useContext(UploadContext)
  if (!ctx) throw new Error('useUploads must be used within UploadProvider')
  return ctx
}
