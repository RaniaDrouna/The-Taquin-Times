import { formatState, stateToArray, getTileDistances } from './solver.js';

export function renderBoard(container, state, options = {}) {
  if (!container) return;
  const { mini = false, interactive = false, target = false, distances = false, highlightState = null } = options;
  container.innerHTML = '';
  const frameClass = container.id === 'main-board' ? 'board' : container.id === 'target-board' ? 'target-board' : '';
  container.className = `${frameClass} board-grid${mini ? ' board-grid--mini' : ''}${interactive ? ' board-grid--interactive' : ''}`.trim();
  container.dataset.state = state;
  container.setAttribute('aria-label', `${target ? 'Goal' : 'Puzzle'} board ${formatState(state)}`);
  const distanceValues = options.targetState ? getTileDistances(state, options.targetState) : [];
  stateToArray(state).forEach((tile, index) => {
    const cell = tile === '0' ? document.createElement('div') : document.createElement('button');
    cell.className = `tile-cell${tile === '0' ? ' tile-cell--empty' : ''}`;
    cell.dataset.index = index;
    cell.dataset.board = target ? 'target' : 'main';
    cell.style.setProperty('--tilt', `${((index * 7) % 5) - 2}deg`);
    cell.style.setProperty('--tile-order', index);
    if (tile !== '0') {
      cell.type = 'button'; cell.dataset.tile = tile; cell.setAttribute('aria-label', `Tile ${tile}`);
      cell.innerHTML = `<span class="tile-value">${tile}</span>${distances ? `<span class="tile-distance">${distanceValues[index] ?? '·'}</span>` : ''}<span class="tile-arrow" aria-hidden="true">↗</span>`;
      if (!interactive) cell.tabIndex = -1;
    }
    if (highlightState && highlightState === state) cell.classList.add('tile-cell--path');
    container.appendChild(cell);
  });
}

function miniBoard(node, className = '') {
  const mini = document.createElement('div');
  mini.className = className;
  renderBoard(mini, node.state, { mini: true });
  return mini;
}

export function renderOpenList(container, nodes = [], activeState = null, phase = '') {
  if (!container) return;
  container.innerHTML = '';
  const lane = document.createElement('div'); lane.className = 'queue-lane';
  const arrayLabel = document.createElement('div'); arrayLabel.className = 'queue-array-label'; arrayLabel.innerHTML = `<code>OPEN [${nodes.length}]</code><span>lowest f first</span>`; container.appendChild(arrayLabel);
  const header = document.createElement('div'); header.className = 'queue-table-head'; header.innerHTML = '<span>#</span><span>state</span><span>node</span><span>g</span><span>h</span><span>f</span><span>move</span>'; container.appendChild(header);
  if (!nodes.length) { lane.innerHTML = '<p class="empty-list">[]</p>'; container.appendChild(lane); container.insertAdjacentHTML('beforeend', '<div class="queue-array-close"><code>]</code></div>'); return; }
  const maxH = Math.max(1, ...nodes.map((node) => node.h));
  nodes.forEach((node, index) => {
    const slip = document.createElement('article');
    slip.className = `queue-slip${node.state === activeState ? ' queue-slip--active' : ''}${index === 0 ? ' queue-slip--front' : ''}${phase === 'insert' ? ' queue-slip--incoming' : ''}`;
    slip.dataset.state = node.state; slip.style.setProperty('--card-tilt', `${(index % 3) - 1}deg`);
    slip.style.setProperty('--queue-heat', (1 - node.h / maxH).toFixed(2));
    slip.innerHTML = `<span class="queue-rank">${index + 1}</span><code class="queue-slip__state">${node.state.replace('0', '·')}</code><b class="queue-slip__node">#${node.id}</b><span class="queue-slip__value queue-slip__g">${node.g}</span><span class="queue-slip__value queue-slip__h">${node.h}</span><strong class="queue-slip__value queue-slip__f">${node.f}</strong><span class="queue-move">${node.move || 'start'}</span>`;
    lane.appendChild(slip);
  });
  container.appendChild(lane);
  const rule = document.createElement('p'); rule.className = 'queue-rule'; rule.innerHTML = '<code>]</code> next row is highlighted';
  container.appendChild(rule);
}

