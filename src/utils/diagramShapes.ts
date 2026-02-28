/**
 * Shared path and SVG path factories for diagram custom shapes.
 * Used by ModelDiagramCanvas and useNotationDiagram so that canvas rendering,
 * outline (arrow attachment) and SVG export use the same geometry.
 */
import { ShapeFactories } from "@ngroznykh/papirus";

export type DiagramShapeId =
  | "beveled-rectangle"
  | "trapezoid"
  | "slanted-rectangle"
  | "sticky-note";

export interface DiagramShapeFactory {
  path: (width: number, height: number) => Path2D;
  svgPath: (width: number, height: number) => string;
}

function beveledRectanglePath(width: number, height: number): Path2D {
  const path = new Path2D();
  const cut = Math.min(width, height) * 0.16;
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

function beveledRectangleSvgPath(w: number, h: number): string {
  const cut = Math.min(w, h) * 0.16;
  return `M ${cut} 0 L ${w - cut} 0 L ${w} ${cut} L ${w} ${h - cut} L ${w - cut} ${h} L ${cut} ${h} L 0 ${h - cut} L 0 ${cut} Z`;
}

function trapezoidPath(width: number, height: number): Path2D {
  const path = new Path2D();
  const topInset = width * 0.18;
  path.moveTo(topInset, 0);
  path.lineTo(width - topInset, 0);
  path.lineTo(width, height);
  path.lineTo(0, height);
  path.closePath();
  return path;
}

function trapezoidSvgPath(w: number, h: number): string {
  const topInset = w * 0.18;
  return `M ${topInset} 0 L ${w - topInset} 0 L ${w} ${h} L 0 ${h} Z`;
}

function stickyNotePath(width: number, height: number): Path2D {
  const path = new Path2D();
  const cut = Math.max(10, Math.min(width, height) * 0.2);
  path.moveTo(0, 0);
  path.lineTo(width - cut, 0);
  path.lineTo(width, cut);
  path.lineTo(width, height);
  path.lineTo(0, height);
  path.closePath();
  return path;
}

function stickyNoteSvgPath(w: number, h: number): string {
  const cut = Math.max(10, Math.min(w, h) * 0.2);
  return `M 0 0 L ${w - cut} 0 L ${w} ${cut} L ${w} ${h} L 0 ${h} Z`;
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
    path: (w, h) => ShapeFactories.parallelogram(w, h),
    svgPath: (w, h) => ShapeFactories.svg.parallelogram(w, h),
  },
  "sticky-note": {
    path: stickyNotePath,
    svgPath: stickyNoteSvgPath,
  },
};
