// Moteur A* pur : aucune dépendance au DOM. Chaque expansion produit les
// événements pédagogiques pop -> expand -> score -> insert/discard.
export const EMPTY = '0';
export const GOAL_STATE = '123804765';

export const HEURISTICS = {
  misplaced: {
    label: 'Misplaced tiles',
    short: 'MISPLACED',
    explain: 'h(n) counts the numbered tiles that are not in their goal position.',
  },
  manhattan: {
    label: 'Manhattan distance',
    short: 'MANHATTAN',
    explain: 'h(n) adds the horizontal and vertical steps each tile still needs.',
  },
};

const DIRECTIONS = [
  { dr: -1, dc: 0, label: 'UP', symbol: '↑' },
  { dr: 1, dc: 0, label: 'DOWN', symbol: '↓' },
  { dr: 0, dc: -1, label: 'LEFT', symbol: '←' },
  { dr: 0, dc: 1, label: 'RIGHT', symbol: '→' },
];

export class PriorityQueue {
  constructor(compare = priorityCompare) { this.items = []; this.compare = compare; }
  get size() { return this.items.length; }
  push(item) { this.items.push(item); this.#bubbleUp(this.items.length - 1); }
  pop() {
    if (!this.items.length) return undefined;
    const first = this.items[0];
    const last = this.items.pop();
    if (this.items.length && last) { this.items[0] = last; this.#bubbleDown(0); }
    return first;
  }
  toArray() { return [...this.items].sort(this.compare); }
  #bubbleUp(index) {
    let child = index;
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      if (this.compare(this.items[child], this.items[parent]) >= 0) break;
      [this.items[child], this.items[parent]] = [this.items[parent], this.items[child]];
      child = parent;
    }
  }
  #bubbleDown(index) {
    let parent = index;
    while (true) {
      const left = parent * 2 + 1;
      const right = left + 1;
      let best = parent;
      if (left < this.items.length && this.compare(this.items[left], this.items[best]) < 0) best = left;
      if (right < this.items.length && this.compare(this.items[right], this.items[best]) < 0) best = right;
      if (best === parent) break;
      [this.items[parent], this.items[best]] = [this.items[best], this.items[parent]];
      parent = best;
    }
  }
}

// Priority rule shown in the UI: lowest f first, then lowest h, then id.
export function priorityCompare(a, b) { return (a.f - b.f) || (a.h - b.h) || (a.id - b.id); }
export function normalizeState(state) { return Array.isArray(state) ? state.join('') : String(state).replace(/\s/g, ''); }
export function stateToArray(state) { return normalizeState(state).split(''); }
export function isValidState(state) { const normalized = normalizeState(state); return normalized.length === 9 && [...normalized].sort().join('') === '012345678'; }

export function getNeighbors(state) {
  const normalized = normalizeState(state);
  const emptyIndex = normalized.indexOf(EMPTY);
  const row = Math.floor(emptyIndex / 3);
  const col = emptyIndex % 3;
  const neighbors = [];
  for (const direction of DIRECTIONS) {
    const nextRow = row + direction.dr;
    const nextCol = col + direction.dc;
    if (nextRow < 0 || nextRow > 2 || nextCol < 0 || nextCol > 2) continue;
    const nextIndex = nextRow * 3 + nextCol;
    const next = stateToArray(normalized);
    const tile = next[nextIndex];
    [next[emptyIndex], next[nextIndex]] = [next[nextIndex], next[emptyIndex]];
    neighbors.push({ state: next.join(''), tile, from: nextIndex, to: emptyIndex, direction: direction.label, symbol: direction.symbol });
  }
  return neighbors;
}

function targetPositions(target) {
  const positions = {};
  normalizeState(target).split('').forEach((tile, index) => { positions[tile] = index; });
  return positions;
}

export function misplacedTiles(state, target = GOAL_STATE) {
  const normalized = normalizeState(state);
  const goal = normalizeState(target);
  return [...normalized].reduce((score, tile, index) => score + (tile !== EMPTY && tile !== goal[index] ? 1 : 0), 0);
}

export function manhattanDistance(state, target = GOAL_STATE) {
  const normalized = normalizeState(state);
  const positions = targetPositions(target);
  return normalized.split('').reduce((score, tile, index) => {
    if (tile === EMPTY) return score;
    const destination = positions[tile];
    return score + Math.abs(Math.floor(index / 3) - Math.floor(destination / 3)) + Math.abs((index % 3) - (destination % 3));
  }, 0);
}

export function heuristicValue(state, target, heuristicName) {
  return heuristicName === 'misplaced' ? misplacedTiles(state, target) : manhattanDistance(state, target);
}

export function inversionCount(state) {
  const values = normalizeState(state).split('').filter((tile) => tile !== EMPTY).map(Number);
  let inversions = 0;
  for (let i = 0; i < values.length; i += 1) for (let j = i + 1; j < values.length; j += 1) if (values[i] > values[j]) inversions += 1;
  return inversions;
}

export function isSolvable(start, target = GOAL_STATE) {
  if (!isValidState(start) || !isValidState(target)) return false;
  return inversionCount(start) % 2 === inversionCount(target) % 2;
}

