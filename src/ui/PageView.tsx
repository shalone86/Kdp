// Draws a DisplayList with HTML. Interactive mode supports drag & drop, selecting a photo,
// dragging to reposition it inside its frame and scrolling to zoom.

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { DisplayList, DLItem, Guide, SlotRef } from '../core/displayList';
import { dpiQuality, placeImage } from '../core/geometry';
import { fitText } from '../core/text';
import type { Photo } from '../core/types';
import { cssFamily } from '../render/fonts';
import { domMeasure } from '../render/measure';
import { useStore } from '../state/store';
import { DRAG_PHOTO, DRAG_SLOT, hasType, usePhotoUrl } from './hooks';
import { importFiles } from './importFiles';

export interface PageViewProps {
  dl: DisplayList;
  scale: number; // px per inch
  photos: Map<string, Photo>;
  interactive?: boolean;
  guides?: boolean;
  thumb?: boolean;
  /** Outline shown around the trim (e.g. for the selected page). */
  highlight?: boolean;
  fontsReady: boolean;
}

let lastWheel = 0;
const sameRef = (a: SlotRef | null, b: SlotRef) => !!a && JSON.stringify(a) === JSON.stringify(b);

export const PageView = memo(function PageView({ dl, scale, photos, interactive, guides, thumb, highlight, fontsReady }: PageViewProps) {
  return (
    <div className="pv" style={{ width: dl.width * scale, height: dl.height * scale }}>
      {dl.items.map((it, i) => {
        if (it.kind === 'rect') return <RectView key={i} it={it} scale={scale} />;
        if (it.kind === 'image') return <ImageView key={i} it={it} scale={scale} photos={photos} interactive={!!interactive} thumb={!!thumb} />;
        return <TextView key={i} it={it} scale={scale} fontsReady={fontsReady} />;
      })}
      {guides && <Guides guides={dl.guides} scale={scale} />}
      {highlight && <TrimOutline dl={dl} scale={scale} />}
    </div>
  );
});

function RectView({ it, scale }: { it: DLItem & { kind: 'rect' }; scale: number }) {
  const r = it.rect;
  return <div className="pv-abs" style={{ left: r.x * scale, top: r.y * scale, width: r.w * scale, height: r.h * scale, background: it.color, opacity: it.opacity ?? 1 }} />;
}

