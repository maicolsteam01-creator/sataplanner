import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  phasePlan,
  planProduction,
  validateDesign,
  type ProductionPlan,
} from '@sataplanner/engine';
import { itemById, localized, sampleGameData } from '@sataplanner/game-data';
import { useT } from '../hooks';
import { useAppStore } from '../store';
import { downloadBlob } from '../lib/export';
import { parseDocJson } from '../lib/docIO';
import { TEMPLATES, templateDoc } from '../lib/templates';
import { BuildingArt } from './BuildingArt';

type Tab = 'generate' | 'phases' | 'check' | 'library';

const fmt = (value: number): string =>
  Math.abs(value) >= 100 ? String(Math.round(value)) : String(Math.round(value * 10) / 10);

export function PlannerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const doc = useAppStore((s) => s.doc);
  const frame = useAppStore((s) => s.frame);
  const floor = useAppStore((s) => s.floor);
  const library = useAppStore((s) => s.library);
  const showIssues = useAppStore((s) => s.showIssues);
  const toggleIssues = useAppStore((s) => s.toggleIssues);
  const saveCurrentPlan = useAppStore((s) => s.saveCurrentPlan);
  const openPlan = useAppStore((s) => s.openPlan);
  const removePlan = useAppStore((s) => s.removePlan);
  const loadExternalDoc = useAppStore((s) => s.loadExternalDoc);
  const applyProductionPlan = useAppStore((s) => s.applyProductionPlan);
  const select = useAppStore((s) => s.select);
  const setFloor = useAppStore((s) => s.setFloor);
  const centerBlueprint = useAppStore((s) => s.centerBlueprint);
  const resetDoc = useAppStore((s) => s.resetDoc);

  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>('generate');
  const [itemId, setItemId] = useState('reinforced-iron-plate');
  const [rate, setRate] = useState('60');
  const [mode, setMode] = useState<'machines' | 'clock'>('machines');
  const [clock, setClock] = useState(100);
  const [alternate, setAlternate] = useState(false);
  const [plan, setPlan] = useState<ProductionPlan | null>(null);
  const [compare, setCompare] = useState<{ normal: ProductionPlan; alt: ProductionPlan } | null>(null);
  const [built, setBuilt] = useState<Set<number>>(new Set());
  const [importText, setImportText] = useState('');
  const [notice, setNotice] = useState('');

  const itemName = (id: string): string => localized(itemById.get(id)?.name ?? { en: id }, lang);
  const buildingName = (id: string): string =>
    localized(sampleGameData.buildings.find((b) => b.id === id)?.name ?? { en: id }, lang);
  const artKind = (id: string): string =>
    sampleGameData.buildings.find((b) => b.id === id)?.icon ?? 'default';

  const targetItems = useMemo(
    () =>
      [...sampleGameData.items]
        .filter((item) =>
          sampleGameData.recipes.some((recipe) =>
            recipe.outputs.some((output) => output.itemId === item.id),
          ),
        )
        .sort((a, b) => itemName(a.id).localeCompare(itemName(b.id), lang)),
    [lang],
  );

  const issues = useMemo(
    () =>
      open
        ? validateDesign(
            {
              nodes: doc.nodes.map((node) => ({ ...node })),
              wires: doc.wires.map((wire) => ({ ...wire })),
              frame,
            },
            sampleGameData,
          )
        : [],
    [open, doc, frame],
  );

  const phases = useMemo(() => (plan ? phasePlan(plan) : []), [plan]);

  const calculate = () => {
    const target = Number(rate);
    if (!itemId || !Number.isFinite(target) || target <= 0) return;
    const options = { clock, mode, preferAlternate: alternate };
    const result = planProduction(itemId, target, sampleGameData, options);
    setPlan(result);
    setBuilt(new Set());
    const recipes = sampleGameData.recipes.filter((recipe) =>
      recipe.outputs.some((output) => output.itemId === itemId),
    );
    setCompare(
      recipes.some((recipe) => recipe.alternate)
        ? {
            normal: planProduction(itemId, target, sampleGameData, { ...options, preferAlternate: false }),
            alt: planProduction(itemId, target, sampleGameData, { ...options, preferAlternate: true }),
          }
        : null,
    );
  };

  const apply = (target: 'replace' | 'append') => {
    if (!plan || plan.steps.length === 0) return;
    applyProductionPlan(plan, target);
    setNotice('');
    onClose();
  };

  const jumpTo = (nodeId?: string, wireId?: string) => {
    const id =
      nodeId ?? doc.wires.find((wire) => wire.id === wireId)?.fromNodeId ?? doc.nodes[0]?.id;
    if (!id) return;
    const node = doc.nodes.find((item) => item.id === id);
    if (node) setFloor(node.floor);
    select(id);
    centerBlueprint();
    onClose();
  };

  const exportPhases = () => {
    if (!plan) return;
    const lines = [
      `# ${t('phase.title')} — ${itemName(plan.targetItemId)} ${fmt(plan.targetRate)}/min`,
      '',
    ];
    for (const phase of phases) {
      lines.push(`## ${t('phase.build')} ${phase.phase}`);
      for (const step of phase.steps) {
        lines.push(
          `- [ ] ${buildingName(step.buildingId)} ×${step.machines} · ${localized(
            sampleGameData.recipes.find((r) => r.id === step.recipeId)?.name ?? { en: step.recipeId },
            lang,
          )} · ${itemName(step.producedItemId)} ${fmt(step.rate)}/min`,
        );
      }
      lines.push(
        `> ${t('phase.cumulative')}: ${Math.round(phase.cumulativeMachines)} ${t('gen.machines')} · ${fmt(phase.cumulativePower)} ${t('units.mw')}`,
        '',
      );
    }
    downloadBlob('sataplanner-fases.md', new Blob([lines.join('\n')], { type: 'text/markdown' }));
    setNotice(t('phase.done'));
  };

  const importJson = () => {
    const parsed = parseDocJson(importText);
    if (!parsed) {
      setNotice(t('lib.invalid'));
      return;
    }
    loadExternalDoc(parsed);
    setImportText('');
    setNotice(t('lib.imported'));
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseDocJson(text);
    if (!parsed) {
      setNotice(t('lib.invalid'));
    } else {
      loadExternalDoc(parsed);
      setNotice(t('lib.imported'));
    }
    event.target.value = '';
  };

  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.filter((issue) => issue.severity === 'warn').length;

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="planner-modal" role="dialog" aria-modal="true" aria-label={t('tools.title')}>
        <header className="planner-head">
          <div>
            <strong>{t('tools.title')}</strong>
            <small>SataPlanner · {t('app.subtitle')}</small>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('misc.close')}>
            ✕
          </button>
        </header>

        <nav className="planner-tabs" aria-label={t('tools.title')}>
          {(['generate', 'phases', 'check', 'library'] as Tab[]).map((name) => (
            <button
              type="button"
              key={name}
              className={tab === name ? 'is-active' : undefined}
              onClick={() => setTab(name)}
            >
              {t(`tabs.${name}`)}
            </button>
          ))}
        </nav>

        <div className="planner-body">
          {tab === 'generate' && (
            <section className="planner-section">
              <h3>{t('gen.title')}</h3>
              <p className="muted">{t('gen.hint')}</p>

              <div className="gen-grid">
                <div className="field">
                  <label htmlFor="gen-item">{t('gen.item')}</label>
                  <select id="gen-item" value={itemId} onChange={(event) => setItemId(event.target.value)}>
                    {targetItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {itemName(item.id)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="gen-rate">{t('gen.rate')}</label>
                  <input
                    id="gen-rate"
                    type="number"
                    min={0.1}
                    step={1}
                    value={rate}
                    onChange={(event) => setRate(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="gen-mode">{t('gen.mode')}</label>
                  <select
                    id="gen-mode"
                    value={mode}
                    onChange={(event) => setMode(event.target.value as 'machines' | 'clock')}
                  >
                    <option value="machines">{t('gen.modeMachines')}</option>
                    <option value="clock">{t('gen.modeClock')}</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="gen-clock">
                    {t('gen.clock')} <b>{clock}%</b>
                  </label>
                  <input
                    id="gen-clock"
                    type="range"
                    min={10}
                    max={250}
                    step={5}
                    value={clock}
                    onChange={(event) => setClock(Number(event.target.value))}
                  />
                </div>
              </div>

              <label className="check">
                <input type="checkbox" checked={alternate} onChange={() => setAlternate(!alternate)} />
                <span>{t('gen.alternate')}</span>
              </label>

              <button type="button" className="btn btn-accent" onClick={calculate}>
                ⚙ {t('gen.calculate')}
              </button>

              {plan && (
                <div className="gen-result">
                  <div className="gen-summary">
                    <span>
                      <em>{t('gen.machines')}</em> <b>{plan.machines}</b>
                    </span>
                    <span>
                      <em>{t('gen.power')}</em> <b>{fmt(plan.power)} {t('units.mw')}</b>
                    </span>
                    <span>
                      <em>{t('gen.steps')}</em> <b>{plan.steps.length}</b>
                    </span>
                  </div>

                  <div className="step-list">
                    {plan.steps.map((step) => (
                      <div className="step-row" key={step.id}>
                        <BuildingArt kind={artKind(step.buildingId)} size={30} />
                        <div className="step-main">
                          <strong>{buildingName(step.buildingId)} ×{step.machines}</strong>
                          <small>{itemName(step.producedItemId)} · {fmt(step.rate)}/min · {step.clock}%</small>
                        </div>
                        <span className="step-power">{fmt(step.power)} {t('units.mw')}</span>
                      </div>
                    ))}
                  </div>

                  {plan.rawInputs.length > 0 && (
                    <div className="raw-list">
                      <em>{t('gen.raw')}</em>
                      {plan.rawInputs.map((flow) => (
                        <span key={flow.itemId}>
                          {itemName(flow.itemId)} <b>{fmt(flow.rate)}/min</b>
                        </span>
                      ))}
                    </div>
                  )}

                  {plan.unresolved.length > 0 && (
                    <p className="warn-text">
                      {t('gen.unresolved')}: {plan.unresolved.map(itemName).join(', ')}
                    </p>
                  )}

                  {compare && (
                    <div className="compare">
                      <h4>{t('gen.compare')}</h4>
                      <p className="muted">{t('gen.compareHint')}</p>
                      <div className="compare-grid">
                        <div>
                          <em>{t('gen.modeMachines')}</em>
                          <b>{compare.normal.machines} {t('gen.machines')}</b>
                          <span>{fmt(compare.normal.power)} {t('units.mw')}</span>
                        </div>
                        <div>
                          <em>{t('gen.alternate')}</em>
                          <b>{compare.alt.machines} {t('gen.machines')}</b>
                          <span>{fmt(compare.alt.power)} {t('units.mw')}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="planner-actions">
                    <button type="button" className="btn btn-accent" onClick={() => apply('replace')}>
                      {t('gen.applyReplace')}
                    </button>
                    <button type="button" className="btn" onClick={() => apply('append')}>
                      {t('gen.applyAppend')}
                    </button>
                  </div>
                </div>
              )}

              {!plan && <p className="empty-note">{t('gen.noTarget')}</p>}
            </section>
          )}

          {tab === 'phases' && (
            <section className="planner-section">
              <h3>{t('phase.title')}</h3>
              <p className="muted">{t('phase.hint')}</p>
              {phases.length === 0 ? (
                <p className="empty-note">{t('phase.empty')}</p>
              ) : (
                <>
                  {phases.map((phase) => (
                    <div className="phase-card" key={phase.phase}>
                      <header>
                        <strong>{t('phase.build')} {phase.phase}</strong>
                        <small>
                          {Math.round(phase.cumulativeMachines)} {t('gen.machines')} ·{' '}
                          {fmt(phase.cumulativePower)} {t('units.mw')}
                        </small>
                      </header>
                      {phase.steps.map((step) => {
                        const key = phase.phase * 1000 + Number(step.id.replace(/\D/g, ''));
                        return (
                          <label className={`phase-step${built.has(key) ? ' is-built' : ''}`} key={step.id}>
                            <input
                              type="checkbox"
                              checked={built.has(key)}
                              onChange={() => {
                                const next = new Set(built);
                                if (next.has(key)) next.delete(key);
                                else next.add(key);
                                setBuilt(next);
                              }}
                            />
                            <span>
                              {buildingName(step.buildingId)} ×{step.machines} —{' '}
                              {itemName(step.producedItemId)} {fmt(step.rate)}/min
                            </span>
                          </label>
                        );
                      })}
                      <div className="phase-buildings">
                        {phase.buildings.map((building) => (
                          <span key={building.itemId}>
                            {buildingName(building.itemId)} ×{Math.round(building.rate)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button type="button" className="btn btn-accent" onClick={exportPhases}>
                    {t('phase.export')}
                  </button>
                </>
              )}
            </section>
          )}

          {tab === 'check' && (
            <section className="planner-section">
              <h3>{t('check.title')}</h3>
              <p className="muted">{t('check.hint')}</p>
              <label className="check">
                <input type="checkbox" checked={showIssues} onChange={toggleIssues} />
                <span>{t('check.overlay')}</span>
              </label>
              <div className="check-summary">
                <span className="badge-error">{errors} {t('check.errors')}</span>
                <span className="badge-warn">{warnings} {t('check.warnings')}</span>
              </div>
              {issues.length === 0 ? (
                <p className="ok">{t('check.clean')}</p>
              ) : (
                <div className="issue-list">
                  {issues.map((issue, index) => (
                    <button
                      type="button"
                      className={`issue-row severity-${issue.severity}`}
                      key={`${issue.code}-${index}`}
                      onClick={() => jumpTo(issue.nodeId, issue.wireId)}
                    >
                      <span className="issue-icon">{issue.severity === 'error' ? '✕' : '!'}</span>
                      <span className="issue-text">
                        <strong>{t(`issue.${issue.code}`)}</strong>
                        <small>{issue.message}</small>
                      </span>
                      <span className="issue-go">↗</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === 'library' && (
            <section className="planner-section">
              <h3>{t('lib.title')}</h3>
              <p className="muted">{t('lib.hint')}</p>

              <div className="field">
                <label htmlFor="lib-name">{t('lib.name')}</label>
                <input id="lib-name" className="text-input" value={doc.meta.name} readOnly />
              </div>
              <div className="planner-actions">
                <button
                  type="button"
                  className="btn btn-accent"
                  onClick={async () => {
                    await saveCurrentPlan();
                    setNotice(t('lib.saved'));
                  }}
                >
                  {t('lib.save')}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    if (window.confirm(`${t('lib.new')}?`)) {
                      resetDoc();
                      setNotice('');
                    }
                  }}
                >
                  {t('lib.new')}
                </button>
              </div>

              <h4>{t('tabs.library')}</h4>
              {library.length === 0 ? (
                <p className="empty-note">{t('lib.empty')}</p>
              ) : (
                <div className="library-list">
                  {library.map((item) => (
                    <div className="library-row" key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <small>
                          {item.nodes} {t('status.nodes')} ·{' '}
                          {new Date(item.updatedAt).toLocaleString(lang)}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={async () => {
                          await openPlan(item.id);
                          setNotice(t('lib.opened'));
                          onClose();
                        }}
                      >
                        {t('lib.open')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={async () => {
                          await removePlan(item.id);
                          setNotice(t('lib.deleted'));
                        }}
                      >
                        {t('lib.delete')}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <h4>{t('lib.import')}</h4>
              <p className="muted">{t('lib.importHint')}</p>
              <textarea
                className="import-area"
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder="{ ... }"
                rows={4}
              />
              <div className="planner-actions">
                <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                  📁 {t('lib.import')}
                </button>
                <button type="button" className="btn btn-accent" onClick={importJson}>
                  {t('lib.importButton')}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={onFile}
                />
              </div>

              <h4>{t('lib.templates')}</h4>
              <div className="template-list">
                {TEMPLATES.map((template) => (
                  <button
                    type="button"
                    className="template-card"
                    key={template.id}
                    onClick={() => {
                      loadExternalDoc(
                        templateDoc(template, frame, floor, itemName(template.itemId)),
                      );
                      setNotice(t('lib.imported'));
                      onClose();
                    }}
                  >
                    <BuildingArt
                      kind={artKind(
                        sampleGameData.recipes.find((recipe) => recipe.id === template.itemId)
                          ?.buildingIds[0] ?? 'default',
                      )}
                      size={36}
                    />
                    <span>{itemName(template.itemId)}</span>
                    <small>{template.rate}/min</small>
                    <em>{t('lib.create')} →</em>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <footer className="planner-foot">
          {notice ? <span className="notice">{notice}</span> : <span />}
          <button type="button" className="btn" onClick={onClose}>
            {t('misc.close')}
          </button>
        </footer>
      </div>
    </div>
  );
}
