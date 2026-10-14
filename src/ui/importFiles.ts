import type { Photo, PhotoSource } from '../core/types';
import { importMany, isSupportedImage, type ImportItem } from '../state/photoStore';
import { useStore } from '../state/store';

/** Import blobs into the current project's library, with progress in the UI. */
export async function importBlobs(items: ImportItem[], label = 'Importing photos'): Promise<Photo[]> {
  const st = useStore.getState();
  if (!items.length) return [];
  st.setImporting({ done: 0, total: items.length, label });
  let batch: Photo[] = [];
  const flush = () => {
    if (batch.length) useStore.getState().addPhotos(batch);
    batch = [];
  };
  const timer = setInterval(flush, 700);
  try {
    const { photos, failed } = await importMany(
      items,
      (done, total) => useStore.getState().setImporting({ done, total, label }),
      (p) => batch.push(p),
    );
    flush();
    if (failed.length) useStore.getState().showToast(`Couldn’t read ${failed.length} file${failed.length > 1 ? 's' : ''}: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}`);
    else useStore.getState().showToast(`Added ${photos.length} photo${photos.length === 1 ? '' : 's'}`);
    return photos;
  } finally {
    clearInterval(timer);
    useStore.getState().setImporting(null);
  }
}

export function importFiles(files: FileList | File[], source: PhotoSource = 'local') {
  const list = Array.from(files).filter(isSupportedImage);
  return importBlobs(list.map((f) => ({ blob: f, meta: { name: f.name, source, takenAt: f.lastModified } })));
}