function TextView({ it, scale, fontsReady }: { it: DLItem & { kind: 'text' }; scale: number; fontsReady: boolean }) {
  const rotated = it.rotate === 90;
  const box = rotated ? { w: it.rect.h, h: it.rect.w } : { w: it.rect.w, h: it.rect.h };
  const fitted = useMemo(
    () => fitText(it.text, box, it.font, it.style, it.size, domMeasure, { maxLines: it.maxLines }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [it.text, box.w, box.h, it.font, it.style, it.size, it.maxLines, fontsReady],
  );
  const pxPerPt = scale / 72;
  const lineH = fitted.size * fitted.lineHeight * pxPerPt;
  const cx = (it.rect.x + it.rect.w / 2) * scale;
  const cy = (it.rect.y + it.rect.h / 2) * scale;
  const w = box.w * scale;
  const h = box.h * scale;
  return (
    <div
      className="pv-text"
      style={{
        left: cx - w / 2,
        top: cy - h / 2,
        width: w,
        height: h,
        transform: rotated ? 'rotate(90deg)' : undefined,
        justifyContent: it.valign === 'top' ? 'flex-start' : it.valign === 'bottom' ? 'flex-end' : 'center',
        textAlign: it.align,
        color: it.color,
        fontFamily: `"${cssFamily(it.font, it.style)}"`,
        fontSize: fitted.size * pxPerPt,
        lineHeight: `${lineH}px`,
      }}
    >
      {fitted.lines.map((l, i) => (
        <div key={i} style={{ height: lineH }}>
          {l || ' '}
        </div>
      ))}
    </div>
  );
}

function ImageView({ it, scale, photos, interactive, thumb }: { it: DLItem & { kind: 'image' }; scale: number; photos: Map<string, Photo>; interactive: boolean; thumb: boolean }) {
  const photo = it.slot.photoId ? photos.get(it.slot.photoId) : undefined;
  const url = usePhotoUrl(photo?.id, thumb ? 'thumb' : 'prev');
  const selectedSlot = useStore((s) => (interactive ? s.selectedSlot : null));
  const selected = interactive && sameRef(selectedSlot, it.ref);
  const [over, setOver] = useState(false);
  const drag = useRef<{ x: number; y: number; fx: number; fy: number; moved: boolean } | null>(null);
  const r = it.rect;
  const frame = { w: r.w, h: r.h };
  const place = photo ? placeImage(frame, photo, it.slot) : null;
  const quality = place ? dpiQuality(place.dpi) : 'good';

  const st = useStore.getState;

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const slotJson = e.dataTransfer.getData(DRAG_SLOT);
    const photoId = e.dataTransfer.getData(DRAG_PHOTO);
    if (slotJson) {
      const from = JSON.parse(slotJson) as SlotRef;
      if (!sameRef(from, it.ref)) st().swapSlots(from, it.ref);
    } else if (photoId) {
      st().assignPhoto(it.ref, photoId);
    } else if (e.dataTransfer.files.length) {
      const added = await importFiles(e.dataTransfer.files);
      if (added[0]) st().assignPhoto(it.ref, added[0].id);
    }
    st().selectSlot(it.ref);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!selected || !photo || !place) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, fx: it.slot.focusX, fy: it.slot.focusY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !place) return;
    const overflowX = (place.w - r.w) * scale;
    const overflowY = (place.h - r.h) * scale;
    const fx = overflowX > 0 ? d.fx - (e.clientX - d.x) / overflowX : 0.5;
    const fy = overflowY > 0 ? d.fy - (e.clientY - d.y) / overflowY : 0.5;
    if (!d.moved) st().checkpoint();
    d.moved = true;
    st().updateSlot(it.ref, { focusX: Math.min(1, Math.max(0, fx)), focusY: Math.min(1, Math.max(0, fy)) }, { history: false });
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onWheel = (e: WheelEvent) => {
    if (!selected || !photo) return;
    e.preventDefault();
    if (Date.now() - lastWheel > 600) st().checkpoint();
    lastWheel = Date.now();
    const zoom = Math.min(4, Math.max(1, it.slot.zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06)));
    st().updateSlot(it.ref, { zoom }, { history: false });
  };

  // Wheel needs a non-passive native listener so we can stop the page from scrolling while zooming.
  const el = useRef<HTMLDivElement>(null);
  const wheelRef = useRef(onWheel);
  wheelRef.current = onWheel;
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const h = (e: WheelEvent) => wheelRef.current(e);
    node.addEventListener('wheel', h, { passive: false });
    return () => node.removeEventListener('wheel', h);
  }, [interactive]);

  const style: React.CSSProperties = { left: r.x * scale, top: r.y * scale, width: r.w * scale, height: r.h * scale };
  if (!interactive) {
    return (
      <div className="pv-abs pv-img" style={style}>
        {photo && url && place && <img alt="" src={url} draggable={false} style={{ left: place.x * scale, top: place.y * scale, width: place.w * scale, height: place.h * scale }} />}
        {!photo && <div className="pv-empty-thumb" />}
      </div>
    );
  }
  return (
    <div
      className={`pv-abs pv-img interactive ${selected ? 'selected' : ''} ${over ? 'over' : ''}`}
      style={style}
      draggable={!!photo && !selected}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_SLOT, JSON.stringify(it.ref));
        if (photo) e.dataTransfer.setData(DRAG_PHOTO, photo.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        if (hasType(e, DRAG_PHOTO) || hasType(e, DRAG_SLOT) || hasType(e, 'Files')) {
          e.preventDefault();
          e.stopPropagation();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onClick={(e) => {
        e.stopPropagation();
        st().selectSlot(it.ref);
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      ref={el}
      title={photo ? (selected ? 'Drag to reposition · scroll to zoom' : 'Click to adjust · drag to swap with another frame') : 'Drop a photo here'}
    >
      {photo && url && place && <img alt={photo.name} src={url} draggable={false} style={{ left: place.x * scale, top: place.y * scale, width: place.w * scale, height: place.h * scale }} />}
      {!photo && (
        <div className="pv-empty">
          <span>＋</span>
          <small>Drop photo</small>
        </div>
      )}
      {photo && quality !== 'good' && (
        <span className={`dpi-badge ${quality}`} title={`${Math.round(place!.dpi)} DPI — ${quality === 'low' ? 'will print blurry' : 'okay, 300 is ideal'}`}>
          {quality === 'low' ? '⚠ Low res' : `${Math.round(place!.dpi)} dpi`}
        </span>
      )}
    </div>
  );
}

function Guides({ guides, scale }: { guides: Guide[]; scale: number }) {
  return (
    <>
      {guides.map((g, i) => (
        <div key={i} className={`guide guide-${g.kind}`} style={{ left: g.rect.x * scale, top: g.rect.y * scale, width: g.rect.w * scale, height: g.rect.h * scale }}>
          {g.label && g.kind !== 'trim' && <span>{g.label}</span>}
        </div>
      ))}
    </>
  );
}

/** Dims the bleed area (which is trimmed off) so people can see where the page really ends. */
function TrimOutline({ dl, scale }: { dl: DisplayList; scale: number }) {
  const trims = dl.guides.filter((g) => g.kind === 'trim');
  if (trims.length !== 1) return null;
  const t = trims[0].rect;
  return <div className="trim-outline" style={{ left: t.x * scale, top: t.y * scale, width: t.w * scale, height: t.h * scale }} />;
}
