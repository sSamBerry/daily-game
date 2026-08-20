import { useState, useEffect, useRef } from "react";
import { RotateCcw, Magnet, Hand, Info, X } from "lucide-react";

const SIZE = 8;

function clone(s) {
  return JSON.parse(JSON.stringify(s));
}
function key(x, y) {
  return x + "," + y;
}
function isWall(state, x, y) {
  return state.walls.some((w) => w.x === x && w.y === y);
}

function occupiedSet(state, excludeUnitId) {
  const set = new Set();
  state.walls.forEach((w) => set.add(key(w.x, w.y)));
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
  for (let step = 1; step <= enemy.range; step++) {
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
      if (adj) lines.push({ fromX: unit.x, fromY: unit.y, toX: adj.e.x, toY: adj.e.y, type: "rotate" });
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
      logs.push(`${unit.name} holds the line.`);
      impacts.push(null);
    } else if (unit.ability === "rotate" || unit.ability === "rotate_ccw") {
      const adj = findPushTarget(cur, unit);
      if (adj) {
        const enemy = adj.e;
        enemy.dir =
          unit.ability === "rotate"
            ? { dx: -enemy.dir.dy, dy: enemy.dir.dx }
            : { dx: enemy.dir.dy, dy: -enemy.dir.dx };
        logs.push(`${unit.name} rotates ${enemy.name}.`);
        impacts.push({ x: enemy.x, y: enemy.y, kind: "rotate" });
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
      logs.push(`${enemy.name} finds nothing in range.`);
      impacts.push(null);
    } else if (hit.type === "wall") {
      logs.push(`${enemy.name}'s attack is absorbed by a wall.`);
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
      { id: "u-mt1tidyc-1hysi", name: "Rotator 2", ability: "rotate" },
      { id: "u-mt1tifie-qzgmv", name: "Counter-rotator", ability: "rotate_ccw" },
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
    id: "crossfire",
    name: "Crossfire",
    hint: "Push one enemy so its own attack redirects into another.",
    units: [{ id: "pusher", name: "Pusher", ability: "push" }],
    enemies: [
      { id: "ea", name: "Enemy A", x: 1, y: 3, dir: { dx: 1, dy: 0 }, range: 3 },
      { id: "eb", name: "Enemy B", x: 3, y: 2, dir: { dx: 0, dy: 1 }, range: 2 },
    ],
    buildings: [
      { id: "b1", name: "Structure A", x: 4, y: 3 },
      { id: "b2", name: "Structure B", x: 3, y: 4 },
    ],
    walls: [],
    conveyors: [],
  },
  {
    id: "full-toolkit",
    name: "Full toolkit",
    hint: "Four threats, three units — push, pull, and block, each exactly once.",
    units: [
      { id: "pusher", name: "Pusher", ability: "push" },
      { id: "puller", name: "Puller", ability: "pull" },
      { id: "blocker", name: "Blocker", ability: "block" },
    ],
    enemies: [
      { id: "ea", name: "Enemy A", x: 2, y: 0, dir: { dx: -1, dy: 0 }, range: 2 },
      { id: "eb", name: "Enemy B", x: 6, y: 0, dir: { dx: 0, dy: 1 }, range: 2 },
      { id: "ec", name: "Enemy C", x: 4, y: 6, dir: { dx: 0, dy: -1 }, range: 8 },
      { id: "ed", name: "Enemy D", x: 2, y: 6, dir: { dx: 0, dy: -1 }, range: 2 },
    ],
    buildings: [
      { id: "b1", name: "Structure A", x: 0, y: 0 },
      { id: "b2", name: "Structure B", x: 6, y: 2 },
      { id: "b3", name: "Structure C", x: 4, y: 1 },
      { id: "b4", name: "Structure D", x: 2, y: 4 },
    ],
    walls: [],
    conveyors: [],
  },
  {
    id: "detour",
    name: "Detour",
    hint: "Every push direction saves the structure. Only some save your Pusher too.",
    units: [{ id: "pusher", name: "Pusher", ability: "push" }],
    enemies: [{ id: "ea", name: "Enemy A", x: 2, y: 3, dir: { dx: 1, dy: 0 }, range: 3 }],
    buildings: [{ id: "b1", name: "Structure A", x: 5, y: 3 }],
    walls: [{ x: 1, y: 3 }],
    conveyors: [],
  },
  {
    id: "relay",
    name: "Relay",
    hint: "Puller acts before Pusher here. Set one enemy in place, then finish it.",
    units: [
      { id: "puller", name: "Puller", ability: "pull" },
      { id: "pusher", name: "Pusher", ability: "push" },
    ],
    enemies: [
      { id: "ec", name: "Enemy C", x: 4, y: 7, dir: { dx: -1, dy: 0 }, range: 3 },
      { id: "ed", name: "Enemy D", x: 5, y: 4, dir: { dx: 1, dy: 0 }, range: 2 },
    ],
    buildings: [
      { id: "b1", name: "Structure C", x: 1, y: 7 },
      { id: "b2", name: "Structure D", x: 7, y: 4 },
    ],
    walls: [],
    conveyors: [],
  },
  {
    id: "gauntlet",
    name: "Gauntlet",
    hint: "There's exactly one way to push this one. Everything else is blocked or occupied.",
    units: [
      { id: "pusher", name: "Pusher", ability: "push" },
      { id: "blocker", name: "Blocker", ability: "block" },
    ],
    enemies: [
      { id: "ea", name: "Enemy A", x: 3, y: 2, dir: { dx: -1, dy: 0 }, range: 2 },
      { id: "eb", name: "Enemy B", x: 4, y: 2, dir: { dx: 1, dy: 0 }, range: 3 },
      { id: "ec", name: "Enemy C", x: 4, y: 0, dir: { dx: 0, dy: 1 }, range: 7 },
    ],
    buildings: [
      { id: "b1", name: "Structure A", x: 1, y: 2 },
      { id: "b2", name: "Structure B", x: 7, y: 2 },
      { id: "b3", name: "Structure C", x: 4, y: 7 },
    ],
    walls: [{ x: 3, y: 1 }],
    conveyors: [],
  },
  {
    id: "crucible",
    name: "Crucible",
    hint: "Two collisions, one block, two walls closing off the easy paths.",
    units: [
      { id: "puller", name: "Puller", ability: "pull" },
      { id: "pusher", name: "Pusher", ability: "push" },
      { id: "blocker", name: "Blocker", ability: "block" },
    ],
    enemies: [
      { id: "ea", name: "Enemy A", x: 2, y: 1, dir: { dx: -1, dy: 0 }, range: 2 },
      { id: "eb", name: "Enemy B", x: 5, y: 1, dir: { dx: 1, dy: 0 }, range: 2 },
      { id: "ec", name: "Enemy C", x: 3, y: 6, dir: { dx: -1, dy: 0 }, range: 2 },
      { id: "ed", name: "Enemy D", x: 4, y: 6, dir: { dx: 1, dy: 0 }, range: 3 },
      { id: "ee", name: "Enemy E", x: 4, y: 5, dir: { dx: 0, dy: -1 }, range: 3 },
    ],
    buildings: [
      { id: "b1", name: "Structure A", x: 0, y: 1 },
      { id: "b2", name: "Structure B", x: 7, y: 1 },
      { id: "b3", name: "Structure C", x: 1, y: 6 },
      { id: "b4", name: "Structure D", x: 7, y: 6 },
      { id: "b5", name: "Structure E", x: 4, y: 2 },
    ],
    walls: [{ x: 1, y: 1 }, { x: 3, y: 5 }],
    conveyors: [],
  },
  {
    id: "redirect",
    name: "Redirect",
    hint: "Turn one enemy to face the other before either can fire.",
    units: [{ id: "rotator", name: "Rotator", ability: "rotate" }],
    enemies: [
      { id: "ea", name: "Enemy A", x: 2, y: 3, dir: { dx: -1, dy: 0 }, range: 2 },
      { id: "eb", name: "Enemy B", x: 2, y: 2, dir: { dx: 1, dy: 0 }, range: 3 },
    ],
    buildings: [
      { id: "b1", name: "Structure A", x: 0, y: 3 },
      { id: "b2", name: "Structure B", x: 5, y: 2 },
    ],
    walls: [],
    conveyors: [],
  },
  {
    id: "double-take",
    name: "Double take",
    hint: "Two independent pairs. Two Pushers, one each.",
    units: [
      { id: "pusher1", name: "Pusher 1", ability: "push" },
      { id: "pusher2", name: "Pusher 2", ability: "push" },
    ],
    enemies: [
      { id: "ea", name: "Enemy A", x: 2, y: 2, dir: { dx: -1, dy: 0 }, range: 2 },
      { id: "eb", name: "Enemy B", x: 3, y: 2, dir: { dx: 1, dy: 0 }, range: 3 },
      { id: "ec", name: "Enemy C", x: 2, y: 5, dir: { dx: -1, dy: 0 }, range: 2 },
      { id: "ed", name: "Enemy D", x: 3, y: 5, dir: { dx: 1, dy: 0 }, range: 3 },
    ],
    buildings: [
      { id: "b1", name: "Structure A", x: 0, y: 2 },
      { id: "b2", name: "Structure B", x: 6, y: 2 },
      { id: "b3", name: "Structure C", x: 0, y: 5 },
      { id: "b4", name: "Structure D", x: 6, y: 5 },
    ],
    walls: [],
    conveyors: [],
  },
  {
    id: "crossed-wires",
    name: "Crossed wires",
    hint: "Two redirects and a block. Turn each enemy to face the other before it can fire.",
    units: [
      { id: "rotcw", name: "Rotator", ability: "rotate" },
      { id: "rotccw", name: "Counter-rotator", ability: "rotate_ccw" },
      { id: "blocker", name: "Blocker", ability: "block" },
    ],
    enemies: [
      { id: "ea1", name: "Enemy A", x: 2, y: 1, dir: { dx: -1, dy: 0 }, range: 2 },
      { id: "eb1", name: "Enemy B", x: 2, y: 0, dir: { dx: 1, dy: 0 }, range: 3 },
      { id: "ed", name: "Enemy D", x: 2, y: 5, dir: { dx: 1, dy: 0 }, range: 3 },
      { id: "ec", name: "Enemy C", x: 2, y: 4, dir: { dx: -1, dy: 0 }, range: 2 },
      { id: "ee", name: "Enemy E", x: 6, y: 7, dir: { dx: 0, dy: -1 }, range: 7 },
    ],
    buildings: [
      { id: "b1", name: "Structure A", x: 0, y: 1 },
      { id: "b2", name: "Structure B", x: 5, y: 0 },
      { id: "b3", name: "Structure C", x: 0, y: 4 },
      { id: "b4", name: "Structure D", x: 5, y: 5 },
      { id: "b5", name: "Structure E", x: 6, y: 0 },
    ],
    walls: [],
    conveyors: [],
  },
  {
    id: "vise",
    name: "Vise",
    hint: "A wall closes the direct pull approach. A counter-rotation handles the rest.",
    units: [
      { id: "puller", name: "Puller", ability: "pull" },
      { id: "rotccw", name: "Counter-rotator", ability: "rotate_ccw" },
      { id: "blocker", name: "Blocker", ability: "block" },
    ],
    enemies: [
      { id: "ef", name: "Enemy F", x: 2, y: 1, dir: { dx: -1, dy: 0 }, range: 2 },
      { id: "eg", name: "Enemy G", x: 5, y: 1, dir: { dx: 1, dy: 0 }, range: 2 },
      { id: "eh", name: "Enemy H", x: 4, y: 5, dir: { dx: 0, dy: 1 }, range: 2 },
      { id: "ei", name: "Enemy I", x: 5, y: 5, dir: { dx: 0, dy: -1 }, range: 3 },
      { id: "ej", name: "Enemy J", x: 3, y: 7, dir: { dx: 0, dy: -1 }, range: 7 },
    ],
    buildings: [
      { id: "b1", name: "Structure F", x: 0, y: 1 },
      { id: "b2", name: "Structure G", x: 7, y: 1 },
      { id: "b3", name: "Structure H", x: 4, y: 7 },
      { id: "b4", name: "Structure I", x: 5, y: 2 },
      { id: "b5", name: "Structure J", x: 3, y: 0 },
    ],
    walls: [{ x: 1, y: 1 }],
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
function shiftDateStr(dateStr, deltaDays) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

async function recordWinAndGetStreak() {
  const today = amsterdamPuzzleDateStr();
  let streak = 1;
  try {
    const raw = localStorage.getItem("puzzlelab_streak");
    if (raw) {
      const data = JSON.parse(raw);
      if (data.lastDate === today) return data.streak;
      const yesterday = shiftDateStr(today, -1);
      streak = data.lastDate === yesterday ? data.streak + 1 : 1;
    }
  } catch (e) {
    // no streak recorded yet, or localStorage unavailable — start at 1
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
  try {
    const raw = localStorage.getItem("puzzlelab_streak");
    if (!raw) return 0;
    const data = JSON.parse(raw);
    const today = amsterdamPuzzleDateStr();
    if (data.lastDate === today) return data.streak;
    const yesterday = shiftDateStr(today, -1);
    if (data.lastDate === yesterday) return data.streak;
    return 0;
  } catch (e) {
    return 0;
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
  if (unit.ability === "rotate") return "\u21BB";
  if (unit.ability === "rotate_ccw") return "\u21BA";
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

function EnemyFacing({ dir }) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        width: 15,
        height: 15,
        transform: `translate(-50%, -50%) rotate(${upBasedAngle(dir)}deg) translateY(-13px)`,
        filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.75))",
        pointerEvents: "none",
      }}
    >
      <path d="M12 2 L19.5 16 L12 12 L4.5 16 Z" fill="#ef4444" />
    </svg>
  );
}

