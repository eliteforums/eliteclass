import { useEffect, useMemo, useRef, useState } from 'react';
import { Undo2, Redo2, Trash2, Send, Save, PenTool, Eraser, Palette } from 'lucide-react';

type CanvasEditorProps = {
  pages?: CanvasSnapshot[];
  onChange: (pages: CanvasSnapshot[]) => void;
  onSendAssignment?: () => void;
};

type Tool = 'pen' | 'eraser' | null;

type Point = { x: number; y: number };

type Stroke = {
  tool: Exclude<Tool, null>;
  color: string;
  width: number;
  points: Point[];
};

type CanvasSnapshot = {
  id: string;
  width: number;
  height: number;
  background: string;
  dataUrl: string;
  fabricJson?: unknown;
};

type SavedCanvasState = {
  strokes: Stroke[];
  boardHeight?: number;
};

type SceneState = {
  strokes: Stroke[];
  boardHeight: number;
};

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 700;
const BOARD_BACKGROUND = '#ffffff';
const BOARD_GROW_STEP = 600;
const BOARD_GROW_THRESHOLD = 160;

const COLOR_OPTIONS = ['#111111', '#0f766e', '#2563eb', '#dc2626', '#ca8a04', '#7c3aed'];

const clampPoint = (value: number, max: number) => Math.max(0, Math.min(max, value));

const cloneStrokes = (strokes: Stroke[]) =>
  strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((point) => ({ ...point })),
  }));

const cloneScene = (scene: SceneState): SceneState => ({
  strokes: cloneStrokes(scene.strokes),
  boardHeight: scene.boardHeight,
});

const loadSavedState = (snapshot?: CanvasSnapshot): SceneState => {
  const saved = snapshot?.fabricJson as SavedCanvasState | undefined;

  return {
    strokes: saved?.strokes ? cloneStrokes(saved.strokes) : [],
    boardHeight: saved?.boardHeight || snapshot?.height || CANVAS_HEIGHT,
  };
};

const buildSnapshot = (canvas: HTMLCanvasElement, scene: SceneState, snapshotId: string): CanvasSnapshot => ({
  id: snapshotId,
  width: canvas.width,
  height: canvas.height,
  background: BOARD_BACKGROUND,
  dataUrl: canvas.toDataURL('image/png'),
  fabricJson: {
    strokes: cloneStrokes(scene.strokes),
    boardHeight: scene.boardHeight,
  },
});

const drawStroke = (context: CanvasRenderingContext2D, stroke: Stroke) => {
  const points = stroke.points;

  if (!points.length) {
    return;
  }

  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = stroke.width;
  context.strokeStyle = stroke.color;
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';

  if (points.length === 1) {
    const point = points[0];
    context.beginPath();
    context.arc(point.x, point.y, Math.max(0.5, stroke.width / 2), 0, Math.PI * 2);
    context.fillStyle = stroke.tool === 'eraser' ? BOARD_BACKGROUND : stroke.color;
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);

    for (let index = 1; index < points.length; index += 1) {
      const point = points[index];
      context.lineTo(point.x, point.y);
    }

    context.stroke();
  }

  context.restore();
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

