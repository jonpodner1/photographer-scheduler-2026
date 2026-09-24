import { useEffect, useState, type FormEvent } from 'react'
import {
  callableErrorMessage,
  getPhotoUploadSettings,
  savePhotoUploadSettings,
  type PhotoUploadSettings,
} from '../../services/photoUploads'
import Spinner from '../../components/Spinner'
import TagManager from '../../components/TagManager'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Suggestions only — any region Wasabi adds later can be typed in.
const WASABI_REGIONS = [
  'us-east-1', 'us-east-2', 'us-central-1', 'us-west-1', 'us-west-2', 'ca-central-1',
  'eu-central-1', 'eu-central-2', 'eu-west-1', 'eu-west-2', 'eu-south-1',
  'ap-northeast-1', 'ap-northeast-2', 'ap-southeast-1', 'ap-southeast-2',
]

/** Preview of the folder setting as the server will store it. */
function previewFolder(folder: string): string {
  return folder
    .split(/[/\\]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' / ')
}

export default function AdminSettingsPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h2 className="mb-4 text-lg font-semibold">Settings</h2>
      <PhotoUploadsCard />
      <TagManager />
    </div>
  )
}

/** Photo upload switch + Wasabi settings (keys are write-only). */
function PhotoUploadsCard() {
  const [saved, setSaved] = useState<PhotoUploadSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [enabled, setEnabled] = useState(false)
  const [bucket, setBucket] = useState('')
  const [region, setRegion] = useState('us-east-1')
  const [folder, setFolder] = useState('')
  // Key fields always start blank: saved keys never come back from the server.
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  const applySaved = (s: PhotoUploadSettings) => {
    setSaved(s)
    setEnabled(s.enabled)
    setBucket(s.bucket)
    setRegion(s.region)
    setFolder(s.folder)
    setAccessKeyId('')
    setSecretAccessKey('')
  }

  useEffect(() => {
    getPhotoUploadSettings()
      .then(applySaved)
      .catch((err) => setLoadError(callableErrorMessage(err)))
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // Turning off sends only the switch — the saved Wasabi settings stay put
      // for when uploads are turned back on.
      const next = await savePhotoUploadSettings(
        enabled
          ? { enabled, bucket, region, folder, accessKeyId, secretAccessKey }
          : { enabled: false },
      )
      applySaved(next)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2500)
    } catch (err) {
      setError(callableErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Couldn't load photo upload settings: {loadError}</AlertDescription>
      </Alert>
    )
  }

  if (!saved) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  const exampleEvent = 'Varsity Football 2026-10-03'
  const folderPreview = previewFolder(folder)

  return (
    <Card>
      <CardContent>
        <form onSubmit={submit} className="space-y-5" autoComplete="off">
          <div>
            <h3 className="font-semibold">Photo Uploads</h3>
            <p className="text-sm text-muted-foreground">
              Photographers upload their photos from any event they're signed up for. Files go
              straight to your Wasabi bucket, one folder per event.
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-border p-3">
            <Checkbox
              checked={enabled}
              onCheckedChange={(v) => {
                setEnabled(v === true)
                setError(null)
              }}
              className="mt-0.5"
            />
            <span className="text-sm">
              <span className="font-medium">Let photographers upload photos</span>
              <br />
              <span className="text-muted-foreground">
                Adds an Upload Photos button to the events they're signed up for.
              </span>
            </span>
          </label>

          {enabled && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="bucket">Bucket name</Label>
                  <Input
                    id="bucket"
                    value={bucket}
                    onChange={(e) => setBucket(e.target.value)}
                    placeholder="mchs-yearbook-photos"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="region">Region</Label>
                  <Input
                    id="region"
                    list="wasabi-regions"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="us-east-1"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                  />
                  <datalist id="wasabi-regions">
                    {WASABI_REGIONS.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="accessKeyId">Access key</Label>
                <Input
                  id="accessKeyId"
                  name="wasabi-access-key"
                  value={accessKeyId}
                  onChange={(e) => setAccessKeyId(e.target.value)}
                  placeholder={
                    saved.accessKeyHint
                      ? `Saved (ends in ${saved.accessKeyHint}). Leave blank to keep it`
                      : 'Wasabi access key'
                  }
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="secretAccessKey">Secret key</Label>
                <Input
                  id="secretAccessKey"
                  name="wasabi-secret-key"
                  type="password"
                  value={secretAccessKey}
                  onChange={(e) => setSecretAccessKey(e.target.value)}
                  placeholder={
                    saved.hasSecretKey ? 'Saved. Leave blank to keep it' : 'Wasabi secret key'
                  }
                  autoComplete="new-password"
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">
                  Saved keys are never shown again, to you or any other admin.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="folder">
                  Folder <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="folder"
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  placeholder="Yearbook/2026-27"
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to put event folders at the top of the bucket. Use / for
                  subfolders.
                </p>
              </div>

              <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">Files are saved as</p>
                <p className="break-all font-mono">
                  {bucket.trim() || 'your-bucket'} / {folderPreview && `${folderPreview} / `}
                  Football / {exampleEvent} / {exampleEvent} 1.jpg, 2.jpg, 3.jpg…
                </p>
                <p className="mt-1">
                  Football is the event's tag. Untagged events skip the tag folder.
                </p>
              </div>
            </>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" size="lg" disabled={busy} className="w-full">
            {busy
              ? enabled
                ? 'Checking Wasabi…'
                : 'Saving…'
              : justSaved
                ? 'Saved ✓'
                : 'Save Settings'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
