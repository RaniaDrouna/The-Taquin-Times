/** @typedef {{ id:number, board:number[], state:string, g:number, h:number, f:number, move:string|null, parent:number|null, depth:number, status?:string, reason?:string }} BackendNode */
/** @typedef {{ step:number, popped:BackendNode, children:BackendNode[], open:BackendNode[], open_before:BackendNode[], open_size:number, closed_size:number, closed:Array<{board:number[],state:string}>, inserted:BackendNode[], discarded:BackendNode[], goal:boolean }} BackendStep */
/** @typedef {{ solved:boolean, solvable:boolean, moves:string[], path:number[][], steps:BackendStep[], expanded:number, generated:number, time_ms:number }} SolveResponse */

const API_BASE = (globalThis.__TAQUIN_API_BASE__ || '').replace(/\/$/, '');

/** @param {number[]} board @param {'manhattan'|'misplaced'} heuristic @returns {Promise<SolveResponse>} */
export async function solvePuzzle(board, heuristic) {
  const response = await fetch(`${API_BASE}/api/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ board, heuristic }),
  });
  if (!response.ok) {
    let detail = `Backend error (${response.status})`;
    try { const body = await response.json(); detail = body.detail || detail; } catch { /* keep status message */ }
    throw new Error(detail);
  }
  return response.json();
}

/** @param {SolveResponse} payload */
export function toReplayResult(payload) {
  const closedNodes = [];
  const events = [];
  payload.steps.forEach((step) => {
    if (step.popped) closedNodes.unshift(step.popped);
    const base = {
      expansion: step.step,
      expanded: step.popped,
      open: step.open_before || step.open,
      closed: [...closedNodes],
      generated: payload.generated,
      expandedCount: step.step,
    };
    events.push({ ...base, phase: 'pop', caption: `Take the slip with the lowest f: #${step.popped.id}, f = ${step.popped.f}`, queueBefore: step.open_before || step.open });
    if (step.goal) {
      events.push({ ...base, phase: 'goal', caption: 'Goal test passes: the fixed answer key has been reached.', open: step.open, closed: [...closedNodes] });
      return;
    }
    events.push({ ...base, phase: 'expand', caption: `Expand #${step.popped.id}: ${step.children.length} legal children appear around the board.`, children: step.children });
    events.push({ ...base, phase: 'score', caption: 'Score each child: g is parent g + 1, h is the estimate, and f = g + h.', children: step.children, scoreTile: step.children[0]?.board?.find((tile) => tile !== 0) || null });
    events.push({ ...base, phase: 'insert', caption: `Insert ${step.inserted.length} child${step.inserted.length === 1 ? '' : 'ren'} in priority order${step.discarded.length ? `; discard ${step.discarded.length} already seen` : ''}.`, children: step.children, inserted: step.inserted, discarded: step.discarded, open: step.open, closed: [...closedNodes] });
  });
  return {
    solvable: payload.solvable,
    solved: payload.solved,
    path: payload.path.map((board) => board.join('')),
    events,
    trace: events,
    nodes: payload.steps.flatMap((step) => [step.popped, ...step.children]),
    moves: payload.moves,
    stats: { expanded: payload.expanded, generated: payload.generated, depth: payload.path.length ? payload.path.length - 1 : null, time: payload.time_ms },
  };
}
