import { useState, useEffect, useRef } from "react";
import { RotateCcw, RotateCw, Magnet, Hand, Info, X, ArrowLeft, Plus, Trash2, Pencil, Eraser } from "lucide-react";
import XenoglyphApp, { XENOGLYPH_SIGNALS } from "./Xenoglyph.jsx";

const SIZE = 8;

function clone(s) {
  return JSON.parse(JSON.stringify(s));
}
function key(x, y) {
  return x + "," + y;
}
function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
function blankLevel() {
  return { id: null, name: "New level", hint: "", date: "", units: [], enemies: [], buildings: [], walls: [], water: [], conveyors: [] };
}
function isWall(state, x, y) {
  return state.walls.some((w) => w.x === x && w.y === y);
}
function isWater(state, x, y) {
  return (state.water || []).some((w) => w.x === x && w.y === y);
}

function occupiedSet(state, excludeUnitId) {
  const set = new Set();
  state.walls.forEach((w) => set.add(key(w.x, w.y)));
  (state.water || []).forEach((w) => set.add(key(w.x, w.y)));
  state.units.forEach((u) => {
    if (u.alive && u.onBoard && u.id !== excludeUnitId) set.add(key(u.x, u.y));
  });
  state.enemies.forEach((e) => {
    if (e.alive) set.add(key(e.x, e.y));
  });
  state.buildings.forEach((b) => {
    if (b.alive) set.add(key(b.x, b.y));
  });
  return set;
}

function emptyTiles(state, excludeUnitId) {
  const occ = occupiedSet(state, excludeUnitId);
  const out = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!occ.has(key(x, y))) out.push({ x, y });
    }
  }
  return out;
}

function threatRay(state, enemy) {
  const tiles = [];
  let x = enemy.x;
  let y = enemy.y;
  let hit = null;
  // Enemies have unlimited range — the ray only ever stops at the board edge
  // or something in its way, so this just walks tile-by-tile until then.
  while (true) {
    x += enemy.dir.dx;
    y += enemy.dir.dy;
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) break;
    tiles.push({ x, y });
    if (isWall(state, x, y)) {
      hit = { type: "wall" };
      break;
    }
    const u = state.units.find((u) => u.alive && u.onBoard && u.x === x && u.y === y);
    if (u) {
      hit = { type: "unit", obj: u };
      break;
    }
    const e2 = state.enemies.find((e) => e.id !== enemy.id && e.alive && e.x === x && e.y === y);
    if (e2) {
      hit = { type: "enemy", obj: e2 };
      break;
    }
    const b = state.buildings.find((b) => b.alive && b.x === x && b.y === y);
    if (b) {
      hit = { type: "building", obj: b };
      break;
    }
  }
  return { tiles, hit };
}

function resolvePull(state, puller) {
  const dirs = [
    [0, -1],
    [0, 1],
    [1, 0],
    [-1, 0],
  ];
  for (const [dx, dy] of dirs) {
    let x = puller.x + dx;
    let y = puller.y + dy;
    let farthest = null;
    // Water doesn't block line of sight for a pull, same as it doesn't for
    // gunfire — a puller can spot and grab an enemy on the far side of it.
    while (x >= 0 && x < SIZE && y >= 0 && y < SIZE) {
      if (isWall(state, x, y)) break;
      const b = state.buildings.find((b) => b.alive && b.x === x && b.y === y);
      const u = state.units.find((u) => u.alive && u.onBoard && u.x === x && u.y === y);
      if (b || u) break;
      const e = state.enemies.find((e) => e.alive && e.x === x && e.y === y);
      if (e) farthest = e;
      x += dx;
      y += dy;
    }
    if (!farthest) continue;
    let cx = farthest.x;
    let cy = farthest.y;
    let collideWith = null;
    while (true) {
      cx -= dx;
      cy -= dy;
      if (cx === puller.x && cy === puller.y) {
        cx += dx;
        cy += dy;
        break;
      }
      const other = state.enemies.find((e) => e.id !== farthest.id && e.alive && e.x === cx && e.y === cy);
      if (other) {
        collideWith = other;
        break;
      }
    }
    // The enemy flies over water fine, but can't come to rest on it — if the
    // tile it would land on (right next to the puller) is water, the pull
    // just doesn't happen in this direction, same as a push with nowhere to
    // land. Other directions can still work.
    if (!collideWith && isWater(state, cx, cy)) continue;
    return { dir: [dx, dy], enemy: farthest, landX: cx, landY: cy, collideWith };
  }
  return null;
}

function findPushTarget(state, unit) {
  return (
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]
      .map(([dx, dy]) => ({ dx, dy, e: state.enemies.find((e) => e.alive && e.x === unit.x + dx && e.y === unit.y + dy) }))
      .find((a) => a.e) || null
  );
}

function movePreviewTiles(state) {
  const out = [];
  for (const unit of state.units) {
    if (!unit.alive || !unit.onBoard) continue;
    if (unit.ability === "push") {
      const adj = findPushTarget(state, unit);
      if (adj) {
        const destX = adj.e.x + adj.dx;
        const destY = adj.e.y + adj.dy;
        if (destX >= 0 && destX < SIZE && destY >= 0 && destY < SIZE) {
          const colliding = state.enemies.find((e) => e.id !== adj.e.id && e.alive && e.x === destX && e.y === destY);
          const blocked = !colliding && occupiedSet(state, null).has(key(destX, destY));
          out.push({ x: destX, y: destY, kind: colliding ? "collision" : blocked ? "blocked" : "land", unitId: unit.id });
        }
      }
    } else if (unit.ability === "pull") {
      const result = resolvePull(state, unit);
      if (result) out.push({ x: result.landX, y: result.landY, kind: result.collideWith ? "collision" : "land", unitId: unit.id });
    }
  }
  return out;
}

function actionPreviewLines(state) {
  const lines = [];
  for (const unit of state.units) {
    if (!unit.alive || !unit.onBoard) continue;
    if (unit.ability === "push") {
      const adj = findPushTarget(state, unit);
      if (adj) lines.push({ fromX: unit.x, fromY: unit.y, toX: adj.e.x, toY: adj.e.y, type: "push" });
    } else if (unit.ability === "pull") {
      const result = resolvePull(state, unit);
      if (result) lines.push({ fromX: unit.x, fromY: unit.y, toX: result.enemy.x, toY: result.enemy.y, type: "pull" });
    } else if (unit.ability === "rotate" || unit.ability === "rotate_ccw") {
      const adj = findPushTarget(state, unit);
      if (adj)
        lines.push({
          fromX: unit.x,
          fromY: unit.y,
          toX: adj.e.x,
          toY: adj.e.y,
          type: "rotate",
          spin: unit.ability === "rotate" ? "cw" : "ccw",
        });
    }
  }
  return lines;
}

function applyConveyorPhase(state) {
  const next = clone(state);
  for (const conv of next.conveyors) {
    const u = next.units.find((u) => u.alive && u.onBoard && u.x === conv.x && u.y === conv.y);
    const e = next.enemies.find((e) => e.alive && e.x === conv.x && e.y === conv.y);
    const occupant = u || e;
    if (!occupant) continue;
    const destX = conv.x + conv.dir.dx;
    const destY = conv.y + conv.dir.dy;
    if (destX < 0 || destX >= SIZE || destY < 0 || destY >= SIZE) continue;
    const excludeId = u ? u.id : null;
    if (!occupiedSet(next, excludeId).has(key(destX, destY))) {
      occupant.x = destX;
      occupant.y = destY;
    }
  }
  return next;
}

function conveyorContinue(state, x, y) {
  const conv = state.conveyors.find((c) => c.x === x && c.y === y);
  if (!conv) return { x, y };
  const nx = x + conv.dir.dx;
  const ny = y + conv.dir.dy;
  if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) return { x, y };
  if (occupiedSet(state, null).has(key(nx, ny))) return { x, y };
  return { x: nx, y: ny };
}

function simulatePhaseAPreview(state) {
  const cur = applyConveyorPhase(state);
  for (const unit of sortedByPlacement(cur.units)) {
    if (!unit.onBoard || !unit.alive) continue;
    if (unit.ability === "push") {
      const adj = findPushTarget(cur, unit);
      if (!adj) continue;
      const enemy = adj.e;
      const destX = enemy.x + adj.dx;
      const destY = enemy.y + adj.dy;
      if (destX < 0 || destX >= SIZE || destY < 0 || destY >= SIZE) continue;
      const colliding = cur.enemies.find((e) => e.id !== enemy.id && e.alive && e.x === destX && e.y === destY);
      if (colliding) {
        enemy.alive = false;
        colliding.alive = false;
        enemy.x = destX;
        enemy.y = destY;
      } else if (!occupiedSet(cur, null).has(key(destX, destY))) {
        const settled = conveyorContinue(cur, destX, destY);
        enemy.x = settled.x;
        enemy.y = settled.y;
      }
    } else if (unit.ability === "pull") {
      const result = resolvePull(cur, unit);
      if (!result) continue;
      const enemy = result.enemy;
      if (result.collideWith) {
        enemy.x = result.landX;
        enemy.y = result.landY;
        enemy.alive = false;
        result.collideWith.alive = false;
      } else {
        const settled = conveyorContinue(cur, result.landX, result.landY);
        enemy.x = settled.x;
        enemy.y = settled.y;
      }
    } else if (unit.ability === "rotate" || unit.ability === "rotate_ccw") {
      const adj = findPushTarget(cur, unit);
      if (!adj) continue;
      const enemy = adj.e;
      enemy.dir =
        unit.ability === "rotate"
          ? { dx: -enemy.dir.dy, dy: enemy.dir.dx }
          : { dx: enemy.dir.dy, dy: -enemy.dir.dx };
    }
  }
  return cur;
}

function computeResolution(initial) {
  const logs = [];
  const impacts = [];
  const actors = [];
  const snapshots = [clone(initial)];
  const cur = clone(initial);

  for (const conv of cur.conveyors) {
    const u = cur.units.find((u) => u.alive && u.onBoard && u.x === conv.x && u.y === conv.y);
    const e = cur.enemies.find((e) => e.alive && e.x === conv.x && e.y === conv.y);
    const occupant = u || e;
    if (!occupant) continue;
    const destX = conv.x + conv.dir.dx;
    const destY = conv.y + conv.dir.dy;
    if (destX < 0 || destX >= SIZE || destY < 0 || destY >= SIZE) continue;
    const excludeId = u ? u.id : null;
    if (!occupiedSet(cur, excludeId).has(key(destX, destY))) {
      occupant.x = destX;
      occupant.y = destY;
      logs.push(`Conveyor carries ${occupant.name} along.`);
      impacts.push({ x: destX, y: destY, kind: "move" });
      actors.push(null);
      snapshots.push(clone(cur));
    }
  }

  for (const unit of sortedByPlacement(cur.units)) {
    if (!unit.onBoard || !unit.alive) continue;
    if (unit.ability === "push") {
      const adj = findPushTarget(cur, unit);
      if (adj) {
        const enemy = adj.e;
        const destX = enemy.x + adj.dx;
        const destY = enemy.y + adj.dy;
        const outOfBounds = destX < 0 || destX >= SIZE || destY < 0 || destY >= SIZE;
        if (outOfBounds) {
          logs.push(`${unit.name} tries to push ${enemy.name}, but it has nowhere to go.`);
          impacts.push(null);
        } else {
          const colliding = cur.enemies.find((e) => e.id !== enemy.id && e.alive && e.x === destX && e.y === destY);
          if (colliding) {
            enemy.alive = false;
            colliding.alive = false;
            enemy.x = destX;
            enemy.y = destY;
            logs.push(`${unit.name} pushes ${enemy.name} straight into ${colliding.name} — the collision destroys them both.`);
            impacts.push({ x: destX, y: destY, kind: "kill" });
          } else if (occupiedSet(cur, null).has(key(destX, destY))) {
            logs.push(`${unit.name} tries to push ${enemy.name}, but it has nowhere to go.`);
            impacts.push(null);
          } else {
            const settled = conveyorContinue(cur, destX, destY);
            enemy.x = settled.x;
            enemy.y = settled.y;
            logs.push(`${unit.name} pushes ${enemy.name} back.`);
            impacts.push({ x: settled.x, y: settled.y, kind: "move" });
          }
        }
      } else {
        logs.push(`${unit.name} holds position — nothing in reach.`);
        impacts.push(null);
      }
    } else if (unit.ability === "pull") {
      const result = resolvePull(cur, unit);
      if (result) {
        const enemy = result.enemy;
        if (result.collideWith) {
          enemy.x = result.landX;
          enemy.y = result.landY;
          enemy.alive = false;
          result.collideWith.alive = false;
          logs.push(`${unit.name} yanks ${enemy.name} into ${result.collideWith.name} — the collision destroys them both.`);
          impacts.push({ x: result.landX, y: result.landY, kind: "kill" });
        } else {
          const settled = conveyorContinue(cur, result.landX, result.landY);
          enemy.x = settled.x;
          enemy.y = settled.y;
          logs.push(`${unit.name} pulls ${enemy.name} in.`);
          impacts.push({ x: settled.x, y: settled.y, kind: "move" });
        }
      } else {
        logs.push(`${unit.name} finds nothing to pull.`);
        impacts.push(null);
      }
    } else if (unit.ability === "block") {
      // Blocking is passive — it just occupies its tile and absorbs shots
      // whenever they come, so it doesn't take an active "turn" here.
      continue;
    } else if (unit.ability === "rotate" || unit.ability === "rotate_ccw") {
      const adj = findPushTarget(cur, unit);
      if (adj) {
        const enemy = adj.e;
        enemy.dir =
          unit.ability === "rotate"
            ? { dx: -enemy.dir.dy, dy: enemy.dir.dx }
            : { dx: enemy.dir.dy, dy: -enemy.dir.dx };
        logs.push(`${unit.name} rotates ${enemy.name}.`);
        impacts.push({ x: enemy.x, y: enemy.y, kind: "rotate", spin: unit.ability === "rotate" ? "cw" : "ccw" });
      } else {
        logs.push(`${unit.name} finds nothing to rotate.`);
        impacts.push(null);
      }
    }
    actors.push({ type: "unit", id: unit.id });
    snapshots.push(clone(cur));
  }

  for (const enemy of cur.enemies) {
    if (!enemy.alive) continue;
    const { hit } = threatRay(cur, enemy);
    if (!hit) {
      logs.push(`${enemy.name} finds nothing in its path.`);
      impacts.push(null);
    } else if (hit.type === "wall") {
      logs.push(`${enemy.name}'s attack is absorbed by a wall.`);
      impacts.push(null);
    } else if (hit.type === "unit" && hit.obj.ability === "block") {
      logs.push(`${enemy.name}'s attack is absorbed by ${hit.obj.name}.`);
      impacts.push(null);
    } else {
      logs.push(`${enemy.name} destroys ${hit.obj.name}.`);
      impacts.push({ x: hit.obj.x, y: hit.obj.y, kind: "kill" });
      hit.obj.alive = false;
    }
    actors.push({ type: "enemy", id: enemy.id });
    snapshots.push(clone(cur));
  }

  const outcome = cur.buildings.every((b) => b.alive) ? "success" : "fail";

  return { snapshots, logs, impacts, actors, outcome };
}

