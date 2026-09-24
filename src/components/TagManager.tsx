import { useState, type FormEvent } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTags } from '../context/TagsContext'
import { cleanTagName, createTag, deleteTag, findTagByName, renameTag } from '../services/tags'
import type { EventTag } from '../types/models'
import Modal from './Modal'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Settings card: add, rename, and delete event tags. */
export default function TagManager() {
  const { profile } = useAuth()
  const { tags } = useTags()
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState<EventTag | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Validates a name; returns it cleaned, or null after showing why not. */
  const validName = (raw: string, exceptId?: string) => {
    const name = cleanTagName(raw)
    if (!name) {
      setError('Tag names need at least one letter or number.')
      return null
    }
    const existing = findTagByName(tags, name, exceptId)
    if (existing) {
      setError(`There's already a tag called "${existing.name}".`)
      return null
    }
    return name
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    const name = validName(newName)
    if (name) {
      void run(async () => {
        await createTag(name, profile.uid)
        setNewName('')
      })
    }
  }

  const saveRename = (e: FormEvent) => {
    e.preventDefault()
    if (!editing) return
    const name = validName(editing.name, editing.id)
    if (name) {
      void run(async () => {
        await renameTag(editing.id, name)
        setEditing(null)
      })
    }
  }

  return (
    <Card className="mt-6">
      <CardContent className="space-y-4">
        <div>
          <h3 className="font-semibold">Event Tags</h3>
          <p className="text-sm text-muted-foreground">
            Tag events (like Football) to group their uploaded photos: each tag gets its own folder,
            with its events' folders inside. Pick an event's tag when you create or edit it.
          </p>
        </div>

        <form onSubmit={add} className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New tag, e.g. Football"
            aria-label="New tag name"
            maxLength={40}
          />
          <Button type="submit" disabled={busy || !newName.trim()}>
            Add Tag
          </Button>
        </form>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tags yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {tags.map((tag) => (
              <li key={tag.id} className="flex items-center gap-2 px-3 py-2">
                {editing?.id === tag.id ? (
                  <form onSubmit={saveRename} className="flex flex-1 gap-2">
                    <Input
                      autoFocus
                      value={editing.name}
                      onChange={(e) => setEditing({ id: tag.id, name: e.target.value })}
                      aria-label={`New name for ${tag.name}`}
                      maxLength={40}
                    />
                    <Button type="submit" size="sm" disabled={busy}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(null)
                        setError(null)
                      }}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm">{tag.name}</span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing({ id: tag.id, name: tag.name })
                        setError(null)
                      }}
                      aria-label={`Rename ${tag.name}`}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        setDeleting(tag)
                        setError(null)
                      }}
                      aria-label={`Delete ${tag.name}`}
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          Renaming a tag or changing an event's tag only affects photos uploaded afterward. Files
          already in Wasabi stay where they are.
        </p>
      </CardContent>

      {deleting && (
        <Modal title="Delete Tag" onClose={() => !busy && setDeleting(null)}>
          <p className="text-sm">
            Delete <span className="font-semibold">{deleting.name}</span>? Events with this tag become
            untagged. Photos already uploaded stay where they are.
          </p>
          {error && (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={busy}>
              Keep Tag
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await deleteTag(deleting.id)
                  setDeleting(null)
                })
              }
            >
              {busy ? 'Deleting…' : 'Delete Tag'}
            </Button>
          </div>
        </Modal>
      )}
    </Card>
  )
}
