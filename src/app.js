import { GOAL_STATE, HEURISTICS, getNeighbors } from './solver.js';
import { solvePuzzle, toReplayResult } from './api.js';
import { renderBoard, renderClosedList, renderOpenList, renderStats, updateHeuristicNote, moveLabel } from './render.js';

const $ = (selector) => document.querySelector(selector);
const app = $('#app');
const mainBoard = $('#main-board');
const targetBoard = $('#target-board');
const splash = $('#splash-screen');
const splashStart = $('#start-app');

let currentState = GOAL_STATE;
let startState = GOAL_STATE;
let targetState = GOAL_STATE;
let heuristicName = 'manhattan';
let result = null;
let eventIndex = -1;
let timer = null;
let speed = 3;
let distancesVisible = false;
let muted = false;
let movesMade = 0;
let audioContext = null;
let announcedSolved = false;
let loading = false;
let dragState = null;
let notice = null; // transient warning shown in the narration line

const refs = {
  openCount: $('#open-count'), closedCount: $('#closed-count'),
  headline: $('#headline'), narration: $('#narration'),
  heuristic: $('#heuristic-select'), speed: $('#speed-slider'), speedLabel: $('#speed-label'),
  run: $('#run-button'), shuffle: $('#shuffle-button'), reset: $('#reset-button'), edit: $('#edit-button'),
  step: $('#step-button'), micro: $('#micro-step-button'), back: $('#back-step-button'),
  auto: $('#auto-button'), autoLabel: $('#auto-label'), autoIcon: $('#auto-icon'),
  moveCount: $('#move-count'), stats: $('#stats'), open: $('#open-list'), closed: $('#closed-list'),
  note: $('#heuristic-note'), children: $('#child-cluster'), pseudocode: $('#pseudocode'),
  soundToggle: $('#sound-toggle'),
};

function currentEvent() { return result?.events?.[eventIndex] || null; }
function boardForDisplay() { return currentEvent()?.expanded?.state || currentState; }
function isAtGoal() { return currentState === targetState; }

function copy(event) {
  if (loading) return ['Thinking…', 'Sending your board to the A* solver.'];
  if (!result) {
    return isAtGoal()
      ? ['Scramble the puzzle.', 'Slide a few tiles out of place (click, drag, or use the arrow keys), or hit SHUFFLE. Yellow tiles can slide. Then let A* find the way back.']
      : ['Now let A* solve it.', 'Press SOLVE IT. A* plans a shortest route back to the goal, and you’ll watch its to-do list (OPEN) and its checked list (CLOSED) change step by step.'];
  }
  if (!event) return ['Let’s watch A* think.', 'It hasn’t made a move yet. Press NEXT to see its first decision, or PLAY to let it run on its own.'];
  const titles = {
    pop: 'Pick the most promising board',
    expand: 'Look at every possible move',
    score: 'Score each new board',
    insert: 'File them in the to-do list',
    goal: 'Solved!',
  };
  return [titles[event.phase] ?? 'Searching…', event.caption];
}

function renderChildren(event) {
  if (!refs.children) return;
  refs.children.innerHTML = '';
  if (!event || !['expand', 'score', 'insert'].includes(event.phase) || !event.children?.length) return;
  event.children.forEach((child) => {
    const status = event.phase === 'score'
      ? 'scoring'
      : event.phase === 'insert'
        ? (event.discarded?.some((node) => node.state === child.state) ? 'discarded' : 'inserted')
        : 'plain';
    const item = document.createElement('article');
    item.className = `tq-child tq-child--${status}`;
    item.innerHTML = `<span class="tq-child__move">${moveLabel(child.move)}</span>`;
    const childBoard = item.appendChild(document.createElement('div'));
    renderBoard(childBoard, child.state, { mini: true, distances: event.phase === 'score', targetState });
    if (event.phase === 'score') childBoard.querySelector(`[data-tile="${child.tile}"]`)?.classList.add('tq-tile--focus');
    item.insertAdjacentHTML('beforeend', `<b class="tq-child__f"><small>f</small>${child.f}</b><span class="tq-child__calc">g ${child.g} + h ${child.h}</span>${status === 'discarded' ? '<span class="tq-stamp">ALREADY SEEN</span>' : ''}`);
    refs.children.appendChild(item);
  });
}