const BUILT_IN_LEVELS = [
  {
    id: "standoff",
    name: "Standoff",
    hint: "A wall closes off the obvious pull approach here. Go around.",
    date: "2026-08-19",
    units: [
      { id: "puller", name: "Puller", ability: "pull" },
      { id: "pusher", name: "Pusher", ability: "push" },
    ],
    enemies: [
      { id: "ea", name: "Enemy A", x: 2, y: 3, dir: { dx: -1, dy: 0 }, range: 2 },
      { id: "eb", name: "Enemy B", x: 5, y: 3, dir: { dx: 1, dy: 0 }, range: 3 },
      { id: "ec", name: "Enemy C", x: 4, y: 6, dir: { dx: 0, dy: -1 }, range: 6 },
      { id: "ed", name: "Enemy D", x: 1, y: 6, dir: { dx: 0, dy: -1 }, range: 2 },
    ],
    buildings: [
      { id: "b1", name: "Structure A", x: 0, y: 3 },
      { id: "b2", name: "Structure B", x: 7, y: 3 },
      { id: "b3", name: "Structure C", x: 4, y: 0 },
      { id: "b4", name: "Structure D", x: 1, y: 4 },
    ],
    walls: [{ x: 1, y: 2 }],
    conveyors: [],
  },
  {
    id: "annelo",
    name: "Annelo",
    hint: "",
    date: "2026-08-20",
    units: [
      { id: "u-mt0m8dww-0tc4v", name: "Pusher", ability: "push" },
      { id: "u-mt0m8e9w-g2wjy", name: "Pusher 2", ability: "push" },
      { id: "u-mt0m8etc-r7i9c", name: "Rotator", ability: "rotate" },
    ],
    enemies: [
      { id: "e-mt0m814c-jwsxj", name: "Enemy 1", x: 2, y: 4, dir: { dx: 0, dy: -1 }, range: 3 },
      { id: "e-mt0m82g0-fa5oq", name: "Enemy 2", x: 5, y: 5, dir: { dx: 0, dy: 1 }, range: 2 },
      { id: "e-mt0m87s3-9m95m", name: "Enemy 3", x: 3, y: 7, dir: { dx: 0, dy: -1 }, range: 3 },
      { id: "e-mt0m88tl-ndxmg", name: "Enemy 4", x: 4, y: 7, dir: { dx: 0, dy: -1 }, range: 3 },
    ],
    buildings: [
      { id: "b-mt0m7sed-u2exl", name: "Structure 1", x: 2, y: 1 },
      { id: "b-mt0m7u24-be7a6", name: "Structure 2", x: 1, y: 5 },
      { id: "b-mt0m7uis-esfzm", name: "Structure 3", x: 6, y: 5 },
      { id: "b-mt0m7v5g-r7src", name: "Structure 4", x: 4, y: 4 },
      { id: "b-mt0m7vdu-hp50b", name: "Structure 5", x: 3, y: 4 },
      { id: "b-mt0m7x12-rwide", name: "Structure 6", x: 5, y: 7 },
    ],
    walls: [
      { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }, { x: 0, y: 4 }, { x: 0, y: 5 }, { x: 0, y: 6 }, { x: 0, y: 7 },
      { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }, { x: 1, y: 4 },
      { x: 2, y: 0 },
      { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 3, y: 3 },
      { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 4, y: 2 }, { x: 4, y: 3 },
      { x: 5, y: 0 }, { x: 5, y: 1 }, { x: 5, y: 2 }, { x: 5, y: 3 }, { x: 5, y: 4 },
      { x: 6, y: 0 }, { x: 6, y: 1 }, { x: 6, y: 2 }, { x: 6, y: 3 }, { x: 6, y: 4 },
      { x: 7, y: 0 }, { x: 7, y: 1 }, { x: 7, y: 2 }, { x: 7, y: 3 }, { x: 7, y: 4 }, { x: 7, y: 5 }, { x: 7, y: 6 }, { x: 7, y: 7 },
    ],
    conveyors: [],
  },
  {
    id: "hbd-j",
    name: "HBD J",
    hint: "",
    date: "2026-08-21",
    units: [
      { id: "u-mt1tidi4-2gfxf", name: "Rotator", ability: "rotate" },
      { id: "u-mt1tidyc-1hysi", name: "Rotator", ability: "rotate" },
      { id: "u-mt1tifie-qzgmv", name: "Rotator", ability: "rotate_ccw" },
    ],
    enemies: [
      { id: "e-mt1tnvut-3mmad", name: "Enemy 1", x: 1, y: 6, dir: { dx: 0, dy: -1 }, range: 2 },
      { id: "e-mt1tny1z-qhnse", name: "Enemy 2", x: 5, y: 5, dir: { dx: -1, dy: 0 }, range: 5 },
      { id: "e-mt1to426-1kafd", name: "Enemy 3", x: 3, y: 6, dir: { dx: 0, dy: -1 }, range: 6 },
      { id: "e-mt1to5oj-qsn89", name: "Enemy 4", x: 3, y: 3, dir: { dx: 1, dy: 0 }, range: 4 },
      { id: "e-mt1toje1-5td78", name: "Enemy 5", x: 4, y: 0, dir: { dx: -1, dy: 0 }, range: 4 },
    ],
    buildings: [
      { id: "b-mt1tnj6t-tspoa", name: "Structure 1", x: 1, y: 0 },
      { id: "b-mt1tnjhx-yzww5", name: "Structure 2", x: 3, y: 0 },
      { id: "b-mt1tnjx7-gm5oc", name: "Structure 4", x: 6, y: 0 },
      { id: "b-mt1tnmvo-qhve2", name: "Structure 5", x: 1, y: 3 },
      { id: "b-mt1tnpeu-ji94x", name: "Structure 6", x: 5, y: 3 },
      { id: "b-mt1tns6w-f3ciu", name: "Structure 7", x: 1, y: 5 },
      { id: "b-mt1tohds-6b5fa", name: "Structure 8", x: 5, y: 0 },
    ],
    walls: [],
    conveyors: [],
  },
  {
    id: "chain-reaction",
    name: "Chain reaction",
    hint: "One push, one enemy takes out another.",
    units: [{ id: "pusher", name: "Pusher", ability: "push" }],
    enemies: [
      { id: "ea", name: "Enemy A", x: 2, y: 3, dir: { dx: -1, dy: 0 }, range: 2 },
      { id: "eb", name: "Enemy B", x: 3, y: 3, dir: { dx: 1, dy: 0 }, range: 3 },
    ],
    buildings: [
      { id: "b1", name: "Structure A", x: 0, y: 3 },
      { id: "b2", name: "Structure B", x: 6, y: 3 },
    ],
    walls: [],
    conveyors: [],
  },
  {
    id: "downtown",
    name: "Downtown",
    hint: "",
    date: "2026-08-22",
    units: [
      { id: "u-mt3djg4k-ysg9j", name: "Puller", ability: "pull" },
      { id: "u-mt3djgdc-yk7r9", name: "Blocker", ability: "block" },
      { id: "u-mt3dmz73-vgg3p", name: "Rotator", ability: "rotate" },
    ],
    enemies: [
      { id: "e-mt3disyr-u83a6", name: "Enemy 1", x: 0, y: 1, dir: { dx: 1, dy: 0 }, range: 7 },
      { id: "e-mt3diwet-l179n", name: "Enemy 3", x: 4, y: 5, dir: { dx: 1, dy: 0 }, range: 1 },
      { id: "e-mt3dixi7-7074z", name: "Enemy 4", x: 4, y: 6, dir: { dx: 1, dy: 0 }, range: 1 },
      { id: "e-mt3dj1b8-7g2lj", name: "Enemy 5", x: 2, y: 5, dir: { dx: 0, dy: -1 }, range: 5 },
      { id: "e-mt3dj99s-pqmh8", name: "Enemy 5", x: 4, y: 2, dir: { dx: -1, dy: 0 }, range: 4 },
      { id: "e-mt3dm8r9-gh4jb", name: "Enemy 6", x: 0, y: 3, dir: { dx: 0, dy: 1 }, range: 1 },
    ],
    buildings: [
      { id: "b-mt3dilxi-j7i4x", name: "Structure 1", x: 0, y: 0 },
      { id: "b-mt3dimhw-04bmq", name: "Structure 2", x: 2, y: 0 },
      { id: "b-mt3din1b-gist5", name: "Structure 3", x: 4, y: 0 },
      { id: "b-mt3dincg-uxfjr", name: "Structure 4", x: 4, y: 1 },
      { id: "b-mt3diock-9butp", name: "Structure 5", x: 6, y: 5 },
      { id: "b-mt3diohm-cfmdn", name: "Structure 6", x: 5, y: 5 },
      { id: "b-mt3diomc-z28ah", name: "Structure 7", x: 5, y: 6 },
      { id: "b-mt3diomv-ehg07", name: "Structure 8", x: 6, y: 6 },
      { id: "b-mt3dipzt-1hjh3", name: "Structure 9", x: 2, y: 7 },
      { id: "b-mt3diq4g-fu7v8", name: "Structure 10", x: 2, y: 6 },
      { id: "b-mt3diq95-8hpr9", name: "Structure 12", x: 1, y: 5 },
      { id: "b-mt3diqdt-11hsx", name: "Structure 14", x: 0, y: 4 },
      { id: "b-mt3dljcw-upy8b", name: "Structure 13", x: 0, y: 2 },
    ],
    walls: [
      { x: 5, y: 0 }, { x: 5, y: 1 }, { x: 5, y: 2 }, { x: 5, y: 3 }, { x: 5, y: 4 },
      { x: 6, y: 4 }, { x: 7, y: 4 }, { x: 7, y: 3 }, { x: 7, y: 2 }, { x: 7, y: 1 }, { x: 7, y: 0 },
      { x: 6, y: 0 }, { x: 6, y: 1 }, { x: 6, y: 2 }, { x: 6, y: 3 },
      { x: 7, y: 7 }, { x: 6, y: 7 }, { x: 5, y: 7 }, { x: 4, y: 7 }, { x: 3, y: 7 },
      { x: 1, y: 7 }, { x: 1, y: 6 }, { x: 0, y: 7 }, { x: 0, y: 6 }, { x: 0, y: 5 },
    ],
    conveyors: [],
  },
  {
    id: "thames",
    name: "Thames",
    hint: "",
    date: "2026-08-23",
    units: [
      { id: "u-mt3f89yj-1olaw", name: "Blocker", ability: "block" },
      { id: "u-mt3f8alo-sb7qu", name: "Puller", ability: "pull" },
      { id: "u-mt3f8zm4-v998l", name: "Pusher", ability: "push" },
    ],
    enemies: [
      { id: "e-mt3fn2yp-xr2i3", name: "Enemy 1", x: 5, y: 1, dir: { dx: -1, dy: 0 } },
      { id: "e-mt3fn60g-6y82p", name: "Enemy 2", x: 1, y: 2, dir: { dx: 0, dy: 1 } },
      { id: "e-mt3fn78f-psrri", name: "Enemy 3", x: 5, y: 3, dir: { dx: -1, dy: 0 } },
      { id: "e-mt3fn82z-mg83h", name: "Enemy 4", x: 0, y: 6, dir: { dx: 1, dy: 0 } },
    ],
    buildings: [
      { id: "b-mt3f7swm-jlvru", name: "Structure 1", x: 1, y: 1 },
      { id: "b-mt3f7tai-et3y4", name: "Structure 2", x: 1, y: 3 },
      { id: "b-mt3f7u1t-ycd6l", name: "Structure 3", x: 1, y: 4 },
      { id: "b-mt3fkuty-ai3nf", name: "Structure 4", x: 0, y: 3 },
      { id: "b-mt3fkv1u-5dfp7", name: "Structure 5", x: 0, y: 4 },
      { id: "b-mt3fmtlp-o4f99", name: "Structure 6", x: 1, y: 6 },
      { id: "b-mt3fnvc1-5nxth", name: "Structure 7", x: 5, y: 7 },
    ],
    walls: [
      { x: 6, y: 1 }, { x: 6, y: 3 }, { x: 6, y: 7 },
      { x: 6, y: 0 }, { x: 7, y: 0 }, { x: 7, y: 1 }, { x: 7, y: 2 }, { x: 7, y: 3 },
      { x: 7, y: 4 }, { x: 7, y: 5 }, { x: 7, y: 6 }, { x: 7, y: 7 }, { x: 6, y: 6 }, { x: 6, y: 4 },
    ],
    water: [
      { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }, { x: 2, y: 4 }, { x: 2, y: 5 }, { x: 2, y: 6 }, { x: 2, y: 7 },
      { x: 3, y: 7 }, { x: 3, y: 6 }, { x: 3, y: 5 }, { x: 3, y: 4 }, { x: 3, y: 3 }, { x: 3, y: 2 }, { x: 3, y: 0 }, { x: 3, y: 1 },
    ],
    conveyors: [],
  },
  {
    id: "kyoto",
    name: "Kyoto",
    hint: "",
    date: "2026-08-24",
    units: [
      { id: "u-mt5oes1a-ohzgh", name: "Rotator", ability: "rotate_ccw" },
      { id: "u-mt5ofofi-9as2j", name: "Puller", ability: "pull" },
      { id: "u-mt5ok9qx-42vvh", name: "Rotator", ability: "rotate" },
    ],
    enemies: [
      { id: "e-mt5oegtr-11ffo", name: "Enemy 1", x: 3, y: 7, dir: { dx: 0, dy: -1 } },
      { id: "e-mt5oeox1-mj3gm", name: "Enemy 3", x: 0, y: 7, dir: { dx: 0, dy: -1 } },
      { id: "e-mt5ogihj-4m4yp", name: "Enemy 4", x: 6, y: 1, dir: { dx: -1, dy: 0 } },
      { id: "e-mt5oi2bk-um6ju", name: "Enemy 4", x: 5, y: 6, dir: { dx: -1, dy: 0 } },
      { id: "e-mt5ojhzt-wzo85", name: "Enemy 5", x: 0, y: 0, dir: { dx: 0, dy: 1 } },
    ],
    buildings: [
      { id: "b-mt5oeawu-g2y00", name: "Structure 1", x: 3, y: 0 },
      { id: "b-mt5oeazt-a6cly", name: "Structure 2", x: 4, y: 0 },
      { id: "b-mt5oeb0q-n9i3l", name: "Structure 3", x: 4, y: 1 },
      { id: "b-mt5oeb85-ns4hy", name: "Structure 4", x: 3, y: 1 },
      { id: "b-mt5oendi-cgp5j", name: "Structure 5", x: 0, y: 3 },
      { id: "b-mt5oha8g-qhquv", name: "Structure 6", x: 1, y: 6 },
      { id: "b-mt5oi0nl-b7tly", name: "Structure 7", x: 5, y: 0 },
    ],
    walls: [
      { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 },
      { x: 6, y: 0 }, { x: 7, y: 0 }, { x: 7, y: 1 }, { x: 7, y: 2 },
      { x: 4, y: 7 },
    ],
    water: [
      { x: 0, y: 4 }, { x: 1, y: 4 }, { x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }, { x: 7, y: 4 },
      { x: 7, y: 5 }, { x: 6, y: 5 }, { x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }, { x: 2, y: 5 }, { x: 1, y: 5 }, { x: 0, y: 5 },
    ],
    conveyors: [],
  },
  {
    id: "ohio",
    name: "Ohio",
    hint: "",
    date: "2026-08-25",
    units: [
      { id: "u-mt717eqo-bm8gf", name: "Puller", ability: "pull" },
      { id: "u-mt717h13-53hlj", name: "Rotator", ability: "rotate_ccw" },
      { id: "u-mt719ef8-jeyv3", name: "Blocker", ability: "block" },
    ],
    enemies: [
      { id: "e-mt716h6d-e3hfu", name: "Enemy 1", x: 1, y: 4, dir: { dx: 0, dy: -1 } },
      { id: "e-mt716n8g-6eiah", name: "Enemy 3", x: 5, y: 5, dir: { dx: 0, dy: -1 } },
      { id: "e-mt7170k0-snzls", name: "Enemy 4", x: 1, y: 5, dir: { dx: 0, dy: 1 } },
      { id: "e-mt717bu1-tj5pt", name: "Enemy 4", x: 6, y: 4, dir: { dx: 0, dy: -1 } },
      { id: "e-mt7197aa-bo5wt", name: "Enemy 5", x: 3, y: 3, dir: { dx: 0, dy: -1 } },
      { id: "e-mt719935-e0k1p", name: "Enemy 6", x: 0, y: 2, dir: { dx: 1, dy: 0 } },
    ],
    buildings: [
      { id: "b-mt716y8o-7w7sh", name: "Structure 2", x: 5, y: 1 },
      { id: "b-mt717219-xlohn", name: "Structure 3", x: 1, y: 6 },
      { id: "b-mt717d66-ab9a4", name: "Structure 3", x: 6, y: 1 },
      { id: "b-mt717tfv-u8o23", name: "Structure 4", x: 0, y: 4 },
      { id: "b-mt718b31-u96wl", name: "Structure 5", x: 0, y: 1 },
      { id: "b-mt718b85-nx70z", name: "Structure 6", x: 1, y: 1 },
      { id: "b-mt718b9o-hnpvu", name: "Structure 7", x: 2, y: 1 },
      { id: "b-mt718bdu-14zhy", name: "Structure 8", x: 3, y: 1 },
      { id: "b-mt719adf-un67n", name: "Structure 9", x: 7, y: 2 },
    ],
    walls: [
      { x: 0, y: 0 }, { x: 1, y: 0 },
      { x: 7, y: 7 }, { x: 6, y: 7 }, { x: 5, y: 7 }, { x: 4, y: 7 }, { x: 3, y: 7 }, { x: 2, y: 7 }, { x: 1, y: 7 }, { x: 0, y: 7 },
      { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 }, { x: 6, y: 0 }, { x: 7, y: 0 },
      { x: 6, y: 5 }, { x: 6, y: 6 },
      { x: 4, y: 1 }, { x: 7, y: 1 },
    ],
    water: [
      { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 3 }, { x: 5, y: 4 }, { x: 4, y: 3 },
    ],
    conveyors: [],
  },
  {
    id: "new-level-draft-1",
    name: "Jetpack",
    hint: "",
    date: "2026-08-26",
    units: [
      { id: "u-mt7cb3cv-aqveg", name: "Pusher", ability: "push" },
    ],
    enemies: [
      { id: "e-mt7c9nas-cs0da", name: "Enemy 1", x: 0, y: 3, dir: { dx: 1, dy: 0 } },
      { id: "e-mt7c9qdg-ayua8", name: "Enemy 2", x: 4, y: 3, dir: { dx: 0, dy: 1 } },
      { id: "e-mt7cgzt2-lwogi", name: "Enemy 4", x: 4, y: 0, dir: { dx: -1, dy: 0 } },
      { id: "e-mt7ch3gh-60r84", name: "Enemy 4", x: 3, y: 6, dir: { dx: 0, dy: -1 } },
    ],
    buildings: [
      { id: "b-mt7ca2f9-m2mef", name: "Structure 1", x: 4, y: 7 },
      { id: "b-mt7cci45-nv2qb", name: "Structure 3", x: 7, y: 3 },
    ],
    walls: [{ x: 5, y: 0 }],
    water: [],
    conveyors: [],
  },
  {
    id: "tennessee",
    name: "Tennessee",
    hint: "",
    date: "2026-08-27",
    units: [
      { id: "u-mtajxmov-rqqnz", name: "Rotator", ability: "rotate_ccw" },
      { id: "u-mtajy1dy-81gd8", name: "Blocker", ability: "block" },
      { id: "u-mtajz5y6-6bf0e", name: "Puller", ability: "pull" },
    ],
    enemies: [
      { id: "e-mtajxdv3-cgg6u", name: "Enemy 1", x: 3, y: 3, dir: { dx: -1, dy: 0 } },
      { id: "e-mtajxfuu-kdic7", name: "Enemy 2", x: 4, y: 2, dir: { dx: 1, dy: 0 } },
      { id: "e-mtajxh8m-b6tvt", name: "Enemy 3", x: 4, y: 0, dir: { dx: -1, dy: 0 } },
      { id: "e-mtajxw5a-tvfnr", name: "Enemy 4", x: 2, y: 7, dir: { dx: 1, dy: 0 } },
      { id: "e-mtajzs9i-rq7l5", name: "Enemy 5", x: 6, y: 1, dir: { dx: 1, dy: 0 } },
      { id: "e-mtajzt87-eg4co", name: "Enemy 6", x: 6, y: 3, dir: { dx: 1, dy: 0 } },
    ],
    buildings: [
      { id: "b-mtajxioe-8nfc4", name: "Structure 1", x: 0, y: 3 },
      { id: "b-mtajxiz2-9bsbr", name: "Structure 2", x: 0, y: 4 },
      { id: "b-mtajxkqt-4crih", name: "Structure 3", x: 2, y: 0 },
      { id: "b-mtajy3vb-16yah", name: "Structure 4", x: 7, y: 2 },
      { id: "b-mtajy51q-i2s3b", name: "Structure 5", x: 7, y: 7 },
      { id: "b-mtajy74u-ahxyy", name: "Structure 7", x: 0, y: 7 },
      { id: "b-mtajz3r9-de9sb", name: "Structure 8", x: 7, y: 1 },
      { id: "b-mtajz411-wc3e0", name: "Structure 9", x: 7, y: 3 },
    ],
    walls: [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
      { x: 3, y: 2 },
      { x: 4, y: 3 },
      { x: 4, y: 4 },
      { x: 3, y: 4 },
      { x: 3, y: 5 },
    ],
    water: [
      { x: 0, y: 6 },
      { x: 1, y: 6 },
      { x: 2, y: 6 },
      { x: 3, y: 6 },
      { x: 4, y: 6 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
      { x: 7, y: 6 },
    ],
    conveyors: [],
  },
];

// Streak tracking, rewritten for a real browser: Claude's `window.storage`
// API only exists inside Claude's own artifact sandbox. On a real deployed
// site this uses plain `localStorage` instead — synchronous under the hood,
// but kept as an async function so the call site (PlayScreen) doesn't change.
//
// "Today" here is always the puzzle's own calendar date — amsterdamPuzzleDateStr(),
// which only rolls over at 9am Europe/Amsterdam — never the plain UTC date.
// Amsterdam is ahead of UTC, so UTC midnight lands hours before the puzzle
// actually changes; keying the streak off UTC date let a player replay the
// still-showing previous puzzle in that gap and bump their streak twice for
// what the app considers the same puzzle day.
export function shiftDateStr(dateStr, deltaDays) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

// One-time goodwill bump for moving the game to dailygiu.com: everyone's
// streak lived in localStorage on the old URL, so it reads as 0 here even
// for people who'd been playing daily. For the 2026-08-22 puzzle only,
// anyone who'd otherwise show/start from 0 gets a starting streak of 3
// instead (4 once they win that day) — a real streak already in progress
// on the new domain (e.g. someone who played on launch day, 2026-08-21) is
// left alone and just continues normally.
const MIGRATION_BONUS_DATE = "2026-08-22";
const MIGRATION_BONUS_STREAK = 3;

async function recordWinAndGetStreak() {
  const today = amsterdamPuzzleDateStr();
  let streak = today === MIGRATION_BONUS_DATE ? MIGRATION_BONUS_STREAK + 1 : 1;
  try {
    const raw = localStorage.getItem("puzzlelab_streak");
    if (raw) {
      const data = JSON.parse(raw);
      if (data.lastDate === today) return data.streak;
      const yesterday = shiftDateStr(today, -1);
      streak = data.lastDate === yesterday ? data.streak + 1 : streak;
    }
  } catch (e) {
    // no streak recorded yet, or localStorage unavailable — start at the
    // default computed above
  }
  try {
    localStorage.setItem("puzzlelab_streak", JSON.stringify({ lastDate: today, streak }));
  } catch (e) {
    // ignore write failure, still show the computed streak
  }
  return streak;
}

// A read-only peek at the persisted streak, for the header badge — mirrors
// recordWinAndGetStreak's own logic for whether a streak is still alive
// (won today or yesterday) without writing anything or requiring a win.
function getCurrentStreak() {
  const today = amsterdamPuzzleDateStr();
  const fallback = today === MIGRATION_BONUS_DATE ? MIGRATION_BONUS_STREAK : 0;
  try {
    const raw = localStorage.getItem("puzzlelab_streak");
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    if (data.lastDate === today) return data.streak;
    const yesterday = shiftDateStr(today, -1);
    if (data.lastDate === yesterday) return data.streak;
    return fallback;
  } catch (e) {
    return fallback;
  }
}

function hasWonToday() {
  try {
    const raw = localStorage.getItem("puzzlelab_streak");
    if (!raw) return false;
    const data = JSON.parse(raw);
    return data.lastDate === amsterdamPuzzleDateStr();
  } catch (e) {
    return false;
  }
}

const SLIDE = "left 0.6s ease, top 0.6s ease, opacity 0.4s ease, transform 0.4s ease";
function dirAngle(dir) {
  if (dir.dx === 1) return 0;
  if (dir.dx === -1) return 180;
  if (dir.dy === 1) return 90;
  return -90;
}
function upBasedAngle(dir) {
  if (dir.dy === -1) return 0;
  if (dir.dx === 1) return 90;
  if (dir.dy === 1) return 180;
  return 270;
}
function unitGlyph(unit) {
  if (unit.ability === "push") return "\u2192";
  return "\u25A0";
}

// Facing direction (in degrees, matching dirAngle's convention) for a Pusher
// currently adjacent to a target — null when not on board or nothing to push.
function pusherFacingAngle(state, unit) {
  if (unit.ability !== "push" || !unit.onBoard) return null;
  const adj = findPushTarget(state, unit);
  if (!adj) return null;
  return dirAngle({ dx: adj.dx, dy: adj.dy });
}

// Shared glyph renderer for units: Pushers get a directional arrow that can
// rotate to face their target, Pullers get a Magnet icon (no arrow, so they
// read as distinct from Pushers at a glance), everything else is a text glyph.
// `spinAnimation` is the one-shot full spin played while a Rotator is actually
// acting during resolution. `armedIdle` is a gentle looping wobble shown during
// planning whenever a Rotator/Counter-rotator has a valid adjacent target, so
// it's obvious ahead of time that it's "armed" and will do something.
function UnitIcon({ unit, size = 26, facingAngle = null, spinAnimation = null, armedIdle = null, inHand = false }) {
  const rotateStyle = facingAngle != null ? { transform: `rotate(${facingAngle}deg)`, transition: "transform 0.25s ease" } : null;
  if (unit.ability === "pull") {
    return <Magnet style={{ width: size * 0.72, height: size * 0.72 }} strokeWidth={2.75} />;
  }
  // Pushers show a plain hand while sitting in the hand tray — the directional
  // arrow only makes sense once the unit is on the board and can point at
  // something, so give it a different glyph before that.
  if (unit.ability === "push" && inHand) {
    return <Hand style={{ width: size * 0.72, height: size * 0.72 }} strokeWidth={2.75} />;
  }
  const animation = spinAnimation ? `${spinAnimation} 0.6s ease-in-out` : armedIdle ? `${armedIdle} 1.1s ease-in-out infinite` : "none";
  // Rotators use real SVG icons rather than the ↻/↺ text glyphs — those
  // characters aren't in Baloo 2, so the browser falls back to a system font
  // for just this one glyph, and that font's box metrics don't optically
  // center the same way, leaving it looking off-center in the badge.
  if (unit.ability === "rotate") {
    return <RotateCw style={{ width: size * 0.72, height: size * 0.72, animation, ...rotateStyle }} strokeWidth={2.75} />;
  }
  if (unit.ability === "rotate_ccw") {
    return <RotateCcw style={{ width: size * 0.72, height: size * 0.72, animation, ...rotateStyle }} strokeWidth={2.75} />;
  }
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: size,
        lineHeight: 1,
        animation,
        ...rotateStyle,
      }}
    >
      {unitGlyph(unit)}
    </span>
  );
}

