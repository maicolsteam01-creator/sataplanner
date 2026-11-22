import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import { analyze, validateDesign } from '@sataplanner/engine';
import { buildingById, sampleGameData } from '@sataplanner/game-data';
import { useAppStore } from '../store';
import { useT } from '../hooks';
import { drawScene } from '../lib/draw';
import {
  clamp,
  hitTest,
  project,
  snapValue,
  toWorld,
  UNIT,
  type Camera,
} from '../lib/geometry';

const FOOTPRINTS = new Map(
  sampleGameData.buildings.map((b) => [b.id, { w: b.footprint.w, d: b.footprint.d }]),
);

type Drag =
  | { kind: 'node'; id: string; ox: number; oy: number; history: boolean }
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number };

export function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const lastCenter = useRef(-1);

  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [dropping, setDropping] = useState(false);
  const t = useT();

  const nodes = useAppStore((s) => s.doc.nodes);
  const wires = useAppStore((s) => s.doc.wires);
  const selectedId = useAppStore((s) => s.selectedId);
  const connectFrom = useAppStore((s) => s.connectFrom);
  const view = useAppStore((s) => s.view);
  const zoom = useAppStore((s) => s.zoom);
  const panX = useAppStore((s) => s.panX);
  const panY = useAppStore((s) => s.panY);
  const grid = useAppStore((s) => s.grid);
  const frame = useAppStore((s) => s.frame);
  const floor = useAppStore((s) => s.floor);
  const lang = useAppStore((s) => s.lang);
  const centerTick = useAppStore((s) => s.centerTick);
  const art = useAppStore((s) => s.art);
  const showIssues = useAppStore((s) => s.showIssues);

  const analysis = useMemo(() => analyze({ nodes, wires }, sampleGameData), [nodes, wires]);
  const issues = useMemo(
    () =>
      showIssues
        ? validateDesign({ nodes, wires, frame }, sampleGameData)
        : [],
    [showIssues, nodes, wires, frame],
  );

  const camera: Camera = useMemo(
    () => ({ width: viewport.w, height: viewport.h, zoom, panX, panY, view }),
    [viewport.w, viewport.h, zoom, panX, panY, view],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setViewport({ w: Math.round(rect.width), h: Math.round(rect.height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!viewport.w || lastCenter.current === centerTick) return;
    lastCenter.current = centerTick;
    const fit = (Math.min(viewport.w, viewport.h) / (frame * UNIT)) * 0.72;
    useAppStore.getState().setCamera({ zoom: clamp(fit, 0.35, 1.8), panX: 0, panY: 0 });
  }, [viewport.w, viewport.h, frame, centerTick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      const state = useAppStore.getState();
      const rect = canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const current: Camera = {
        width: rect.width,
        height: rect.height,
        zoom: state.zoom,
        panX: state.panX,
        panY: state.panY,
        view: state.view,
      };
      const world = toWorld(sx, sy, current);
      const nextZoom = clamp(state.zoom * Math.exp(-event.deltaY * 0.0015), 0.2, 3.5);
      const projected = project(world.x, world.y, state.view);
      state.setCamera({
        zoom: nextZoom,
        panX: sx - rect.width / 2 - projected.x * UNIT * nextZoom,
        panY: sy - rect.height / 2 - projected.y * UNIT * nextZoom,
      });
    };
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !viewport.w || !viewport.h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(viewport.w * dpr);
    const pixelHeight = Math.round(viewport.h * dpr);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(ctx, {
      nodes,
      wires,
      analysis,
      data: sampleGameData,
      buildings: buildingById,
      selectedId,
      connectFrom,
      camera,
      grid,
      frame,
      floor,
      lang,
      view,
      art,
      showIssues,
      issues,
    });
  }, [
    nodes,
    wires,
    analysis,
    selectedId,
    connectFrom,
    camera,
    grid,
    frame,
    floor,
    lang,
    view,
    art,
    showIssues,
    issues,
    viewport,
  ]);

  const localPoint = (event: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = useAppStore.getState();
    const point = localPoint(event);
    const world = toWorld(point.x, point.y, camera);
    const node = hitTest(state.doc.nodes, world, FOOTPRINTS);

    if (state.connectFrom) {
      if (node && node.id !== state.connectFrom) {
        state.connectTo(node.id);
      } else {
        state.cancelConnect();
      }
      return;
    }

    if (node) {
      state.select(node.id);
      dragRef.current = {
        kind: 'node',
        id: node.id,
        ox: world.x - node.x,
        oy: world.y - node.y,
        history: false,
      };
    } else {
      state.select(null);
      dragRef.current = {
        kind: 'pan',
        startX: point.x,
        startY: point.y,
        panX: state.panX,
        panY: state.panY,
      };
    }
    canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const state = useAppStore.getState();
    const point = localPoint(event);

    if (drag.kind === 'node') {
      if (!drag.history) {
        state.pushHistory();
        dragRef.current = { ...drag, history: true };
      }
      const world = toWorld(point.x, point.y, camera);
      const rawX = world.x - drag.ox;
      const rawY = world.y - drag.oy;
      const x = state.snap ? snapValue(rawX, state.grid) : Math.round(rawX * 100) / 100;
      const y = state.snap ? snapValue(rawY, state.grid) : Math.round(rawY * 100) / 100;
      state.moveNode(drag.id, x, y);
      return;
    }

    state.setCamera({
      panX: drag.panX + (point.x - drag.startX),
      panY: drag.panY + (point.y - drag.startY),
    });
  };

  const endDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropping(false);
    const buildingId =
      event.dataTransfer.getData('application/x-sataplanner-building') ||
      event.dataTransfer.getData('text/plain');
    if (!buildingId) return;
    const point = localPoint(event);
    const state = useAppStore.getState();
    const world = toWorld(point.x, point.y, camera);
    const x = state.snap ? snapValue(world.x, state.grid) : Math.round(world.x * 100) / 100;
    const y = state.snap ? snapValue(world.y, state.grid) : Math.round(world.y * 100) / 100;
    state.addNode(buildingId, { x, y });
  };

  return (
    <div
      className={`stage${dropping ? ' is-dropping' : ''}`}
      ref={wrapRef}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
    >
      <canvas
        id="scene"
        ref={canvasRef}
        className={connectFrom ? 'is-connecting' : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />

      {nodes.length === 0 && <div className="stage-hint">{t('canvas.hint')}</div>}

      {connectFrom && (
        <div className="stage-hint is-accent">
          {t('canvas.connectHint')} · {t('left.cancel')}: Esc
        </div>
      )}

      {dropping && <div className="stage-drop">{t('canvas.drop')}</div>}
    </div>
  );
}
