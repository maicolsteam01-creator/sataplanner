import { useCallback, useMemo } from 'react';
import { analyze } from '@sataplanner/engine';
import { sampleGameData } from '@sataplanner/game-data';
import { translate } from './i18n';
import { useAppStore } from './store';

export function useT() {
  const lang = useAppStore((s) => s.lang);
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );
}

export function useAnalysis() {
  const nodes = useAppStore((s) => s.doc.nodes);
  const wires = useAppStore((s) => s.doc.wires);
  return useMemo(() => analyze({ nodes, wires }, sampleGameData), [nodes, wires]);
}
