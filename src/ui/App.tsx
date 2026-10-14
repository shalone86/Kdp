import { useEffect, useState } from 'react';
import { loadFonts } from '../render/fonts';
import { useStore } from '../state/store';
import { Editor } from './Editor';
import { Home } from './Home';

export function App() {
  const project = useStore((s) => s.project);
  const loadIndex = useStore((s) => s.loadIndex);
  const toast = useStore((s) => s.toast);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    void loadIndex();
    loadFonts()
      .then(() => setFontsReady(true))
      .catch((e) => {
        console.error('Font loading failed', e);
        setFontsReady(true);
      });
  }, [loadIndex]);

  return (
    <>
      {project ? <Editor fontsReady={fontsReady} /> : <Home />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
