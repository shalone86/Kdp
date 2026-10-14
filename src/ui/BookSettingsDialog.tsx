import { useState } from 'react';
import { FONTS } from '../core/text';
import type { BookSpec, FontId, Theme } from '../core/types';
import { useStore } from '../state/store';
import { useProject } from './hooks';
import { Modal } from './Modal';
import { SizePicker } from './SizePicker';

export function BookSettingsDialog({ onClose }: { onClose: () => void }) {
  const project = useProject();
  const [spec, setSpec] = useState<BookSpec>(project.spec);
  const [theme, setTheme] = useState<Theme>(project.theme);
  const save = () => {
    useStore.getState().update((p) => ({ ...p, spec, theme }));
    onClose();
  };
  const t = (patch: Partial<Theme>) => setTheme({ ...theme, ...patch });
  return (
    <Modal
      title="Book setup"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <h3>Size & paper</h3>
      <SizePicker spec={spec} onChange={setSpec} />
      <p className="hint">Changing the size keeps your pages; photos are re-cropped to fit the new frames.</p>

      <h3>Page style</h3>
      <div className="field-row">
        <label className="field">
          <span>Page colour</span>
          <input type="color" value={theme.pageBackground} onChange={(e) => t({ pageBackground: e.target.value })} />
        </label>
        <label className="field">
          <span>Text colour</span>
          <input type="color" value={theme.textColor} onChange={(e) => t({ textColor: e.target.value })} />
        </label>
        <label className="field">
          <span>Heading font</span>
          <select value={theme.headingFont} onChange={(e) => t({ headingFont: e.target.value as FontId })}>
            {(Object.keys(FONTS) as FontId[]).map((f) => (
              <option key={f} value={f}>
                {FONTS[f].label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Caption font</span>
          <select value={theme.bodyFont} onChange={(e) => t({ bodyFont: e.target.value as FontId })}>
            {(Object.keys(FONTS) as FontId[]).map((f) => (
              <option key={f} value={f}>
                {FONTS[f].label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Space between photos: {theme.gap.toFixed(2)}″</span>
          <input type="range" min={0} max={0.4} step={0.01} value={theme.gap} onChange={(e) => t({ gap: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>Page margin: {theme.margin.toFixed(2)}″</span>
          <input type="range" min={0.25} max={1.25} step={0.05} value={theme.margin} onChange={(e) => t({ margin: Number(e.target.value) })} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={theme.pageNumbers} onChange={(e) => t({ pageNumbers: e.target.checked })} />
        <span>Page numbers (not shown on full-page photos)</span>
      </label>
    </Modal>
  );
}