export function renderClosedList(container, nodes = []) {
  if (!container) return;
  container.innerHTML = '';
  const arrayLabel = document.createElement('div'); arrayLabel.className = 'queue-array-label'; arrayLabel.innerHTML = `<code>CLOSED [${nodes.length}]</code><span>explored order</span>`; container.appendChild(arrayLabel);
  const header = document.createElement('div'); header.className = 'closed-table-head'; header.innerHTML = '<span>#</span><span>state</span><span>g / h / f</span>'; container.appendChild(header);
  if (!nodes.length) { container.insertAdjacentHTML('beforeend', '<p class="empty-list">]</p>'); return; }
  const shelf = document.createElement('div'); shelf.className = 'closed-shelf';
  const maxH = Math.max(1, ...nodes.map((node) => node.h || 0));
  nodes.slice(0, 28).forEach((node, index) => {
    const item = document.createElement('article'); item.className = `closed-slip${index === 0 ? ' closed-slip--new' : ''}`; item.dataset.state = node.state; item.style.setProperty('--queue-heat', (1 - (node.h || 0) / maxH).toFixed(2));
    item.innerHTML = `<span class="closed-slip__number">${String(nodes.length - index).padStart(2, '0')}</span><code class="closed-slip__state">${node.state.replace('0', '·')}</code><span class="closed-slip__meta">#${node.id} · g=${node.g} · h=${node.h} · f=${node.f}</span>`;
    shelf.appendChild(item);
  });
  container.appendChild(shelf);
  container.insertAdjacentHTML('beforeend', '<div class="queue-array-close"><code>]</code></div>');
}

export function renderStepLog(container, events = [], eventIndex = -1) {
  if (!container) return;
  container.innerHTML = '';
  if (!events.length || eventIndex < 0) { container.innerHTML = '<p class="log-empty">The clues will appear as A* takes its next decision.</p>'; return; }
  events.slice(0, eventIndex + 1).slice(-30).forEach((event, index, visible) => {
    const entry = document.createElement('div');
    entry.className = `log-entry${events.indexOf(event) === eventIndex ? ' log-entry--active' : ''}`;
    const phase = event.phase.toUpperCase();
    entry.innerHTML = `<span class="log-entry__num">${String(events.indexOf(event) + 1).padStart(2, '0')}.</span><span><b>${phase}</b> — ${event.caption}</span>`;
    container.appendChild(entry);
  });
}

export function renderTree(container, nodes = [], path = [], activeState = null) {
  if (!container) return;
  container.innerHTML = '';
  if (!nodes.length) { container.innerHTML = '<div class="tree-empty">Run the search, then flip the page to see the explored branches.</div>'; return; }
  const catalog = new Map(nodes.map((node) => [node.state, node]));
  const visible = nodes.slice(0, 46); const visibleStates = new Set(visible.map((node) => node.state));
  path.forEach((state) => { let cursor = catalog.get(state); while (cursor && !visibleStates.has(cursor.state)) { visible.push(cursor); visibleStates.add(cursor.state); cursor = cursor.parent ? catalog.get(cursor.parent) : null; } });
  const pathSet = new Set(path); const levels = new Map();
  visible.forEach((node) => { const level = Math.min(6, node.depth || 0); if (!levels.has(level)) levels.set(level, []); levels.get(level).push(node); });
  const width = 860; const levelHeight = 86; const height = Math.max(230, (Math.max(...levels.keys()) + 1) * levelHeight + 50); const positions = new Map();
  levels.forEach((levelNodes, level) => levelNodes.forEach((node, index) => positions.set(node.state, { x: ((index + 1) / (levelNodes.length + 1)) * width, y: level * levelHeight + 30 })));
  const stage = document.createElement('div'); stage.className = 'tree-stage'; stage.style.height = `${height}px`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.classList.add('tree-ink');
  visible.forEach((node) => { if (!node.parent || !positions.has(node.parent) || !positions.has(node.state)) return; const from = positions.get(node.parent); const to = positions.get(node.state); const edge = document.createElementNS('http://www.w3.org/2000/svg', 'path'); const bend = (from.y + to.y) / 2; edge.setAttribute('d', `M ${from.x} ${from.y + 19} C ${from.x + 8} ${bend}, ${to.x - 8} ${bend}, ${to.x} ${to.y - 19}`); edge.classList.add(pathSet.has(node.state) && pathSet.has(node.parent) ? 'tree-edge--solution' : 'tree-edge'); svg.appendChild(edge); });
  stage.appendChild(svg);
  visible.forEach((node, index) => { const point = positions.get(node.state); if (!point) return; const nodeEl = document.createElement('div'); nodeEl.className = `tree-node${pathSet.has(node.state) ? ' tree-node--solution' : ''}${node.state === activeState ? ' tree-node--active' : ''}`; nodeEl.style.left = `${(point.x / width) * 100}%`; nodeEl.style.top = `${point.y - 17}px`; nodeEl.style.setProperty('--node-tilt', `${(index % 5) - 2}deg`); const mini = miniBoard(node); nodeEl.appendChild(mini); nodeEl.insertAdjacentHTML('beforeend', `<span class="tree-node__label">#${node.id} · f=${node.f}</span>`); stage.appendChild(nodeEl); });
  container.appendChild(stage);
}