function highlightPseudo(phase) {
  refs.pseudocode?.querySelectorAll('[data-pseudo]').forEach((line) => line.classList.toggle('is-current', line.dataset.pseudo === phase));
}

function render() {
  const event = currentEvent();
  const solved = Boolean(result?.solved && event?.phase === 'goal');
  const scorePhase = event?.phase === 'score';
  const shown = boardForDisplay();

  app.dataset.mode = result ? 'watch' : 'play';
  if (solved) app.dataset.solved = ''; else delete app.dataset.solved;

  // boards
  renderBoard(mainBoard, shown, { interactive: !result && !loading, distances: distancesVisible || scorePhase, targetState });
  renderBoard(targetBoard, targetState, { mini: true, target: true });

  // OPEN / CLOSED (idle = which empty-state hint to show before A* has acted)
  const idle = event ? false : result ? 'ready' : 'play';
  renderOpenList(refs.open, event?.open || [], event?.expanded?.state, event?.phase || '', idle);
  renderClosedList(refs.closed, event?.closed || [], idle);
  refs.openCount.textContent = event ? `${event.open?.length ?? 0} waiting` : 'empty';
  refs.closedCount.textContent = event ? `${event.closed?.length ?? 0} checked` : 'empty';

  // stats strip (hidden until A* makes its first decision)
  refs.stats.hidden = !event;
  renderStats(refs.stats, event
    ? { checked: event.closed?.length ?? 0, waiting: event.open?.length ?? 0, depth: result?.stats?.depth }
    : {}, solved);

  // children, explainer, stepper
  renderChildren(event);
  updateHeuristicNote(refs.note, HEURISTICS[heuristicName], shown, targetState, event, distancesVisible || scorePhase);
  highlightPseudo(event?.phase || '');

  // headline + sticky-note narration
  const [headline, line] = copy(event);
  refs.headline.textContent = headline;
  refs.narration.textContent = notice?.text ?? line;
  refs.narration.classList.toggle('is-warn', Boolean(notice));

  // controls
  refs.moveCount.textContent = String(movesMade);
  refs.speedLabel.textContent = `${speed}×`;
  refs.autoLabel.textContent = timer ? 'Pause' : 'Play';
  refs.autoIcon.textContent = timer ? '❚❚' : '▶';
  refs.back.disabled = !result || eventIndex < 0;
  refs.run.disabled = loading || isAtGoal() || Boolean(result);
  refs.run.title = isAtGoal() ? 'Scramble the board first.' : '';
  [refs.step, refs.micro, refs.auto, refs.reset, refs.shuffle, refs.edit].forEach((button) => { button.disabled = loading; });

  // solved state
  document.body.classList.toggle('is-solved', solved);
  if (solved && !announcedSolved) { announcedSolved = true; inkStampSound(); }
}

function stopAuto() { if (timer) window.clearInterval(timer); timer = null; }
function clearSearch() {
  stopAuto();
  result = null; eventIndex = -1; announcedSolved = false; notice = null;
  render();
}

async function prepareSearch() {
  stopAuto();
  if (isAtGoal()) { notice = { text: 'Scramble the board first. It already matches the goal.' }; render(); return false; }
  loading = true; notice = null;
  render();
  try {
    const payload = await solvePuzzle([...currentState].map(Number), heuristicName);
    if (!payload.solvable) {
      result = null;
      notice = { text: 'This arrangement can’t be solved. Edit the board and try again.' };
      return false;
    }
    result = toReplayResult(payload);
    eventIndex = -1;
    return true;
  } catch (error) {
    result = null;
    notice = { text: `Couldn’t reach the A* backend (${error.message}). Is the Python server running?` };
    return false;
  } finally {
    loading = false;
    render();
  }
}

function advanceMicroNow() {
  if (!result?.events?.length || eventIndex >= result.events.length - 1) { stopAuto(); render(); return; }
  eventIndex += 1;
  notice = null;
  render();
  if (currentEvent().phase === 'goal') stopAuto();
}

async function advanceMicro() {
  if (!result && !(await prepareSearch())) return;
  advanceMicroNow();
}

