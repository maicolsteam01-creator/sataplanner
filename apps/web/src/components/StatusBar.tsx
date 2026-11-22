import { itemById, localized, sampleGameData } from '@sataplanner/game-data';
import { useAnalysis, useT } from '../hooks';
import { useAppStore } from '../store';

const fmt = (value: number): string =>
  Math.abs(value) >= 100 ? String(Math.round(value)) : String(Math.round(value * 10) / 10);

export function StatusBar() {
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const nodes = useAppStore((s) => s.doc.nodes);
  const analysis = useAnalysis();

  const alerts = analysis.warnings.length;
  const balance = analysis.powerGeneration - analysis.powerConsumption;
  const raw = analysis.bom.slice(0, 3);

  return (
    <footer className="statusbar">
      <span className="status-chip">
        <em>{t('status.nodes')}</em> <b>{nodes.length}</b>
      </span>

      <span className="status-chip">
        <em>{t('status.power')}</em>
        <b>{fmt(analysis.powerConsumption)}</b>
        <span className="muted">
          / {fmt(analysis.powerGeneration)} {t('units.mw')}
        </span>
        <span className={balance >= 0 ? 'ok' : 'warn'}>
          {balance >= 0 ? '▲' : '▼'} {fmt(Math.abs(balance))}
        </span>
      </span>

      {raw.length > 0 && (
        <span className="status-chip status-raw">
          <em>{t('status.raw')}</em>
          {raw.map((flow) => (
            <span key={flow.itemId}>
              {localized(itemById.get(flow.itemId)?.name ?? { en: flow.itemId }, lang)}{' '}
              <b>{fmt(flow.rate)}</b>
              <span className="muted">{t('units.perMin')}</span>
            </span>
          ))}
        </span>
      )}

      <span className={`status-chip ${alerts > 0 ? 'is-danger' : 'is-ok'}`}>
        <em>{t('status.alerts')}</em>
        <b>{alerts > 0 ? alerts : t('status.noAlerts')}</b>
      </span>

      <span className="status-spacer" />

      <span className="status-chip is-quiet">
        <em>{t('status.data')}</em>
        <b>{sampleGameData.gameVersion}</b>
      </span>
    </footer>
  );
}