// Same visual language as the unit tokens (Pusher/Puller/Blocker/Rotator) —
// a filled rounded-square badge — so pieces on both sides read as the same
// kind of thing. A bold arrow icon inside rotates to face the enemy's
// direction; the turn-order number sits in its own corner badge rather than
// dead-center, since the arrow already owns the middle of the tile.
function EnemyToken({ dir, label, active }) {
  const angle = upBasedAngle(dir);
  return (
    <div style={{ position: "relative", width: "74%", height: "74%" }}>
      <div
        className="flex items-center justify-center rounded-md w-full h-full"
        style={{
          background: "#dc2626",
          border: "2px solid #4b2e73",
          boxSizing: "border-box",
          boxShadow: active ? "0 0 0 3px #fbbf24" : "none",
          animation: active ? "enemyFire 0.5s ease-in-out" : "none",
          transition: "box-shadow 0.25s ease",
        }}
      >
        <span
          style={{
            display: "inline-block",
            fontSize: 30,
            lineHeight: 1,
            color: "#ffffff",
            transform: `rotate(${angle}deg)`,
            transition: "transform 0.25s ease",
          }}
        >
          ▲
        </span>
      </div>
      {label != null && <EnemyTurnBadge label={label} />}
    </div>
  );
}

// The turn-order badge for an enemy on the board — positioned relative to
// the *full tile*, not the 74%-sized arrow body, so it lands in exactly the
// same corner as a unit's own turn-order badge.
function EnemyTurnBadge({ label }) {
  return (
    <div
      className="rounded-full flex items-center justify-center"
      style={{
        position: "absolute",
        top: "2%",
        right: "6%",
        width: 16,
        height: 16,
        background: "#ffffff",
        border: "1.5px solid #4b2e73",
        color: "#4b2e73",
        fontSize: 10,
        fontWeight: 900,
        lineHeight: 1,
      }}
    >
      {label}
    </div>
  );
}

// threat is null | "bold" | "light" — a ray traveling over a passable
// terrain tile (water, conveyor) still needs to read as threatened, but
// those tiles paint a solid fill over the whole tile, which would otherwise
// hide the plain tile's red threat background entirely and leave only the
// (easy to miss) red border. A translucent red wash on top of the terrain
// fill keeps both signals visible at once.
function threatWashStyle(threat) {
  if (!threat) return null;
  return { position: "absolute", inset: 0, zIndex: 0, background: threat === "bold" ? "rgba(239,68,68,0.55)" : "rgba(239,68,68,0.32)" };
}

function TerrainMark({ wall, water, conveyor, threat }) {
  if (wall) {
    return <div className="absolute inset-0 rounded-sm" style={{ background: "#4b2e73", zIndex: 0 }} />;
  }
  if (water) {
    // A pastel sky-blue, distinct from both the mint unit color and the
    // board's white base tile — solid fill only, no wave decoration.
    return (
      <>
        <div className="absolute inset-0 rounded-sm" style={{ zIndex: 0, background: "#6ec3e8" }} />
        {threat && <div className="rounded-sm" style={threatWashStyle(threat)} />}
      </>
    );
  }
  if (conveyor) {
    const angle = dirAngle(conveyor.dir);
    return (
      <div className="absolute inset-0 rounded-sm overflow-hidden" style={{ zIndex: 0, background: "#78350f" }}>
        <div
          style={{
            position: "absolute",
            inset: "-60%",
            backgroundImage: "repeating-linear-gradient(90deg, #fbbf24 0px, #fbbf24 4px, transparent 4px, transparent 13px)",
            transform: `rotate(${angle}deg)`,
            animation: "beltStripes 0.7s linear infinite",
            opacity: 0.6,
          }}
        />
        {threat && <div style={{ ...threatWashStyle(threat), position: "absolute" }} />}
      </div>
    );
  }
  return null;
}

function makeGameStateFromLevel(level) {
  return {
    units: level.units.map((u) => ({ ...u, onBoard: false, x: null, y: null, alive: true, order: null })),
    enemies: level.enemies.map((e) => ({ ...e, alive: true })),
    buildings: level.buildings.map((b) => ({ ...b, alive: true })),
    walls: level.walls || [],
    water: level.water || [],
    conveyors: level.conveyors || [],
  };
}

// Units act in the order the player placed them on the board this turn
// (not the fixed order they're defined in the level). Units off the board
// have no meaningful order and sort last / are filtered out by callers.
function sortedByPlacement(units) {
  return [...units].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
}

function RuleRow({ swatch, title, children }) {
  return (
    <div className="flex items-start gap-3 mb-3">
      <div
        className="shrink-0 flex items-center justify-center rounded-md"
        style={{ width: 40, height: 40, background: "#f5eefc", border: "2px solid #4b2e73" }}
      >
        {swatch}
      </div>
      <div>
        <p style={{ color: "#4b2e73", fontFamily: "'Baloo 2', system-ui, sans-serif", fontWeight: 800, fontSize: 14 }}>{title}</p>
        <p style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontSize: 11, lineHeight: 1.4 }}>{children}</p>
      </div>
    </div>
  );
}

