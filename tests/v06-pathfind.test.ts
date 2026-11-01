import { test } from "node:test";
import assert from "node:assert/strict";
import { gridFromRects, findPath, pathToPoints, cellOf } from "../packages/core/src/actor/pathfind.js";

const bounds = { x: 0, y: 0, width: 400, height: 300 };

test("grid rasterises rectangles with a margin and clips to bounds", () => {
  const grid = gridFromRects([{ x: 100, y: 100, width: 40, height: 40 }], bounds, 10, 5);
  assert.equal(grid.cols, 40);
  assert.equal(grid.rows, 30);
  assert.equal(grid.blocked[10 * 40 + 10], 1, "inside the rect");
  assert.equal(grid.blocked[9 * 40 + 9], 1, "inside the margin");
  assert.equal(grid.blocked[0], 0, "far away is free");
  assert.throws(() => gridFromRects([], bounds, 0), RangeError);
  assert.throws(() => gridFromRects([{ x: Number.NaN, y: 0, width: 1, height: 1 }], bounds, 10), RangeError);
});

test("path goes around a wall instead of through it", () => {
  // A vertical wall from the top with a gap at the bottom.
  const grid = gridFromRects([{ x: 180, y: 0, width: 20, height: 240 }], bounds, 10, 0);
  const start = cellOf(grid, { x: 20, y: 40 }, bounds);
  const goal = cellOf(grid, { x: 380, y: 40 }, bounds);
  const path = findPath(grid, start, goal);
  assert.ok(path, "a route exists through the gap");
  assert.ok(path.every((p) => grid.blocked[p.row * grid.cols + p.col] === 0), "no cell on the path is blocked");
  assert.ok(path.some((p) => p.row >= 24), "the route dips under the wall");
  const pts = pathToPoints(path, grid, bounds);
  assert.deepEqual(pts[0], { x: start.col * 10 + 5, y: start.row * 10 + 5 });
});

test("no route returns null when the goal is sealed off", () => {
  const ring = [
    { x: 150, y: 110, width: 100, height: 10 },
    { x: 150, y: 180, width: 100, height: 10 },
    { x: 150, y: 110, width: 10, height: 80 },
    { x: 240, y: 110, width: 10, height: 80 },
  ];
  const grid = gridFromRects(ring, bounds, 10, 0);
  const path = findPath(grid, cellOf(grid, { x: 20, y: 20 }, bounds), cellOf(grid, { x: 200, y: 150 }, bounds));
  assert.equal(path, null);
});

test("diagonal moves never cut a corner between two blocked cells", () => {
  // Two blocks touching at a corner: the diagonal gap between them must not be used.
  const grid = gridFromRects(
    [
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 10, y: 10, width: 10, height: 10 },
    ],
    { x: 0, y: 0, width: 30, height: 30 },
    10,
    0,
  );
  const path = findPath(grid, { col: 0, row: 1 }, { col: 1, row: 0 }, 1000);
  // From (0,1) to (1,0) the direct diagonal crosses the touching corner, so the route must be longer.
  assert.ok(path && path.length > 2, `path ${JSON.stringify(path)}`);
});

test("start equal to goal returns the single cell, and expansion budget stops long searches", () => {
  const grid = gridFromRects([], bounds, 10, 0);
  assert.deepEqual(findPath(grid, { col: 3, row: 3 }, { col: 3, row: 3 }), [{ col: 3, row: 3 }]);
  assert.equal(findPath(grid, { col: 0, row: 0 }, { col: 39, row: 29 }, 3), null);
});

test("collinear points are dropped when simplifying a path", () => {
  const grid = gridFromRects([], bounds, 10, 0);
  const path = [0, 1, 2, 3].map((c) => ({ col: c, row: 0 }));
  assert.equal(pathToPoints(path, grid, bounds, true).length, 2);
  assert.equal(pathToPoints(path, grid, bounds, false).length, 4);
});
