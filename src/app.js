import { GOAL_STATE, HEURISTICS, getNeighbors } from './solver.js';
import { solvePuzzle, toReplayResult } from './api.js';
import { renderBoard, renderClosedList, renderOpenList, renderStats, renderStepLog, updateHeuristicNote } from './render.js';

const $ = (selector) => document.querySelector(selector);
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
let dragHandled = false;

const refs = {
  status: $('#status-text'), heuristic: $('#heuristic-select'), speed: $('#speed-slider'), speedLabel: $('#speed-label'), run: $('#run-button'), solveNote: $('#solve-note'), step: $('#step-button'), micro: $('#micro-step-button'), auto: $('#auto-button'), pause: $('#pause-button'), reset: $('#reset-button'), back: $('#back-step-button'), distances: $('#distance-toggle'), currentNode: $('#current-node-id'), moveCaption: $('#move-caption'), moveCount: $('#move-count'), stats: $('#stats'), open: $('#open-list'), closed: $('#closed-list'), log: $('#step-log'), note: $('#heuristic-note'), children: $('#child-cluster'), pseudocode: $('#pseudocode'), activeRing: $('.active-ring'),
};

function currentEvent() { return result?.events?.[eventIndex] || null; }
function boardForDisplay() { return currentEvent()?.expanded?.state || currentState; }
function isAtGoal() { return currentState === targetState; }

function renderChildren(event) {
  if (!refs.children) return;
  refs.children.innerHTML = '';
  if (!event || !['expand', 'score', 'insert'].includes(event.phase) || !event.children?.length) return;
  event.children.forEach((child) => {
    const item = document.createElement('article');
    const status = event.phase === 'score' ? 'scoring' : event.phase === 'insert' ? (event.discarded?.some((node) => node.state === child.state) ? 'discarded' : 'inserted') : '';
    item.className = `child-slip child-slip--${status}`;
    item.innerHTML = `<span class="child-move">${child.move}</span>`;
    const childBoard = item.appendChild(document.createElement('div'));
    renderBoard(childBoard, child.state, { mini: true, distances: event.phase === 'score', targetState });
    if (event.phase === 'score') childBoard.querySelector(`[data-tile="${child.tile}"]`)?.classList.add('tile-cell--score-focus');
    item.insertAdjacentHTML('beforeend', `<b>g ${child.g} · h ${child.h} · f ${child.f}</b>${status === 'discarded' ? '<span class="seen-stamp">ALREADY SEEN</span>' : ''}`);
    refs.children.appendChild(item);
  });
}

function highlightPseudo(phase) {
  refs.pseudocode?.querySelectorAll('[data-pseudo]').forEach((line) => line.classList.toggle('is-current', line.dataset.pseudo === phase));
}

function render() {
  const event = currentEvent();
  const displayState = boardForDisplay();
  const scorePhase = event?.phase === 'score';
  renderBoard(mainBoard, displayState, { interactive: !result, distances: distancesVisible || scorePhase, targetState });
  renderBoard(targetBoard, targetState, { mini: true, target: true, distances: false, targetState });
  renderOpenList(refs.open, event?.open || [], event?.expanded?.state, event?.phase || '');
  renderClosedList(refs.closed, event?.closed || []);
  renderStepLog(refs.log, result?.events || [], eventIndex);
  renderStats(refs.stats, result?.stats || {}, Boolean(result?.solved && event?.phase === 'goal'));
  renderChildren(event);
  updateHeuristicNote(refs.note, HEURISTICS[heuristicName], currentState, targetState, event, distancesVisible || scorePhase);
  highlightPseudo(event?.phase || '');

  refs.moveCount.textContent = String(movesMade);
  refs.moveCaption.textContent = event ? `${event.phase.toUpperCase()} · expansion ${event.expansion}` : `move ${movesMade} · drag or click a tile`;
  refs.speedLabel.textContent = `${speed}×`;
  refs.pause.disabled = !timer;
  refs.back.disabled = !result || eventIndex < 0;
  refs.auto.querySelector('.action-button__arrow').textContent = timer ? '■' : '▶';
  refs.activeRing.classList.toggle('is-visible', Boolean(event));
  refs.run.disabled = loading || isAtGoal() || Boolean(result);
  refs.step.disabled = loading;
  refs.micro.disabled = loading;
  refs.auto.disabled = loading;
  refs.reset.disabled = loading;
  refs.run.title = isAtGoal() ? 'Make at least one move before solving.' : '';
  refs.solveNote?.classList.toggle('is-visible', isAtGoal());
  const solved = Boolean(result?.solved && event?.phase === 'goal');
  if (solved && !announcedSolved) {
    announcedSolved = true;
    inkStampSound();
  }
  document.body.classList.toggle('is-solved', solved);
}

function setStatus(message, tone = 'ready') { refs.status.textContent = message; const dot = document.querySelector('.status-dot'); if (dot) dot.className = `status-dot status-dot--${tone}`; }
function stopAuto() { if (timer) window.clearInterval(timer); timer = null; }
function clearSearch(message = 'State changed · ready to build the search.') { stopAuto(); result = null; eventIndex = -1; announcedSolved = false; document.body.classList.remove('is-solved'); if (message) setStatus(message); render(); }

async function prepareSearch() {
  stopAuto();
  if (isAtGoal()) { setStatus('The made state equals the goal · move a tile before solving.', 'warning'); render(); return false; }
  loading = true;
  setStatus('Sending the made board to the A* backend…', 'active');
  render();
  try {
    const payload = await solvePuzzle([...currentState].map(Number), heuristicName);
    if (!payload.solvable) {
      result = null;
      setStatus('This board is not solvable · change the made configuration and try again.', 'warning');
      return false;
    }
    result = toReplayResult(payload);
    eventIndex = -1;
    setStatus('A* initialized · the first slip is ready to POP.', 'active');
    return true;
  } catch (error) {
    result = null;
    setStatus(`Backend unavailable · ${error.message}`, 'warning');
    return false;
  } finally {
    loading = false;
    render();
  }
}

