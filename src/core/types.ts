// Core data model. All physical measurements are in inches unless a name says otherwise.

export type BookFormat = 'paperback' | 'hardcover';
export type Ink = 'premium-color' | 'standard-color' | 'bw';
export type Paper = 'white' | 'cream';

export interface BookSpec {
  format: BookFormat;
  trimWidth: number;
  trimHeight: number;
  /** Photo books almost always want bleed so images can run off the page edge. */
  bleed: boolean;
  ink: Ink;
  paper: Paper;
}

export type PhotoSource = 'local' | 'immich' | 'google' | 'icloud';

export interface Photo {
  id: string;
  name: string;
  /** Pixel size of the original after EXIF orientation is applied. */
  width: number;
  height: number;
  /** Capture time (ms since epoch) from EXIF or the source service, when known. */
  takenAt?: number;
  source: PhotoSource;
  /** Average colour of the photo as #rrggbb; used for automatic cover colours. */
  avgColor?: string;
  caption?: string;
}

export interface SlotContent {
  photoId: string | null;
  /** 1 = the photo just covers the frame. >1 zooms in. */
  zoom: number;
  /** 0..1 — which part of the overflowing photo is visible (like CSS object-position). */
  focusX: number;
  focusY: number;
}

export type PageKind = 'photos' | 'title' | 'text' | 'blank';

export interface Page {
  id: string;
  kind: PageKind;
  layoutId: string;
  slots: SlotContent[];
  /** Optional caption shown under the photos. */
  caption?: string;
  /** Title / heading text for title and text pages. */
  heading?: string;
  /** Body text for text pages. */
  body?: string;
  background?: string;
}

export type CoverTemplateId = 'full-bleed' | 'wraparound' | 'framed' | 'collage' | 'band';

export interface CoverDesign {
  template: CoverTemplateId;
  title: string;
  subtitle: string;
  author: string;
  backText: string;
  /** Photos used on the cover; how many are used depends on the template. */
  slots: SlotContent[];
  backSlot: SlotContent;
  background: string;
  textColor: string;
  accentColor: string;
  titleFont: FontId;
  bodyFont: FontId;
  spineText: boolean;
}

export type FontId = 'playfair' | 'lora' | 'inter' | 'caveat';

export interface Theme {
  pageBackground: string;
  textColor: string;
  headingFont: FontId;
  bodyFont: FontId;
  /** Space between photos, inches. */
  gap: number;
  /** Preferred page margin, inches. KDP minimums (bigger gutter for thick books) are applied on top. */
  margin: number;
  pageNumbers: boolean;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  spec: BookSpec;
  photos: Photo[];
  pages: Page[];
  cover: CoverDesign;
  theme: Theme;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
