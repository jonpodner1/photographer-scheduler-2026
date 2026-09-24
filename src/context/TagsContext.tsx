import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { listenTags } from '../services/tags'
import type { EventTag } from '../types/models'

interface TagsState {
  /** All event tags, A→Z. */
  tags: EventTag[]
  /** The tag's name, or null for no tag / a deleted tag. */
  tagName: (tagId: string | null) => string | null
}

const EMPTY: TagsState = { tags: [], tagName: () => null }

const TagsContext = createContext<TagsState>(EMPTY)

/** One live subscription to scheduler_tags for the signed-in layout (event cards, forms, settings). */
export function TagsProvider({ children }: { children: ReactNode }) {
  const [tags, setTags] = useState<EventTag[]>([])

  useEffect(() => listenTags(setTags), [])

  const tagName = (tagId: string | null) => (tagId ? (tags.find((t) => t.id === tagId)?.name ?? null) : null)

  return <TagsContext.Provider value={{ tags, tagName }}>{children}</TagsContext.Provider>
}

export const useTags = () => useContext(TagsContext)
