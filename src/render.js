import { formatState, stateToArray, getTileDistances, getNeighbors } from './solver.js';

const ARROWS = { up: '↑', down: '↓', left: '←', right: '→' };
export function moveLabel(move) {
  const key = String(move || '').toLowerCase();
  return key ? `${ARROWS[key] ?? ''} ${key}`.trim() : 'start';
}

export function renderBoard(container, state, options = {}) {
  if (!container) return;
  const { mini = false, interactive = false, target = false, distances = false } = options;
  container.innerHTML = '';
  container.className = `tq-board${mini ? ' tq-board--mini' : ''}${interactive ? ' tq-board--interactive' : ''}${target ? ' tq-board--target' : ''}`;
  container.dataset.state = state;
  container.setAttribute('aria-label', `${target ? 'Goal' : 'Puzzle'} board ${formatState(state)}`);

  const movable = interactive ? new Set(getNeighbors(state).map((n) => n.from)) : new Set();
  const distanceValues = options.targetState ? getTileDistances(state, options.targetState) : [];

  stateToArray(state).forEach((tile, index) => {
    const empty = tile === '0';
    const cell = document.createElement(!empty && interactive ? 'button' : 'div');
    cell.className = `tq-tile${empty ? ' tq-tile--empty' : ''}${movable.has(index) ? ' is-movable' : ''}`;
    cell.dataset.index = index;
    if (!empty) {
      if (interactive) cell.type = 'button';
      cell.dataset.tile = tile;
      cell.setAttribute('aria-label', `Tile ${tile}`);
      cell.innerHTML = `<span class="tq-tile__num">${tile}</span>${distances ? `<span class="tq-tile__dist">${distanceValues[index] ?? ''}</span>` : ''}`;
    }
    container.appendChild(cell);
  });
}

function thumb(state) {
  const el = document.createElement('div');
  renderBoard(el, state, { mini: true });
  return el;
}

/* ---------- empty-state placeholders ---------- */

const ghostBoard = `<div class="tq-ghostboard" aria-hidden="true">${'<i></i>'.repeat(9)}</div>`;

const OPEN_HINT = {
  play: 'A* hasn’t started. Press SOLVE IT and boards line up here, lowest f first.',
  ready: 'Press NEXT. The starting board lands here first.',
};
const CLOSED_HINT = {
  play: 'Boards A* has finished with will pile up here.',
  ready: 'Nothing checked yet.',
};

/* ---------- OPEN ---------- */

let seenOpen = new Set();
export function renderOpenList(container, nodes = [], activeState = null, phase = '', idle = false) {
  if (!container) return;
  container.innerHTML = '';

  if (!nodes.length) {
    seenOpen = new Set();
    if (!idle) { container.innerHTML = '<p class="tq-hint">Empty right now.</p>'; return; }
    const ghost = `<li class="tq-slip tq-slip--ghost">${ghostBoard}<div class="tq-slip__body"><span class="tq-ghostbar"></span><span class="tq-ghostbar tq-ghostbar--short"></span></div></li>`;
    container.innerHTML = `<ol class="tq-slips tq-slips--ghost" aria-hidden="true">${ghost}${ghost}</ol><p class="tq-hint">${OPEN_HINT[idle]}</p>`;
    return;
  }

  const MAX = 6;
  const list = document.createElement('ol');
  list.className = 'tq-slips';
  nodes.slice(0, MAX).forEach((node, index) => {
    const li = document.createElement('li');
    li.className = `tq-slip${index === 0 ? ' tq-slip--next' : ''}${seenOpen.has(node.state) ? '' : ' is-new'}`;
    li.dataset.state = node.state;
    li.appendChild(thumb(node.state));
    const body = document.createElement('div');
    body.className = 'tq-slip__body';
    body.innerHTML = `<span class="tq-slip__f"><small>f</small>${node.f}</span><span class="tq-slip__calc">g ${node.g} + h ${node.h}</span><span class="tq-slip__move">${moveLabel(node.move)}</span>`;
    li.appendChild(body);
    if (index === 0) li.insertAdjacentHTML('beforeend', '<span class="tq-slip__flag">NEXT</span>');
    list.appendChild(li);
  });
  if (nodes.length > MAX) list.insertAdjacentHTML('beforeend', `<li class="tq-more">+ ${nodes.length - MAX} more waiting</li>`);
  container.appendChild(list);
  seenOpen = new Set(nodes.map((n) => n.state));
}

/* ---------- CLOSED ---------- */

let seenClosed = new Set();
export function renderClosedList(container, nodes = [], idle = false) {
  if (!container) return;
  container.innerHTML = '';

  if (!nodes.length) {
    seenClosed = new Set();
    const ghost = `<li class="tq-chip tq-chip--ghost">${ghostBoard}</li>`;
    container.innerHTML = `<ul class="tq-chips tq-chips--ghost" aria-hidden="true">${ghost.repeat(4)}</ul><p class="tq-hint">${CLOSED_HINT[idle || 'ready']}</p>`;
    return;
  }

  const MAX = 24;
  const list = document.createElement('ul');
  list.className = 'tq-chips';
  nodes.slice(0, MAX).forEach((node, index) => {
    const li = document.createElement('li');
    li.className = `tq-chip${index === 0 ? ' tq-chip--latest' : ''}${seenClosed.has(node.state) ? '' : ' is-new'}`;
    li.dataset.state = node.state;
    li.appendChild(thumb(node.state));
    li.insertAdjacentHTML('beforeend', `<span class="tq-chip__label"><i>${nodes.length - index}</i> f ${node.f}</span>`);
    list.appendChild(li);
  });
  container.appendChild(list);
  if (nodes.length > MAX) container.insertAdjacentHTML('beforeend', `<p class="tq-more">+ ${nodes.length - MAX} earlier</p>`);
  seenClosed = new Set(nodes.map((n) => n.state));
}

/* ---------- stats ---------- */

export function renderStats(container, stats = {}, solved = false) {
  if (!container) return;
  container.innerHTML = `
    <span><b>${stats.checked ?? 0}</b> checked</span>
    <span><b>${stats.waiting ?? 0}</b> waiting</span>
    ${solved ? `<span class="tq-stat--win"><b>${stats.depth ?? '?'}</b> moves to solve</span>` : ''}`;
}

/* ---------- h(n) explainer ---------- */

export function updateHeuristicNote(container, heuristic, currentState, targetState, event = null, distancesVisible = true) {
  if (!container || !heuristic) return;
  const distances = getTileDistances(currentState, targetState);
  const tiles = stateToArray(currentState)
    .map((tile, index) => (tile === '0' ? null : { tile, distance: distances[index] }))
    .filter(Boolean)
    .sort((a, b) => b.distance - a.distance)
    .slice(0, 3);
  const total = heuristic.short === 'MISPLACED'
    ? tiles.reduce((sum, item) => sum + (item.distance ? 1 : 0), 0)
    : distances.reduce((sum, d) => sum + (d || 0), 0);
  const examples = tiles.map((item) => `tile ${item.tile}: ${item.distance} step${item.distance === 1 ? '' : 's'} away`).join(', ');
  container.innerHTML = `<p class="tq-h-title"><strong>h(n) = ${heuristic.label}</strong></p><p>${heuristic.explain}</p><p class="tq-h-example">${examples} … <b>h = ${total}</b></p><p class="tq-h-small">Admissible: it never overestimates the real cost.</p><button class="tq-link-btn" id="distance-toggle" type="button">${distancesVisible ? 'Hide' : 'Show'} distances on the tiles</button>`;
}