// Rules explained with small swatches that reuse the exact colors/shapes the
// board itself uses (building tile, enemy circle + facing arrow, threat
// overlays, unit squares) so the legend doubles as a visual example.
function RulesModal({ onClose }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs mx-4"
        style={{
          background: "#ffffff",
          border: "3px solid #4b2e73",
          borderRadius: 16,
          padding: 20,
          maxHeight: "85vh",
          overflowY: "auto",
          animation: "popIn 0.2s ease-out",
          fontFamily: "'Baloo 2', system-ui, sans-serif",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 style={{ color: "#4b2e73", fontWeight: 800, fontSize: 18 }}>How to play</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-md" style={{ color: "#4b2e73" }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <RuleRow
          title="Goal"
          swatch={<div className="rounded-sm" style={{ width: 18, height: 18, background: "#fff5b8", border: "2px solid #4b2e73" }} />}
        >
          Keep every building alive when the turn plays out. Lose one and the puzzle is lost.
        </RuleRow>

        <RuleRow
          title="Enemies"
          swatch={
            <div
              className="rounded-md flex items-center justify-center"
              style={{ width: 26, height: 26, background: "#dc2626", border: "2px solid #4b2e73", color: "#fff", fontSize: 18, fontWeight: 900 }}
            >
              ▲
            </div>
          }
        >
          The arrow points the way it's aimed — fires in a straight line the moment you hit Play.
        </RuleRow>

        <RuleRow
          title="Threat tiles"
          swatch={
            <div className="flex gap-1">
              <div style={{ width: 14, height: 14, background: "#fecaca", border: "2px solid #ef4444", borderRadius: 2 }} />
              <div style={{ width: 14, height: 14, background: "#fee2e2", border: "1px solid #f87171", borderRadius: 2 }} />
            </div>
          }
        >
          Bold red = gets hit right now. Pale red = gets hit after this turn's pushes/pulls/conveyors.
        </RuleRow>

        <RuleRow
          title="Enemy collisions"
          swatch={
            <div style={{ position: "relative", width: 30, height: 22 }}>
              <div className="rounded-full" style={{ position: "absolute", left: 0, top: 3, width: 15, height: 15, background: "#dc2626", border: "1.5px solid #4b2e73" }} />
              <div className="rounded-full" style={{ position: "absolute", right: 0, top: 3, width: 15, height: 15, background: "#dc2626", border: "1.5px solid #4b2e73" }} />
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "#fde047",
                  border: "1px solid #4b2e73",
                }}
              />
            </div>
          }
        >
          Push or pull an enemy into another enemy's tile — the impact destroys them both.
        </RuleRow>

        <RuleRow
          title="Pusher"
          swatch={
            <div className="rounded-md flex items-center justify-center" style={{ width: 26, height: 26, background: "#8ad7d2", border: "2px solid #4b2e73", color: "#4b2e73", fontSize: 16, fontWeight: 900 }}>
              →
            </div>
          }
        >
          Drop it next to an enemy — on Play it shoves that enemy back one tile.
        </RuleRow>

        <RuleRow
          title="Puller"
          swatch={
            <div className="rounded-md flex items-center justify-center" style={{ width: 26, height: 26, background: "#8ad7d2", border: "2px solid #4b2e73", color: "#4b2e73" }}>
              <Magnet style={{ width: 16, height: 16 }} strokeWidth={2.75} />
            </div>
          }
        >
          Pulls the nearest enemy in line toward it, in whichever of the four directions has one.
        </RuleRow>

        <RuleRow
          title="Blocker"
          swatch={
            <div className="rounded-md flex items-center justify-center" style={{ width: 26, height: 26, background: "#8ad7d2", border: "2px solid #4b2e73", color: "#4b2e73", fontSize: 16, fontWeight: 900 }}>
              ■
            </div>
          }
        >
          Just occupies its tile — permanently blocks any shots down its line, or blocks where a pushed/pulled enemy would land.
        </RuleRow>

        <RuleRow
          title="Rotators"
          swatch={
            <div className="flex gap-1">
              <div className="rounded-md flex items-center justify-center" style={{ width: 26, height: 26, background: "#8ad7d2", border: "2px solid #4b2e73", color: "#4b2e73" }}>
                <RotateCw className="w-4 h-4" strokeWidth={2.75} />
              </div>
              <div className="rounded-md flex items-center justify-center" style={{ width: 26, height: 26, background: "#8ad7d2", border: "2px solid #4b2e73", color: "#4b2e73" }}>
                <RotateCcw className="w-4 h-4" strokeWidth={2.75} />
              </div>
            </div>
          }
        >
          Turn an adjacent enemy 90° clockwise or counter-clockwise, redirecting its shot.
        </RuleRow>

        <RuleRow
          title="Turn order"
          swatch={
            <div className="flex items-center gap-1">
              <div
                className="rounded-full flex items-center justify-center"
                style={{ width: 20, height: 20, background: "#ffffff", border: "1.5px solid #4b2e73", color: "#4b2e73", fontSize: 11, fontWeight: 900 }}
              >
                1
              </div>
              <div
                className="rounded-full flex items-center justify-center"
                style={{ width: 20, height: 20, background: "#dc2626", border: "1.5px solid #4b2e73", color: "#fff", fontSize: 11, fontWeight: 900 }}
              >
                1
              </div>
            </div>
          }
        >
          Pieces act in the order you placed them, then enemies fire in numeric order — the number on each red circle is its turn.
        </RuleRow>

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-1"
          style={{
            padding: "10px 0",
            borderRadius: 12,
            border: "2.5px solid #4b2e73",
            background: "#ffb3d0",
            color: "#4b2e73",
            fontWeight: 800,
            fontFamily: "'Baloo 2', system-ui, sans-serif",
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

// Shown once, ever, the very first time someone opens the game (gated by a
// localStorage flag) — a fast "what am I doing here" before they touch
// anything. The full RulesModal covers everything else on demand.
function IntroScreen({ onClose, onShowRules }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" }}
    >
      <div
        className="w-full max-w-xs mx-4 text-center"
        style={{
          background: "#ffffff",
          border: "3px solid #4b2e73",
          borderRadius: 16,
          padding: 24,
          fontFamily: "'Baloo 2', system-ui, sans-serif",
          animation: "popIn 0.25s ease-out",
        }}
      >
        <div className="rounded-sm mx-auto mb-4" style={{ width: 40, height: 40, background: "#fff5b8", border: "2px solid #4b2e73" }} />
        <p style={{ color: "#4b2e73", fontWeight: 800, fontSize: 20, marginBottom: 8 }}>Save every building</p>
        <p style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 12, marginBottom: 20 }}>
          Keep all the yellow squares alive when the turn plays out — that's the only goal.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-full mb-2"
          style={{
            padding: "10px 0",
            borderRadius: 12,
            border: "2.5px solid #4b2e73",
            background: "#ffb3d0",
            color: "#4b2e73",
            fontWeight: 800,
          }}
        >
          Let's go
        </button>
        <button
          type="button"
          onClick={onShowRules}
          className="w-full"
          style={{ padding: "8px 0", color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700 }}
        >
          See full rules
        </button>
      </div>
    </div>
  );
}

