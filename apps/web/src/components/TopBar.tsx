import { useEffect, useRef, useState } from 'react';
import { buildingById, sampleGameData } from '@sataplanner/game-data';
import { useAnalysis, useT } from '../hooks';
import { useAppStore } from '../store';
import type { Lang, ViewMode } from '../types';
import { buildBlueprintSvg } from '../lib/svg';
import {
  buildShareLink,
  copyText,
  downloadBlob,
  downloadSvg,
  printBlueprint,
  slug,
  svgToPngBlob,
} from '../lib/export';

export function TopBar({
  onOpenTools,
  onOpenShare,
}: {
  onOpenTools?: () => void;
  onOpenShare?: () => void;
} = {}) {
  const t = useT();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const toastTimer = useRef<number | null>(null);

  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const canUndo = useAppStore((s) => s.past.length > 0);
  const canRedo = useAppStore((s) => s.future.length > 0);
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const doc = useAppStore((s) => s.doc);
  const frame = useAppStore((s) => s.frame);
  const floor = useAppStore((s) => s.floor);
  const showLeft = useAppStore((s) => s.showLeft);
  const showRight = useAppStore((s) => s.showRight);
  const toggleLeft = useAppStore((s) => s.toggleLeft);
  const toggleRight = useAppStore((s) => s.toggleRight);
  const profiles = useAppStore((s) => s.profiles);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const setActiveProfile = useAppStore((s) => s.setActiveProfile);
  const renameProfile = useAppStore((s) => s.renameProfile);
  const createProfile = useAppStore((s) => s.createProfile);
  const publishCurrentPlan = useAppStore((s) => s.publishCurrentPlan);

  const analysis = useAnalysis();
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [manualLink, setManualLink] = useState('');

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 3200);
  };

  const closeMenu = () => menuRef.current?.removeAttribute('open');

  const filename = (extension: string) => `${slug(doc.meta.name)}.${extension}`;

  const makeSvg = () =>
    buildBlueprintSvg({
      doc,
      analysis,
      data: sampleGameData,
      buildings: buildingById,
      lang,
      view,
      frame,
      floor,
    });

  const exportSvg = () => {
    downloadSvg(filename('svg'), makeSvg());
    notify(t('export.done'));
    closeMenu();
  };

  const exportPng = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await svgToPngBlob(makeSvg(), 2);
      downloadBlob(filename('png'), blob);
      notify(t('export.done'));
    } catch {
      // Ultimo recurso: captura del canvas tal como se ve en pantalla.
      const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
      if (canvas) {
        canvas.toBlob((blob) => {
          if (blob) downloadBlob(filename('png'), blob);
        }, 'image/png');
      }
    } finally {
      setBusy(false);
      closeMenu();
    }
  };

  const exportPdf = () => {
    printBlueprint(makeSvg(), doc.meta.name || 'SataPlanner');
    notify(t('export.print'));
    closeMenu();
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    downloadBlob(filename('json'), blob);
    notify(t('export.done'));
    closeMenu();
  };

  const shareLink = async () => {
    closeMenu();
    try {
      const link = await buildShareLink(doc);
      const copied = await copyText(link);
      if (copied) {
        notify(t('export.copied'));
      } else {
        setManualLink(link);
      }
    } catch {
      notify(t('export.linkError'));
    }
  };

  const profile = profiles.find((item) => item.id === activeProfileId);
  const profileInitial = (profile?.name ?? t('profile.local')).trim().charAt(0).toUpperCase() || 'L';

  const publish = async () => {
    closeMenu();
    try {
      await publishCurrentPlan();
      notify(t('publish.done'));
      onOpenShare?.();
    } catch {
      onOpenShare?.();
    }
  };

  const renameCurrentProfile = () => {
    closeMenu();
    const name = window.prompt(t('profile.name'), profile?.name ?? t('profile.local'));
    if (name?.trim()) void renameProfile(name);
  };

  const addProfile = () => {
    closeMenu();
    const name = window.prompt(t('profile.name'), '');
    if (name?.trim()) void createProfile(name);
  };

  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-btn only-mobile"
        onClick={toggleLeft}
        aria-pressed={showLeft}
        title={t('top.menu')}
      >
        ☰
      </button>

      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z" />
            <path d="M4 8.5 12 13l8-4.5M12 13v7" />
          </svg>
        </div>
        <div className="brand-text">
          <strong>{t('app.name')}</strong>
          <span>{t('app.subtitle')}</span>
        </div>
      </div>

      <div className="topbar-divider" />

      <div className="segmented" role="group" aria-label="Vista">
        {(['plan', 'iso'] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            className={view === mode ? 'is-active' : undefined}
            onClick={() => setView(mode)}
          >
            {t(mode === 'plan' ? 'top.plan' : 'top.iso')}
          </button>
        ))}
      </div>

      <div className="topbar-actions">
        <button type="button" className="icon-btn" onClick={undo} disabled={!canUndo} title={t('top.undo')}>
          ↶
        </button>
        <button type="button" className="icon-btn" onClick={redo} disabled={!canRedo} title={t('top.redo')}>
          ↷
        </button>

        <details className="menu profile-menu">
          <summary className="btn btn-profile" title={t('profile.title')}>
            <span className="profile-avatar" aria-hidden="true">{profileInitial}</span>
            <span className="profile-name">{profile?.name ?? t('profile.local')}</span>
          </summary>
          <div className="menu-panel">
            {profiles.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === activeProfileId ? 'is-current' : undefined}
                onClick={() => {
                  if (item.id !== activeProfileId) setActiveProfile(item.id);
                  closeMenu();
                }}
              >
                <span>{item.name}</span>
                <em>{item.id === activeProfileId ? t('profile.title') : t('profile.local')}</em>
              </button>
            ))}
            <div className="menu-sep" />
            <button type="button" onClick={renameCurrentProfile}>
              <span>{t('profile.rename')}</span>
            </button>
            <button type="button" onClick={addProfile}>
              <span>{t('profile.create')}</span>
            </button>
          </div>
        </details>

        <button type="button" className="btn btn-publish" onClick={() => void publish()} title={t('publish.hint')}>
          ⤴ <span>{t('publish.button')}</span>
        </button>

        <button
          type="button"
          className="btn btn-tools"
          onClick={() => onOpenTools?.()}
          title={t('tools.title')}
        >
          ⚙ <span>{t('tools.open')}</span>
        </button>

        <select
          className="lang-select"
          value={lang}
          onChange={(event) => setLang(event.target.value as Lang)}
          aria-label="Idioma"
        >
          <option value="es">ES</option>
          <option value="en">EN</option>
          <option value="ja">日本語</option>
        </select>

        <details className="menu" ref={menuRef}>
          <summary className="btn btn-accent">{t('top.export')}</summary>
          <div className="menu-panel">
            <button type="button" onClick={exportPng} disabled={busy}>
              <span>{t('export.png')}</span>
              <em>{t('export.pngHint')}</em>
            </button>
            <button type="button" onClick={exportSvg}>
              <span>{t('export.svg')}</span>
              <em>{t('export.svgHint')}</em>
            </button>
            <button type="button" onClick={exportPdf}>
              <span>{t('export.pdf')}</span>
              <em>{t('export.pdfHint')}</em>
            </button>
            <button type="button" onClick={exportJson}>
              <span>{t('export.json')}</span>
              <em>{t('export.jsonHint')}</em>
            </button>
            <div className="menu-sep" />
            <button type="button" onClick={shareLink}>
              <span>{t('export.link')}</span>
              <em>{t('export.linkHint')}</em>
            </button>
            <button type="button" onClick={() => { closeMenu(); onOpenShare?.(); }}>
              <span>{t('tools.share')}</span>
              <em>QR · PNG</em>
            </button>
          </div>
        </details>
      </div>

      <button
        type="button"
        className="icon-btn only-mobile"
        onClick={toggleRight}
        aria-pressed={showRight}
        title={t('top.menu')}
      >
        ▤
      </button>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {manualLink && (
        <div className="link-dialog" role="dialog" aria-modal="true" aria-label={t('export.copyManual')}>
          <div className="link-dialog-box">
            <h3>{t('export.copyManual')}</h3>
            <input
              className="text-input"
              type="text"
              readOnly
              value={manualLink}
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="link-dialog-actions">
              <button
                type="button"
                className="btn btn-accent"
                onClick={async () => {
                  if (await copyText(manualLink)) {
                    setManualLink('');
                    notify(t('export.copied'));
                  }
                }}
              >
                {t('export.copy')}
              </button>
              <button type="button" className="btn" onClick={() => setManualLink('')}>
                {t('export.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