export function renderSolutionPath(container, path = [], currentState = null) {
  if (!container) return;
  container.innerHTML = '';
  if (!path.length) { container.innerHTML = '<p class="path-empty">The optimal path will appear here when the goal is reached.</p>'; return; }
  path.forEach((state, index) => { const step = document.createElement('div'); step.className = `path-step${state === currentState ? ' path-step--current' : ''}`; const mini = document.createElement('div'); renderBoard(mini, state, { mini }); step.appendChild(mini); step.insertAdjacentHTML('beforeend', `<span>${index === 0 ? 'START' : index === path.length - 1 ? 'GOAL' : String(index).padStart(2, '0')}</span>`); container.appendChild(step); });
}

export function renderStats(container, stats = {}, solved = false) {
  if (!container) return;
  const value = (entry, fallback = '—') => entry === null || entry === undefined ? fallback : entry;
  container.innerHTML = `<div class="stat"><span>Expanded</span><strong>${value(stats.expanded, 0)}</strong></div><div class="stat"><span>Generated</span><strong>${value(stats.generated, 0)}</strong></div><div class="stat"><span>Depth</span><strong>${value(stats.depth)}</strong></div><div class="stat"><span>Time</span><strong>${stats.time ? `${Number(stats.time).toFixed(1)}ms` : '—'}</strong></div><div class="stats-ribbon${solved ? ' stats-ribbon--solved' : ''}">${solved ? 'SOLVED' : 'TRACE'}</div>`;
}

export function renderRace(container, races = []) {
  if (!container) return;
  if (!races.length) { container.innerHTML = ''; return; }
  container.innerHTML = races.map((race) => `<article class="race-card"><div class="race-card__top"><span>${race.label}</span><b>${race.stats.expanded} expanded</b></div><div class="race-meter"><i style="width:${Math.min(100, race.stats.expanded / Math.max(1, ...races.map((item) => item.stats.expanded)) * 100)}%"></i></div><div class="race-card__meta"><span>depth ${race.stats.depth ?? '—'}</span><span>${Number(race.stats.time).toFixed(1)}ms</span></div></article>`).join('');
}

export function updateHeuristicNote(container, heuristic, currentState, targetState, event = null, distancesVisible = true) {
  if (!container || !heuristic) return;
  const distances = getTileDistances(currentState, targetState);
  const tiles = stateToArray(currentState).map((tile, index) => tile === '0' ? null : { tile, distance: distances[index] }).filter(Boolean).sort((a, b) => b.distance - a.distance).slice(0, 3);
  const total = heuristic.short === 'MISPLACED' ? tiles.reduce((sum, item) => sum + (item.distance ? 1 : 0), 0) : distances.reduce((sum, distance) => sum + (distance || 0), 0);
  const examples = tiles.map((item) => `tile ${item.tile}: ${item.distance} step${item.distance === 1 ? '' : 's'} away`).join(', ');
  container.innerHTML = `<div class="h-box__title"><strong>DEFINE h(n)</strong><span>${heuristic.label}</span></div><p>${heuristic.explain}</p><p class="h-example">${examples} … <b>h = ${total}</b></p><div class="h-box-actions"><small>Admissible: this estimate never overestimates the real cost.</small><button class="outline-button" id="distance-toggle" type="button">${distancesVisible ? 'HIDE DISTANCES' : 'SHOW DISTANCES'}</button></div>`;
  container.classList.toggle('is-scoring', event?.phase === 'score' || distancesVisible);
}