export function CanvasEditor({ pages = [], onChange, onSendAssignment }: CanvasEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  const initialPage = pages[0];
  const sceneRef = useRef<SceneState>(loadSavedState(initialPage));
  const historyRef = useRef<SceneState[]>([]);
  const redoRef = useRef<SceneState[]>([]);
  const drawingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const hasInitializedRef = useRef(false);
  const renderTokenRef = useRef(0);
  const sceneHeightRef = useRef(sceneRef.current.boardHeight);

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#111111');
  const [penSize, setPenSize] = useState(4);
  const [eraserSize, setEraserSize] = useState(20);
  const [boardHeight, setBoardHeight] = useState(sceneRef.current.boardHeight);

  onChangeRef.current = onChange;

  const activeStrokeWidth = useMemo(() => (tool === 'eraser' ? eraserSize : penSize), [eraserSize, penSize, tool]);

  const ensureBoardHeight = (requiredHeight: number) => {
    if (requiredHeight <= sceneHeightRef.current) {
      return;
    }

    const nextHeight = Math.ceil(requiredHeight / BOARD_GROW_STEP) * BOARD_GROW_STEP;
    sceneHeightRef.current = nextHeight;
    sceneRef.current = {
      ...sceneRef.current,
      boardHeight: nextHeight,
    };
    setBoardHeight(nextHeight);
  };

  const syncCanvas = () => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const token = ++renderTokenRef.current;
    const { strokes, boardHeight: sceneHeight } = sceneRef.current;
    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    canvas.width = CANVAS_WIDTH;
    canvas.height = sceneHeight;

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = BOARD_BACKGROUND;
    context.fillRect(0, 0, canvas.width, canvas.height);

    for (const stroke of strokes) {
      drawStroke(context, stroke);
    }

    context.save();
    context.strokeStyle = 'rgba(15, 23, 42, 0.08)';
    context.lineWidth = 1;
    for (let pageTop = CANVAS_HEIGHT; pageTop < sceneHeight; pageTop += CANVAS_HEIGHT) {
      context.beginPath();
      context.moveTo(0, pageTop);
      context.lineTo(canvas.width, pageTop);
      context.stroke();
    }
    context.restore();

    context.restore();
  };

  const publishSnapshot = (snapshotId: string) => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const nextSnapshot = buildSnapshot(canvas, sceneRef.current, snapshotId);
    onChangeRef.current([nextSnapshot]);
  };

  const captureHistory = () => {
    historyRef.current.push(cloneScene(sceneRef.current));
    redoRef.current = [];
  };

  const commitScene = (snapshotId: string) => {
    syncCanvas();
    publishSnapshot(snapshotId);
  };

  const getPointFromEvent = (event: PointerEvent) => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();

    if (!rect.width || !rect.height) {
      return null;
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: clampPoint((event.clientX - rect.left) * scaleX, canvas.width),
      y: clampPoint((event.clientY - rect.top) * scaleY, canvas.height),
    };
  };

  const appendPoint = (point: Point) => {
    const stroke = currentStrokeRef.current;

    if (!stroke) {
      return;
    }

    const points = stroke.points;
    const previousPoint = points[points.length - 1];

    if (!previousPoint || previousPoint.x !== point.x || previousPoint.y !== point.y) {
      points.push(point);
    }

    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');

    if (!context || points.length < 2) {
      return;
    }

    ensureBoardHeight(point.y + BOARD_GROW_THRESHOLD);

    const fromPoint = points[points.length - 2];
    const toPoint = points[points.length - 1];

    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = stroke.width;
    context.strokeStyle = stroke.color;
    context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    context.beginPath();
    context.moveTo(fromPoint.x, fromPoint.y);
    context.lineTo(toPoint.x, toPoint.y);
    context.stroke();
    context.restore();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!tool) {
      return;
    }

    const point = getPointFromEvent(event.nativeEvent);

    if (!point) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    captureHistory();
    drawingRef.current = true;
    pointerIdRef.current = event.pointerId;
    currentStrokeRef.current = {
      tool,
      color: tool === 'eraser' ? BOARD_BACKGROUND : color,
      width: activeStrokeWidth,
      points: [point],
    };

    ensureBoardHeight(point.y + BOARD_GROW_THRESHOLD);

    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = activeStrokeWidth;
    context.strokeStyle = tool === 'eraser' ? BOARD_BACKGROUND : color;
    context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    context.beginPath();
    context.arc(point.x, point.y, Math.max(0.5, activeStrokeWidth / 2), 0, Math.PI * 2);
    context.fillStyle = tool === 'eraser' ? BOARD_BACKGROUND : color;
    context.fill();
    context.restore();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || pointerIdRef.current !== event.pointerId) {
      return;
    }

    const point = getPointFromEvent(event.nativeEvent);

    if (!point) {
      return;
    }

    event.preventDefault();
    appendPoint(point);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.currentTarget.releasePointerCapture(event.pointerId);

    const stroke = currentStrokeRef.current;

    if (!stroke || stroke.points.length < 1) {
      currentStrokeRef.current = null;
      drawingRef.current = false;
      pointerIdRef.current = null;
      return;
    }

    sceneRef.current = {
      ...sceneRef.current,
      strokes: [...sceneRef.current.strokes, stroke],
    };

    currentStrokeRef.current = null;
    drawingRef.current = false;
    pointerIdRef.current = null;
    commitScene(`canvas-${Date.now()}-stroke`);
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.currentTarget.releasePointerCapture(event.pointerId);
    currentStrokeRef.current = null;
    drawingRef.current = false;
    pointerIdRef.current = null;
  };

  const handleUndo = () => {
    if (!historyRef.current.length) {
      return;
    }

    redoRef.current = [...redoRef.current, cloneScene(sceneRef.current)];
    sceneRef.current = historyRef.current.pop() ?? sceneRef.current;
    sceneHeightRef.current = sceneRef.current.boardHeight;
    setBoardHeight(sceneRef.current.boardHeight);
    syncCanvas();
    publishSnapshot(`canvas-${Date.now()}-undo`);
  };

  const handleRedo = () => {
    const nextState = redoRef.current.pop();

    if (!nextState) {
      return;
    }

    historyRef.current = [...historyRef.current, cloneScene(sceneRef.current)];
    sceneRef.current = cloneScene(nextState);
    sceneHeightRef.current = sceneRef.current.boardHeight;
    setBoardHeight(sceneRef.current.boardHeight);
    syncCanvas();
    publishSnapshot(`canvas-${Date.now()}-redo`);
  };

  const handleClear = () => {
    if (!sceneRef.current.strokes.length) {
      return;
    }

    historyRef.current = [...historyRef.current, cloneScene(sceneRef.current)];
    redoRef.current = [];
    sceneRef.current = {
      strokes: [],
      boardHeight: CANVAS_HEIGHT,
    };
    sceneHeightRef.current = CANVAS_HEIGHT;
    setBoardHeight(CANVAS_HEIGHT);
    syncCanvas();
    publishSnapshot(`canvas-${Date.now()}-clear`);
  };

  const handleSave = () => {
    publishSnapshot(`canvas-${Date.now()}-save`);
  };

  const handleAddPage = () => {
    historyRef.current.push(cloneScene(sceneRef.current));
    redoRef.current = [];

    const nextHeight = sceneRef.current.boardHeight + CANVAS_HEIGHT;
    sceneRef.current = {
      ...sceneRef.current,
      boardHeight: nextHeight,
    };
    sceneHeightRef.current = nextHeight;
    setBoardHeight(nextHeight);

    syncCanvas();
    publishSnapshot(`canvas-${Date.now()}-page`);

    window.requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: nextHeight - CANVAS_HEIGHT, behavior: 'smooth' });
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || hasInitializedRef.current) {
      return;
    }

    hasInitializedRef.current = true;
    canvas.width = CANVAS_WIDTH;
    canvas.height = sceneRef.current.boardHeight;
    canvas.style.touchAction = 'none';

    sceneHeightRef.current = sceneRef.current.boardHeight;
    setBoardHeight(sceneRef.current.boardHeight);
    syncCanvas();
  }, []);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      return;
    }

    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    canvas.width = CANVAS_WIDTH;
    canvas.height = boardHeight;
    sceneRef.current = {
      ...sceneRef.current,
      boardHeight,
    };
    sceneHeightRef.current = boardHeight;
    syncCanvas();
  }, [boardHeight]);

  const toolButtonClass = (active: boolean) =>
    [
      'btn flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200',
      'border shadow-sm',
      active
        ? '!border-black !bg-black !text-white shadow-md shadow-black/20 hover:!border-black hover:!bg-black hover:!text-white'
        : 'border-border bg-card text-foreground hover:!border-black hover:!bg-black hover:!text-white',
    ].join(' ');

  const colorButtonClass = (active: boolean) =>
    [
      'h-6 w-6 rounded-full border-2 transition-all duration-200',
      active ? 'border-foreground scale-110 shadow-md' : 'border-border/60 hover:scale-105',
    ].join(' ');

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/95 p-3 shadow-card backdrop-blur-sm">
        <button type="button" onClick={() => setTool('pen')} className={toolButtonClass(tool === 'pen')}>
          <PenTool size={16} />
          Pen
        </button>
        <button type="button" onClick={() => setTool('eraser')} className={toolButtonClass(tool === 'eraser')}>
          <Eraser size={16} />
          Eraser
        </button>
        <button type="button" onClick={handleAddPage} className="btn flex items-center gap-2 rounded-full border border-border bg-background/80 px-4 py-2 text-foreground shadow-sm hover:!bg-black hover:!text-white">
          <Save size={16} />
          Add Page
        </button>

        <div className="h-8 w-px bg-border" />

        <div className="flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-2">
          <Palette size={16} className="text-muted-foreground" />
          <div className="flex items-center gap-2">
            {COLOR_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setColor(option);
                  setTool('pen');
                }}
                aria-label={`Set pen color ${option}`}
                className={colorButtonClass(color === option)}
                style={{ backgroundColor: option }}
              />
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-2 text-sm text-muted-foreground">
          Pen size
          <input
            type="range"
            min="1"
            max="16"
            value={penSize}
            onChange={(event) => setPenSize(Number(event.target.value))}
            className="accent-primary"
          />
          <span className="w-8 text-right font-semibold text-foreground">{penSize}</span>
        </label>

        <label className="flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-2 text-sm text-muted-foreground">
          Eraser size
          <input
            type="range"
            min="8"
            max="48"
            value={eraserSize}
            onChange={(event) => setEraserSize(Number(event.target.value))}
            className="accent-primary"
          />
          <span className="w-8 text-right font-semibold text-foreground">{eraserSize}</span>
        </label>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleUndo} className="btn flex items-center gap-2 rounded-full border border-border bg-background/80 px-4 py-2 text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground">
            <Undo2 size={16} />
            Undo
          </button>
          <button type="button" onClick={handleRedo} className="btn flex items-center gap-2 rounded-full border border-border bg-background/80 px-4 py-2 text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground">
            <Redo2 size={16} />
            Redo
          </button>
          <button type="button" onClick={handleClear} className="btn flex items-center gap-2 rounded-full border border-destructive/20 bg-destructive/10 px-4 py-2 text-destructive shadow-sm hover:bg-destructive hover:text-destructive-foreground">
            <Trash2 size={16} />
            Clear
          </button>
          <button type="button" onClick={handleSave} className="btn flex items-center gap-2 rounded-full border border-primary/30 bg-primary px-4 py-2 text-primary-foreground shadow-sm shadow-primary/20 hover:opacity-95">
            <Save size={16} />
            Save
          </button>
          {onSendAssignment && (
            <button type="button" onClick={onSendAssignment} className="btn flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-600 px-4 py-2 text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-500">
              <Send size={16} />
              Send
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex min-h-0 flex-1 justify-center overflow-y-auto rounded-[28px] border border-border bg-surface p-3 shadow-card">
        <div className="w-full max-w-[1240px]">
          <div className="overflow-hidden rounded-[24px] bg-white shadow-inner">
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onContextMenu={(event) => event.preventDefault()}
              className="block h-auto w-full max-w-full select-none touch-none"
              width={CANVAS_WIDTH}
              height={boardHeight}
              aria-label="Assignment drawing board"
            />
          </div>
          <div className="mt-3 flex items-center justify-between px-2 text-xs text-slate-500">
            <span>{sceneRef.current.strokes.length ? 'Canvas saved' : 'Blank board'}</span>
            <span>Scroll down for more space. Add Page appends a new blank page below.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CanvasEditor;