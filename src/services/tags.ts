import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { COL, db } from '../lib/firebase'
import type { EventTag } from '../types/models'

// Event tags (e.g. "Football"). Admins manage them on the Settings page and
// pick one per event; a tagged event's photos upload into a folder named
// after the tag (see createPhotoUploadUrls in functions/index.js).

const tagsCol = collection(db, COL.tags)

const byName = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

/** All tags, A→Z. */
export function listenTags(cb: (tags: EventTag[]) => void): () => void {
  return onSnapshot(
    tagsCol,
    (snap) =>
      cb(
        snap.docs
          .map((d) => ({ id: d.id, name: (d.data().name as string) ?? '' }))
          .sort((a, b) => byName.compare(a.name, b.name)),
      ),
    (err) => {
      console.error('tags listener error', err)
      cb([])
    },
  )
}

/** Tidies a typed tag name; null if it can't name a folder (no letters or digits). */
export function cleanTagName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, 40)
  return /[\p{L}\p{N}]/u.test(name) ? name : null
}

/** Case-insensitive match against the existing tags (optionally ignoring one being renamed). */
export function findTagByName(tags: EventTag[], name: string, exceptId?: string): EventTag | undefined {
  return tags.find((t) => t.id !== exceptId && byName.compare(t.name, name) === 0)
}

export async function createTag(name: string, createdBy: string): Promise<string> {
  const ref = await addDoc(tagsCol, { name, createdBy, createdAt: serverTimestamp() })
  return ref.id
}

export async function renameTag(id: string, name: string): Promise<void> {
  await updateDoc(doc(db, COL.tags, id), { name })
}

/** Deletes the tag and untags its events (their photos already uploaded stay where they are). */
export async function deleteTag(id: string): Promise<void> {
  const tagged = await getDocs(query(collection(db, COL.events), where('tagId', '==', id)))
  for (let i = 0; i < tagged.docs.length; i += 400) {
    const batch = writeBatch(db)
    tagged.docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, { tagId: null }))
    await batch.commit()
  }
  await deleteDoc(doc(db, COL.tags, id))
}