function advanceMicroNow() {
  if (!result?.events?.length || eventIndex >= result.events.length - 1) { stopAuto(); return; }
  eventIndex += 1;
  const event = currentEvent();
  setStatus(event.caption, event.phase === 'goal' ? 'solved' : 'active');
  render();
  if (event.phase === 'goal') stopAuto();
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
  setStatus('Auto is replaying one A* phase at a time…', 'active'); render();
}

function backOneStep() {
  if (!result || eventIndex < 0) return;
  stopAuto();
  let cursor = eventIndex - 1;
  while (cursor >= 0 && !['insert', 'goal'].includes(result.events[cursor].phase)) cursor -= 1;
  eventIndex = cursor;
  setStatus('Back one expansion · replay the decision again.', 'active'); render();
}

function moveState(state, tileIndex) { return getNeighbors(state).find((item) => item.from === tileIndex)?.state || null; }
function tryMove(tileIndex) {
  if (result) return false;
  const next = moveState(currentState, tileIndex);
  if (!next) { mainBoard.classList.remove('is-rejected'); void mainBoard.offsetWidth; mainBoard.classList.add('is-rejected'); paperCrumpleSound(); setStatus('Illegal move · only a tile beside the blank can slide.', 'warning'); return false; }
  currentState = next; movesMade += 1; paperSlideSound(); clearSearch('A tile moved · the final configuration is still editable.'); animateMove(); return true;
}
function handleBoardClick(event) { const tile = event.target.closest('.tile-cell:not(.tile-cell--empty)'); if (!tile || dragHandled) { dragHandled = false; return; } tryMove(Number(tile.dataset.index)); }
function handlePointerDown(event) { const tile = event.target.closest('.tile-cell:not(.tile-cell--empty)'); if (!tile || result) return; dragState = { x: event.clientX, y: event.clientY, index: Number(tile.dataset.index) }; event.currentTarget.setPointerCapture?.(event.pointerId); }
function handlePointerMove(event) { if (!dragState) return; const tile = event.currentTarget.querySelector(`[data-index="${dragState.index}"]`); if (!tile) return; const dx = event.clientX - dragState.x; const dy = event.clientY - dragState.y; if (Math.abs(dx) + Math.abs(dy) > 6) { tile.classList.add('is-dragging'); tile.style.setProperty('--drag-x', `${dx}px`); tile.style.setProperty('--drag-y', `${dy}px`); } }
function handlePointerUp(event) { if (!dragState) return; const delta = Math.abs(event.clientX - dragState.x) + Math.abs(event.clientY - dragState.y); if (delta > 14) { dragHandled = true; tryMove(dragState.index); } event.currentTarget.querySelector(`[data-index="${dragState.index}"]`)?.classList.remove('is-dragging'); dragState = null; }
function handleKeyboard(event) { if (result) return; const desired = { ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT' }[event.key]; if (!desired) return; event.preventDefault(); const neighbor = getNeighbors(currentState).find((item) => item.direction === desired); tryMove(neighbor?.from ?? -1); }
function resetToStart() {
  stopAuto();
  currentState = startState;
  movesMade = 0;
  clearSearch('Back at the printed start state · paper rearranged and ready.');
  animateShuffleToStart();
  paperCrumpleSound();
  window.setTimeout(inkStampSound, 130);
}

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

function animateShuffleToStart() {
  mainBoard.classList.remove('is-shuffling', 'is-stamping');
  void mainBoard.offsetWidth;
  mainBoard.classList.add('is-shuffling', 'is-stamping');
  window.setTimeout(() => mainBoard.classList.remove('is-shuffling', 'is-stamping'), 780);
}

function animateMove() {
  mainBoard.classList.remove('is-moving');
  void mainBoard.offsetWidth;
  mainBoard.classList.add('is-moving');
  window.setTimeout(() => mainBoard.classList.remove('is-moving'), 280);
}

refs.run.addEventListener('click', async () => { if (await prepareSearch()) await advanceStep(); });
refs.step.addEventListener('click', advanceStep);
refs.micro.addEventListener('click', advanceMicro);
refs.auto.addEventListener('click', startAuto);
refs.pause.addEventListener('click', () => { stopAuto(); setStatus('Paused · choose STEP or MICRO-STEP to continue.', 'active'); render(); });
refs.reset.addEventListener('click', resetToStart);
refs.back?.addEventListener('click', backOneStep);
refs.heuristic.addEventListener('change', (event) => { heuristicName = event.target.value; clearSearch(`${HEURISTICS[heuristicName].label} selected · define h(n) before solving.`); });
refs.speed.addEventListener('input', (event) => { speed = Number(event.target.value); if (timer) { stopAuto(); startAuto(); } else render(); });
refs.note.addEventListener('click', (event) => { if (event.target.closest('#distance-toggle')) { distancesVisible = !distancesVisible; render(); } });
refs.soundToggle?.addEventListener('change', () => { muted = !refs.soundToggle.checked; });
mainBoard.addEventListener('click', handleBoardClick); mainBoard.addEventListener('pointerdown', handlePointerDown); mainBoard.addEventListener('pointermove', handlePointerMove); mainBoard.addEventListener('pointerup', handlePointerUp); mainBoard.addEventListener('keydown', handleKeyboard);
window.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !['INPUT', 'SELECT', 'BUTTON'].includes(document.activeElement?.tagName)) refs.run.click(); });

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
