import { createStore as createIdbStore, del, get, set } from 'idb-keyval';
import { create } from 'zustand';
import { autoLayout, blankPage, emptySlot, relayoutPage, textPage, type Areas, type AutoLayoutOptions, DEFAULT_AUTO_OPTIONS, type LayoutStyle } from '../core/autoLayout';
import { coverPhotoCount, type SlotRef } from '../core/displayList';
import { pageGeometry } from '../core/geometry';
import { autoCover, newProject } from '../core/project';
import type { BookSpec, CoverDesign, CoverTemplateId, Page, Photo, Project, SlotContent, Theme } from '../core/types';
import { deletePhotoBlobs } from './photoStore';

const db = createIdbStore('photobook-projects', 'projects');

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  pages: number;
  photos: number;
  coverPhotoId?: string | null;
}

export type Selection = { kind: 'cover' } | { kind: 'page'; index: number };

interface State {
  project: Project | null;
  projects: ProjectMeta[];
  past: Project[];
  future: Project[];
  selection: Selection;
  selectedSlot: SlotRef | null;
  autoOptions: AutoLayoutOptions;
  importing: { done: number; total: number; label: string } | null;
  toast: string | null;

  loadIndex(): Promise<void>;
  openProject(id: string): Promise<void>;
  createProject(name: string, spec: BookSpec, theme?: Partial<Theme>): void;
  deleteProject(id: string): Promise<void>;
  closeProject(): void;

  update(fn: (p: Project) => Project, opts?: { history?: boolean }): void;
  /** Save the current state as an undo step before a series of history-less updates (e.g. a drag). */
  checkpoint(): void;
  undo(): void;
  redo(): void;

  setSpec(patch: Partial<BookSpec>): void;
  setTheme(patch: Partial<Theme>): void;
  rename(name: string): void;

  addPhotos(photos: Photo[]): void;
  removePhoto(id: string): void;
  setImporting(v: State['importing']): void;
  showToast(msg: string): void;

  setAutoOptions(o: Partial<AutoLayoutOptions>): void;
  autoBuild(): void;
  appendPhotosToBook(ids: string[]): void;

  select(s: Selection): void;
  selectSlot(ref: SlotRef | null): void;

  updatePage(pageId: string, fn: (p: Page) => Page): void;
  movePage(from: number, to: number): void;
  insertPage(at: number, kind: 'blank' | 'text' | 'photos'): void;
  duplicatePage(index: number): void;
  deletePage(index: number): void;
  setPageLayout(pageId: string, layoutId: string, frames: number): void;
  shufflePage(pageId: string): void;
  addPhotoToPage(pageId: string, photoId: string): void;
  removeFromSlot(ref: SlotRef): void;

  assignPhoto(ref: SlotRef, photoId: string): void;
  swapSlots(a: SlotRef, b: SlotRef): void;
  updateSlot(ref: SlotRef, patch: Partial<SlotContent>, opts?: { history?: boolean }): void;

  setCover(patch: Partial<CoverDesign>): void;
  setCoverTemplate(t: CoverTemplateId): void;
  autoDesignCover(): void;
}

const HISTORY_LIMIT = 60;

export function areasFor(project: Project, pageIndex: number): Areas {
  const g = pageGeometry(project.spec, project.theme, pageIndex, project.pages.length);
  return { live: g.live, bleed: { x: 0, y: 0, w: g.width, h: g.height } };
}

export function getSlot(project: Project, ref: SlotRef): SlotContent | undefined {
  if (ref.target === 'cover') return project.cover.slots[ref.slot];
  if (ref.target === 'cover-back') return project.cover.backSlot;
  return project.pages.find((p) => p.id === ref.pageId)?.slots[ref.slot];
}