function formatElapsed(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function PlayScreen({ level, onBack, isDaily = !onBack }) {
  const [gameState, setGameState] = useState(() => makeGameStateFromLevel(level));
  const [phase, setPhase] = useState("planning");
  const [resolution, setResolution] = useState(null);
  const [revealStep, setRevealStep] = useState(0);
  const [drag, setDrag] = useState(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [hoverTile, setHoverTile] = useState(null);
  const [streak, setStreak] = useState(null);
  const [headerStreak, setHeaderStreak] = useState(0);
  const [wonToday, setWonToday] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [bulletPos, setBulletPos] = useState(null);
  // Whether the current step's kill (if any) is allowed to actually show as
  // dead yet — held back until the traveling bullet visually arrives, so a
  // unit/building doesn't vanish before the shot that kills it gets there.
  const [killRevealed, setKillRevealed] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hasSolved, setHasSolved] = useState(false);
  const placementCounterRef = useRef(0);
  // Timer only accrues while the player is actively planning — it pauses
  // during the resolve animation and the result modal, and (unlike a plain
  // stopwatch) never resumes once the puzzle has been solved once.
  const accumulatedMsRef = useRef(0);
  const planningStartRef = useRef(Date.now());

  useEffect(() => {
    // Only the real daily game greets first-timers — not the level editor's
    // "test play" mode, which reuses this same screen.
    if (!isDaily) return;
    try {
      if (!localStorage.getItem("puzzlelab_seen_intro")) setShowIntro(true);
    } catch (e) {
      // localStorage unavailable — skip the one-time intro
    }
  }, []);

  function dismissIntro() {
    setShowIntro(false);
    try {
      localStorage.setItem("puzzlelab_seen_intro", "1");
    } catch (e) {
      // ignore write failure
    }
  }

  useEffect(() => {
    setGameState(makeGameStateFromLevel(level));
    setPhase("planning");
    setResolution(null);
    setRevealStep(0);
    setStreak(null);
    setHeaderStreak(getCurrentStreak());
    setWonToday(hasWonToday());
    placementCounterRef.current = 0;
    accumulatedMsRef.current = 0;
    planningStartRef.current = Date.now();
    setElapsedSeconds(0);
    setHasSolved(false);
  }, [level]);

  // Whenever the phase flips, either start a fresh planning clock or bank
  // the time spent planning so far (resolve animation + result modal time
  // doesn't count).
  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    if (phase === "planning") {
      planningStartRef.current = Date.now();
    } else if (prevPhaseRef.current === "planning") {
      // Only bank time on the transition OUT of planning — later phase
      // changes (e.g. resolving -> done) must not re-add the same span.
      accumulatedMsRef.current += Date.now() - planningStartRef.current;
      setElapsedSeconds(Math.floor(accumulatedMsRef.current / 1000));
    }
    prevPhaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (phase !== "planning" || hasSolved) return;
    const t = setInterval(() => {
      setElapsedSeconds(Math.floor((accumulatedMsRef.current + (Date.now() - planningStartRef.current)) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [phase, hasSolved]);

  useEffect(() => {
    if (phase !== "resolving" || !resolution) return;
    if (revealStep >= resolution.snapshots.length - 1) {
      const t = setTimeout(() => setPhase("done"), 1000);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setRevealStep((r) => r + 1), 1000);
    return () => clearTimeout(t);
  }, [phase, resolution, revealStep]);

  // Drives the traveling "bullet" dot on an enemy's turn: snap it to the
  // enemy's tile with no transition, then (one frame later, so the browser
  // has actually painted that starting position) move it to the impact tile
  // WITH a transition — the same snap-then-transition trick the enemy/unit
  // tokens themselves use (see the SLIDE constant) to animate across tiles.
  useEffect(() => {
    if (phase !== "resolving" || !resolution || revealStep === 0) {
      setBulletPos(null);
      return;
    }
    const actor = resolution.actors[revealStep - 1];
    if (!actor || actor.type !== "enemy") {
      setBulletPos(null);
      return;
    }
    const beforeState = resolution.snapshots[revealStep - 1];
    const enemy = beforeState.enemies.find((e) => e.id === actor.id);
    if (!enemy || !enemy.alive) {
      setBulletPos(null);
      return;
    }
    const ray = threatRay(beforeState, enemy);
    if (ray.tiles.length === 0) {
      setBulletPos(null);
      return;
    }
    const end = ray.tiles[ray.tiles.length - 1];
    setBulletPos({ x: enemy.x, y: enemy.y, animate: false });
    // A single rAF isn't enough here: it can fire before the browser has
    // actually painted the snapped (no-transition) position, so the CSS
    // transition ends up animating from wherever the dot last was (the
    // previous enemy's shot) instead of snapping first — the double-rAF
    // guarantees a real paint of the snap lands before we flip animate on.
    let raf2 = null;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setBulletPos({ x: end.x, y: end.y, animate: true });
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2 !== null) cancelAnimationFrame(raf2);
    };
  }, [phase, resolution, revealStep]);

  useEffect(() => {
    if (phase === "done" && resolution && resolution.outcome === "success") {
      setHasSolved(true);
      recordWinAndGetStreak().then((s) => {
        setStreak(s);
        setHeaderStreak(s);
        setWonToday(true);
      });
    }
  }, [phase, resolution]);

  useEffect(() => {
    if (!drag) return;
    function onMove(e) {
      setDragPos({ x: e.clientX, y: e.clientY });
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const tileEl = el && el.closest("[data-tile]");
      setHoverTile(tileEl ? { x: Number(tileEl.dataset.x), y: Number(tileEl.dataset.y) } : null);
    }
    function onUp(e) {
      // A tap (barely any movement since pointerdown) on a piece that was
      // already on the board sends it back to the hand, regardless of what's
      // under the finger at release — dragging is the only way to reposition.
      const movedDist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (movedDist < 10 && drag.wasOnBoard) {
        setGameState((prev) => {
          const next = clone(prev);
          const u = next.units.find((u) => u.id === drag.unitId);
          u.onBoard = false;
          u.x = null;
          u.y = null;
          u.order = null;
          return next;
        });
        setDrag(null);
        setHoverTile(null);
        return;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const tileEl = el && el.closest("[data-tile]");
      const handEl = el && el.closest("[data-hand]");
      if (tileEl) {
        const dropTile = { x: Number(tileEl.dataset.x), y: Number(tileEl.dataset.y) };
        const valid = drag.validTiles.some((t) => t.x === dropTile.x && t.y === dropTile.y);
        if (valid) {
          setGameState((prev) => {
            const next = clone(prev);
            const u = next.units.find((u) => u.id === drag.unitId);
            // Only a fresh placement (coming from the hand) claims a new turn
            // order — repositioning a unit that's already on the board keeps
            // whenever it was first placed.
            if (!u.onBoard) {
              placementCounterRef.current += 1;
              u.order = placementCounterRef.current;
            }
            u.onBoard = true;
            u.x = dropTile.x;
            u.y = dropTile.y;
            return next;
          });
        }
      } else if (handEl) {
        setGameState((prev) => {
          const next = clone(prev);
          const u = next.units.find((u) => u.id === drag.unitId);
          u.onBoard = false;
          u.x = null;
          u.y = null;
          u.order = null;
          return next;
        });
      }
      setDrag(null);
      setHoverTile(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag]);

  const displayState = phase === "planning" ? gameState : resolution.snapshots[revealStep];
  const previewState = phase === "planning" ? applyConveyorPhase(gameState) : displayState;
  const projState = phase === "planning" ? simulatePhaseAPreview(gameState) : displayState;
  const flashTile = phase === "resolving" && resolution && revealStep > 0 ? resolution.impacts[revealStep - 1] : null;
  const activeActor = phase === "resolving" && resolution && revealStep > 0 ? resolution.actors[revealStep - 1] : null;
  const draggedUnit = drag ? gameState.units.find((u) => u.id === drag.unitId) : null;

  // The enemy firing on the currently displayed step, resolved against the
  // state just before its shot (so its ray/target are still accurate) —
  // drives a small traveling "bullet" so it's easy to see what hit what.
  const activeEnemyRay =
    phase === "resolving" && activeActor && activeActor.type === "enemy"
      ? (() => {
          const beforeState = resolution.snapshots[revealStep - 1];
          const enemy = beforeState.enemies.find((e) => e.id === activeActor.id);
          if (!enemy || !enemy.alive) return null;
          const ray = threatRay(beforeState, enemy);
          return ray.tiles.length > 0 ? { enemy, ...ray } : null;
        })()
      : null;
  // Impact bursts wait for the bullet to actually arrive instead of popping
  // instantly.
  const flashDelay = activeEnemyRay ? 0.5 : 0;

  // A kill from gunfire shouldn't remove its target from the board until the
  // bullet has actually traveled there — push/pull kills (flashDelay 0) have
  // no bullet to wait on, so those still land instantly.
  useEffect(() => {
    if (flashTile && flashTile.kind === "kill" && flashDelay > 0) {
      setKillRevealed(false);
      const t = setTimeout(() => setKillRevealed(true), flashDelay * 1000);
      return () => clearTimeout(t);
    }
    setKillRevealed(true);
  }, [revealStep, phase]);

  // While a gunfire kill is held back (see above), render buildings/units/
  // enemies from the snapshot just *before* this step instead of the
  // (already-dead) current one, so the target stays visible until the bullet
  // lands. Nothing else differs between those two snapshots for a kill step,
  // so this is safe to swap in wholesale.
  const isPendingKill = !killRevealed && flashTile && flashTile.kind === "kill" && flashDelay > 0;
  const renderState = isPendingKill ? resolution.snapshots[revealStep - 1] : displayState;
  const activeKillTarget = isPendingKill ? { x: flashTile.x, y: flashTile.y } : null;

  // Enemies that have already fired their attack, as of the currently displayed
  // snapshot. Once an enemy is in this set it stops contributing any threat
  // overlay — no ray, no "will be hit" marker on buildings in its old path.
  const firedEnemyIds = new Set();
  if ((phase === "resolving" || phase === "done") && resolution) {
    for (let i = 0; i < revealStep; i++) {
      const a = resolution.actors[i];
      if (a && a.type === "enemy") firedEnemyIds.add(a.id);
    }
  }

  // BOLD = where each not-yet-fired enemy will actually hit right now, given
  // its current position/facing. This is always shown for anyone who hasn't
  // fired yet.
  const boldState = phase === "planning" ? gameState : displayState;
  const boldRays = boldState.enemies
    .filter((e) => e.alive && !firedEnemyIds.has(e.id))
    .map((e) => ({ enemyId: e.id, ...threatRay(boldState, e) }));

  // LIGHT = a forward preview, during planning only, of where a not-yet-fired
  // enemy will end up hitting *after* this turn's conveyor/push/pull/rotate
  // moves it. Only drawn for enemies that actually move or turn this turn.
  const lightRays =
    phase === "planning"
      ? projState.enemies
          .filter((e) => {
            if (!e.alive || firedEnemyIds.has(e.id)) return false;
            const orig = gameState.enemies.find((o) => o.id === e.id);
            return orig && (orig.x !== e.x || orig.y !== e.y || orig.dir.dx !== e.dir.dx || orig.dir.dy !== e.dir.dy);
          })
          .map((e) => ({ enemyId: e.id, ...threatRay(projState, e) }))
      : [];

  function reset() {
    setGameState(makeGameStateFromLevel(level));
    setPhase("planning");
    setResolution(null);
    setRevealStep(0);
    setDrag(null);
    setHoverTile(null);
    setStreak(null);
    placementCounterRef.current = 0;
  }

  // Retry after a resolved turn (win or lose) without clearing the board back
  // to the hand. `gameState` itself is never mutated during resolution —
  // computeResolution works on a clone — so it still holds exactly the
  // layout the player had when they hit Play, ready for small adjustments.
  function retryPlan() {
    setPhase("planning");
    setResolution(null);
    setRevealStep(0);
    setDrag(null);
    setHoverTile(null);
    setStreak(null);
  }

  function onUnitPointerDown(e, unit) {
    if (phase !== "planning") return;
    e.preventDefault();
    const validTiles = emptyTiles(gameState, unit.id);
    setDrag({ unitId: unit.id, validTiles, startX: e.clientX, startY: e.clientY, wasOnBoard: unit.onBoard });
    setDragPos({ x: e.clientX, y: e.clientY });
  }

  function play() {
    const res = computeResolution(gameState);
    setResolution(res);
    setRevealStep(0);
    setPhase("resolving");
  }

  function categoryForHit(hit) {
    if (!hit || hit.type === "wall") return "muted";
    if (hit.type === "building") return "danger";
    if (hit.type === "enemy") return "collision";
    if (hit.type === "unit") return "caution";
    return null;
  }

  // Bold wins over light when both land on the same tile — bold is "current
  // truth", light is just a heads-up about what's coming.
  function tileThreat(x, y) {
    for (const r of boldRays) {
      if (r.tiles.some((t) => t.x === x && t.y === y)) {
        return { level: "bold", category: categoryForHit(r.hit) };
      }
    }
    for (const r of lightRays) {
      const cat = categoryForHit(r.hit);
      if (r.tiles.some((t) => t.x === x && t.y === y)) {
        return { level: "light", category: cat };
      }
    }
    if (phase === "planning") {
      const previews = movePreviewTiles(previewState);
      const match = previews.find((p) => p.x === x && p.y === y);
      if (match && match.kind === "collision") return { level: "bold", category: "collision" };
      // A plain "land" preview (no collision) isn't a threat — it's drawn as
      // its own faded circle marker instead of a tile-background color.
    }
    return null;
  }

  function buildingThreatLevel(x, y) {
    const buildingHitBy = (rays) => rays.some((r) => r.hit && r.hit.type === "building" && r.hit.obj.x === x && r.hit.obj.y === y);
    if (buildingHitBy(boldRays)) return "bold";
    if (buildingHitBy(lightRays)) return "light";
    return null;
  }

  function tileClassName(x, y) {
    if (isWall(displayState, x, y)) {
      return "relative aspect-square flex items-center justify-center rounded-sm border border-[#4b2e73]";
    }
    const isValidDrop = drag && drag.validTiles.some((t) => t.x === x && t.y === y);
    const isHover = hoverTile && hoverTile.x === x && hoverTile.y === y;
    const threat = tileThreat(x, y);

    let variant;
    // Placing is always legal on any empty tile, so only call out the one
    // tile currently under the finger/cursor while dragging — lighting up
    // every valid tile at once is redundant with that given.
    if (isValidDrop && isHover) variant = "border-2 border-[#4b2e73] bg-[#c9e9e6]";
    else if (!threat) variant = "border border-[#e2c7d8] bg-white";
    else if (threat.level === "bold") {
      // A single strong red for any live threat — miss, hit-a-building,
      // hit-a-unit, or beam-on-beam collision — so it's always clearly
      // visible even when the ray doesn't land on anything.
      variant = "border-2 border-[#ef4444] bg-[#fecaca]";
    } else {
      // light preview — a single pale red, always, regardless of what the
      // post-move ray happens to hit. This keeps it reading as "a future
      // threat" (same hue as the bold danger color) without implying a
      // specific outcome, and it stays visible even on a "miss" trace.
      variant = "border border-[#f87171] bg-[#fee2e2]";
    }

    return `relative aspect-square flex items-center justify-center rounded-sm transition-colors ${variant}`;
  }

  function renderTileContent(x, y) {
    const wall = isWall(renderState, x, y);
    const water = isWater(renderState, x, y);
    const conveyor = renderState.conveyors.find((c) => c.x === x && c.y === y);
    const b = renderState.buildings.find((b) => b.alive && b.x === x && b.y === y);
    const threatLevel = b ? buildingThreatLevel(x, y) : null;
    const terrainThreat = !wall ? tileThreat(x, y)?.level ?? null : null;
    // The one tile actively getting hit this step (bullet in flight, target
    // held alive until it lands) reads as a fast amber pulse — distinct from
    // and more urgent than the slower red "incoming" warning, which stops
    // applying the instant the enemy fires. (A white pulse worked on the old
    // dark board but is invisible against this light one, since the building
    // is already white — amber pops against both the tile and the building.)
    const isBeingHit = !!(activeKillTarget && activeKillTarget.x === x && activeKillTarget.y === y);
    return (
      <>
        <TerrainMark wall={wall} water={water} conveyor={conveyor} threat={terrainThreat} />
        {b && (
          <div
            className="rounded-sm"
            style={{
              width: "52%",
              height: "52%",
              zIndex: 2,
              position: "relative",
              background: isBeingHit
                ? "#fff5b8"
                : threatLevel === "bold"
                ? "linear-gradient(155deg, #fff5b8 0%, #fecaca 100%)"
                : threatLevel === "light"
                ? "linear-gradient(155deg, #fff5b8 0%, #fee2e2 100%)"
                : "#fff5b8",
              boxShadow: isBeingHit
                ? "0 0 0 3px #fbbf24, 0 0 12px 3px rgba(251,191,36,0.85)"
                : threatLevel === "bold"
                ? "0 0 0 2px #ef4444, 0 0 10px 2px rgba(239,68,68,0.55)"
                : threatLevel === "light"
                ? "0 0 0 2px rgba(239,68,68,0.5)"
                : "0 0 0 2px #4b2e73",
              animation: isBeingHit
                ? "buildingPulseAmber 0.3s ease-in-out infinite"
                : threatLevel === "bold"
                ? "buildingPulse 1.4s ease-in-out infinite"
                : "none",
            }}
          >
            {(isBeingHit || threatLevel === "bold") && (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ color: "#b91c1c", fontSize: 13, fontWeight: 900, lineHeight: 1 }}
              >
                !
              </div>
            )}
          </div>
        )}
      </>
    );
  }

  const tiles = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      tiles.push({ x, y });
    }
  }

  const boardUnits = gameState.units.filter(
    (u) => u.onBoard && !(phase === "planning" && drag && drag.unitId === u.id)
  );
  const handUnits = gameState.units.filter((u) => !u.onBoard && !(drag && drag.unitId === u.id));
  // While a piece is actively being dragged, its old spot is stale — suppress
  // any preview line starting there so it doesn't float over an empty tile.
  // The line reappears once the piece is dropped somewhere new.
  const previewLines =
    phase === "planning"
      ? actionPreviewLines(previewState).filter((l) => !(draggedUnit && draggedUnit.onBoard && l.fromX === draggedUnit.x && l.fromY === draggedUnit.y))
      : [];
  // Where a pushed/pulled enemy would land, shown as a faded red circle
  // rather than a tile highlight — it's not a threat, just a preview of
  // where that enemy is about to end up.
  const landPreviewTiles =
    phase === "planning"
      ? movePreviewTiles(previewState).filter((p) => p.kind === "land" && !(draggedUnit && p.unitId === draggedUnit.id))
      : [];
  // Rotators get their own outcome preview — a small spinning ring on the
  // target enemy showing which way it's about to turn — the same kind of
  // "here's what happens" heads-up push/pull already get from the line above
  // plus their landing marker.
  const rotatePreviewTargets = previewLines.filter((l) => l.type === "rotate").map((l) => ({ x: l.toX, y: l.toY, spin: l.spin }));

  // The badge shown to the player is always a compact 1..N rank among the
  // currently placed units, even though the underlying `order` field (used
  // to drive actual resolution order) just keeps counting up forever as
  // units get picked up and re-placed.
  const placementRankById = new Map();
  sortedByPlacement(gameState.units)
    .filter((u) => u.onBoard)
    .forEach((u, i) => placementRankById.set(u.id, i + 1));

  // Index (into resolution.actors/snapshots) of each unit's own turn, so a
  // Pusher's facing arrow can be "locked" to the direction it fired once its
  // turn has played, instead of recomputing live and snapping back to
  // unrotated once the target it pushed is no longer adjacent.
  const unitActionIndexById = new Map();
  if (resolution) {
    resolution.actors.forEach((a, i) => {
      if (a && a.type === "unit") unitActionIndexById.set(a.id, i);
    });
  }

  return (
    <div
      style={{
        background: "#ffffff",
        border: "3px solid #4b2e73",
        borderRadius: 16,
        padding: 24,
        fontFamily: "'Baloo 2', system-ui, sans-serif",
      }}
    >
      <div className="max-w-md mx-auto mb-4 relative flex items-center justify-center" style={{ minHeight: 40 }}>
        <div className="shrink-0 flex items-center gap-1.5" style={{ position: "absolute", left: 0 }}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to menu"
              className="shrink-0 flex items-center justify-center"
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                border: "2.5px solid #4b2e73",
                background: "#ffffff",
                color: "#4b2e73",
              }}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          {isDaily && (
            <div
              className="shrink-0 flex items-center gap-1"
              style={{
                height: 32,
                padding: "0 10px",
                fontSize: 13,
                fontWeight: 800,
                color: "#4b2e73",
                borderRadius: 999,
                border: "2.5px solid #4b2e73",
                background: wonToday ? "#fff5b8" : "#ffffff",
              }}
              title={wonToday ? "Today's puzzle solved" : "Current streak"}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>🔥</span>
              {headerStreak}
            </div>
          )}
        </div>
        <h2 style={{ fontFamily: "'Baloo 2', system-ui, sans-serif", fontWeight: 800, color: "#4b2e73", letterSpacing: "-.01em", textAlign: "center", fontSize: 24 }}>
          {level.name}
        </h2>
        <div className="shrink-0 flex items-center gap-1.5" style={{ position: "absolute", right: 0 }}>
          <div
            className="shrink-0 flex items-center justify-center"
            style={{
              height: 32,
              padding: "0 10px",
              fontSize: 13,
              fontWeight: 800,
              color: "#4b2e73",
              borderRadius: 999,
              border: "2.5px solid #4b2e73",
              background: hasSolved ? "#fff5b8" : "#ffffff",
              fontFamily: "'DM Mono', monospace",
              fontVariantNumeric: "tabular-nums",
            }}
            title={hasSolved ? "Time to solve" : "Time elapsed"}
          >
            {formatElapsed(elapsedSeconds)}
          </div>
          <button
            type="button"
            onClick={() => setShowRules(true)}
            aria-label="How to play"
            className="shrink-0 flex items-center justify-center"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "2.5px solid #4b2e73",
              background: "#ffffff",
              color: "#4b2e73",
            }}
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="relative w-full max-w-md mx-auto" style={{ aspectRatio: "1 / 1" }}>
        <div className="grid grid-cols-8 gap-1 w-full h-full select-none">
          {tiles.map(({ x, y }) => (
            <div key={key(x, y)} data-tile data-x={x} data-y={y} className={tileClassName(x, y)}>
              {renderTileContent(x, y)}
            </div>
          ))}
        </div>

        <style>{`
          @keyframes flowAnim { to { stroke-dashoffset: -0.52; } }
          @keyframes impactRingKill {
            0% { transform: scale(0.25); opacity: 0.95; }
            100% { transform: scale(2); opacity: 0; }
          }
          @keyframes impactCoreKill {
            0% { transform: scale(0.3); opacity: 1; }
            60% { transform: scale(1); opacity: 0.9; }
            100% { transform: scale(1.2); opacity: 0; }
          }
          @keyframes impactShard {
            0% { transform: scale(0.2); opacity: 1; }
            100% { transform: scale(1); opacity: 0; }
          }
          @keyframes impactRingMove {
            0% { transform: scale(0.4); opacity: 0.7; }
            100% { transform: scale(1.5); opacity: 0; }
          }
          @keyframes impactRingRotateCW {
            0% { transform: scale(0.3) rotate(0deg); opacity: 0.9; }
            100% { transform: scale(1.7) rotate(140deg); opacity: 0; }
          }
          @keyframes impactRingRotateCCW {
            0% { transform: scale(0.3) rotate(0deg); opacity: 0.9; }
            100% { transform: scale(1.7) rotate(-140deg); opacity: 0; }
          }
          @keyframes rotatorSpinCW { to { transform: rotate(360deg); } }
          @keyframes rotatorSpinCCW { to { transform: rotate(-360deg); } }
          @keyframes rotatorIdleCW {
            0%, 100% { transform: rotate(-22deg); }
            50% { transform: rotate(22deg); }
          }
          @keyframes rotatorIdleCCW {
            0%, 100% { transform: rotate(22deg); }
            50% { transform: rotate(-22deg); }
          }
          @keyframes armedGlow {
            0%, 100% { box-shadow: 0 0 0 3px #4b2e73, 0 0 8px 2px rgba(13,148,136,0.45); }
            50% { box-shadow: 0 0 0 3px #4b2e73, 0 0 16px 5px rgba(13,148,136,0.85); }
          }
          @keyframes armedSpinCW { to { transform: rotate(360deg); } }
          @keyframes armedSpinCCW { to { transform: rotate(-360deg); } }
          @keyframes buildingPulse {
            0%, 100% { box-shadow: 0 0 0 2px #ef4444, 0 0 10px 2px rgba(239,68,68,0.55); }
            50% { box-shadow: 0 0 0 2px #ef4444, 0 0 16px 5px rgba(239,68,68,0.85); }
          }
          @keyframes buildingPulseAmber {
            0%, 100% { box-shadow: 0 0 0 3px #fbbf24, 0 0 10px 3px rgba(251,191,36,0.75); }
            50% { box-shadow: 0 0 0 3px #fbbf24, 0 0 18px 6px rgba(251,191,36,1); }
          }
          @keyframes beltStripes { to { background-position: -13px 0; } }
          @keyframes enemyFire {
            0% { transform: scale(1); }
            35% { transform: scale(1.35); }
            100% { transform: scale(1); }
          }
          @keyframes popIn {
            0% { opacity: 0; transform: scale(0.92); }
            100% { opacity: 1; transform: scale(1); }
          }
        `}</style>
        <svg className="absolute inset-0" viewBox={`0 0 ${SIZE} ${SIZE}`} preserveAspectRatio="none" style={{ pointerEvents: "none" }}>
          {previewLines.map((l, i) => {
            const isPull = l.type === "pull";
            const isRotate = l.type === "rotate";
            const x1 = isPull ? l.toX : l.fromX;
            const y1 = isPull ? l.toY : l.fromY;
            const x2 = isPull ? l.fromX : l.toX;
            const y2 = isPull ? l.fromY : l.toY;
            // One color for every action line — push, pull, and rotate all
            // read as "this unit is about to do something", no need to also
            // encode which action via color.
            const color = "#0d9488";
            return (
              <g key={i}>
                <line
                  x1={x1 + 0.5}
                  y1={y1 + 0.5}
                  x2={x2 + 0.5}
                  y2={y2 + 0.5}
                  stroke={color}
                  strokeWidth="0.06"
                  strokeDasharray="0.16 0.1"
                  strokeLinecap="round"
                  style={isRotate ? undefined : { animation: "flowAnim 0.7s linear infinite" }}
                />
                <circle cx={l.toX + 0.5} cy={l.toY + 0.5} r="0.14" fill="none" stroke={color} strokeWidth="0.05" />
              </g>
            );
          })}
          {landPreviewTiles.map((p, i) => (
            <circle
              key={`land-${i}`}
              cx={p.x + 0.5}
              cy={p.y + 0.5}
              r="0.3"
              fill="rgba(239,68,68,0.3)"
              stroke="rgba(248,113,113,0.75)"
              strokeWidth="0.05"
            />
          ))}
          {rotatePreviewTargets.map((t, i) => (
            <circle
              key={`rotate-preview-${i}`}
              cx={t.x + 0.5}
              cy={t.y + 0.5}
              r="0.46"
              fill="none"
              stroke="#0d9488"
              strokeWidth="0.05"
              strokeDasharray="0.16 0.13"
              opacity="0.85"
              style={{
                transformBox: "fill-box",
                transformOrigin: "center",
                animation: `${t.spin === "ccw" ? "armedSpinCCW" : "armedSpinCW"} 7.2s linear infinite`,
              }}
            />
          ))}
          {flashTile && flashTile.kind === "kill" && (
            <g key={`flash-${revealStep}`}>
              {[0, 60, 120, 180, 240, 300].map((angle) => (
                <g key={angle} transform={`rotate(${angle} ${flashTile.x + 0.5} ${flashTile.y + 0.5})`}>
                  <line
                    x1={flashTile.x + 0.5}
                    y1={flashTile.y + 0.5}
                    x2={flashTile.x + 0.5}
                    y2={flashTile.y + 0.16}
                    stroke="#fb923c"
                    strokeWidth="0.05"
                    strokeLinecap="round"
                    style={{
                      transformBox: "fill-box",
                      transformOrigin: "50% 100%",
                      animation: "impactShard 0.45s ease-out",
                      animationDelay: `${flashDelay}s`,
                      animationFillMode: "backwards",
                    }}
                  />
                </g>
              ))}
              <circle
                cx={flashTile.x + 0.5}
                cy={flashTile.y + 0.5}
                r="0.42"
                fill="none"
                stroke="#f97316"
                strokeWidth="0.07"
                style={{
                  transformBox: "fill-box",
                  transformOrigin: "center",
                  animation: "impactRingKill 0.5s ease-out",
                  animationDelay: `${flashDelay}s`,
                  animationFillMode: "backwards",
                }}
              />
              <circle
                cx={flashTile.x + 0.5}
                cy={flashTile.y + 0.5}
                r="0.2"
                fill="#fde047"
                style={{
                  transformBox: "fill-box",
                  transformOrigin: "center",
                  animation: "impactCoreKill 0.5s ease-out",
                  animationDelay: `${flashDelay}s`,
                  animationFillMode: "backwards",
                }}
              />
            </g>
          )}
          {flashTile && flashTile.kind === "move" && (
            <circle
              key={`flash-${revealStep}`}
              cx={flashTile.x + 0.5}
              cy={flashTile.y + 0.5}
              r="0.36"
              fill="none"
              stroke="#0ea5e9"
              strokeWidth="0.06"
              style={{ transformBox: "fill-box", transformOrigin: "center", animation: "impactRingMove 0.5s ease-out" }}
            />
          )}
          {flashTile && flashTile.kind === "rotate" && (
            <circle
              key={`flash-${revealStep}`}
              cx={flashTile.x + 0.5}
              cy={flashTile.y + 0.5}
              r="0.38"
              fill="none"
              stroke="#fbbf24"
              strokeWidth="0.07"
              strokeDasharray="0.22 0.16"
              style={{
                transformBox: "fill-box",
                transformOrigin: "center",
                animation: `${flashTile.spin === "ccw" ? "impactRingRotateCCW" : "impactRingRotateCW"} 0.55s ease-out`,
              }}
            />
          )}
        </svg>

        {renderState.enemies.map((enemy, enemyIndex) => {
          const isEnemyActing = !!activeActor && activeActor.type === "enemy" && activeActor.id === enemy.id;
          return (
            <div
              key={enemy.id}
              className="flex items-center justify-center"
              style={{
                position: "absolute",
                left: `${(enemy.x / SIZE) * 100}%`,
                top: `${(enemy.y / SIZE) * 100}%`,
                width: `${100 / SIZE}%`,
                height: `${100 / SIZE}%`,
                pointerEvents: "none",
                transition: SLIDE,
                opacity: enemy.alive ? 1 : 0,
                transform: enemy.alive ? "scale(1)" : "scale(0.3)",
                zIndex: 2,
              }}
            >
              <EnemyToken dir={enemy.dir} active={isEnemyActing} />
              <EnemyTurnBadge label={enemyIndex + 1} />
            </div>
          );
        })}

        {bulletPos && (
          <div
            style={{
              position: "absolute",
              left: `${((bulletPos.x + 0.5) / SIZE) * 100}%`,
              top: `${((bulletPos.y + 0.5) / SIZE) * 100}%`,
              width: 16,
              height: 16,
              marginLeft: -8,
              marginTop: -8,
              borderRadius: "50%",
              background: "#ff3b3b",
              border: "2.5px solid #7f1d1d",
              boxShadow: "0 0 6px 1px rgba(255,59,59,0.8)",
              transition: bulletPos.animate ? "left 0.55s linear, top 0.55s linear" : "none",
              zIndex: 4,
              pointerEvents: "none",
            }}
          />
        )}

        {boardUnits.map((unit) => {
          const displayUnit = renderState.units.find((u) => u.id === unit.id);
          const isActing = !!activeActor && activeActor.type === "unit" && activeActor.id === unit.id;
          const isRotatorAbility = unit.ability === "rotate" || unit.ability === "rotate_ccw";
          const isActingRotator = isActing && isRotatorAbility;
          const isArmedRotator = phase === "planning" && isRotatorAbility && !!findPushTarget(gameState, displayUnit);
          let facingAngle = pusherFacingAngle(displayState, displayUnit);
          if (phase !== "planning" && resolution && unit.ability === "push") {
            const actionIndex = unitActionIndexById.get(unit.id);
            // Once this Pusher's own turn has played, freeze its facing at
            // the direction it actually fired in — recomputing live would
            // snap it back to unrotated the moment the pushed enemy is no
            // longer adjacent.
            if (actionIndex !== undefined && revealStep > actionIndex) {
              const beforeState = resolution.snapshots[actionIndex];
              const beforeUnit = beforeState.units.find((u) => u.id === unit.id);
              facingAngle = pusherFacingAngle(beforeState, beforeUnit);
            }
          }
          return (
            <div
              key={unit.id}
              onPointerDown={(e) => onUnitPointerDown(e, unit)}
              className="flex items-center justify-center select-none cursor-grab active:cursor-grabbing"
              style={{
                position: "absolute",
                left: `${(displayUnit.x / SIZE) * 100}%`,
                top: `${(displayUnit.y / SIZE) * 100}%`,
                width: `${100 / SIZE}%`,
                height: `${100 / SIZE}%`,
                touchAction: "none",
                transition: SLIDE,
                opacity: displayUnit.alive ? 1 : 0,
                transform: displayUnit.alive ? "scale(1)" : "scale(0.3)",
                zIndex: 3,
              }}
            >
              <div
                className="flex items-center justify-center rounded-md m-auto"
                style={{
                  width: "74%",
                  height: "74%",
                  background: "#8ad7d2",
                  color: "#4b2e73",
                  border: "2px solid #4b2e73",
                  boxSizing: "border-box",
                  fontSize: 26,
                  fontWeight: 900,
                  boxShadow: isActing ? "0 0 0 3px #fbbf24" : "none",
                  animation: !isActing && isArmedRotator ? "armedGlow 1.1s ease-in-out infinite" : "none",
                  transition: "box-shadow 0.25s ease",
                }}
              >
                <UnitIcon
                  unit={unit}
                  facingAngle={facingAngle}
                  spinAnimation={isActingRotator ? (unit.ability === "rotate" ? "rotatorSpinCW" : "rotatorSpinCCW") : null}
                  armedIdle={!isActing && isArmedRotator ? (unit.ability === "rotate" ? "rotatorIdleCW" : "rotatorIdleCCW") : null}
                />
              </div>
              {phase === "planning" && placementRankById.has(unit.id) && (
                <div
                  className="rounded-full flex items-center justify-center"
                  style={{
                    position: "absolute",
                    top: "2%",
                    right: "6%",
                    width: 16,
                    height: 16,
                    background: "#ffffff",
                    border: "1.5px solid #4b2e73",
                    color: "#4b2e73",
                    fontSize: 10,
                    fontWeight: 900,
                    lineHeight: 1,
                  }}
                >
                  {placementRankById.get(unit.id)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 mx-auto" style={{ width: "100%", maxWidth: 448 }}>
        <div
          data-hand
          className="flex flex-wrap gap-3 p-3"
          style={{
            width: "100%",
            height: 100,
            overflow: "hidden",
            boxSizing: "border-box",
            borderRadius: 12,
            border: "2.5px dashed #a07fc4",
            background: "#fff8fb",
          }}
        >
          {handUnits.map((unit) => (
            <div key={unit.id} className="flex flex-col items-center gap-1">
              <div
                onPointerDown={(e) => onUnitPointerDown(e, unit)}
                className="w-12 h-12 flex items-center justify-center rounded-md cursor-grab active:cursor-grabbing select-none"
                style={{
                  touchAction: "none",
                  background: "#8ad7d2",
                  color: "#4b2e73",
                  border: "2.5px solid #4b2e73",
                  boxSizing: "border-box",
                  fontSize: 24,
                  fontWeight: 900,
                }}
              >
                <UnitIcon unit={unit} size={24} inHand />
              </div>
              <span style={{ color: "#4b2e73", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 11 }}>{unit.name}</span>
            </div>
          ))}
          {handUnits.length === 0 && phase === "planning" && (
            <span style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 13 }} className="flex items-center px-2">
              All pieces played
            </span>
          )}
        </div>
      </div>

      {drag && draggedUnit && (
        <div
          style={{ position: "fixed", left: dragPos.x, top: dragPos.y, width: 48, height: 48, transform: "translate(-50%, -50%)", zIndex: 50, pointerEvents: "none" }}
          className="flex items-center justify-center"
        >
          <div
            className="w-full h-full flex items-center justify-center rounded-md"
            style={{ background: "#8ad7d2", color: "#4b2e73", border: "2.5px solid #4b2e73", boxSizing: "border-box", fontSize: 26, fontWeight: 900 }}
          >
            <UnitIcon unit={draggedUnit} inHand={!draggedUnit.onBoard} />
          </div>
        </div>
      )}

      {phase === "done" && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}
        >
          <div
            className="w-full max-w-xs mx-4 text-center"
            style={{
              background: "#ffffff",
              border: "3px solid #4b2e73",
              borderRadius: 16,
              padding: 24,
              fontFamily: "'Baloo 2', system-ui, sans-serif",
              animation: "popIn 0.25s ease-out",
            }}
          >
            {resolution.outcome === "success" ? (
              <>
                <p style={{ color: "#16a34a", fontWeight: 800, fontSize: 26, marginBottom: 4 }}>Congratulations!</p>
                <p style={{ color: "#4b2e73", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                  Solved in {formatElapsed(elapsedSeconds)}
                </p>
                <p style={{ color: "#4b2e73", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 14, marginBottom: 20 }}>
                  {streak === null ? "\u2014" : `${streak} day streak`}
                </p>
                {isDaily && (
                  <p style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 11, marginBottom: 16 }}>
                    Come back tomorrow for the next puzzle.
                  </p>
                )}
              </>
            ) : (
              <p style={{ color: "#dc2626", fontWeight: 800, fontSize: 26, marginBottom: 24 }}>Lost</p>
            )}
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={retryPlan}
                className="flex-1 flex items-center justify-center gap-1"
                style={{
                  padding: "10px 0",
                  borderRadius: 12,
                  border: "2.5px solid #4b2e73",
                  background: "#ffb3d0",
                  color: "#4b2e73",
                  fontWeight: 800,
                  fontFamily: "'Baloo 2', system-ui, sans-serif",
                }}
              >
                <RotateCcw className="w-5 h-5" /> Reset
              </button>
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 12,
                    border: "2.5px solid #4b2e73",
                    background: "#ffffff",
                    color: "#4b2e73",
                    fontWeight: 800,
                    fontFamily: "'Baloo 2', system-ui, sans-serif",
                  }}
                >
                  Menu
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 max-w-md mx-auto flex gap-2">
        <button
          type="button"
          onClick={play}
          disabled={phase !== "planning"}
          className="flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            padding: "10px 0",
            borderRadius: 12,
            border: "2.5px solid #4b2e73",
            background: "#ffb3d0",
            color: "#4b2e73",
            fontWeight: 800,
            fontFamily: "'Baloo 2', system-ui, sans-serif",
            fontSize: 16,
          }}
        >
          Play
        </button>
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-1"
          style={{
            padding: "10px 16px",
            borderRadius: 12,
            border: "2.5px solid #4b2e73",
            background: "#ffffff",
            color: "#4b2e73",
            fontWeight: 800,
            fontFamily: "'Baloo 2', system-ui, sans-serif",
          }}
        >
          <RotateCcw className="w-5 h-5" /> Reset
        </button>
      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      {showIntro && (
        <IntroScreen
          onClose={dismissIntro}
          onShowRules={() => {
            dismissIntro();
            setShowRules(true);
          }}
        />
      )}
    </div>
  );
}

