import {
  MAX_PHOTO_BYTES,
  UploadHttpError,
  callableErrorMessage,
  createPhotoUploadUrls,
  isTransientCallableError,
  photoExtension,
  putFile,
} from './photoUploads'

/** Files uploading at once. */
const CONCURRENCY = 3
/**
 * Upload links requested per call (server max 25). Each link claims the next
 * file number, so asking a few at a time keeps a closed tab from leaving a
 * big gap in the numbering.
 */
const RESERVE_BATCH = 6
const MAX_ATTEMPTS = 3
/** Remembered uploads per event (for skipping re-selected files). */
const MAX_REMEMBERED = 5000

type ItemStatus = 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled'

interface UploadItem {
  file: File
  extension: string
  fingerprint: string
  status: ItemStatus
  /** Bytes sent so far on the current attempt. */
  loaded: number
  /** Presigned PUT link; null until reserved, or after the bucket rejected it. */
  url: string | null
  contentType: string
  xhr: XMLHttpRequest | null
}

interface UploadJob {
  id: number
  uid: string
  eventId: string
  eventName: string
  items: UploadItem[]
  /** Picked files skipped because this browser already uploaded them to this event. */
  alreadyUploaded: number
  /** Picked files skipped because they aren't photos or are over the size limit. */
  skipped: number
  running: boolean
  cancelled: boolean
  /** Why the server stopped handing out links (uploads turned off, not signed up…). */
  error: string | null
  reserving: Promise<void> | null
}

