import { useEffect, useState } from 'react';
import { useAnalysis, useT } from '../hooks';
import { useAppStore } from '../store';
import { buildShareLink, copyText, downloadBlob, slug } from '../lib/export';
import { buildShareCard } from '../lib/shareCard';

export function ShareCardDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const doc = useAppStore((s) => s.doc);
  const analysis = useAnalysis();
  const [link, setLink] = useState('');
  const [card, setCard] = useState<{ url: string; blob: Blob } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setBusy(true);
    setError('');
    setCard(null);
    setCopied(false);

    void (async () => {
      const generated = await buildShareLink(doc);
      const blob = await buildShareCard(generated, {
        name: doc.meta.name,
        nodeCount: doc.nodes.length,
        power: analysis.powerConsumption,
        labels: {
          subtitle: t('share.subtitle'),
          nodes: t('share.nodes'),
          power: t('share.power'),
          scan: t('share.scan'),
          footer: t('share.footer'),
        },
      });
      objectUrl = URL.createObjectURL(blob);
      if (cancelled) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setLink(generated);
      setCard({ url: objectUrl, blob });
    })()
      .catch(() => setError(t('share.qrError')))
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, doc, analysis.powerConsumption, t]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="planner-modal share-modal" role="dialog" aria-modal="true" aria-label={t('share.title')}>
        <header className="planner-head">
          <div>
            <strong>{t('share.title')}</strong>
            <small>QR · {t('export.linkHint')}</small>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('misc.close')}>
            ✕
          </button>
        </header>

        <div className="planner-body share-body">
          {busy && <p className="muted">…</p>}
          {error && <p className="warn-text">{error}</p>}
          {card && <img className="share-preview" src={card.url} alt={t('share.title')} />}
          {link && <p className="share-link">{link}</p>}
        </div>

        <footer className="planner-foot">
          <span />
          <div className="planner-actions">
            <button
              type="button"
              className="btn"
              disabled={!link}
              onClick={async () => {
                if (await copyText(link)) setCopied(true);
              }}
            >
              {copied ? t('export.copied') : t('export.link')}
            </button>
            <button
              type="button"
              className="btn btn-accent"
              disabled={!card}
              onClick={() => card && downloadBlob(`${slug(doc.meta.name)}-card.png`, card.blob)}
            >
              {t('share.download')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
