import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { Photo, Project } from '../core/types';
import { useStore } from '../state/store';
import { cachedPhotoUrl, photoUrl } from '../state/photoStore';

export function usePhotoUrl(id: string | null | undefined, variant: 'prev' | 'thumb'): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => (id ? cachedPhotoUrl(id, variant) : undefined));
  useEffect(() => {
    let alive = true;
    if (!id) {
      setUrl(undefined);
      return;
    }
    const c = cachedPhotoUrl(id, variant);
    if (c) setUrl(c);
    else photoUrl(id, variant).then((u) => alive && setUrl(u ?? undefined));
    return () => {
      alive = false;
    };
  }, [id, variant]);
  return url;
}

/** Tracks an element's size. Returns a callback ref, so it works even if the element mounts later. */
export function useElementSize<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  const ref = useCallback((node: T | null) => setEl(node), []);
  return [ref, size] as const;
}

export const DRAG_PHOTO = 'application/x-photobook-photo';
export const DRAG_SLOT = 'application/x-photobook-slot';
export const DRAG_PAGE = 'application/x-photobook-page';

export function hasType(e: React.DragEvent, type: string) {
  return Array.from(e.dataTransfer.types).includes(type);
}


export function useProject(): Project {
  return useStore((s) => s.project)!;
}

export function usePhotoMap(): Map<string, Photo> {
  const photos = useStore((s) => s.project?.photos);
  return useMemo(() => new Map((photos ?? []).map((p) => [p.id, p])), [photos]);
}

/** How many times each photo is used in the book (pages + cover). */
export function useUsage(): Map<string, number> {
  const project = useStore((s) => s.project);
  return useMemo(() => {
    const m = new Map<string, number>();
    if (!project) return m;
    const add = (id: string | null) => id && m.set(id, (m.get(id) ?? 0) + 1);
    project.pages.forEach((p) => p.slots.forEach((s) => add(s.photoId)));
    project.cover.slots.forEach((s) => add(s.photoId));
    add(project.cover.backSlot.photoId);
    return m;
  }, [project]);
}