export function getTileDistances(state, target = GOAL_STATE) {
  const positions = targetPositions(target);
  return stateToArray(state).map((tile) => {
    if (tile === EMPTY) return null;
    const from = stateToArray(state).indexOf(tile);
    const destination = positions[tile];
    return Math.abs(Math.floor(from / 3) - Math.floor(destination / 3)) + Math.abs((from % 3) - (destination % 3));
  });
}

function makeRecord(state, g, parent, move, id, target, heuristicName) {
  const h = heuristicValue(state, target, heuristicName);
  return { id, state, g, h, f: g + h, parent, move, depth: g };
}
function copyRecord(record) { return record ? { ...record } : record; }
function openSnapshot(queue) { return queue.toArray().map(copyRecord); }
function closedSnapshot(order, records) { return [...order].reverse().map((state) => copyRecord(records.get(state))); }
function reconstructPath(records, target) {
  const path = [];
  let cursor = records.get(target);
  while (cursor) { path.unshift(cursor.state); cursor = cursor.parent ? records.get(cursor.parent) : null; }
  return path;
}
function emptyStats(time) { return { expanded: 0, generated: 0, depth: null, time }; }

export function solveAStar(start, target = GOAL_STATE, heuristicName = 'manhattan', options = {}) {
  const normalizedStart = normalizeState(start);
  const normalizedTarget = normalizeState(target);
  const startedAt = performance.now();
  if (!isValidState(normalizedStart) || !isValidState(normalizedTarget)) return { solvable: false, reason: 'invalid', events: [], trace: [], path: [], nodes: [], stats: emptyStats(0) };
  if (!isSolvable(normalizedStart, normalizedTarget)) return { solvable: false, reason: 'unsolvable', events: [], trace: [], path: [], nodes: [], stats: emptyStats(performance.now() - startedAt) };

  const queue = new PriorityQueue();
  const records = new Map();
  const closed = new Set();
  const closedOrder = [];
  const nodeCatalog = new Map();
  const events = [];
  let nextId = 1;
  let generated = 1;
  let expanded = 0;
  let goalRecord = null;
  const limit = options.limit || 50000;
  const root = makeRecord(normalizedStart, 0, null, 'START', nextId++, normalizedTarget, heuristicName);
  records.set(normalizedStart, root); nodeCatalog.set(normalizedStart, root); queue.push(root);

  while (queue.size && expanded < limit) {
    const beforePop = openSnapshot(queue);
    const current = queue.pop();
    const best = records.get(current.state);
    if (!best || best.g !== current.g || closed.has(current.state)) continue;
    closed.add(current.state); closedOrder.push(current.state); expanded += 1;
    const base = { expansion: expanded, expanded: copyRecord(current), open: openSnapshot(queue), closed: closedSnapshot(closedOrder, records), generated, expandedCount: expanded };
    events.push({ ...base, phase: 'pop', caption: `Take the slip with the lowest f: #${current.id}, f = ${current.f}`, queueBefore: beforePop });

    if (current.state === normalizedTarget) {
      goalRecord = current;
      events.push({ ...base, phase: 'goal', caption: 'Goal test passes: the fixed answer key has been reached.' });
      break;
    }

    const children = getNeighbors(current.state).map((neighbor) => ({
      ...makeRecord(neighbor.state, current.g + 1, current.state, `${neighbor.tile} ${neighbor.symbol}`, nextId++, normalizedTarget, heuristicName),
      tile: neighbor.tile, symbol: neighbor.symbol, direction: neighbor.direction,
    }));
    events.push({ ...base, phase: 'expand', caption: `Expand #${current.id}: ${children.length} legal children appear around the board.`, children: children.map(copyRecord) });
    events.push({ ...base, phase: 'score', caption: 'Score each child: g is parent g + 1, h is the estimate, and f = g + h.', children: children.map(copyRecord), scoreTile: children[0]?.tile || null });

    const inserted = [];
    const discarded = [];
    children.forEach((child) => {
      const known = records.get(child.state);
      if (closed.has(child.state)) { discarded.push({ ...copyRecord(child), reason: 'already in closed with an equal or better g' }); return; }
      if (known && known.g <= child.g) { discarded.push({ ...copyRecord(child), reason: 'already in open with an equal or better g' }); return; }
      records.set(child.state, child); nodeCatalog.set(child.state, child); queue.push(child); inserted.push(copyRecord(child)); generated += 1;
    });
    const open = openSnapshot(queue);
    events.push({ ...base, phase: 'insert', caption: `Insert ${inserted.length} child${inserted.length === 1 ? '' : 'ren'} in priority order${discarded.length ? `; discard ${discarded.length} already seen` : ''}.`, children: children.map(copyRecord), inserted, discarded, open, closed: closedSnapshot(closedOrder, records), generated, expandedCount: expanded });
  }

  const solved = Boolean(goalRecord);
  const path = solved ? reconstructPath(records, normalizedTarget) : [];
  const elapsed = performance.now() - startedAt;
  return { solvable: true, solved, reason: solved ? 'solved' : 'limit', events, trace: events, path, nodes: [...nodeCatalog.values()].map(copyRecord), stats: { expanded, generated, depth: solved ? path.length - 1 : null, time: elapsed } };
}

export function formatState(state) { return normalizeState(state).replace('0', '·'); }
