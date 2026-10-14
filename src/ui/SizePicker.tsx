import { useState } from 'react';
import { checkTrim, HARDCOVER_TRIM_SIZES, inkPaperProblems, mmToIn, inToMm, PAPERBACK_TRIM_SIZES, sameSize } from '../core/kdp';
import type { BookSpec } from '../core/types';

/** Trim size, format, ink & paper picker with plain-language explanations. */
export function SizePicker({ spec, onChange }: { spec: BookSpec; onChange: (s: BookSpec) => void }) {
  const [unit, setUnit] = useState<'in' | 'mm'>('in');
  const sizes = spec.format === 'hardcover' ? HARDCOVER_TRIM_SIZES : PAPERBACK_TRIM_SIZES;
  const isPreset = sizes.some((t) => sameSize(t.w, spec.trimWidth) && sameSize(t.h, spec.trimHeight));
  const [custom, setCustom] = useState(!isPreset);
  const trim = checkTrim(spec);
  const problems = inkPaperProblems(spec);
  const toUnit = (v: number) => (unit === 'in' ? Number(v.toFixed(3)) : Number(inToMm(v).toFixed(1)));
  const fromUnit = (v: number) => (unit === 'in' ? v : mmToIn(v));
  const maxDim = 11.69;

  return (
    <div className="size-picker">
      <div className="field-row">
        <label className="field">
          <span>Binding</span>
          <div className="seg">
            {(['paperback', 'hardcover'] as const).map((f) => (
              <button key={f} type="button" className={spec.format === f ? 'on' : ''} onClick={() => onChange({ ...spec, format: f, ink: f === 'hardcover' && spec.ink === 'standard-color' ? 'premium-color' : spec.ink })}>
                {f === 'paperback' ? 'Paperback' : 'Hardcover'}
              </button>
            ))}
          </div>
        </label>
        <label className="field">
          <span>Units</span>
          <div className="seg">
            {(['in', 'mm'] as const).map((u) => (
              <button key={u} type="button" className={unit === u ? 'on' : ''} onClick={() => setUnit(u)}>
                {u === 'in' ? 'inches' : 'mm'}
              </button>
            ))}
          </div>
        </label>
      </div>

      <div className="size-grid">
        {sizes.map((t) => {
          const on = !custom && sameSize(t.w, spec.trimWidth) && sameSize(t.h, spec.trimHeight);
          const s = 54 / maxDim;
          return (
            <button key={t.label} type="button" className={`size-card ${on ? 'on' : ''}`} onClick={() => { setCustom(false); onChange({ ...spec, trimWidth: t.w, trimHeight: t.h }); }}>
              <div className="size-shape-wrap">
                <div className="size-shape" style={{ width: t.w * s, height: t.h * s }} />
              </div>
              <strong>{unit === 'in' ? t.label : `${inToMm(t.w).toFixed(0)} × ${inToMm(t.h).toFixed(0)} mm`}</strong>
              {t.hint && <small>{t.hint}</small>}
            </button>
          );
        })}
        {spec.format === 'paperback' && (
          <button type="button" className={`size-card ${custom ? 'on' : ''}`} onClick={() => setCustom(true)}>
            <div className="size-shape-wrap">
              <div className="size-shape custom">?</div>
            </div>
            <strong>Custom size</strong>
            <small>Any size you like</small>
          </button>
        )}
      </div>

      {custom && spec.format === 'paperback' && (
        <div className="field-row">
          <label className="field">
            <span>Width ({unit})</span>
            <input type="number" step={unit === 'in' ? 0.01 : 1} value={toUnit(spec.trimWidth)} onChange={(e) => onChange({ ...spec, trimWidth: fromUnit(Number(e.target.value) || 0) })} />
          </label>
          <label className="field">
            <span>Height ({unit})</span>
            <input type="number" step={unit === 'in' ? 0.01 : 1} value={toUnit(spec.trimHeight)} onChange={(e) => onChange({ ...spec, trimHeight: fromUnit(Number(e.target.value) || 0) })} />
          </label>
        </div>
      )}

      {!trim.ok && <p className="note error">⚠ {trim.reason}</p>}
      {trim.ok && !trim.standard && <p className="note">Custom size — KDP can print this, though some distribution options (Expanded Distribution) may not be available.</p>}

      <div className="field-row">
        <label className="field">
          <span>Ink</span>
          <select value={spec.ink} onChange={(e) => onChange({ ...spec, ink: e.target.value as BookSpec['ink'], paper: e.target.value === 'bw' ? spec.paper : 'white' })}>
            <option value="premium-color">Premium colour — best for photos</option>
            {spec.format === 'paperback' && <option value="standard-color">Standard colour — cheaper, 72+ pages</option>}
            <option value="bw">Black & white</option>
          </select>
        </label>
        <label className="field">
          <span>Paper</span>
          <select value={spec.paper} onChange={(e) => onChange({ ...spec, paper: e.target.value as BookSpec['paper'] })}>
            <option value="white">White</option>
            <option value="cream" disabled={spec.ink !== 'bw'}>
              Cream (black & white only)
            </option>
          </select>
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={spec.bleed} onChange={(e) => onChange({ ...spec, bleed: e.target.checked })} />
        <span>
          <strong>Bleed</strong> — let photos run right to the edge of the page (recommended for photo books)
        </span>
      </label>
      {problems.map((p) => (
        <p key={p} className="note error">
          ⚠ {p}
        </p>
      ))}
    </div>
  );
}