async function advanceStep() {
  if (!result && !(await prepareSearch())) return;
  if (!result?.events?.length) return;
  do { advanceMicroNow(); } while (result && currentEvent()?.phase !== 'insert' && currentEvent()?.phase !== 'goal' && eventIndex < result.events.length - 1);
}

async function startAuto() {
  if (!result && !(await prepareSearch())) return;
  if (timer) { stopAuto(); render(); return; }
  timer = window.setInterval(advanceMicro, Math.max(260, 1320 - speed * 180));
  render();
}

function backOneStep() {
  if (!result || eventIndex < 0) return;
  stopAuto();
  let cursor = eventIndex - 1;
  while (cursor >= 0 && !['insert', 'goal'].includes(result.events[cursor].phase)) cursor -= 1;
  eventIndex = cursor;
  notice = null;
  render();
}

/* ---------- playing the puzzle ---------- */

function moveState(state, tileIndex) { return getNeighbors(state).find((item) => item.from === tileIndex)?.state || null; }

function tryMove(tileIndex) {
  if (result || loading) return false;
  const blank = currentState.indexOf('0');
  const next = moveState(currentState, tileIndex);
  if (!next) {
    notice = { text: 'That tile isn’t next to the blank square, so it can’t slide. Only the yellow tiles can move.' };
    render();
    mainBoard.classList.remove('is-rejected'); void mainBoard.offsetWidth; mainBoard.classList.add('is-rejected');
    paperCrumpleSound();
    return false;
  }
  currentState = next; movesMade += 1;
  paperSlideSound();
  clearSearch();
  animateMove(tileIndex, blank);
  return true;
}

function animateMove(from, to) {
  const tile = mainBoard.querySelector(`[data-index="${to}"]`);
  if (!tile) return;
  tile.style.setProperty('--fx', String((from % 3) - (to % 3)));
  tile.style.setProperty('--fy', String(Math.floor(from / 3) - Math.floor(to / 3)));
  tile.classList.add('is-sliding');
  tile.addEventListener('animationend', () => tile.classList.remove('is-sliding'), { once: true });
}

function handleBoardClick(event) {
  if (event.detail !== 0) return; // mouse clicks are handled by pointerup; this is keyboard activation
  const tile = event.target.closest('.tq-tile:not(.tq-tile--empty)');
  if (tile) tryMove(Number(tile.dataset.index));
}
function handlePointerDown(event) {
  if (result || loading) return;
  const tile = event.target.closest('.tq-tile:not(.tq-tile--empty)');
  if (!tile) return;
  dragState = { x: event.clientX, y: event.clientY, index: Number(tile.dataset.index) };
  event.currentTarget.setPointerCapture?.(event.pointerId);
}
function handlePointerMove(event) {
  if (!dragState) return;
  const tile = mainBoard.querySelector(`[data-index="${dragState.index}"]`);
  if (!tile) return;
  const dx = event.clientX - dragState.x; const dy = event.clientY - dragState.y;
  if (Math.abs(dx) + Math.abs(dy) > 6) {
    tile.classList.add('is-dragging');
    tile.style.setProperty('--drag-x', `${Math.max(-60, Math.min(60, dx))}px`);
    tile.style.setProperty('--drag-y', `${Math.max(-60, Math.min(60, dy))}px`);
  }
}
function handlePointerUp(event) {
  if (!dragState) return;
  const { index } = dragState;
  dragState = null;
  event.currentTarget.releasePointerCapture?.(event.pointerId);
  mainBoard.querySelector('.is-dragging')?.classList.remove('is-dragging');
  tryMove(index);
}
function handlePointerCancel() { dragState = null; mainBoard.querySelector('.is-dragging')?.classList.remove('is-dragging'); }

// Arrow keys slide a tile in the arrow's direction (so the blank moves the opposite way).
function handleKeyboard(event) {
  if (result || loading || !document.body.classList.contains('has-started')) return;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  const blankDirection = { ArrowUp: 'DOWN', ArrowDown: 'UP', ArrowLeft: 'RIGHT', ArrowRight: 'LEFT' }[event.key];
  if (!blankDirection) return;
  event.preventDefault();
  const neighbor = getNeighbors(currentState).find((item) => item.direction === blankDirection);
  tryMove(neighbor?.from ?? -1);
}

