type WhiteboardStroke = {
  kind: 'stroke';
  id: string;
  tool: string;
  points: number[];
  color: string;
  width: number;
  opacity: number;
  smoothing?: number;
  composite?: GlobalCompositeOperation;
  shadowBlur?: number;
  shadowColor?: string;
  dash?: number[];
  lineCap?: CanvasLineCap;
  lineJoin?: CanvasLineJoin;
};

type WhiteboardText = {
  kind: 'text';
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  opacity?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  width?: number;
  fontFamily?: string;
  fontStyle?: string;
  lineHeight?: number;
  draggable?: boolean;
};

export type WhiteboardObject = WhiteboardStroke | WhiteboardText;

export type WhiteboardPage = {
  id: string;
  objects: WhiteboardObject[];
  width?: number;
  height?: number;
  background?: string;
  dataUrl?: string;
  fabricJson?: unknown;
};

export type WhiteboardExportOptions = {
  scale?: number;
  background?: string;
};

const DEFAULT_WIDTH = 1000;
const DEFAULT_HEIGHT = 700;

export function getWhiteboardSize(page?: WhiteboardPage) {
  return {
    width: page?.width || DEFAULT_WIDTH,
    height: page?.height || DEFAULT_HEIGHT,
  };
}

function drawSmoothStroke(ctx: CanvasRenderingContext2D, points: number[]) {
  if (points.length < 2) return;
  if (points.length === 2) {
    ctx.beginPath();
    ctx.arc(points[0], points[1], 0.5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);

  for (let index = 2; index < points.length - 2; index += 2) {
    const currentX = points[index];
    const currentY = points[index + 1];
    const nextX = points[index + 2];
    const nextY = points[index + 3];
    const midX = (currentX + nextX) / 2;
    const midY = (currentY + nextY) / 2;
    ctx.quadraticCurveTo(currentX, currentY, midX, midY);
  }

  const lastX = points[points.length - 2];
  const lastY = points[points.length - 1];
  ctx.lineTo(lastX, lastY);
  ctx.stroke();
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: WhiteboardStroke) {
  const points = stroke.points;
  if (!points.length) return;

  ctx.save();
  ctx.globalCompositeOperation = stroke.composite || 'source-over';
  ctx.globalAlpha = Math.max(0, Math.min(1, stroke.opacity));
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = stroke.lineCap || 'round';
  ctx.lineJoin = stroke.lineJoin || 'round';
  ctx.shadowBlur = stroke.shadowBlur || 0;
  ctx.shadowColor = stroke.shadowColor || stroke.color;
  if (stroke.dash?.length) ctx.setLineDash(stroke.dash);

  if (points.length === 2) {
    ctx.beginPath();
    ctx.arc(points[0], points[1], Math.max(0.5, stroke.width / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  drawSmoothStroke(ctx, points);
  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, textObject: WhiteboardText) {
  ctx.save();
  ctx.translate(textObject.x, textObject.y);
  ctx.rotate(((textObject.rotation || 0) * Math.PI) / 180);
  ctx.scale(textObject.scaleX || 1, textObject.scaleY || 1);
  ctx.globalAlpha = Math.max(0, Math.min(1, textObject.opacity ?? 1));
  ctx.fillStyle = textObject.color;
  ctx.font = `${textObject.fontStyle || 'normal'} ${textObject.fontSize}px ${textObject.fontFamily || 'Plus Jakarta Sans, Inter, sans-serif'}`;
  ctx.textBaseline = 'top';

  const lineHeight = textObject.lineHeight || Math.round(textObject.fontSize * 1.35);
  const lines = (textObject.text || '').split('\n');
  lines.forEach((line, index) => {
    ctx.fillText(line, 0, index * lineHeight);
  });

  ctx.restore();
}

export function renderWhiteboardPageToCanvas(page: WhiteboardPage, options?: WhiteboardExportOptions) {
  const { width, height } = getWhiteboardSize(page);
  const scale = options?.scale || 2;
  const background = options?.background || page.background || '#ffffff';

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.scale(scale, scale);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  page.objects.forEach((object) => {
    if (object.kind === 'stroke') drawStroke(ctx, object);
    if (object.kind === 'text') drawText(ctx, object);
  });

  return canvas;
}

export function createWhiteboardCaptureContainer(pages: WhiteboardPage[], options?: WhiteboardExportOptions) {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.pointerEvents = 'none';
  container.style.background = '#fff';

  const pageNodes = pages.map((page) => {
    const { width, height } = getWhiteboardSize(page);
    const wrapper = document.createElement('div');
    wrapper.style.width = `${width}px`;
    wrapper.style.height = `${height}px`;
    wrapper.style.position = 'relative';
    wrapper.style.background = page.background || options?.background || '#fff';

    const canvas = renderWhiteboardPageToCanvas(page, options);
    wrapper.appendChild(canvas);
    container.appendChild(wrapper);

    return { wrapper, canvas };
  });

  document.body.appendChild(container);

  return {
    container,
    pageNodes,
    remove() {
      if (container.parentNode) container.parentNode.removeChild(container);
    },
  };
}