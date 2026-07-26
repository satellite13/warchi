/**
 * Shared path and SVG path factories for diagram custom shapes.
 * Used by ModelDiagramCanvas and useNotationDiagram so that canvas rendering,
 * outline (arrow attachment) and SVG export use the same geometry.
 */

export type DiagramShapeId =
  | "beveled-rectangle"
  | "trapezoid"
  | "slanted-rectangle"
  | "sticky-note"
  | "folder-tab";

export const DEFAULT_CORNER_CUT_PX = 12;
export const STICKY_NOTE_CORNER_CUT_PX = 16;
/** Fixed horizontal inset/skew for trapezoid and parallelogram (keeps side angle on width resize). */
export const FIXED_SIDE_SLANT_PX = 24;

export function clampCornerCut(cutPx: number, width: number, height: number): number {
  const cut = Number.isFinite(cutPx) && cutPx > 0 ? cutPx : 0;
  return Math.min(cut, width / 2, height / 2);
}

/** Clamp slant inset so top/bottom edges stay non-degenerate. */
export function clampSideSlant(slantPx: number, width: number): number {
  const slant = Number.isFinite(slantPx) && slantPx > 0 ? slantPx : 0;
  return Math.min(slant, width / 2);
}

export interface DiagramShapeFactory {
  path: (width: number, height: number, cutPx?: number) => Path2D;
  svgPath: (width: number, height: number, cutPx?: number) => string;
}

function resolveBeveledCut(width: number, height: number, cutPx?: number): number {
  const raw = cutPx ?? DEFAULT_CORNER_CUT_PX;
  return clampCornerCut(raw, width, height);
}

function beveledRectanglePath(width: number, height: number, cutPx?: number): Path2D {
  const path = new Path2D();
  const cut = resolveBeveledCut(width, height, cutPx);
  path.moveTo(cut, 0);
  path.lineTo(width - cut, 0);
  path.lineTo(width, cut);
  path.lineTo(width, height - cut);
  path.lineTo(width - cut, height);
  path.lineTo(cut, height);
  path.lineTo(0, height - cut);
  path.lineTo(0, cut);
  path.closePath();
  return path;
}

function beveledRectangleSvgPath(w: number, h: number, cutPx?: number): string {
  const cut = resolveBeveledCut(w, h, cutPx);
  return `M ${cut} 0 L ${w - cut} 0 L ${w} ${cut} L ${w} ${h - cut} L ${w - cut} ${h} L ${cut} ${h} L 0 ${h - cut} L 0 ${cut} Z`;
}

function trapezoidPath(width: number, height: number, _cutPx?: number): Path2D {
  const path = new Path2D();
  const topInset = clampSideSlant(FIXED_SIDE_SLANT_PX, width);
  path.moveTo(topInset, 0);
  path.lineTo(width - topInset, 0);
  path.lineTo(width, height);
  path.lineTo(0, height);
  path.closePath();
  return path;
}

function trapezoidSvgPath(w: number, h: number, _cutPx?: number): string {
  const topInset = clampSideSlant(FIXED_SIDE_SLANT_PX, w);
  return `M ${topInset} 0 L ${w - topInset} 0 L ${w} ${h} L 0 ${h} Z`;
}

function parallelogramPath(width: number, height: number, _cutPx?: number): Path2D {
  const path = new Path2D();
  const skew = clampSideSlant(FIXED_SIDE_SLANT_PX, width);
  path.moveTo(skew, 0);
  path.lineTo(width, 0);
  path.lineTo(width - skew, height);
  path.lineTo(0, height);
  path.closePath();
  return path;
}

function parallelogramSvgPath(w: number, h: number, _cutPx?: number): string {
  const skew = clampSideSlant(FIXED_SIDE_SLANT_PX, w);
  return `M ${skew} 0 L ${w} 0 L ${w - skew} ${h} L 0 ${h} Z`;
}

function stickyNotePath(width: number, height: number, _cutPx?: number): Path2D {
  const path = new Path2D();
  const cut = clampCornerCut(STICKY_NOTE_CORNER_CUT_PX, width, height);
  path.moveTo(0, 0);
  path.lineTo(width - cut, 0);
  path.lineTo(width, cut);
  path.lineTo(width, height);
  path.lineTo(0, height);
  path.closePath();
  return path;
}

function stickyNoteSvgPath(w: number, h: number, _cutPx?: number): string {
  const cut = clampCornerCut(STICKY_NOTE_CORNER_CUT_PX, w, h);
  return `M 0 0 L ${w - cut} 0 L ${w} ${cut} L ${w} ${h} L 0 ${h} Z`;
}

function folderTabPath(width: number, height: number, _cutPx?: number): Path2D {
  const path = new Path2D();
  const tabHeight = Math.max(8, Math.min(height * 0.18, 16));
  const tabWidth = Math.max(34, Math.min(width * 0.24, width - 20));
  const rightSlope = Math.max(5, Math.min(width * 0.03, 8));
  path.moveTo(0, 0);
  path.lineTo(tabWidth, 0);
  path.lineTo(tabWidth + rightSlope, tabHeight);
  path.lineTo(width, tabHeight);
  path.lineTo(width, height);
  path.lineTo(0, height);
  path.closePath();
  return path;
}

function folderTabSvgPath(w: number, h: number, _cutPx?: number): string {
  const tabHeight = Math.max(8, Math.min(h * 0.18, 16));
  const tabWidth = Math.max(34, Math.min(w * 0.24, w - 20));
  const rightSlope = Math.max(5, Math.min(w * 0.03, 8));
  return `M 0 0 L ${tabWidth} 0 L ${tabWidth + rightSlope} ${tabHeight} L ${w} ${tabHeight} L ${w} ${h} L 0 ${h} Z`;
}

export const diagramShapeFactories: Record<
  DiagramShapeId,
  DiagramShapeFactory
> = {
  "beveled-rectangle": {
    path: beveledRectanglePath,
    svgPath: beveledRectangleSvgPath,
  },
  trapezoid: {
    path: trapezoidPath,
    svgPath: trapezoidSvgPath,
  },
  "slanted-rectangle": {
    path: parallelogramPath,
    svgPath: parallelogramSvgPath,
  },
  "sticky-note": {
    path: stickyNotePath,
    svgPath: stickyNoteSvgPath,
  },
  "folder-tab": {
    path: folderTabPath,
    svgPath: folderTabSvgPath,
  },
};
