import { useEffect, useState } from 'react';
import { LeftPanel } from './components/LeftPanel';
import { PlannerDialog } from './components/PlannerDialog';
import { RightPanel } from './components/RightPanel';
import { ShareCardDialog } from './components/ShareCardDialog';
import { Stage } from './components/Stage';
import { StatusBar } from './components/StatusBar';
import { TopBar } from './components/TopBar';
import { clearShareHash, readShareLink } from './lib/export';
import { useAppStore } from './store';

export default function App() {
  const showLeft = useAppStore((s) => s.showLeft);
  const showRight = useAppStore((s) => s.showRight);
  const toggleLeft = useAppStore((s) => s.toggleLeft);
  const toggleRight = useAppStore((s) => s.toggleRight);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const shared = await readShareLink();
      if (cancelled || !shared) return;
      useAppStore.getState().loadExternalDoc(shared);
      clearShareHash();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName ?? '';
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
      const state = useAppStore.getState();

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        state.removeSelected();
        return;
      }
      if (event.key === 'Escape') {
        state.cancelConnect();
        state.select(null);
        return;
      }
      if (event.key.toLowerCase() === 'v') {
        state.setView(state.view === 'plan' ? 'iso' : 'plan');
      }
      if (event.key.toLowerCase() === 'p') {
        setToolsOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <TopBar onOpenTools={() => setToolsOpen(true)} onOpenShare={() => setShareOpen(true)} />
      <div className="app-main">
        <LeftPanel />
        <Stage />
        <RightPanel />
        {(showLeft || showRight) && (
          <div
            className="scrim only-mobile"
            onClick={() => {
              if (showLeft) toggleLeft();
              if (showRight) toggleRight();
            }}
          />
        )}
      </div>
      <StatusBar />
      <PlannerDialog open={toolsOpen} onClose={() => setToolsOpen(false)} />
      <ShareCardDialog open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}
