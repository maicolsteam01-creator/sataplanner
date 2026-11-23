import { useMemo, useState } from 'react';
import { localized, sampleGameData } from '@sataplanner/game-data';
import { useT } from '../hooks';
import { useAppStore } from '../store';
import { Glyph } from './Glyph';

export function RightPanel() {
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const addNode = useAppStore((s) => s.addNode);
  const showRight = useAppStore((s) => s.showRight);
  const toggleRight = useAppStore((s) => s.toggleRight);

  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sampleGameData.categories
      .map((category) => ({
        category,
        buildings: sampleGameData.buildings.filter((building) => {
          if (building.category !== category.id) return false;
          if (!needle) return true;
          return Object.values(building.name).some((text) =>
            text?.toLowerCase().includes(needle),
          );
        }),
      }))
      .filter((group) => group.buildings.length > 0);
  }, [query]);

  return (
    <aside className={`panel panel-right${showRight ? ' is-open' : ''}`}>
      <div className="panel-head">
        <h3>{t('right.title')}</h3>
        <button type="button" className="icon-btn only-mobile" onClick={toggleRight}>
          ✕
        </button>
      </div>

      <input
        className="search"
        type="search"
        placeholder={t('right.search')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="catalog">
        {groups.length === 0 && <p className="empty-note">{t('right.empty')}</p>}
        {groups.map(({ category, buildings }) => (
          <section key={category.id} className="catalog-group">
            <header>
              <span className="dot" style={{ background: category.color }} />
              {localized(category.name, lang)}
              <em>{buildings.length}</em>
            </header>
            {buildings.map((building) => (
              <button
                type="button"
                key={building.id}
                className="catalog-card"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/x-sataplanner-building', building.id);
                  event.dataTransfer.setData('text/plain', building.id);
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => addNode(building.id)}
                title={t('right.add')}
              >
                <span className="catalog-glyph" style={{ color: category.color }}>
                  <Glyph
                    kind={building.id === 'miner-mk1' ? 'miner-mk1' : building.icon}
                    size={26}
                  />
                </span>
                <span className="catalog-text">
                  <strong>{localized(building.name, lang)}</strong>
                  <small>
                    {building.footprint.w}×{building.footprint.d}
                    {building.powerBase > 0 && <> · {building.powerBase} MW</>}
                    {building.powerGeneration ? <> · +{building.powerGeneration} MW</> : null}
                  </small>
                </span>
                <span className="catalog-add">+</span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}
