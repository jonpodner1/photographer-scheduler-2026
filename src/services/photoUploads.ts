import { doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { FirebaseError } from 'firebase/app'
import { COL, db, functions } from '../lib/firebase'

// Event photo uploads: photographers send the photos they shot straight to the
// Wasabi bucket an admin configures on the Settings page. The bucket, folder,
// and keys stay server-side (see functions/index.js); the browser only ever
// gets short-lived upload links.

/**
 * Photo extensions the picker accepts — mirrors PHOTO_CONTENT_TYPES in
 * functions/index.js, which is the list actually enforced.
 */
export const PHOTO_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif', 'tif', 'tiff',
  // Camera RAW
  'dng', 'cr2', 'cr3', 'nef', 'nrw', 'arw', 'raf', 'orf', 'rw2', 'pef', 'srw',
]

/** `accept` for the file picker: the photo library plus RAW files by extension. */
export const PHOTO_ACCEPT = ['image/*', ...PHOTO_EXTENSIONS.map((e) => `.${e}`)].join(',')

/** Per-file limit, same as the server's. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024 * 1024

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/tiff': 'tiff',
}

/** The file's photo extension (lowercase), or null if it isn't a photo we accept. */
export function photoExtension(file: File): string | null {
  const dot = file.name.lastIndexOf('.')
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : ''
  if (PHOTO_EXTENSIONS.includes(ext)) return ext
  // Some pickers hand over photos without an extension; fall back to the type.
  return ext ? null : (EXTENSION_BY_TYPE[file.type] ?? null)
}

// ─── On/off switch (readable by every signed-in user) ────────────────────────

export function listenPhotoUploadsEnabled(cb: (enabled: boolean) => void): () => void {
  return onSnapshot(
    doc(db, COL.settings, 'photoUploads'),
    (snap) => cb(snap.data()?.enabled === true),
    (err) => {
      console.error('photo uploads setting listener error', err)
      cb(false)
    },
  )
}

// ─── Admin settings ──────────────────────────────────────────────────────────

/** What the server shows admins — the keys themselves are never sent back. */
export interface PhotoUploadSettings {
  enabled: boolean
  bucket: string
  region: string
  folder: string
  /** Last 4 characters of the saved access key, or null if none is saved. */
  accessKeyHint: string | null
  hasSecretKey: boolean
}

/** Blank or omitted key fields keep the saved keys. */
export interface PhotoUploadSettingsInput {
  enabled: boolean
  bucket?: string
  region?: string
  folder?: string
  accessKeyId?: string
  secretAccessKey?: string
}

export async function getPhotoUploadSettings(): Promise<PhotoUploadSettings> {
  const fn = httpsCallable<void, PhotoUploadSettings>(functions, 'getPhotoUploadSettings')
  return (await fn()).data
}

export async function savePhotoUploadSettings(
  input: PhotoUploadSettingsInput,
): Promise<PhotoUploadSettings> {
  const fn = httpsCallable<PhotoUploadSettingsInput, PhotoUploadSettings>(
    functions,
    'savePhotoUploadSettings',
  )
  return (await fn(input)).data
}

// ─── Uploading ───────────────────────────────────────────────────────────────

export interface UploadTarget {
  url: string
  contentType: string
}

/** Reserves the next file numbers for this event and returns one upload link per file, in order. */
export async function createPhotoUploadUrls(
  eventId: string,
  files: { size: number; extension: string }[],
): Promise<UploadTarget[]> {
  const fn = httpsCallable<
    { eventId: string; files: { size: number; extension: string }[] },
    { uploads: UploadTarget[] }
  >(functions, 'createPhotoUploadUrls')
  return (await fn({ eventId, files })).data.uploads
}

/** Errors from a callable that are worth retrying (network blips, server hiccups). */
export function isTransientCallableError(err: unknown): boolean {
  return (
    err instanceof FirebaseError &&
    ['functions/unavailable', 'functions/deadline-exceeded', 'functions/internal', 'functions/resource-exhausted'].includes(err.code)
  )
}

export function callableErrorMessage(err: unknown): string {
  if (err instanceof FirebaseError && err.code.startsWith('functions/') && !isTransientCallableError(err)) {
    return err.message
  }
  return 'Something went wrong. Please try again.'
}

export class UploadHttpError extends Error {
  /** HTTP status from the bucket, or 0 for a network error / abort. */
  status: number

  constructor(status: number) {
    super(status ? `Upload failed (HTTP ${status})` : 'Upload failed (network error)')
    this.status = status
  }
}

/**
 * Aborts an upload that has made no progress for this long, so a connection
 * that silently stalls (flaky school Wi-Fi) gets retried instead of hanging.
 * Not an overall timeout — big files on slow links can take as long as they need.
 */
const STALL_MS = 90_000

/**
 * PUTs one file to a presigned URL. XMLHttpRequest rather than fetch because
 * fetch can't report upload progress.
 */
export function putFile(
  url: string,
  file: File,
  contentType: string,
  onProgress: (loaded: number) => void,
  onStart: (xhr: XMLHttpRequest) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    let lastActivity = Date.now()
    const watchdog = setInterval(() => {
      if (Date.now() - lastActivity > STALL_MS) xhr.abort()
    }, 5000)
    const settle = (fn: () => void) => {
      clearInterval(watchdog)
      fn()
    }

    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = (e) => {
      lastActivity = Date.now()
      if (e.lengthComputable) onProgress(e.loaded)
    }
    // Body fully sent; the bucket's reply should follow shortly.
    xhr.upload.onload = () => {
      lastActivity = Date.now()
    }
    xhr.onload = () =>
      settle(() => {
        if (xhr.status >= 200 && xhr.status < 300) resolve()
        else reject(new UploadHttpError(xhr.status))
      })
    xhr.onerror = () => settle(() => reject(new UploadHttpError(0)))
    // A stall abort is retried like a network error; a user cancel is told
    // apart by the queue (job.cancelled).
    xhr.onabort = () => settle(() => reject(new UploadHttpError(0)))
    onStart(xhr)
    xhr.send(file)
  })
}
