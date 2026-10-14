import { useState } from 'react';
import { PRESETS, type BookPreset } from '../core/project';
import type { BookSpec } from '../core/types';
import { useStore } from '../state/store';
import { usePhotoUrl } from './hooks';
import { SizePicker } from './SizePicker';

export function Home() {
  const projects = useStore((s) => s.projects);
  const [wizard, setWizard] = useState(projects.length === 0);
  return (
    <div className="home">
      <header className="home-header">
        <div className="brand">
          <img src="/favicon.svg" alt="" /> Photobook Studio
        </div>
        <span className="muted">Print-ready photo books for Amazon KDP</span>
      </header>
      {wizard ? <Wizard onCancel={projects.length ? () => setWizard(false) : undefined} /> : <ProjectList onNew={() => setWizard(true)} />}
    </div>
  );
}

function ProjectList({ onNew }: { onNew: () => void }) {
  const projects = useStore((s) => s.projects);
  const open = useStore((s) => s.openProject);
  const remove = useStore((s) => s.deleteProject);
  return (
    <main className="home-main">
      <div className="home-title-row">
        <h1>Your books</h1>
        <button className="btn primary" onClick={onNew}>
          ＋ New photo book
        </button>
      </div>
      <div className="project-grid">
        {projects.map((p) => (
          <div key={p.id} className="project-card" onClick={() => open(p.id)}>
            <ProjectThumb id={p.coverPhotoId} />
            <div className="project-info">
              <strong>{p.name}</strong>
              <small>
                {p.pages} pages · {p.photos} photos · {new Date(p.updatedAt).toLocaleDateString()}
              </small>
            </div>
            <button
              className="icon-btn danger"
              title="Delete book"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete “${p.name}” and its photos from this browser?`)) void remove(p.id);
              }}
            >
              🗑
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}

function ProjectThumb({ id }: { id?: string | null }) {
  const url = usePhotoUrl(id ?? null, 'thumb');
  return <div className="project-thumb" style={{ backgroundImage: url ? `url(${url})` : undefined }}>{!url && '📖'}</div>;
}

function Wizard({ onCancel }: { onCancel?: () => void }) {
  const create = useStore((s) => s.createProject);
  const setCover = useStore((s) => s.setCover);
  const [step, setStep] = useState(0);
  const [preset, setPreset] = useState<BookPreset>(PRESETS[0]);
  const [spec, setSpec] = useState<BookSpec>(PRESETS[0].spec);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');

  const finish = () => {
    const name = title.trim() || 'My Photo Book';
    create(name, spec, preset.theme);
    setCover({ title: name, author: author.trim() });
  };

  return (
    <main className="wizard">
      <ol className="steps">
        {['What are you making?', 'Size & paper', 'Name your book'].map((s, i) => (
          <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>
            <span>{i + 1}</span> {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section>
          <h2>What kind of photo book are you making?</h2>
          <p className="muted">Pick the closest one — you can change the size and style later.</p>
          <div className="preset-grid">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className={`preset-card ${preset.id === p.id ? 'on' : ''}`}
                onClick={() => {
                  setPreset(p);
                  setSpec(p.spec);
                }}
              >
                <span className="preset-emoji">{p.emoji}</span>
                <strong>{p.name}</strong>
                <small>{p.description}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 1 && (
        <section>
          <h2>Choose your book size</h2>
          <p className="muted">
            “Trim size” is the size of the finished book. Premium colour on white paper with bleed is what most photo books use. Square and landscape books show off photos best.
          </p>
          <SizePicker spec={spec} onChange={setSpec} />
        </section>
      )}

      {step === 2 && (
        <section>
          <h2>Name your book</h2>
          <p className="muted">This goes on the cover and title page. You can change it any time.</p>
          <label className="field">
            <span>Title</span>
            <input autoFocus value={title} placeholder="Our Summer in Italy" onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>Author (optional)</span>
            <input value={author} placeholder="The Rivera Family" onChange={(e) => setAuthor(e.target.value)} />
          </label>
        </section>
      )}

      <div className="wizard-nav">
        {step > 0 ? (
          <button className="btn" onClick={() => setStep(step - 1)}>
            ← Back
          </button>
        ) : onCancel ? (
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <span />
        )}
        {step < 2 ? (
          <button className="btn primary" onClick={() => setStep(step + 1)}>
            Next →
          </button>
        ) : (
          <button className="btn primary" onClick={finish}>
            Create book & add photos →
          </button>
        )}
      </div>
    </main>
  );
}
