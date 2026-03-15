// Custom node shape outline (normalized coordinates 0–1)
export type OutlineSegmentLine = {
  type: "line"
  points: [[number, number], [number, number]]
}
export type OutlineSegmentBezier = {
  type: "bezier"
  points: [[number, number], [number, number], [number, number], [number, number]]
}
export type OutlineSegment = OutlineSegmentLine | OutlineSegmentBezier