// --- Daily puzzle selection ---------------------------------------------
//
// No backend needed: every visitor's browser computes the same "day index"
// from today's date, and indexes into the same ordered level list — so
// everyone sees the same puzzle on the same day (like Wordle), purely
// client-side.
//
// LAUNCH_DATE is day 1. Change this once, when you actually launch, and
// never change it again — moving it later would shift which puzzle
// everyone sees on a given day.
const LAUNCH_DATE = "2026-08-19"; // YYYY-MM-DD calendar date, rolls over per amsterdamPuzzleDateStr()

// The puzzle rolls over at 9am Europe/Amsterdam time, not UTC midnight —
// before 9am local it's still showing the previous calendar day's puzzle.
// Intl's timeZone support handles CET/CEST (DST) automatically, so this
// stays correct year-round without a date library.
export function amsterdamPuzzleDateStr() {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = {};
  for (const p of fmt.formatToParts(new Date())) parts[p.type] = p.value;
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const hour = Number(parts.hour) % 24; // midnight can render as "24" in some engines
  const effectiveDay = hour < 9 ? d - 1 : d; // Date.UTC normalizes an out-of-range day fine
  return new Date(Date.UTC(y, m - 1, effectiveDay)).toISOString().slice(0, 10);
}

export function dayIndexSince(launchDateStr) {
  const start = new Date(launchDateStr + "T00:00:00Z").getTime();
  const today = new Date(amsterdamPuzzleDateStr() + "T00:00:00Z").getTime();
  const diffDays = Math.floor((today - start) / 86400000);
  return Math.max(0, diffDays);
}

function pickDailyLevel(levels, launchDateStr) {
  const dayIndex = dayIndexSince(launchDateStr);
  const dayNumber = dayIndex + 1;
  // A level authored with a `date` (set in the Puzzle Lab editor) always wins
  // for that calendar date, so purpose-built levels can be scheduled ahead —
  // see the README for the editor -> BUILT_IN_LEVELS workflow.
  const dated = levels.find((l) => l.date === amsterdamPuzzleDateStr());
  if (dated) return { level: dated, dayNumber };
  // No dated level for today — fall back to cycling through the undated
  // list. Add more levels over time so it doesn't visibly repeat.
  const level = levels[dayIndex % levels.length];
  return { level, dayNumber };
}

// ---------------------------------------------------------------------------
// Hidden puzzle-lab route, reachable only at /config (never linked from the
// game itself). Not real security — the password check runs client-side and
// the shipped code is publicly readable — it's just a speed bump to keep the
// live puzzle list from being casually stumbled into. Unlocking only lasts
// the current browser tab session.
// ---------------------------------------------------------------------------
const CONFIG_PASSWORD = "Polpette12";

function ConfigGate({ onUnlock }) {
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);

  function submit(e) {
    e.preventDefault();
    if (value === CONFIG_PASSWORD) {
      try {
        sessionStorage.setItem("puzzlelab_config_unlocked", "1");
      } catch (err) {
        // ignore — unlock still works for this render, just won't persist
      }
      onUnlock();
    } else {
      setWrong(true);
    }
  }

  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#ffe9f3",
        backgroundImage: "linear-gradient(#ffffff 2px, transparent 2px), linear-gradient(90deg, #ffffff 2px, transparent 2px)",
        backgroundSize: "36px 36px",
      }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-xs mx-4"
        style={{ background: "#ffffff", border: "3px solid #4b2e73", borderRadius: 16, padding: 24, fontFamily: "'Baloo 2', system-ui, sans-serif" }}
      >
        <p style={{ color: "#4b2e73", fontWeight: 800, fontSize: 18, marginBottom: 16 }}>Puzzle lab</p>
        <input
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setWrong(false);
          }}
          autoFocus
          className="w-full focus:outline-none"
          style={{
            border: "2px solid #4b2e73",
            borderRadius: 10,
            padding: "8px 12px",
            color: "#4b2e73",
            background: "#fff8fb",
            marginBottom: 12,
            fontFamily: "'Baloo 2', system-ui, sans-serif",
            fontWeight: 700,
          }}
          placeholder="Password"
        />
        {wrong && <p style={{ color: "#dc2626", fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, marginBottom: 12 }}>Wrong password.</p>}
        <button
          type="submit"
          className="w-full"
          style={{ padding: "10px 0", borderRadius: 12, border: "2.5px solid #4b2e73", background: "#ffb3d0", color: "#4b2e73", fontWeight: 800 }}
        >
          Unlock
        </button>
      </form>
    </div>
  );
}