function TerrainMark({ wall, conveyor }) {
  if (wall) {
    return <div className="absolute inset-0 rounded-sm" style={{ background: "#0c0a09", zIndex: 0 }} />;
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
      <div className="shrink-0 flex items-center justify-center rounded-md" style={{ width: 40, height: 40, background: "#292524" }}>
        {swatch}
      </div>
      <div>
        <p className="text-white font-bold" style={{ fontSize: 13 }}>{title}</p>
        <p className="text-stone-400" style={{ fontSize: 12, lineHeight: 1.35 }}>{children}</p>
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
        className="bg-stone-800 border-2 border-stone-600 rounded-xl p-5 w-full max-w-xs mx-4"
        style={{ maxHeight: "85vh", overflowY: "auto", animation: "popIn 0.2s ease-out" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-black" style={{ fontSize: 18 }}>How to play</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-md text-stone-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <RuleRow
          title="Goal"
          swatch={
            <div
              className="rounded-sm"
              style={{ width: 18, height: 18, background: "#f8fafc", boxShadow: "0 1px 2px rgba(0,0,0,0.25)" }}
            />
          }
        >
          Keep every building alive when the turn plays out. Lose one and the puzzle is lost.
        </RuleRow>

        <RuleRow
          title="Enemies"
          swatch={
            <div style={{ position: "relative", width: 22, height: 22 }}>
              <div className="rounded-full bg-red-500" style={{ width: "100%", height: "100%" }} />
              <div
                style={{
                  position: "absolute",
                  top: -7,
                  left: "50%",
                  width: 0,
                  height: 0,
                  borderLeft: "4px solid transparent",
                  borderRight: "4px solid transparent",
                  borderBottom: "7px solid #fff",
                  transform: "translateX(-50%)",
                }}
              />
            </div>
          }
        >
          Each one faces a direction (white arrow) and fires in a straight line the moment you hit Play.
        </RuleRow>

        <RuleRow
          title="Threat tiles"
          swatch={
            <div className="flex gap-1">
              <div style={{ width: 14, height: 14, background: "#7f1d1d", border: "2px solid #ef4444", borderRadius: 2 }} />
              <div style={{ width: 14, height: 14, background: "#450a0a", border: "1px solid #f87171", borderRadius: 2 }} />
            </div>
          }
        >
          Bold red = gets hit right now. Pale red = gets hit after this turn's pushes/pulls/conveyors.
        </RuleRow>

        <RuleRow
          title="Enemy collisions"
          swatch={
            <div style={{ position: "relative", width: 30, height: 22 }}>
              <div className="rounded-full bg-red-500" style={{ position: "absolute", left: 0, top: 3, width: 15, height: 15 }} />
              <div className="rounded-full bg-red-500" style={{ position: "absolute", right: 0, top: 3, width: 15, height: 15 }} />
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
                  boxShadow: "0 0 6px 2px rgba(249,115,22,0.85)",
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
            <div className="rounded-md flex items-center justify-center" style={{ width: 26, height: 26, background: "#0d9488", color: "#fff", fontSize: 16, fontWeight: 900 }}>
              →
            </div>
          }
        >
          Drop it next to an enemy — on Play it shoves that enemy back one tile.
        </RuleRow>

        <RuleRow
          title="Puller"
          swatch={
            <div className="rounded-md flex items-center justify-center" style={{ width: 26, height: 26, background: "#0d9488", color: "#fff" }}>
              <Magnet style={{ width: 16, height: 16 }} strokeWidth={2.75} />
            </div>
          }
        >
          Pulls the nearest enemy in line toward it, in whichever of the four directions has one.
        </RuleRow>

        <RuleRow
          title="Blocker"
          swatch={
            <div className="rounded-md flex items-center justify-center" style={{ width: 26, height: 26, background: "#0d9488", color: "#fff", fontSize: 16, fontWeight: 900 }}>
              ■
            </div>
          }
        >
          Just occupies its tile — use it to soak a shot, or to block where a pushed/pulled enemy would land.
        </RuleRow>

        <RuleRow
          title="Rotators"
          swatch={
            <div className="flex gap-1">
              <div className="rounded-md flex items-center justify-center" style={{ width: 26, height: 26, background: "#0d9488", color: "#fff", fontSize: 16, fontWeight: 900 }}>
                ↻
              </div>
              <div className="rounded-md flex items-center justify-center" style={{ width: 26, height: 26, background: "#0d9488", color: "#fff", fontSize: 16, fontWeight: 900 }}>
                ↺
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
                style={{ width: 20, height: 20, background: "#1c1917", border: "1.5px solid #5eead4", color: "#5eead4", fontSize: 11, fontWeight: 900 }}
              >
                1
              </div>
              <div className="rounded-full bg-red-500 flex items-center justify-center text-white" style={{ width: 20, height: 20, fontSize: 11, fontWeight: 900 }}>
                1
              </div>
            </div>
          }
        >
          Pieces act in the order you placed them, then enemies fire in numeric order — the number on each red circle is its turn.
        </RuleRow>

        <button type="button" onClick={onClose} className="w-full mt-1 py-2.5 rounded-lg bg-teal-600 text-white font-bold">
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
      <div className="bg-stone-800 border-2 border-stone-600 rounded-xl p-6 w-full max-w-xs mx-4 text-center" style={{ animation: "popIn 0.25s ease-out" }}>
        <div className="rounded-sm mx-auto mb-4" style={{ width: 40, height: 40, background: "#f8fafc", boxShadow: "0 1px 2px rgba(0,0,0,0.25)" }} />
        <p className="text-white font-black mb-2" style={{ fontSize: 20 }}>Save every building</p>
        <p className="text-stone-300 font-bold text-sm mb-5">
          Keep all the white squares alive when the turn plays out — that's the only goal.
        </p>
        <button type="button" onClick={onClose} className="w-full py-2.5 rounded-lg bg-teal-600 text-white font-bold mb-2">
          Let's go
        </button>
        <button type="button" onClick={onShowRules} className="w-full py-2 text-stone-400 text-xs font-bold">
          See full rules
        </button>
      </div>
    </div>
  );
}

function PlayScreen({ level, onBack }) {
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
  const placementCounterRef = useRef(0);

  useEffect(() => {
    // Only the real daily game greets first-timers — not the level editor's
    // "test play" mode, which reuses this same screen.
    if (onBack) return;
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
  }, [level]);

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
    const raf = requestAnimationFrame(() => {
      setBulletPos({ x: end.x, y: end.y, animate: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [phase, resolution, revealStep]);

  useEffect(() => {
    if (phase === "done" && resolution && resolution.outcome === "success") {
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
      return "relative aspect-square flex items-center justify-center rounded-sm border border-stone-800";
    }
    const isValidDrop = drag && drag.validTiles.some((t) => t.x === x && t.y === y);
    const isHover = hoverTile && hoverTile.x === x && hoverTile.y === y;
    const threat = tileThreat(x, y);

    let variant;
    // Placing is always legal on any empty tile, so only call out the one
    // tile currently under the finger/cursor while dragging — lighting up
    // every valid tile at once is redundant with that given.
    if (isValidDrop && isHover) variant = "border-2 border-teal-400 bg-teal-800";
    else if (!threat) variant = "border border-stone-700 bg-stone-800";
    else if (threat.level === "bold") {
      // A single strong red for any live threat — miss, hit-a-building,
      // hit-a-unit, or beam-on-beam collision — so it's always clearly
      // visible even when the ray doesn't land on anything.
      variant = "border-2 border-red-500 bg-red-900";
    } else {
      // light preview — a single pale red, always, regardless of what the
      // post-move ray happens to hit. This keeps it reading as "a future
      // threat" (same hue as the bold danger color) without implying a
      // specific outcome, and it stays visible even on a "miss" trace.
      variant = "border border-red-400 bg-red-950";
    }

    return `relative aspect-square flex items-center justify-center rounded-sm transition-colors ${variant}`;
  }

  function renderTileContent(x, y) {
    const wall = isWall(displayState, x, y);
    const conveyor = displayState.conveyors.find((c) => c.x === x && c.y === y);
    const b = displayState.buildings.find((b) => b.alive && b.x === x && b.y === y);
    const threatLevel = b ? buildingThreatLevel(x, y) : null;
    return (
      <>
        <TerrainMark wall={wall} conveyor={conveyor} />
        {b && (
          <div
            className="rounded-sm"
            style={{
              width: "52%",
              height: "52%",
              zIndex: 2,
              position: "relative",
              background:
                threatLevel === "bold"
                  ? "linear-gradient(155deg, #fff1f1 0%, #fecaca 100%)"
                  : threatLevel === "light"
                  ? "linear-gradient(155deg, #f8fafc 0%, #fee2e2 100%)"
                  : "#f8fafc",
              boxShadow:
                threatLevel === "bold"
                  ? "0 0 0 2px #ef4444, 0 0 10px 2px rgba(239,68,68,0.55)"
                  : threatLevel === "light"
                  ? "0 0 0 2px rgba(239,68,68,0.5)"
                  : "0 1px 2px rgba(0,0,0,0.25)",
              animation: threatLevel === "bold" ? "buildingPulse 1.4s ease-in-out infinite" : "none",
            }}
          >
            {threatLevel === "bold" && (
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
    <div className="bg-stone-900 p-6 rounded-xl">
      <div className="max-w-md mx-auto mb-4 relative flex items-center justify-center" style={{ minHeight: 40 }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 p-2 rounded-md border-2 border-stone-600 text-stone-200"
            style={{ position: "absolute", left: 0 }}
          >
            Menu
          </button>
        )}
        {!onBack && (
          <div
            className="shrink-0 flex items-center gap-1 rounded-full border-2 border-stone-600 text-stone-200 font-bold"
            style={{
              position: "absolute",
              left: 0,
              height: 32,
              padding: "0 10px",
              fontSize: 13,
              ...(wonToday ? { borderColor: "#facc15", boxShadow: "0 0 8px 1px rgba(250,204,21,0.55)" } : null),
            }}
            title={wonToday ? "Today's puzzle solved" : "Current streak"}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>🔥</span>
            {headerStreak}
          </div>
        )}
        <h2 className="text-white font-black tracking-tight text-center" style={{ fontSize: 24 }}>{level.name}</h2>
        <button
          type="button"
          onClick={() => setShowRules(true)}
          aria-label="How to play"
          className="shrink-0 flex items-center justify-center rounded-full border-2 border-stone-600 text-stone-200"
          style={{ position: "absolute", right: 0, width: 32, height: 32 }}
        >
          <Info className="w-4 h-4" />
        </button>
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
          @keyframes impactRingRotate {
            0% { transform: scale(0.3) rotate(0deg); opacity: 0.9; }
            100% { transform: scale(1.7) rotate(140deg); opacity: 0; }
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
            0%, 100% { box-shadow: 0 0 0 3px #2dd4bf, 0 0 8px 2px rgba(45,212,191,0.55); }
            50% { box-shadow: 0 0 0 3px #2dd4bf, 0 0 16px 5px rgba(45,212,191,0.9); }
          }
          @keyframes buildingPulse {
            0%, 100% { box-shadow: 0 0 0 2px #ef4444, 0 0 10px 2px rgba(239,68,68,0.55); }
            50% { box-shadow: 0 0 0 2px #ef4444, 0 0 16px 5px rgba(239,68,68,0.85); }
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
            const color = isPull ? "#c084fc" : isRotate ? "#fbbf24" : "#2dd4bf";
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
              stroke="#38bdf8"
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
              style={{ transformBox: "fill-box", transformOrigin: "center", animation: "impactRingRotate 0.55s ease-out" }}
            />
          )}
        </svg>

        {displayState.enemies.map((enemy, enemyIndex) => {
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
              <div style={{ position: "relative", width: "62%", height: "62%" }}>
                <div
                  className="rounded-full bg-red-500 flex items-center justify-center text-white w-full h-full"
                  style={{
                    fontSize: 15,
                    fontWeight: 900,
                    boxShadow: isEnemyActing ? "0 0 0 3px #fde047, 0 0 16px 5px rgba(253,224,71,0.85)" : "none",
                    animation: isEnemyActing ? "enemyFire 0.5s ease-in-out" : "none",
                    transition: "box-shadow 0.25s ease",
                  }}
                >
                  {enemyIndex + 1}
                </div>
                <EnemyFacing dir={enemy.dir} />
              </div>
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
          const displayUnit = displayState.units.find((u) => u.id === unit.id);
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
                  background: "#0d9488",
                  color: "#ffffff",
                  fontSize: 26,
                  fontWeight: 900,
                  boxShadow: isActing ? "0 0 0 3px #fbbf24, 0 0 14px 3px rgba(251,191,36,0.7)" : "none",
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
                    background: "#1c1917",
                    border: "1.5px solid #5eead4",
                    color: "#5eead4",
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
          className="flex flex-wrap gap-3 p-3 rounded-lg border-2 border-stone-600 bg-stone-800"
          style={{ width: "100%", height: 100, overflow: "hidden", boxSizing: "border-box" }}
        >
          {handUnits.map((unit) => (
            <div key={unit.id} className="flex flex-col items-center gap-1">
              <div
                onPointerDown={(e) => onUnitPointerDown(e, unit)}
                className="w-12 h-12 flex items-center justify-center rounded-md cursor-grab active:cursor-grabbing select-none"
                style={{ touchAction: "none", background: "#0d9488", color: "#ffffff", fontSize: 24, fontWeight: 900 }}
              >
                <UnitIcon unit={unit} size={24} inHand />
              </div>
              <span className="text-stone-300 font-bold" style={{ fontSize: 11 }}>{unit.name}</span>
            </div>
          ))}
          {handUnits.length === 0 && phase === "planning" && (
            <span className="text-sm text-stone-400 font-bold flex items-center px-2">All pieces played</span>
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
            style={{ background: "#0d9488", color: "#ffffff", fontSize: 26, fontWeight: 900 }}
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
            className="bg-stone-800 border-2 border-stone-600 rounded-xl p-6 w-full max-w-xs mx-4 text-center"
            style={{ animation: "popIn 0.25s ease-out" }}
          >
            {resolution.outcome === "success" ? (
              <>
                <p className="text-emerald-400 font-black mb-1" style={{ fontSize: 26 }}>Congratulations!</p>
                <p className="text-stone-300 font-bold text-sm mb-5">{streak === null ? "\u2014" : `${streak} day streak`}</p>
                {!onBack && <p className="text-stone-500 text-xs font-bold mb-4">Come back tomorrow for the next puzzle.</p>}
              </>
            ) : (
              <p className="text-red-400 font-black mb-6" style={{ fontSize: 26 }}>Lost</p>
            )}
            <div className="flex gap-2 justify-center">
              <button type="button" onClick={retryPlan} className="flex-1 py-2.5 rounded-lg bg-teal-600 text-white font-bold flex items-center justify-center gap-1">
                <RotateCcw className="w-5 h-5" /> Reset
              </button>
              {onBack && (
                <button type="button" onClick={onBack} className="px-4 py-2.5 rounded-lg border-2 border-stone-500 text-stone-200 font-bold">
                  Menu
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 max-w-md mx-auto flex gap-2">
        <button type="button" onClick={play} disabled={phase !== "planning"} className="flex-1 py-2.5 rounded-lg bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold" style={{ fontSize: 16 }}>
          Play
        </button>
        <button type="button" onClick={reset} className="px-4 py-2.5 rounded-lg border-2 border-stone-500 text-stone-200 font-bold flex items-center gap-1">
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
function amsterdamPuzzleDateStr() {
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

function dayIndexSince(launchDateStr) {
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

export default function DailyPuzzleApp() {
  const { level, dayNumber } = pickDailyLevel(BUILT_IN_LEVELS, LAUNCH_DATE);
  return (
    <div
      style={{
        height: "100dvh",
        overflow: "hidden",
        background: "#1c1917",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 24,
        paddingBottom: 24,
      }}
    >
      <p className="text-stone-500 font-bold text-xs mb-2" style={{ letterSpacing: 1 }}>PUZZLE #{dayNumber}</p>
      <div className="w-full max-w-md px-4">
        <PlayScreen level={level} onBack={null} />
      </div>
    </div>
  );
}