function setSlot(project: Project, ref: SlotRef, value: SlotContent): Project {
  if (ref.target === 'cover') {
    const slots = [...project.cover.slots];
    while (slots.length <= ref.slot) slots.push(emptySlot());
    slots[ref.slot] = value;
    return { ...project, cover: { ...project.cover, slots } };
  }
  if (ref.target === 'cover-back') return { ...project, cover: { ...project.cover, backSlot: value } };
  return {
    ...project,
    pages: project.pages.map((p) => {
      if (p.id !== ref.pageId) return p;
      const slots = [...p.slots];
      while (slots.length <= ref.slot) slots.push(emptySlot());
      slots[ref.slot] = value;
      return { ...p, slots };
    }),
  };
}

function metaOf(p: Project): ProjectMeta {
  return { id: p.id, name: p.name, updatedAt: p.updatedAt, pages: p.pages.length, photos: p.photos.length, coverPhotoId: p.cover.slots[0]?.photoId };
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>((setState, getState) => {
  const persist = (p: Project) => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await set(`project:${p.id}`, p, db);
      const projects = [metaOf(p), ...getState().projects.filter((m) => m.id !== p.id)].sort((a, b) => b.updatedAt - a.updatedAt);
      await set('index', projects, db);
      setState({ projects });
    }, 400);
  };

  const commit = (next: Project, history = true) => {
    const cur = getState().project;
    next = { ...next, updatedAt: Date.now() };
    setState({
      project: next,
      past: history && cur ? [...getState().past, cur].slice(-HISTORY_LIMIT) : getState().past,
      future: history ? [] : getState().future,
    });
    persist(next);
  };

  const withProject = (fn: (p: Project) => Project, history = true) => {
    const p = getState().project;
    if (p) commit(fn(p), history);
  };

  return {
    project: null,
    projects: [],
    past: [],
    future: [],
    selection: { kind: 'cover' },
    selectedSlot: null,
    autoOptions: DEFAULT_AUTO_OPTIONS,
    importing: null,
    toast: null,

    async loadIndex() {
      setState({ projects: (await get<ProjectMeta[]>('index', db)) ?? [] });
    },
    async openProject(id) {
      const p = await get<Project>(`project:${id}`, db);
      if (p) setState({ project: p, past: [], future: [], selection: { kind: 'cover' }, selectedSlot: null });
    },
    createProject(name, spec, theme) {
      const p = newProject(name, spec, theme);
      setState({ project: p, past: [], future: [], selection: { kind: 'cover' }, selectedSlot: null, autoOptions: { ...DEFAULT_AUTO_OPTIONS, title: name } });
      persist(p);
    },
    async deleteProject(id) {
      const p = await get<Project>(`project:${id}`, db);
      if (p) for (const ph of p.photos) await deletePhotoBlobs(ph.id);
      await del(`project:${id}`, db);
      const projects = getState().projects.filter((m) => m.id !== id);
      await set('index', projects, db);
      setState({ projects, project: getState().project?.id === id ? null : getState().project });
    },
    closeProject() {
      setState({ project: null, past: [], future: [] });
    },

    update(fn, opts) {
      withProject(fn, opts?.history ?? true);
    },
    checkpoint() {
      const { project, past } = getState();
      if (project) setState({ past: [...past, project].slice(-HISTORY_LIMIT), future: [] });
    },
    undo() {
      const { past, project, future } = getState();
      if (!past.length || !project) return;
      const prev = past[past.length - 1];
      setState({ project: prev, past: past.slice(0, -1), future: [project, ...future] });
      persist(prev);
    },
    redo() {
      const { past, project, future } = getState();
      if (!future.length || !project) return;
      const next = future[0];
      setState({ project: next, past: [...past, project], future: future.slice(1) });
      persist(next);
    },

    setSpec(patch) {
      withProject((p) => ({ ...p, spec: { ...p.spec, ...patch } }));
    },
    setTheme(patch) {
      withProject((p) => ({ ...p, theme: { ...p.theme, ...patch } }));
    },
    rename(name) {
      withProject((p) => ({ ...p, name }), false);
    },

    addPhotos(photos) {
      if (!photos.length) return;
      withProject((p) => ({ ...p, photos: [...p.photos, ...photos] }), false);
    },
    removePhoto(id) {
      withProject((p) => {
        const clear = (s: SlotContent) => (s.photoId === id ? emptySlot() : s);
        return {
          ...p,
          photos: p.photos.filter((x) => x.id !== id),
          pages: p.pages.map((pg) => ({ ...pg, slots: pg.slots.map(clear) })),
          cover: { ...p.cover, slots: p.cover.slots.map(clear), backSlot: clear(p.cover.backSlot) },
        };
      });
      void deletePhotoBlobs(id);
    },
    setImporting(v) {
      setState({ importing: v });
    },
    showToast(msg) {
      setState({ toast: msg });
      setTimeout(() => getState().toast === msg && setState({ toast: null }), 4000);
    },

    setAutoOptions(o) {
      setState({ autoOptions: { ...getState().autoOptions, ...o } });
    },
    autoBuild() {
      const { autoOptions } = getState();
      withProject((p) => {
        const { pages } = autoLayout(p.photos, p.spec, p.theme, { ...autoOptions, title: p.cover.title || p.name, subtitle: p.cover.subtitle });
        const withPages = { ...p, pages };
        const coverEmpty = !p.cover.slots.some((s) => s.photoId);
        return coverEmpty ? { ...withPages, cover: autoCover(withPages) } : withPages;
      });
      setState({ selection: { kind: 'page', index: 0 }, selectedSlot: null });
    },
    appendPhotosToBook(ids) {
      withProject((p) => {
        const byId = new Map(p.photos.map((x) => [x.id, x]));
        const photos = ids.map((id) => byId.get(id)).filter((x): x is Photo => !!x);
        if (!photos.length) return p;
        const { pages } = autoLayout(photos, p.spec, p.theme, { ...getState().autoOptions, titlePage: false, chapterGapDays: 0 });
        const content = pages.filter((pg) => pg.kind === 'photos');
        // Replace trailing blank pages first so the book doesn't grow unnecessarily.
        const kept = [...p.pages];
        while (kept.length && kept[kept.length - 1].kind === 'blank') kept.pop();
        const merged = [...kept, ...content];
        while (merged.length < p.pages.length || merged.length % 2) merged.push(blankPage());
        return { ...p, pages: merged };
      });
    },

    select(s) {
      setState({ selection: s, selectedSlot: null });
    },
    selectSlot(ref) {
      setState({ selectedSlot: ref });
    },

    updatePage(pageId, fn) {
      withProject((p) => ({ ...p, pages: p.pages.map((pg) => (pg.id === pageId ? fn(pg) : pg)) }));
    },
    movePage(from, to) {
      withProject((p) => {
        const pages = [...p.pages];
        const [pg] = pages.splice(from, 1);
        pages.splice(to, 0, pg);
        return { ...p, pages };
      });
      setState({ selection: { kind: 'page', index: to } });
    },
    insertPage(at, kind) {
      const page = kind === 'text' ? textPage('A new chapter', '') : kind === 'photos' ? { ...blankPage(), kind: 'photos' as const } : blankPage();
      withProject((p) => {
        const pages = [...p.pages];
        pages.splice(at, 0, page);
        return { ...p, pages };
      });
      setState({ selection: { kind: 'page', index: at } });
    },
    duplicatePage(index) {
      withProject((p) => {
        const pages = [...p.pages];
        pages.splice(index + 1, 0, { ...structuredClone(p.pages[index]), id: crypto.randomUUID() });
        return { ...p, pages };
      });
    },
    deletePage(index) {
      withProject((p) => ({ ...p, pages: p.pages.filter((_, i) => i !== index) }));
      const n = getState().project?.pages.length ?? 0;
      setState({ selection: n ? { kind: 'page', index: Math.min(index, n - 1) } : { kind: 'cover' }, selectedSlot: null });
    },
    setPageLayout(pageId, layoutId, frames) {
      getState().updatePage(pageId, (pg) => {
        const filled = pg.slots.filter((s) => s.photoId);
        const slots = Array.from({ length: frames }, (_, i) => filled[i] ?? emptySlot());
        return { ...pg, kind: pg.kind === 'blank' ? 'photos' : pg.kind, layoutId, slots };
      });
    },
    shufflePage(pageId) {
      withProject((p) => {
        const idx = p.pages.findIndex((x) => x.id === pageId);
        const byId = new Map(p.photos.map((x) => [x.id, x]));
        const style: LayoutStyle = getState().autoOptions.style;
        const pages = p.pages.map((pg, i) => (i === idx ? relayoutPage(pg, byId, areasFor(p, idx), style, true) : pg));
        return { ...p, pages };
      });
    },
    addPhotoToPage(pageId, photoId) {
      withProject((p) => {
        const idx = p.pages.findIndex((x) => x.id === pageId);
        if (idx < 0) return p;
        const page = p.pages[idx];
        const emptyIdx = page.slots.findIndex((s) => !s.photoId);
        let next: Page;
        if (emptyIdx >= 0) {
          const slots = [...page.slots];
          slots[emptyIdx] = emptySlot(photoId);
          next = { ...page, slots };
        } else if (page.kind === 'text' || page.kind === 'title') {
          next = page.kind === 'title' ? { ...page, layoutId: 'title-photo', slots: [emptySlot(photoId)] } : page;
        } else {
          const byId = new Map(p.photos.map((x) => [x.id, x]));
          const grown: Page = { ...page, kind: 'photos', slots: [...page.slots, emptySlot(photoId)] };
          next = grown.slots.length > 9 ? page : relayoutPage(grown, byId, areasFor(p, idx), getState().autoOptions.style);
        }
        return { ...p, pages: p.pages.map((x, i) => (i === idx ? next : x)) };
      });
    },
    removeFromSlot(ref) {
      withProject((p) => {
        if (ref.target !== 'page') return setSlot(p, ref, emptySlot());
        const idx = p.pages.findIndex((x) => x.id === ref.pageId);
        const page = p.pages[idx];
        const remaining: Page = { ...page, slots: page.slots.filter((_, i) => i !== ref.slot) };
        const byId = new Map(p.photos.map((x) => [x.id, x]));
        const next = page.kind === 'title' ? { ...page, layoutId: 'empty', slots: [] } : relayoutPage(remaining, byId, areasFor(p, idx), getState().autoOptions.style);
        return { ...p, pages: p.pages.map((x, i) => (i === idx ? (next.slots.length ? next : { ...next, kind: 'blank' as const, layoutId: 'empty' }) : x)) };
      });
      setState({ selectedSlot: null });
    },

    assignPhoto(ref, photoId) {
      withProject((p) => setSlot(p, ref, emptySlot(photoId)));
    },
    swapSlots(a, b) {
      withProject((p) => {
        const sa = getSlot(p, a) ?? emptySlot();
        const sb = getSlot(p, b) ?? emptySlot();
        // Reset crop when photos move: the old crop was for a different frame shape.
        return setSlot(setSlot(p, a, emptySlot(sb.photoId)), b, emptySlot(sa.photoId));
      });
    },
    updateSlot(ref, patch, opts) {
      withProject((p) => {
        const s = getSlot(p, ref);
        return s ? setSlot(p, ref, { ...s, ...patch }) : p;
      }, opts?.history ?? true);
    },

    setCover(patch) {
      withProject((p) => ({ ...p, cover: { ...p.cover, ...patch } }));
    },
    setCoverTemplate(t) {
      withProject((p) => {
        const n = coverPhotoCount(t);
        const filled = p.cover.slots.filter((s) => s.photoId);
        if (filled.length >= n) return { ...p, cover: { ...p.cover, template: t, slots: filled.slice(0, Math.max(n, 1)) } };
        return { ...p, cover: { ...autoCover(p, t), title: p.cover.title, subtitle: p.cover.subtitle, author: p.cover.author, backText: p.cover.backText, background: p.cover.background, textColor: p.cover.textColor } };
      });
    },
    autoDesignCover() {
      withProject((p) => ({ ...p, cover: autoCover({ ...p, cover: { ...p.cover, slots: [] } }) }));
    },
  };
});