function PuzzleRow({ level, highlight, onEdit, onPlay }) {
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-md px-3 py-2"
      style={{ border: highlight ? "2px solid #4b2e73" : "1.5px solid #e2c7d8", background: highlight ? "#fff5b8" : "#fff8fb" }}
    >
      <div className="min-w-0">
        <p className="text-sm truncate" style={{ color: "#4b2e73", fontWeight: 800 }}>
          {level.name}
          {level.date && (
            <span className="ml-2" style={{ color: "#0d9488", fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700 }}>
              {level.date}
            </span>
          )}
        </p>
        {level.hint && <p className="text-xs truncate" style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace" }}>{level.hint}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onPlay(level)}
          className="px-2 py-1 rounded text-xs"
          style={{ background: "#8ad7d2", border: "1.5px solid #4b2e73", color: "#4b2e73", fontWeight: 800 }}
        >
          Play
        </button>
        <button type="button" onClick={() => onEdit(level)} className="p-1.5 rounded" style={{ border: "1.5px solid #4b2e73", color: "#4b2e73" }}>
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// Sorted-by-date list of every puzzle baked into this build, plus a computed
// "next puzzle needed" date — one day after whichever dated puzzle is
// scheduled furthest out (or today, if none are scheduled ahead) — so it's
// obvious what to build next without cross-checking the calendar by hand.
function PuzzleListScreen({ onEdit, onNew, onPlay, onBackToGames }) {
  const dated = BUILT_IN_LEVELS.filter((l) => l.date).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const undated = BUILT_IN_LEVELS.filter((l) => !l.date);
  const today = amsterdamPuzzleDateStr();
  const maxDated = dated.length ? dated[dated.length - 1].date : null;
  let nextNeeded = maxDated ? shiftDateStr(maxDated, 1) : today;
  if (nextNeeded < today) nextNeeded = today;

  return (
    <div
      style={{ maxWidth: 480, margin: "0 auto", background: "#ffffff", border: "3px solid #4b2e73", borderRadius: 16, padding: 24, fontFamily: "'Baloo 2', system-ui, sans-serif" }}
    >
      {onBackToGames && (
        <button
          type="button"
          onClick={onBackToGames}
          className="flex items-center gap-1 mb-3"
          style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, background: "none", border: "none", padding: 0 }}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All games
        </button>
      )}
      <h2 style={{ color: "#4b2e73", fontWeight: 800, fontSize: 20, marginBottom: 4 }}>Defender puzzle lab</h2>
      <p style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontSize: 12, marginBottom: 16 }}>{BUILT_IN_LEVELS.length} puzzles in this build.</p>

      <div className="mb-5 p-3 rounded-lg" style={{ border: "2px solid #4b2e73", background: "#fff5b8" }}>
        <p style={{ color: "#4b2e73", fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>
          Next puzzle needed
        </p>
        <p style={{ color: "#4b2e73", fontWeight: 800, fontSize: 18 }}>{nextNeeded}</p>
        <button
          type="button"
          onClick={() => onNew(nextNeeded)}
          className="mt-2 w-full py-2 rounded-lg text-sm flex items-center justify-center gap-1"
          style={{ background: "#ffb3d0", border: "2px solid #4b2e73", color: "#4b2e73", fontWeight: 800 }}
        >
          <Plus className="w-4 h-4" /> New puzzle for {nextNeeded}
        </button>
      </div>

      <p style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>Dated puzzles</p>
      <div className="space-y-2 mb-5">
        {dated.map((lvl) => (
          <PuzzleRow key={lvl.id} level={lvl} highlight={lvl.date === today} onEdit={onEdit} onPlay={onPlay} />
        ))}
      </div>

      <p style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
        Undated (rotation) puzzles
      </p>
      <div className="space-y-2">
        {undated.map((lvl) => (
          <PuzzleRow key={lvl.id} level={lvl} onEdit={onEdit} onPlay={onPlay} />
        ))}
      </div>
    </div>
  );
}

// A trimmed copy of the level editor's drag-to-build screen (see
// level-editor/puzzle-lab.jsx for the full version with the dev menu and
// window.storage saving) — just enough to draft a new puzzle here and get
// its JSON out. There's no live "Save": paste the exported JSON to Claude
// Code to actually get it added to BUILT_IN_LEVELS and deployed.
function PuzzleEditorScreen({ initialLevel, onBack, onTest }) {
  const [draft, setDraft] = useState(() => {
    const lvl = clone(initialLevel);
    if (!lvl.water) lvl.water = [];
    return lvl;
  });
  const [tool, setTool] = useState("wall");
  const [copyStatus, setCopyStatus] = useState("idle");
  const [aimDrag, setAimDrag] = useState(null);
  const [aimPreview, setAimPreview] = useState(null);
  const paintingRef = useRef(false);
  const lastPaintedKeyRef = useRef(null);

  function clearTile(next, x, y) {
    next.walls = next.walls.filter((w) => !(w.x === x && w.y === y));
    next.water = next.water.filter((w) => !(w.x === x && w.y === y));
    next.conveyors = next.conveyors.filter((c) => !(c.x === x && c.y === y));
    next.buildings = next.buildings.filter((b) => !(b.x === x && b.y === y));
    next.enemies = next.enemies.filter((e) => !(e.x === x && e.y === y));
  }

  function applyToolAt(x, y) {
    setDraft((prev) => {
      const next = clone(prev);
      clearTile(next, x, y);
      if (tool === "wall") next.walls.push({ x, y });
      else if (tool === "water") next.water.push({ x, y });
      else if (tool === "building") next.buildings.push({ id: uid("b"), name: `Structure ${next.buildings.length + 1}`, x, y });
      else if (tool === "enemy")
        next.enemies.push({ id: uid("e"), name: `Enemy ${next.enemies.length + 1}`, x, y, dir: { dx: 1, dy: 0 } });
      return next;
    });
  }

  function eraseAt(x, y) {
    setDraft((prev) => {
      const next = clone(prev);
      clearTile(next, x, y);
      return next;
    });
  }

  function onTilePointerDown(e, x, y) {
    e.preventDefault();
    const existingEnemy = draft.enemies.find((en) => en.x === x && en.y === y);
    if (existingEnemy && tool !== "eraser") {
      setAimDrag({ enemyId: existingEnemy.id, startX: x, startY: y });
      setAimPreview(null);
      return;
    }
    paintingRef.current = true;
    lastPaintedKeyRef.current = key(x, y);
    if (tool === "eraser") eraseAt(x, y);
    else applyToolAt(x, y);
  }

  useEffect(() => {
    function onMove(e) {
      if (!paintingRef.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const tileEl = el && el.closest("[data-tile-editor]");
      if (!tileEl) return;
      const x = Number(tileEl.dataset.x);
      const y = Number(tileEl.dataset.y);
      const k = key(x, y);
      if (k === lastPaintedKeyRef.current) return;
      lastPaintedKeyRef.current = k;
      if (tool === "eraser") eraseAt(x, y);
      else if (tool !== "enemy") applyToolAt(x, y);
    }
    function onUp() {
      paintingRef.current = false;
      lastPaintedKeyRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [tool]);

  useEffect(() => {
    if (!aimDrag) return;
    function onMove(e) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const tileEl = el && el.closest("[data-tile-editor]");
      if (!tileEl) return;
      const x = Number(tileEl.dataset.x);
      const y = Number(tileEl.dataset.y);
      const dx = x - aimDrag.startX;
      const dy = y - aimDrag.startY;
      if (dx === 0 && dy === 0) {
        setAimPreview(null);
        return;
      }
      const dir = Math.abs(dx) >= Math.abs(dy) ? { dx: dx > 0 ? 1 : -1, dy: 0 } : { dx: 0, dy: dy > 0 ? 1 : -1 };
      setAimPreview({ dir });
    }
    function onUp() {
      setAimPreview((preview) => {
        if (preview) {
          setDraft((prev) => {
            const next = clone(prev);
            const enemy = next.enemies.find((en) => en.id === aimDrag.enemyId);
            if (enemy) enemy.dir = preview.dir;
            return next;
          });
        }
        return null;
      });
      setAimDrag(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [aimDrag]);

  function addUnit(ability) {
    setDraft((prev) => {
      const next = clone(prev);
      const isRotator = ability === "rotate" || ability === "rotate_ccw";
      const label = ability === "push" ? "Pusher" : ability === "pull" ? "Puller" : isRotator ? "Rotator" : "Blocker";
      const count = next.units.filter((u) => u.ability === ability).length + 1;
      const name = isRotator ? label : count > 1 ? `${label} ${count}` : label;
      next.units.push({ id: uid("u"), name, ability });
      return next;
    });
  }
  function removeUnit(id) {
    setDraft((prev) => ({ ...prev, units: prev.units.filter((u) => u.id !== id) }));
  }

  async function handleCopyJson() {
    const json = JSON.stringify(draft, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setCopyStatus("copied");
    } catch (e) {
      setCopyStatus("error");
    }
    setTimeout(() => setCopyStatus("idle"), 2000);
  }

  const tiles = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) tiles.push({ x, y });

  const previewTiles = [];
  if (aimDrag && aimPreview) {
    let x = aimDrag.startX;
    let y = aimDrag.startY;
    while (true) {
      x += aimPreview.dir.dx;
      y += aimPreview.dir.dy;
      if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) break;
      previewTiles.push({ x, y });
    }
  }

  const tileClassName = "relative aspect-square flex items-center justify-center rounded-sm";

  function tileStyle(x, y) {
    const isAimStart = aimDrag && aimDrag.startX === x && aimDrag.startY === y;
    const inPreview = previewTiles.some((t) => t.x === x && t.y === y);
    if (isAimStart) return { border: "2px solid #4b2e73", background: "#c9e9e6", touchAction: "none" };
    if (inPreview) return { border: "2px solid #fbbf24", background: "#fff5b8", touchAction: "none" };
    return { border: "1px solid #e2c7d8", background: "#ffffff", touchAction: "none" };
  }

  function tileContent(x, y) {
    const wall = draft.walls.find((w) => w.x === x && w.y === y);
    const water = draft.water.find((w) => w.x === x && w.y === y);
    const conv = draft.conveyors.find((c) => c.x === x && c.y === y);
    const b = draft.buildings.find((b) => b.x === x && b.y === y);
    const e = draft.enemies.find((e) => e.x === x && e.y === y);
    return (
      <>
        <TerrainMark wall={!!wall} water={!!water} conveyor={conv} />
        {b && <div className="rounded-sm" style={{ width: "52%", height: "52%", zIndex: 1, position: "relative", background: "#fff5b8", border: "2px solid #4b2e73", boxSizing: "border-box" }} />}
        {e && (
          <div style={{ zIndex: 1, position: "relative" }}>
            <EnemyToken dir={e.dir} label={draft.enemies.indexOf(e) + 1} />
          </div>
        )}
      </>
    );
  }

  const toolSwatchStyle = (active) => ({
    width: 44,
    height: 44,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: active ? "2.5px solid #4b2e73" : "2px solid #e2c7d8",
    boxSizing: "border-box",
    background: "#ffffff",
  });
  const addUnitBtnStyle = {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "5px 8px",
    borderRadius: 8,
    border: "1.5px solid #4b2e73",
    color: "#4b2e73",
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
    fontWeight: 700,
    background: "#ffffff",
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", background: "#ffffff", border: "3px solid #4b2e73", borderRadius: 16, padding: 24, fontFamily: "'Baloo 2', system-ui, sans-serif" }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <input
          value={draft.name}
          onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
          className="bg-transparent focus:outline-none flex-1"
          style={{ fontSize: 22, fontWeight: 800, color: "#4b2e73", borderBottom: "2px solid #e2c7d8", paddingBottom: 2 }}
          placeholder="Level name"
        />
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 flex items-center justify-center"
          style={{ width: 32, height: 32, borderRadius: 10, border: "2.5px solid #4b2e73", background: "#ffffff", color: "#4b2e73" }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
      </div>

      <input
        value={draft.hint}
        onChange={(e) => setDraft((prev) => ({ ...prev, hint: e.target.value }))}
        className="w-full block focus:outline-none mb-2"
        style={{ border: "2px solid #e2c7d8", borderRadius: 10, padding: "8px 12px", fontSize: 13, color: "#4b2e73", fontWeight: 700, background: "#fff8fb" }}
        placeholder="One-line hint shown to the player"
      />

      <div className="mb-4 flex items-center gap-2">
        <label className="shrink-0" style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700 }}>
          Scheduled date
        </label>
        <input
          type="date"
          value={draft.date || ""}
          onChange={(e) => setDraft((prev) => ({ ...prev, date: e.target.value }))}
          className="focus:outline-none"
          style={{ border: "2px solid #e2c7d8", borderRadius: 10, padding: "6px 10px", fontSize: 13, color: "#4b2e73", fontWeight: 700, background: "#fff8fb" }}
        />
      </div>

      <div className="mb-2 flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => setTool("eraser")} style={toolSwatchStyle(tool === "eraser")}>
          <Eraser className="w-5 h-5" style={{ color: "#4b2e73" }} />
        </button>
        <button type="button" onClick={() => setTool("wall")} style={{ ...toolSwatchStyle(tool === "wall"), background: "#4b2e73" }} />
        <button type="button" onClick={() => setTool("water")} style={{ ...toolSwatchStyle(tool === "water"), background: "#6ec3e8" }} />
        <button type="button" onClick={() => setTool("building")} style={toolSwatchStyle(tool === "building")}>
          <div className="rounded-sm" style={{ width: 18, height: 18, background: "#fff5b8", border: "2px solid #4b2e73", boxSizing: "border-box" }} />
        </button>
        <button type="button" onClick={() => setTool("enemy")} style={toolSwatchStyle(tool === "enemy")}>
          <div className="rounded-md flex items-center justify-center" style={{ width: 20, height: 20, background: "#dc2626", border: "1.5px solid #4b2e73", color: "#fff", fontSize: 13, fontWeight: 900, boxSizing: "border-box" }}>
            ▲
          </div>
        </button>
      </div>

      <p className="mb-3" style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700 }}>
        Hold and drag to paint. Drag from a placed enemy to aim it.
      </p>

      <div className="relative w-full" style={{ aspectRatio: "1 / 1" }}>
        <div className="grid grid-cols-8 gap-1 w-full h-full select-none">
          {tiles.map(({ x, y }) => (
            <button
              key={key(x, y)}
              type="button"
              data-tile-editor
              data-x={x}
              data-y={y}
              onPointerDown={(e) => onTilePointerDown(e, x, y)}
              className={tileClassName}
              style={tileStyle(x, y)}
            >
              {tileContent(x, y)}
            </button>
          ))}
        </div>
        {aimDrag && aimPreview && (
          <svg className="absolute inset-0" viewBox={`0 0 ${SIZE} ${SIZE}`} preserveAspectRatio="none" style={{ pointerEvents: "none" }}>
            <line
              x1={aimDrag.startX + 0.5}
              y1={aimDrag.startY + 0.5}
              x2={aimDrag.startX + 0.5 + aimPreview.dir.dx * previewTiles.length}
              y2={aimDrag.startY + 0.5 + aimPreview.dir.dy * previewTiles.length}
              stroke="#4b2e73"
              strokeWidth="0.08"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>

      <div className="mt-4">
        <p className="mb-1" style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700 }}>
          Units in hand
        </p>
        <div className="flex flex-wrap gap-2 p-3 rounded-md min-h-14" style={{ border: "2.5px dashed #a07fc4", background: "#fff8fb" }}>
          {draft.units.map((u) => (
            <span
              key={u.id}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs"
              style={{ background: "#ffffff", border: "1.5px solid #4b2e73", color: "#4b2e73", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}
            >
              <span className="flex items-center justify-center rounded" style={{ width: 16, height: 16, background: "#8ad7d2", color: "#4b2e73" }}>
                <UnitIcon unit={u} size={11} />
              </span>
              {u.name}
              <button type="button" onClick={() => removeUnit(u.id)} className="ml-1" style={{ color: "#a07fc4" }}>
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2 mt-2 flex-wrap">
          <button type="button" onClick={() => addUnit("push")} style={addUnitBtnStyle}>
            <Plus className="w-3 h-3" /> Pusher
          </button>
          <button type="button" onClick={() => addUnit("pull")} style={addUnitBtnStyle}>
            <Plus className="w-3 h-3" /> Puller
          </button>
          <button type="button" onClick={() => addUnit("block")} style={addUnitBtnStyle}>
            <Plus className="w-3 h-3" /> Blocker
          </button>
          <button type="button" onClick={() => addUnit("rotate")} style={addUnitBtnStyle}>
            <Plus className="w-3 h-3" /> Rotator
          </button>
          <button type="button" onClick={() => addUnit("rotate_ccw")} style={addUnitBtnStyle}>
            <Plus className="w-3 h-3" /> Counter-rotator
          </button>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => onTest(draft)}
          className="flex-1"
          style={{ padding: "10px 0", borderRadius: 12, border: "2.5px solid #4b2e73", background: "#ffb3d0", color: "#4b2e73", fontWeight: 800, fontSize: 14 }}
        >
          Test play
        </button>
        <button
          type="button"
          onClick={handleCopyJson}
          style={{ padding: "10px 16px", borderRadius: 12, border: "2.5px solid #4b2e73", background: "#ffffff", color: "#4b2e73", fontWeight: 800, fontSize: 14 }}
        >
          {copyStatus === "copied" ? "Copied!" : copyStatus === "error" ? "Copy failed" : "Copy JSON"}
        </button>
      </div>

      <p className="mt-4" style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>
        Click a tile to place the selected tool. Click again to clear or replace it.
      </p>
      <p className="mt-1" style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>
        "Copy JSON" is the only way this actually ships — paste it into a Claude Code conversation and ask it to add the level to BUILT_IN_LEVELS.
      </p>
    </div>
  );
}

// Landing screen inside the puzzle lab once unlocked — picks which game's
// test tools to open. Defender keeps its existing list/edit/play screens;
// Xenoglyph gets a simpler "pick any signal, play it" list below, since it
// has no level editor of its own yet.
function GameHubScreen({ onSelect }) {
  const tileStyle = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 18px",
    borderRadius: 14,
    border: "2.5px solid #4b2e73",
    background: "#fff8fb",
    textAlign: "left",
    width: "100%",
  };
  return (
    <div
      style={{ maxWidth: 480, margin: "0 auto", background: "#ffffff", border: "3px solid #4b2e73", borderRadius: 16, padding: 24, fontFamily: "'Baloo 2', system-ui, sans-serif" }}
    >
      <h2 style={{ color: "#4b2e73", fontWeight: 800, fontSize: 20, marginBottom: 4 }}>Puzzle lab</h2>
      <p style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontSize: 12, marginBottom: 16 }}>Pick a game to test.</p>
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => onSelect("defender")} style={tileStyle}>
          <div style={{ width: 40, height: 40, flex: "none", borderRadius: "50%", border: "3px solid #4b2e73", background: "#8ad7d2", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 16, height: 16, border: "3px solid #4b2e73", borderRadius: "50%", background: "#fff5b8" }} />
          </div>
          <div>
            <p style={{ color: "#4b2e73", fontWeight: 800, fontSize: 16 }}>Defender</p>
            <p style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{BUILT_IN_LEVELS.length} puzzles · has an editor</p>
          </div>
        </button>
        <button type="button" onClick={() => onSelect("xenoglyph")} style={tileStyle}>
          <div style={{ width: 40, height: 40, flex: "none", borderRadius: 12, border: "3px solid #4b2e73", background: "#f5eefc", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "'Noto Sans Old North Arabian', 'Baloo 2', serif", fontSize: 20, color: "#4b2e73" }}>
              {XENOGLYPH_SIGNALS[0].vocabulary[0].glyph}
            </span>
          </div>
          <div>
            <p style={{ color: "#4b2e73", fontWeight: 800, fontSize: 16 }}>Xenoglyph</p>
            <p style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{XENOGLYPH_SIGNALS.length} signals · pick one to test</p>
          </div>
        </button>
      </div>
    </div>
  );
}