function shuffleBoard() {
  if (loading) return;
  stopAuto();
  let state = targetState; let previous = null;
  const steps = 10 + Math.floor(Math.random() * 7); // easy scramble so the search stays readable
  for (let i = 0; i < steps; i += 1) {
    const options = getNeighbors(state).filter((n) => n.state !== previous);
    const pick = options[Math.floor(Math.random() * options.length)];
    previous = state; state = pick.state;
  }
  if (state === targetState) { shuffleBoard(); return; }
  currentState = state; startState = state; movesMade = 0;
  clearSearch();
  animateShuffle();
  paperCrumpleSound();
}

function resetToStart() {
  stopAuto();
  currentState = startState; movesMade = 0;
  clearSearch();
  animateShuffle();
  paperCrumpleSound();
}

function editBoard() { stopAuto(); clearSearch(); }

/* ---------- sound ---------- */

function getAudioContext() {
  if (muted) return null;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    return audioContext;
  } catch { return null; }
}

function paperSlideSound() {
  const context = getAudioContext();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(220, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(330, context.currentTime + .055);
  gain.gain.setValueAtTime(.02, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .075);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(); oscillator.stop(context.currentTime + .08);
}

function paperCrumpleSound() {
  const context = getAudioContext();
  if (!context) return;
  const length = Math.floor(context.sampleRate * .22);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / length);
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  filter.type = 'bandpass'; filter.frequency.setValueAtTime(1450, context.currentTime); filter.Q.value = .8;
  gain.gain.setValueAtTime(.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(.06, context.currentTime + .018);
  gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .22);
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(); source.stop(context.currentTime + .23);
}

function inkStampSound() {
  const context = getAudioContext();
  if (!context) return;
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'square'; oscillator.frequency.setValueAtTime(92, now); oscillator.frequency.exponentialRampToValueAtTime(48, now + .12);
  gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.11, now + .012); gain.gain.exponentialRampToValueAtTime(.0001, now + .17);
  oscillator.connect(gain).connect(context.destination); oscillator.start(now); oscillator.stop(now + .18);
  paperCrumpleSound();
}

function animateShuffle() {
  mainBoard.classList.remove('is-shuffling');
  void mainBoard.offsetWidth;
  mainBoard.classList.add('is-shuffling');
  window.setTimeout(() => mainBoard.classList.remove('is-shuffling'), 650);
}

/* ---------- wiring ---------- */

refs.run.addEventListener('click', async () => { if (await prepareSearch()) await advanceStep(); });
refs.step.addEventListener('click', advanceStep);
refs.micro.addEventListener('click', advanceMicro);
refs.auto.addEventListener('click', startAuto);
refs.reset.addEventListener('click', resetToStart);
refs.shuffle.addEventListener('click', shuffleBoard);
refs.edit.addEventListener('click', editBoard);
refs.back.addEventListener('click', backOneStep);
refs.heuristic.addEventListener('change', (event) => { heuristicName = event.target.value; clearSearch(); });
refs.speed.addEventListener('input', (event) => { speed = Number(event.target.value); if (timer) { stopAuto(); startAuto(); } else render(); });
refs.note.addEventListener('click', (event) => { if (event.target.closest('#distance-toggle')) { distancesVisible = !distancesVisible; render(); } });
refs.soundToggle?.addEventListener('change', () => { muted = !refs.soundToggle.checked; });

mainBoard.addEventListener('click', handleBoardClick);
mainBoard.addEventListener('pointerdown', handlePointerDown);
mainBoard.addEventListener('pointermove', handlePointerMove);
mainBoard.addEventListener('pointerup', handlePointerUp);
mainBoard.addEventListener('pointercancel', handlePointerCancel);
window.addEventListener('keydown', handleKeyboard);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && document.body.classList.contains('has-started') && !['INPUT', 'SELECT', 'BUTTON', 'SUMMARY'].includes(document.activeElement?.tagName)) refs.run.click();
});

splashStart?.addEventListener('click', () => {
  if (document.body.classList.contains('is-transitioning')) return;
  document.body.classList.add('is-transitioning');
  splashStart.disabled = true;
  document.body.classList.add('has-started');
  splash?.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => { if (splash) splash.hidden = true; document.body.classList.remove('is-transitioning'); }, 820);
});

refs.heuristic.value = heuristicName;
render();