/** What the progress panel renders — deliberately nothing about where files go. */
export interface UploadJobView {
  id: number
  eventId: string
  eventName: string
  total: number
  done: number
  /** While running: failed so far. Once finished: everything that didn't upload. */
  failed: number
  state: 'running' | 'finished' | 'cancelled'
  /** 0–100, by bytes. */
  percent: number
  error: string | null
  alreadyUploaded: number
  skipped: number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Camera files sort the way they were shot: IMG_2 before IMG_10.
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Short stable hash (cyrb53) so remembered uploads stay small in localStorage. */
function hash(s: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

const fingerprint = (f: File) => hash(`${f.name}|${f.size}|${f.lastModified}`)

// Fingerprints of files this browser finished uploading, per user + event, so
// re-picking a whole card after an interrupted upload only sends what's missing.
// Storage can be unavailable (private mode, blocked site data) — then every
// pick simply uploads everything.
const rememberedKey = (uid: string, eventId: string) => `photoUploads.done.${uid}.${eventId}`

function readRemembered(uid: string, eventId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(rememberedKey(uid, eventId)) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function remember(uid: string, eventId: string, fp: string) {
  try {
    const list = readRemembered(uid, eventId)
    if (list.includes(fp)) return
    list.push(fp)
    localStorage.setItem(rememberedKey(uid, eventId), JSON.stringify(list.slice(-MAX_REMEMBERED)))
  } catch {
    // Storage full or blocked — only the duplicate check is lost.
  }
}

function toView(job: UploadJob): UploadJobView {
  let done = 0
  let failed = 0
  let bytes = 0
  let loaded = 0
  for (const item of job.items) {
    bytes += item.file.size
    if (item.status === 'done') {
      done++
      loaded += item.file.size
    } else {
      loaded += item.loaded
      if (item.status === 'failed') failed++
    }
  }
  const state = job.running ? 'running' : job.cancelled ? 'cancelled' : 'finished'
  return {
    id: job.id,
    eventId: job.eventId,
    eventName: job.eventName,
    total: job.items.length,
    done,
    failed: state === 'finished' ? job.items.length - done : failed,
    state,
    percent: bytes ? Math.min(100, Math.floor((loaded / bytes) * 100)) : 100,
    error: job.error,
    alreadyUploaded: job.alreadyUploaded,
    skipped: job.skipped,
  }
}

/**
 * Uploads photos for events straight to the bucket: asks the server for a few
 * numbered upload links at a time (in file-name order, so numbering follows
 * the camera's order), PUTs up to CONCURRENCY files at once, and retries
 * network failures. Exposes plain snapshots for useSyncExternalStore.
 */
export class PhotoUploadQueue {
  private jobs: UploadJob[] = []
  private nextId = 1
  private listeners = new Set<() => void>()
  private snapshot: UploadJobView[] = []
  private emitTimer: ReturnType<typeof setTimeout> | null = null

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.snapshot

  start(uid: string, event: { id: string; eventName: string }, files: File[]) {
    const remembered = new Set(readRemembered(uid, event.id))
    // Also skip files still queued in another upload to the same event.
    for (const other of this.jobs) {
      if (other.uid !== uid || other.eventId !== event.id) continue
      for (const item of other.items) {
        if (item.status === 'queued' || item.status === 'uploading') remembered.add(item.fingerprint)
      }
    }

    const job: UploadJob = {
      id: this.nextId++,
      uid,
      eventId: event.id,
      eventName: event.eventName,
      items: [],
      alreadyUploaded: 0,
      skipped: 0,
      running: false,
      cancelled: false,
      error: null,
      reserving: null,
    }

    for (const file of [...files].sort((a, b) => byName.compare(a.name, b.name))) {
      const extension = photoExtension(file)
      if (!extension || file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
        job.skipped++
        continue
      }
      const fp = fingerprint(file)
      if (remembered.has(fp)) {
        job.alreadyUploaded++
        continue
      }
      remembered.add(fp)
      job.items.push({
        file,
        extension,
        fingerprint: fp,
        status: 'queued',
        loaded: 0,
        url: null,
        contentType: '',
        xhr: null,
      })
    }

    this.jobs.push(job)
    if (job.items.length) void this.run(job)
    else this.emit()
  }

  cancel(id: number) {
    const job = this.jobs.find((j) => j.id === id)
    if (!job?.running) return
    job.cancelled = true
    for (const item of job.items) {
      if (item.status === 'queued') item.status = 'cancelled'
      item.xhr?.abort()
    }
    this.emit()
  }

  /** Re-sends whatever didn't upload (failed files, or files left when the server said no). */
  retry(id: number) {
    const job = this.jobs.find((j) => j.id === id)
    if (!job || job.running || job.cancelled) return
    for (const item of job.items) {
      if (item.status === 'failed') {
        item.status = 'queued'
        item.loaded = 0
      }
    }
    void this.run(job)
  }

  dismiss(id: number) {
    if (this.jobs.some((j) => j.id === id && j.running)) return
    this.jobs = this.jobs.filter((j) => j.id !== id)
    this.emit()
  }

  /** Stops everything (sign-out / unmount). */
  cancelAll() {
    for (const job of this.jobs) this.cancel(job.id)
  }

  private async run(job: UploadJob) {
    job.running = true
    job.error = null
    this.emit()
    await Promise.all(Array.from({ length: CONCURRENCY }, () => this.worker(job)))
    job.running = false
    this.emit()
  }

  private async worker(job: UploadJob) {
    for (let item = await this.nextItem(job); item; item = await this.nextItem(job)) {
      await this.upload(job, item)
    }
  }

  /** Next file with an upload link, reserving more links (one request at a time, in order) as needed. */
  private async nextItem(job: UploadJob): Promise<UploadItem | null> {
    for (;;) {
      if (job.cancelled || job.error) return null
      const ready = job.items.find((i) => i.status === 'queued' && i.url)
      const unreserved = job.items.filter((i) => i.status === 'queued' && !i.url)
      if (ready) {
        ready.status = 'uploading'
        // Keep links a step ahead of the uploads so workers rarely wait.
        const readyLeft = job.items.filter((i) => i.status === 'queued' && i.url).length
        if (readyLeft < CONCURRENCY && unreserved.length && !job.reserving) {
          void this.reserve(job, unreserved.slice(0, RESERVE_BATCH))
        }
        return ready
      }
      if (!unreserved.length) return null
      await (job.reserving ?? this.reserve(job, unreserved.slice(0, RESERVE_BATCH)))
    }
  }

  private reserve(job: UploadJob, items: UploadItem[]): Promise<void> {
    const reserving = (async () => {
      for (let attempt = 1; ; attempt++) {
        try {
          const targets = await createPhotoUploadUrls(
            job.eventId,
            items.map((i) => ({ size: i.file.size, extension: i.extension })),
          )
          if (targets.length !== items.length) throw new Error('Unexpected upload link response')
          targets.forEach((t, n) => {
            items[n].url = t.url
            items[n].contentType = t.contentType
          })
          return
        } catch (err) {
          if (job.cancelled) return
          if (!isTransientCallableError(err) || attempt >= MAX_ATTEMPTS) {
            console.error('photo upload: could not get upload links', err)
            job.error = callableErrorMessage(err)
            return
          }
          await sleep(1000 * attempt)
        }
      }
    })().finally(() => {
      job.reserving = null
      this.emit()
    })
    job.reserving = reserving
    return reserving
  }

  private async upload(job: UploadJob, item: UploadItem) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && item.url && !job.cancelled; attempt++) {
      try {
        await putFile(
          item.url,
          item.file,
          item.contentType,
          (loaded) => {
            item.loaded = loaded
            this.emit()
          },
          (xhr) => {
            item.xhr = xhr
          },
        )
        item.xhr = null
        item.status = 'done'
        item.loaded = item.file.size
        remember(job.uid, job.eventId, item.fingerprint)
        this.emit()
        return
      } catch (err) {
        item.xhr = null
        item.loaded = 0
        if (job.cancelled) break
        const status = err instanceof UploadHttpError ? err.status : 0
        if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
          // The bucket refused the link itself (expired, or bad settings).
          // Retrying needs a fresh link, which Retry will request.
          console.error('photo upload: bucket rejected upload', status)
          item.url = null
        } else if (attempt < MAX_ATTEMPTS) {
          await sleep(1500 * attempt)
        }
      }
    }
    item.status = job.cancelled ? 'cancelled' : 'failed'
    this.emit()
  }

  /** Batches progress updates (XHR progress fires far more often than we need to render). */
  private emit() {
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      this.snapshot = this.jobs.map(toView)
      this.listeners.forEach((listener) => listener())
    }, 100)
  }
}
