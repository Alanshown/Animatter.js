/**
 * Obstacle-aware grid path planning (A*). Pure numeric code: no DOM. Obstacles are rectangles
 * (for example DOM rects) rasterised onto a grid with an optional inflation margin, so the path
 * keeps the actor's body clear of the edges.
 */
export interface PlanRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlanGrid {
  cols: number;
  rows: number;
  cell: number;
  /** 1 = blocked. Row-major, length cols * rows. */
  blocked: Uint8Array;
}

export interface PlanPoint {
  x: number;
  y: number;
}

export function gridFromRects(
  rects: readonly PlanRect[],
  bounds: PlanRect,
  cell: number,
  margin = 0,
): PlanGrid {
  if (!(cell > 0) || !Number.isFinite(cell)) throw new RangeError("cell must be a positive number");
  if (!(margin >= 0) || !Number.isFinite(margin)) throw new RangeError("margin must be >= 0");
  if (!(bounds.width > 0 && bounds.height > 0)) throw new RangeError("bounds must have positive size");
  const cols = Math.max(1, Math.ceil(bounds.width / cell));
  const rows = Math.max(1, Math.ceil(bounds.height / cell));
  const blocked = new Uint8Array(cols * rows);
  for (const r of rects) {
    if (![r.x, r.y, r.width, r.height].every(Number.isFinite)) throw new RangeError("rect values must be finite");
    const x0 = r.x - margin - bounds.x;
    const y0 = r.y - margin - bounds.y;
    const x1 = r.x + r.width + margin - bounds.x;
    const y1 = r.y + r.height + margin - bounds.y;
    const c0 = Math.max(0, Math.floor(x0 / cell));
    const c1 = Math.min(cols - 1, Math.floor((x1 - 1e-9) / cell));
    const r0 = Math.max(0, Math.floor(y0 / cell));
    const r1 = Math.min(rows - 1, Math.floor((y1 - 1e-9) / cell));
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) blocked[row * cols + col] = 1;
  }
  return { cols, rows, cell, blocked };
}

export function cellOf(grid: PlanGrid, p: PlanPoint, bounds: PlanRect): { col: number; row: number } {
  return {
    col: Math.min(grid.cols - 1, Math.max(0, Math.floor((p.x - bounds.x) / grid.cell))),
    row: Math.min(grid.rows - 1, Math.max(0, Math.floor((p.y - bounds.y) / grid.cell))),
  };
}

/**
 * A* over 8-connected cells. Diagonal moves are not allowed through blocked corners, so the path
 * never squeezes between two touching obstacles. Returns cell-centre points in the grid's
 * coordinate frame (add bounds.x/bounds.y for page coordinates), or null when there is no route.
 * The start and goal cells are allowed to be blocked, which lets an actor stand on an edge.
 */
export function findPath(grid: PlanGrid, start: { col: number; row: number }, goal: { col: number; row: number }, maxExpansions = 20000): Array<{ col: number; row: number }> | null {
  const { cols, rows, blocked } = grid;
  const idx = (c: number, r: number) => r * cols + c;
  if (start.col === goal.col && start.row === goal.row) return [start];
  const n = cols * rows;
  const g = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const h = (c: number, r: number) => Math.hypot(c - goal.col, r - goal.row);
  const s = idx(start.col, start.row);
  const t = idx(goal.col, goal.row);
  g[s] = 0;
  const heap = new MinHeap();
  heap.push(s, h(start.col, start.row));
  let expansions = 0;
  while (heap.size()) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    if (cur === t) break;
    closed[cur] = 1;
    if (++expansions > maxExpansions) return null;
    const c = cur % cols;
    const r = (cur - c) / cols;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const ni = idx(nc, nr);
        if (closed[ni]) continue;
        const isGoal = ni === t;
        if (blocked[ni] && !isGoal && ni !== s) continue;
        const diagonal = dr !== 0 && dc !== 0;
        // No corner cutting: a diagonal step needs both orthogonal neighbours to be free.
        if (diagonal && (blocked[idx(c + dc, r)] || blocked[idx(c, r + dr)])) continue;
        const cost = g[cur]! + (diagonal ? Math.SQRT2 : 1);
        if (cost < g[ni]!) {
          g[ni] = cost;
          parent[ni] = cur;
          heap.push(ni, cost + h(nc, nr));
        }
      }
    }
  }
  if (parent[t] === -1 && t !== s) return null;
  const out: Array<{ col: number; row: number }> = [];
  for (let cur = t; cur !== -1; cur = parent[cur]!) {
    const c = cur % cols;
    out.push({ col: c, row: (cur - c) / cols });
    if (cur === s) break;
  }
  return out.reverse();
}

/** Converts a cell path to page points at cell centres, optionally simplified by dropping collinear points. */
export function pathToPoints(path: Array<{ col: number; row: number }>, grid: PlanGrid, bounds: PlanRect, simplify = true): PlanPoint[] {
  const pts = path.map((p) => ({ x: bounds.x + (p.col + 0.5) * grid.cell, y: bounds.y + (p.row + 0.5) * grid.cell }));
  if (!simplify || pts.length < 3) return pts;
  const out = [pts[0]!];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) > 1e-6) out.push(b);
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  size(): number {
    return this.keys.length;
  }
  push(v: number, k: number): void {
    this.keys.push(k);
    this.vals.push(v);
    let i = this.keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p]! <= this.keys[i]!) break;
      [this.keys[p], this.keys[i]] = [this.keys[i]!, this.keys[p]!];
      [this.vals[p], this.vals[i]] = [this.vals[i]!, this.vals[p]!];
      i = p;
    }
  }
  pop(): number {
    const top = this.vals[0]!;
    const lastK = this.keys.pop()!;
    const lastV = this.vals.pop()!;
    if (this.keys.length) {
      this.keys[0] = lastK;
      this.vals[0] = lastV;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.keys[l]! < this.keys[m]!) m = l;
        if (r < this.keys.length && this.keys[r]! < this.keys[m]!) m = r;
        if (m === i) break;
        [this.keys[m], this.keys[i]] = [this.keys[i]!, this.keys[m]!];
        [this.vals[m], this.vals[i]] = [this.vals[i]!, this.vals[m]!];
        i = m;
      }
    }
    return top;
  }
}
