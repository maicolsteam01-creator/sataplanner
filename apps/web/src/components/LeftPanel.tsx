import { buildingById, itemById, localized, sampleGameData } from '@sataplanner/game-data';
import { useAnalysis, useT } from '../hooks';
import { useAppStore } from '../store';
import { Glyph } from './Glyph';

const fmt = (value: number): string =>
  Math.abs(value) >= 100 ? String(Math.round(value)) : String(Math.round(value * 10) / 10);

export function LeftPanel() {
  const t = useT();
  const analysis = useAnalysis();

  const grid = useAppStore((s) => s.grid);
  const snap = useAppStore((s) => s.snap);
  const frame = useAppStore((s) => s.frame);
  const setGrid = useAppStore((s) => s.setGrid);
  const toggleSnap = useAppStore((s) => s.toggleSnap);
  const setFrame = useAppStore((s) => s.setFrame);
  const centerBlueprint = useAppStore((s) => s.centerBlueprint);
  const floor = useAppStore((s) => s.floor);
  const setFloor = useAppStore((s) => s.setFloor);

  const doc = useAppStore((s) => s.doc);
  const selectedId = useAppStore((s) => s.selectedId);
  const connectFrom = useAppStore((s) => s.connectFrom);
  const startConnect = useAppStore((s) => s.startConnect);
  const cancelConnect = useAppStore((s) => s.cancelConnect);
  const removeSelected = useAppStore((s) => s.removeSelected);
  const updateNode = useAppStore((s) => s.updateNode);
  const pushHistory = useAppStore((s) => s.pushHistory);
  const renameDoc = useAppStore((s) => s.renameDoc);
  const showLeft = useAppStore((s) => s.showLeft);
  const toggleLeft = useAppStore((s) => s.toggleLeft);
  const lang = useAppStore((s) => s.lang);

  const node = doc.nodes.find((n) => n.id === selectedId);
  const building = node ? buildingById.get(node.buildingId) : undefined;
  const production = node ? analysis.nodes[node.id] : undefined;
  const recipes = building
    ? sampleGameData.recipes.filter((r) => r.buildingIds.includes(building.id))
    : [];
  const category = building
    ? sampleGameData.categories.find((c) => c.id === building.category)
    : undefined;

  return (
    <aside className={`panel panel-left${showLeft ? ' is-open' : ''}`}>
      <div className="panel-head only-mobile">
        <span>{t('left.title')}</span>
        <button type="button" className="icon-btn" onClick={toggleLeft}>
          ✕
        </button>
      </div>

      <section className="panel-section">
        <h3>{t('left.title')}</h3>

        <div className="field">
          <label htmlFor="doc-name">{t('left.name')}</label>
          <input
            id="doc-name"
            className="text-input"
            type="text"
            maxLength={80}
            value={doc.meta.name}
            onChange={(event) => renameDoc(event.target.value)}
            placeholder="Plano sin título"
          />
        </div>

        <div className="field">
          <label htmlFor="grid">{t('left.grid')}</label>
          <select id="grid" value={grid} onChange={(e) => setGrid(Number(e.target.value))}>
            <option value={0.5}>0.5</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </div>

        <label className="check">
          <input type="checkbox" checked={snap} onChange={toggleSnap} />
          <span>{t('left.snap')}</span>
        </label>

        <div className="field">
          <label>{t('left.frame')}</label>
          <div className="segmented segmented-sm">
            {[4, 6].map((value) => (
              <button
                key={value}
                type="button"
                className={frame === value ? 'is-active' : undefined}
                onClick={() => setFrame(value as 4 | 6)}
              >
                {value}×{value}
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="btn btn-block" onClick={centerBlueprint}>
          ⌖ {t('left.center')}
        </button>

        <div className="field">
          <label htmlFor="floor">{t('left.floor')}</label>
          <select id="floor" value={floor} onChange={(e) => setFloor(Number(e.target.value))}>
            {[0, 1, 2, 3, 4].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="panel-section">
        <h3>{t('left.inspector')}</h3>

        {!node || !building ? (
          <p className="empty-note">{t('left.none')}</p>
        ) : (
          <div className="inspector">
            <div className="inspector-head">
              <span className="dot" style={{ background: category?.color }} />
              <Glyph
                kind={building.id === 'miner-mk1' ? 'miner-mk1' : building.icon}
                size={22}
                color={category?.color}
              />
              <div>
                <strong>{localized(building.name, lang)}</strong>
                <small>
                  {category ? localized(category.name, lang) : ''} · {building.footprint.w}×
                  {building.footprint.d}
                  {!building.verified && <span className="tag">≈</span>}
                </small>
              </div>
            </div>

            {recipes.length > 0 && (
              <div className="field">
                <label htmlFor="recipe">{t('left.recipe')}</label>
                <select
                  id="recipe"
                  value={node.recipeId ?? ''}
                  onChange={(e) => updateNode(node.id, { recipeId: e.target.value || undefined })}
                >
                  <option value="">{t('left.noRecipe')}</option>
                  {recipes.filter((r) => !r.alternate).length > 0 && (
                    <optgroup label="—">
                      {recipes
                        .filter((r) => !r.alternate)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {localized(r.name, lang)}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  {recipes.some((r) => r.alternate) && (
                    <optgroup label={t('left.alternates')}>
                      {recipes
                        .filter((r) => r.alternate)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {localized(r.name, lang)}
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
              </div>
            )}

            <div className="field-row">
              <div className="field">
                <label htmlFor="count">{t('left.machines')}</label>
                <input
                  id="count"
                  type="number"
                  min={1}
                  max={200}
                  value={node.count}
                  onChange={(e) =>
                    updateNode(node.id, { count: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="sloops">{t('left.sloops')}</label>
                <select
                  id="sloops"
                  value={node.somersloops}
                  onChange={(e) => updateNode(node.id, { somersloops: Number(e.target.value) })}
                >
                  {Array.from({ length: building.somersloopSlots + 1 }, (_, index) => (
                    <option key={index} value={index}>
                      {index}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="clock">
                {t('left.clock')} <b>{Math.round(node.clock)}%</b>
              </label>
              <input
                id="clock"
                type="range"
                min={1}
                max={250}
                step={1}
                value={node.clock}
                onPointerDown={pushHistory}
                onChange={(e) => updateNode(node.id, { clock: Number(e.target.value) }, false)}
              />
            </div>

            <div className="field">
              <label>
                {t('left.position')}
                <b>
                  {fmt(node.x)} · {fmt(node.y)}
                </b>
              </label>
              <div className="field-row">
                <input
                  type="number"
                  step={0.5}
                  value={Math.round(node.x * 100) / 100}
                  aria-label="X"
                  onChange={(e) => updateNode(node.id, { x: Number(e.target.value) || 0 })}
                />
                <input
                  type="number"
                  step={0.5}
                  value={Math.round(node.y * 100) / 100}
                  aria-label="Y"
                  onChange={(e) => updateNode(node.id, { y: Number(e.target.value) || 0 })}
                />
              </div>
            </div>

            <button
              type="button"
              className="btn btn-block"
              onClick={() => updateNode(node.id, { x: 0, y: 0 })}
            >
              ⌖ {t('left.centerNode')}
            </button>

            <div className="readout">
              {production?.outputs.map((flow) => (
                <div className="readout-row" key={`out-${flow.itemId}`}>
                  <span className="readout-tag out">OUT</span>
                  <span className="readout-name">
                    {localized(itemById.get(flow.itemId)?.name ?? { en: flow.itemId }, lang)}
                  </span>
                  <b>{fmt(flow.rate)}</b>
                  <em>{t('units.perMin')}</em>
                </div>
              ))}
              {production?.inputs.map((flow) => (
                <div className="readout-row" key={`in-${flow.itemId}`}>
                  <span className="readout-tag in">IN</span>
                  <span className="readout-name">
                    {localized(itemById.get(flow.itemId)?.name ?? { en: flow.itemId }, lang)}
                  </span>
                  <b>{fmt(flow.rate)}</b>
                  <em>{t('units.perMin')}</em>
                </div>
              ))}
              <div className="readout-row is-power">
                <span className="readout-tag">⚡</span>
                <span className="readout-name">{t('power.use')}</span>
                <b>{fmt(production?.power ?? 0)}</b>
                <em>{t('units.mw')}</em>
              </div>
            </div>

            <div className="inspector-actions">
              {connectFrom === node.id ? (
                <button type="button" className="btn btn-accent btn-block" onClick={cancelConnect}>
                  {t('left.connecting')}
                </button>
              ) : (
                <button type="button" className="btn btn-block" onClick={startConnect}>
                  ⇢ {t('left.connect')}
                </button>
              )}
              <button type="button" className="btn btn-danger btn-block" onClick={removeSelected}>
                {t('left.delete')}
              </button>
            </div>
          </div>
        )}
      </section>
    </aside>
  );
}