// Xenoglyph has no editor yet — this just lists every signal baked into the
// build so any of them can be played on demand while testing, regardless of
// which one today's date would actually pick.
function XenoglyphSignalListScreen({ onBack, onPlay }) {
  return (
    <div
      style={{ maxWidth: 480, margin: "0 auto", background: "#ffffff", border: "3px solid #4b2e73", borderRadius: 16, padding: 24, fontFamily: "'Baloo 2', system-ui, sans-serif" }}
    >
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 mb-3"
        style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, background: "none", border: "none", padding: 0 }}
      >
        <ArrowLeft className="w-3.5 h-3.5" /> All games
      </button>
      <h2 style={{ color: "#4b2e73", fontWeight: 800, fontSize: 20, marginBottom: 4 }}>Xenoglyph signals</h2>
      <p style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontSize: 12, marginBottom: 16 }}>
        {XENOGLYPH_SIGNALS.length} signals in this build. Playing here never touches your real streak.
      </p>
      <div className="space-y-2">
        {XENOGLYPH_SIGNALS.map((sig, i) => (
          <div
            key={sig.id}
            className="flex items-center justify-between gap-2 rounded-md px-3 py-2"
            style={{ border: "1.5px solid #e2c7d8", background: "#fff8fb" }}
          >
            <div className="min-w-0 flex items-center gap-2">
              <span style={{ fontFamily: "'Noto Sans Old North Arabian', 'Baloo 2', serif", fontSize: 20, color: "#4b2e73", flex: "none" }}>
                {sig.vocabulary[0].glyph}
              </span>
              <div className="min-w-0">
                <p className="text-sm truncate" style={{ color: "#4b2e73", fontWeight: 800 }}>
                  #{i + 1} · {sig.headline}
                </p>
                <p className="text-xs truncate" style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace" }}>
                  {sig.vocabulary.map((v) => v.meaning).join(", ")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onPlay(sig)}
              className="px-2 py-1 rounded text-xs shrink-0"
              style={{ background: "#8ad7d2", border: "1.5px solid #4b2e73", color: "#4b2e73", fontWeight: 800 }}
            >
              Play
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfigApp() {
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return sessionStorage.getItem("puzzlelab_config_unlocked") === "1";
    } catch (e) {
      return false;
    }
  });
  const [game, setGame] = useState(null); // null | "defender" | "xenoglyph"
  const [screen, setScreen] = useState("list");
  const [editorInitial, setEditorInitial] = useState(null);
  const [activeLevel, setActiveLevel] = useState(null);
  const [playedFromEdit, setPlayedFromEdit] = useState(false);
  const [xgActiveSignal, setXgActiveSignal] = useState(null);

  // #root is pinned to a fixed height with overflow:hidden (so the drag-driven
  // game itself never scrolls the page) — this screen needs its own explicit
  // height + overflow:auto to actually become a scroll container inside that,
  // since a `minHeight` alone would just get clipped by the ancestor instead.
  const outerStyle = {
    height: "100dvh",
    overflowY: "auto",
    backgroundColor: "#ffe9f3",
    backgroundImage: "linear-gradient(#ffffff 2px, transparent 2px), linear-gradient(90deg, #ffffff 2px, transparent 2px)",
    backgroundSize: "36px 36px",
    padding: "24px 16px",
    boxSizing: "border-box",
  };

  if (!unlocked) return <ConfigGate onUnlock={() => setUnlocked(true)} />;

  if (!game) {
    return (
      <div style={outerStyle}>
        <GameHubScreen onSelect={setGame} />
      </div>
    );
  }

  if (game === "xenoglyph") {
    if (xgActiveSignal) {
      return (
        <div style={outerStyle}>
          <XenoglyphApp signal={xgActiveSignal} onBack={() => setXgActiveSignal(null)} />
        </div>
      );
    }
    return (
      <div style={outerStyle}>
        <XenoglyphSignalListScreen onBack={() => setGame(null)} onPlay={setXgActiveSignal} />
      </div>
    );
  }

  if (screen === "play" && activeLevel) {
    return (
      <div style={outerStyle}>
        <PlayScreen
          level={activeLevel}
          onBack={() => setScreen(playedFromEdit ? "edit" : "list")}
        />
      </div>
    );
  }
  if (screen === "edit" && editorInitial) {
    return (
      <div style={outerStyle}>
        <PuzzleEditorScreen
          initialLevel={editorInitial}
          onBack={() => setScreen("list")}
          onTest={(draft) => {
            setEditorInitial(draft);
            setActiveLevel(draft);
            setPlayedFromEdit(true);
            setScreen("play");
          }}
        />
      </div>
    );
  }
  return (
    <div style={outerStyle}>
      <PuzzleListScreen
        onEdit={(lvl) => {
          setEditorInitial(clone(lvl));
          setPlayedFromEdit(false);
          setScreen("edit");
        }}
        onNew={(dateStr) => {
          setEditorInitial({ ...blankLevel(), date: dateStr });
          setPlayedFromEdit(false);
          setScreen("edit");
        }}
        onPlay={(lvl) => {
          setActiveLevel(lvl);
          setPlayedFromEdit(false);
          setScreen("play");
        }}
        onBackToGames={() => setGame(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Future ecosystem hub, reachable only at /home (not linked from anywhere
// yet — dailygiu.com itself stays this one game for now). Pixel-matches the
// "Daily Games Home" design handoff: a retro-window header plus a card per
// game. Confluence and Queens 2 are placeholders from that handoff, not real
// games — their taps are stubs until those games actually exist.
// ---------------------------------------------------------------------------
function GameCard({ gameNo, chromeColor, squareColors, iconBg, iconRadius, iconInner, name, tagline, puzzleNumber, streak, streakBg, onPlay, comingSoon = false }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={comingSoon ? undefined : onPlay}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: "unset",
        cursor: comingSoon ? "default" : "pointer",
        display: "block",
        width: "100%",
        boxSizing: "border-box",
        fontFamily: "'Baloo 2', system-ui, sans-serif",
        opacity: comingSoon ? 0.55 : 1,
        transform: !comingSoon && hover ? "translate(-2px, -2px)" : "none",
        transition: "transform 0.1s ease",
      }}
    >
      <div style={{ background: "#ffffff", border: "3px solid #4b2e73", borderRadius: 16, overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: chromeColor,
            borderBottom: "3px solid #4b2e73",
            padding: "6px 10px",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: "#4b2e73", letterSpacing: ".1em", textTransform: "uppercase", fontFamily: "'DM Mono', monospace" }}>
            game {gameNo}
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            {squareColors.map((c, i) => (
              <div key={i} style={{ width: 11, height: 11, border: "2.5px solid #4b2e73", borderRadius: "50%", background: c }} />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 16px" }}>
          <div
            style={{
              width: 52,
              height: 52,
              flex: "none",
              border: "3px solid #4b2e73",
              borderRadius: iconRadius,
              background: iconBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {iconInner}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
            <div style={{ fontSize: 27, fontWeight: 800, color: "#4b2e73", lineHeight: 1.05 }}>{name}</div>
            {tagline && <div style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", color: "#a07fc4" }}>{tagline}</div>}
            {puzzleNumber != null && (
              <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 700, color: "#4b2e73", letterSpacing: ".04em" }}>
                puzzle #{puzzleNumber}
              </div>
            )}
          </div>
          <div
            style={{
              flex: "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              width: comingSoon ? 44 : undefined,
              height: comingSoon ? 44 : undefined,
              background: comingSoon ? "#e5e0e8" : streakBg,
              border: "3px solid #4b2e73",
              borderRadius: 12,
              padding: comingSoon ? 0 : "7px 9px",
              boxSizing: "border-box",
            }}
          >
            {!comingSoon && (
              <>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#4b2e73", lineHeight: 1, display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ fontSize: 13 }}>🔥</span>
                  {streak}
                </div>
                <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: "#4b2e73", letterSpacing: ".12em" }}>STREAK</div>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function DailyGamesHome() {
  // Baloo 2 + DM Mono are loaded globally via index.html now (the main game
  // uses them too), so no per-route font injection is needed here anymore.

  // Same puzzle-day convention as the rest of the site (9am Amsterdam
  // rollover), formatted the way the design calls for: "friday, aug 21".
  const dateLine = new Date(amsterdamPuzzleDateStr() + "T12:00:00Z")
    .toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })
    .toLowerCase();
  // Defender is the real, already-live game — its card shows the player's
  // actual streak (same source as the in-game header badge) and today's
  // puzzle number (same source as the "PUZZLE #N" label in the game itself),
  // not mocks.
  const defenderStreak = getCurrentStreak();
  const { dayNumber: defenderPuzzleNumber } = pickDailyLevel(BUILT_IN_LEVELS, LAUNCH_DATE);

  return (
    <div
      style={{
        height: "100dvh",
        overflowY: "auto",
        width: "100%",
        backgroundColor: "#ffe9f3",
        backgroundImage: "linear-gradient(#ffffff 2px, transparent 2px), linear-gradient(90deg, #ffffff 2px, transparent 2px)",
        backgroundSize: "36px 36px",
        display: "flex",
        justifyContent: "center",
        fontFamily: "'Baloo 2', system-ui, sans-serif",
        boxSizing: "border-box",
        padding: "28px 18px 22px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 430, display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, paddingTop: 14 }}>
          <div style={{ position: "relative", background: "#ffffff", border: "3px solid #4b2e73", borderRadius: 14, overflow: "hidden", width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#8ad7d2", borderBottom: "3px solid #4b2e73", padding: "7px 10px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#4b2e73", letterSpacing: ".08em", textTransform: "uppercase", fontFamily: "'DM Mono', monospace" }}>
                daily.exe
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ width: 13, height: 13, border: "2.5px solid #4b2e73", borderRadius: "50%", background: "#ffffff" }} />
                <div style={{ width: 13, height: 13, border: "2.5px solid #4b2e73", borderRadius: "50%", background: "#ffffff" }} />
                <div style={{ width: 13, height: 13, border: "2.5px solid #4b2e73", borderRadius: "50%", background: "#ffb3d0" }} />
              </div>
            </div>
            <div style={{ padding: "22px 18px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ fontSize: 38, fontWeight: 800, color: "#4b2e73", lineHeight: 1, letterSpacing: "-.01em" }}>daily games</div>
              <div style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", color: "#a07fc4", letterSpacing: ".06em" }}>{dateLine}</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <GameCard
            gameNo="01"
            chromeColor="#ffb3d0"
            squareColors={["#fff5b8", "#8ad7d2"]}
            iconBg="#8ad7d2"
            iconRadius="50%"
            iconInner={<div style={{ width: 22, height: 22, border: "3px solid #4b2e73", borderRadius: "50%", background: "#fff5b8" }} />}
            name="Defender"
            tagline="protect the buildings"
            puzzleNumber={defenderPuzzleNumber}
            streak={defenderStreak}
            streakBg="#fff5b8"
            onPlay={() => {
              window.location.href = "/defenders";
            }}
          />
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", justifyContent: "center", padding: "26px 0 6px" }}>
          <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: "#e2c7d8", letterSpacing: ".1em", textAlign: "center" }}>
            created with love · new puzzles every day at midnight
          </div>
        </div>
      </div>
    </div>
  );
}

// The actual Defender game — lives at /defenders. dailygiu.com's root is now
// the ecosystem hub (DailyGamesHome); this used to be what rendered there
// before the site grew a second (placeholder) game.
function DefenderApp() {
  const { level, dayNumber } = pickDailyLevel(BUILT_IN_LEVELS, LAUNCH_DATE);
  return (
    <div
      style={{
        height: "100dvh",
        overflow: "hidden",
        backgroundColor: "#ffe9f3",
        backgroundImage: "linear-gradient(#ffffff 2px, transparent 2px), linear-gradient(90deg, #ffffff 2px, transparent 2px)",
        backgroundSize: "36px 36px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 24,
        paddingBottom: 24,
        fontFamily: "'Baloo 2', system-ui, sans-serif",
      }}
    >
      <p
        style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 12, letterSpacing: ".08em", marginBottom: 8 }}
      >
        PUZZLE #{dayNumber}
      </p>
      <div className="w-full max-w-md px-4">
        <PlayScreen level={level} onBack={() => { window.location.href = "/"; }} isDaily />
      </div>
    </div>
  );
}

export default function DailyPuzzleApp() {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
  if (pathname === "/config") return <ConfigApp />;
  if (pathname === "/defenders") return <DefenderApp />;
  // Xenoglyph has no public route — it's not ready to ship, so it's only
  // reachable from inside /config's puzzle lab for testing.
  // Everything else (the root "/", the old "/home" link, any typo'd path —
  // GitHub Pages' 404.html fallback routes all of those through this same
  // app) lands on the ecosystem hub, which is now the actual landing page.
  return <DailyGamesHome />;
}
