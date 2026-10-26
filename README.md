# The Taquin Times — A* 8-Puzzle, Playable

An interactive way to **see** how the A\* search algorithm thinks. You scramble a sliding-tile puzzle (the *taquin*, or 8-puzzle), hand it to A\*, and then watch the algorithm's two working lists, **OPEN** and **CLOSED**, change one decision at a time.

It is built as a university demonstration, but designed to be understood by someone who has never seen A\* before: no pseudocode needed, just a puzzle you can play and an algorithm you can step through.

---

## Table of contents

1. [The idea in one minute](#the-idea-in-one-minute)
2. [Quick start](#quick-start)
3. [How to play](#how-to-play)
4. [A tour of the screen](#a-tour-of-the-screen)
5. [How A\* works here](#how-a-works-here)
6. [The two heuristics](#the-two-heuristics)
7. [Controls and shortcuts](#controls-and-shortcuts)
8. [Design choices: why it looks and works this way](#design-choices-why-it-looks-and-works-this-way)
9. [Architecture](#architecture)
10. [The backend API](#the-backend-api)
11. [Project structure](#project-structure)
12. [Running the tests](#running-the-tests)
13. [Troubleshooting](#troubleshooting)
14. [Glossary](#glossary)

---

## The idea in one minute

The 8-puzzle is a 3×3 grid with eight numbered tiles and one empty square. You may only slide a tile that is next to the empty square into it. The goal is to reach a fixed arrangement:

```
1 2 3
8 _ 4
7 6 5
```

A\* finds the **shortest** sequence of slides from any solvable arrangement back to this goal. It does so by always working on the board that *looks* most promising, judged by a score called **f**.

Most explanations of A\* show a block of pseudocode. The hard part to grasp is invisible there: the **queue of candidates** and the **list of things already done**. This project makes those two lists the main attraction. You can watch boards line up in OPEN, get picked, get expanded, and move to CLOSED.

---

## Quick start

### Requirements

- Python 3.11 or newer
- Node.js (only if you want to run in a browser instead of the desktop window)

### Option A: desktop window (recommended)

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
python desktop.py
```

`desktop.py` does three things for you: starts the Python backend, serves the front-end, and opens a native window (via [pywebview](https://pywebview.flowrl.com/), which uses the WebView2 engine already present on Windows). Closing the window stops everything.

### Option B: in the browser

Use two terminals from the project root.

```powershell
# Terminal 1: the A* backend
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000

# Terminal 2: the front-end
npm start
```

Then open <http://localhost:3000>. The port can be changed with the `PORT` environment variable. `npm run check` runs a syntax check.

> The front-end calls `/api/solve`, while the backend route is `/solve`. Whatever serves the front-end (the Node server or `desktop.py`) must forward `/api/*` to port 8000 with the `/api` prefix removed. Both launchers are set up for this.

---

## How to play

1. **Click START** on the cover page.
2. **Scramble the board.** Click, drag, or use the arrow keys to slide tiles, or press **Shuffle** for a ready-made scramble. Tiles highlighted in yellow are the ones that can currently move.
3. **Press "Solve it".** The page switches to *watch* mode and A\* starts from your board.
4. **Step through the search.** Press **Next** to run one full A\* decision, **Play** to let it run by itself, or **1 phase** to move through its thinking in the smallest possible pieces.
5. **Watch OPEN and CLOSED** on the right, and the yellow narration note at the top explaining each step in plain words.
6. When A\* reaches the goal, a **SOLVED!** stamp lands on the board and the stats strip shows how many moves the shortest solution takes.
7. Press **Edit board** to go back to your scrambled puzzle and try a different one (or switch heuristic).

---

## A tour of the screen

Each part of the page has a job. Here is what it is, what it shows, and why it is there.

### Cover page (splash screen)

A single card with a START button. It sets the tone (a paper zine, not a dashboard) and gives one clear invitation before anything else appears.

### Masthead: "The Taquin Times"

The newspaper title bar. It carries the zine and newspaper theme and holds the **sound** toggle (small paper and ink sound effects on moves, errors and solving). It has no function beyond identity and the sound switch, and it is deliberately small so the puzzle stays the focus.

### Headline and narration note

The big headline and the yellow sticky note beneath it answer the question *"what am I supposed to do or look at right now?"* at every moment.

- Before you scramble: *"Scramble the puzzle."*
- After scrambling: *"Now let A\* solve it."*
- During the search, the headline names the current phase in plain language (*"Pick the most promising board"*, *"Look at every possible move"*, *"Score each new board"*, *"File them in the to-do list"*) and the note gives the exact details of that step.
- Problems (an illegal move, the backend being unreachable) appear here in red.

This replaces a status bar and an event log with one place to read.

### The board

The large 3×3 grid in the centre. In **play mode** it is interactive: yellow tiles can slide, others politely refuse (and shake). In **watch mode** it shows the board A\* is currently examining, which is the board it just took off the top of OPEN. When you turn on distances (see below), each tile shows how far it is from home.

### The goal sticker

A small taped-on card showing the target arrangement, plus your move counter. It stays visible so you never have to remember what you are aiming for. Note that this goal is fixed: A\* always solves toward this exact layout.

### Play-mode controls

| Control | What it does |
|---|---|
| **Shuffle** | Makes 10 to 16 random legal moves from the goal. This guarantees a solvable board that is also small enough for the search to be readable. |
| **Reset** | Returns to the last shuffled starting board (or the goal if you have not shuffled). |
| **Solve it ↵** | Sends the board to the backend and starts the replay. Disabled while the board already equals the goal. |
| **Heuristic selector** | Chooses how A\* guesses the remaining distance: *Manhattan distance* or *Misplaced tiles*. |

### Watch-mode controls

| Control | What it does |
|---|---|
| **Back** | Rewinds one full expansion. |
| **Next** | Runs one full expansion: pick, expand, score, insert. |
| **Play / Pause** | Automatically advances one phase at a time. |
| **1 phase** | Advances a single phase (the finest level of detail). |
| **Edit board** | Leaves the replay and returns to your scrambled puzzle. |
| **Pace** | Sets the autoplay speed (1× slowest to 5× fastest). |

### The five-step stepper

The row of pills (*pick lowest f → make children → score g + h → file the best → goal?*) is the whole A\* loop, compressed to five words each. The current phase lights up in yellow. It is the pseudocode, but alive: you can see *where in the algorithm you are* without reading code.

### "A\* is looking at": the children cards

During the *expand*, *score* and *insert* phases, small cards show every board that can be reached from the one being examined. Each card shows the move that produced it (↑ ↓ ← →), its **f** score, and its **g + h** breakdown. In the insert phase:

- **Yellow solid cards** were added to OPEN.
- **Faded cards with an "ALREADY SEEN" stamp** were thrown away, because A\* had already visited that board. This is what the CLOSED list is for.

### "What do g, h and f mean?"

A collapsible explainer so that beginners can look it up without leaving the page. Inside it, a live note shows the **current heuristic's definition**, a worked example using the tiles furthest from home, and a **Show distances on the tiles** toggle, which prints each tile's distance on the board itself.

### The stats strip

A small row that appears only once A\* has made a decision:

- **checked**: how many boards are in CLOSED so far.
- **waiting**: how many boards are in OPEN.
- **moves to solve**: appears at the end, the length of the shortest solution.

These numbers are a quick way to compare heuristics: a better heuristic needs fewer boards checked.

### OPEN: "the to-do list"

The most important panel. OPEN holds the boards A\* has discovered but **not yet examined**, sorted by **f**, lowest first.

- Each slip shows a thumbnail of the board, a big **f**, and its **g + h**.
- The top slip is yellow and flagged **NEXT**: this is what A\* will pick.
- Up to six slips are shown, with a "+ N more waiting" line for the rest.
- New slips pop in so you notice what just arrived.
- Before the search starts, **ghost slips** (faint dashed outlines) show where boards will appear.

### CLOSED: "boards already checked"

CLOSED holds every board A\* has already examined. A\* never revisits these, which is what keeps it from going in circles. It is shown as a grid of small board thumbnails with their f scores, newest first, with the latest highlighted. Empty at first, it fills up as the search goes on.

---

## How A\* works here

For every board **n**, A\* computes:

```
f(n) = g(n) + h(n)
```

- **g(n)**: how many moves it took to reach this board from the start (known exactly).
- **h(n)**: a *guess* of how many moves remain until the goal (the heuristic).
- **f(n)**: the estimated length of the best full solution passing through this board.

The loop, which is exactly what the five-step stepper shows:

```
put the start board in OPEN
repeat:
    1. POP     take the board with the lowest f from OPEN
    2. GOAL?   if it is the goal, stop: we have the shortest path
    3. EXPAND  find every board reachable by one legal slide
    4. SCORE   compute g, h and f for each new board
    5. INSERT  add each new board to OPEN, unless it was already seen;
               move the examined board to CLOSED
```

When the goal is popped, the path back through the parent boards is the shortest possible solution, provided the heuristic never overestimates (see below).

### One replay, five phases

The backend solves the puzzle in one go and returns a full record of every expansion. The front-end then **replays** that record and splits each expansion into its phases (`pop`, `expand`, `score`, `insert`, and finally `goal`). That is why you can step forwards and backwards freely: nothing is recomputed, you are scrubbing through a recording.

### Solvability

Only half of the possible arrangements of the 8-puzzle can ever reach the goal. A board is solvable when the number of inversions in its tile sequence (ignoring the blank) has the same parity as the goal's. The backend checks this and reports `solvable: false` for impossible boards. In the app you can only produce solvable boards, since every move you make is legal.

---

## The two heuristics

Both are **admissible** (they never overestimate the true number of remaining moves) and **consistent**, so A\* with either one still returns an optimal solution.

| Heuristic | h(n) is… | Strength |
|---|---|---|
| **Misplaced tiles** | the number of tiles not on their goal square | Very cheap, but a weak guess: a tile one square away and a tile five squares away count the same. |
| **Manhattan distance** | the sum, over all tiles, of horizontal plus vertical distance to the goal square | A tighter guess, so A\* usually explores noticeably fewer boards. |

**Try this:** shuffle a board, solve it with Misplaced tiles and note the "checked" count in the stats strip, then press *Edit board*, switch to Manhattan, and solve the same board again. The difference is the whole point of choosing a good heuristic.

---

## Controls and shortcuts

| Input | Effect |
|---|---|
| Click a yellow tile | Slide it into the blank. |
| Drag a tile | Same, with a bit of tactile feedback. |
| Arrow keys | Slide the tile in the arrow's direction (focus the board first or click once on the page). |
| `Enter` | Same as "Solve it" (in play mode). |
| Click a non-yellow tile | The board shakes and the note explains why the move is illegal. |

---

## Design choices: why it looks and works this way

**Why visualize OPEN and CLOSED at all?**
They are the heart of A\*. Textbook pseudocode names them but never lets you *see* them change. Making them physical objects (slips you can watch arrive, line up and move) turns an abstract data structure into something intuitive. A priority queue becomes a literal to-do pile sorted by score.

**Why board thumbnails instead of rows of numbers?**
An earlier version showed states as strings like `1238·4765`. Nobody can read those. A tiny picture of the board is instantly recognisable, so you can see *which* board is queued, spot repeats in CLOSED, and notice when two slips are nearly the same.

**Why a puzzle you play first?**
Search algorithms are normally demonstrated on abstract graphs. A puzzle you have just played yourself gives you a feeling for the problem (*"this is hard to solve by hand"*) before A\* solves it. It also makes the tool feel like a toy rather than a lecture, which is the spirit of sites like neal.fun.

**Why two modes (play and watch)?**
Showing the controls for both at once made the page look like a dashboard and confused newcomers. Play mode shows only what you need to scramble and start; watch mode shows only what you need to step through the search.

**Why a single narration note and a plain-language headline?**
The earlier layout had a status bar, a "what happened" log and a "how A\* thinks" card, all saying overlapping things in tiny type. One large, readable sentence that always describes *the current moment* is far easier to follow, and the technical vocabulary (f, g, h) is introduced gradually through it.

**Why replay a recording instead of running A\* live in the browser?**
The Python backend returns the full trace in one response, which keeps the front-end simple and makes stepping *backwards* trivial. It also keeps the algorithm in a language and structure suitable for testing.

**Why the zine and newspaper aesthetic?**
Paper slips, hard offset shadows, a halftone grain, taped stickers and a stamped "SOLVED!" make the interface feel handmade and tactile. That suits the physical metaphor of slips of paper in a queue, and keeps the project memorable. Ink, paper and a single yellow highlight also give a clear visual rule: **yellow means "this is what matters right now"** (a movable tile, the next slip, the current phase, the narration note).

**Why shuffle with only 10 to 16 moves?**
A fully random board can need 20+ moves and thousands of expansions, which makes the OPEN list hard to follow. Short scrambles keep the search small enough to read, while still being non-trivial.

---

## Architecture

```
┌─────────────────────────┐     POST /api/solve      ┌──────────────────────────┐
│  Front-end (browser/    │ ───────────────────────► │  Python backend (FastAPI)│
│  pywebview window)      │                          │  A* search + solvability │
│                         │ ◄─────────────────────── │                          │
│  index.html, src/*.js   │   full trace of steps    │  backend/astar.py        │
│  replays the trace      │                          │  backend/app.py          │
└─────────────────────────┘                          └──────────────────────────┘
```

- The **backend** owns the algorithm. It runs A\*, records every step, and returns it as JSON.
- The **front-end** owns the experience. It holds the current board, sends it to the backend, and replays the returned trace phase by phase.
- `src/solver.js` is a DOM-independent helper module with the goal state, heuristics, neighbour generation and tile-distance helpers used by the interface.
- `desktop.py` is the launcher. It starts the backend, serves the static files, forwards `/api/*` requests to the backend, and opens the native window.

---

## The backend API

Base URL: `http://127.0.0.1:8000`

### `POST /solve`

Request body:

```json
{
  "board": [1, 0, 3, 8, 2, 4, 7, 6, 5],
  "heuristic": "manhattan"
}
```

- `board`: nine integers, a permutation of 0 to 8, where `0` is the blank (read left to right, top to bottom).
- `heuristic`: `"manhattan"` (default) or `"misplaced"`.

Response (shape):

```
solvable   boolean   whether the board can reach the goal
solved     boolean   whether A* found a solution
moves      string[]  the move names along the shortest path
path       number[][] the boards from start to goal
steps      object[]  one entry per expansion: the popped node, its children,
                     OPEN before and after, CLOSED, inserted and discarded nodes
expanded   number    boards expanded
generated  number    boards generated
time_ms    number    search time in milliseconds
```

Invalid input is rejected with HTTP 422.

### `GET /health`

Returns `{"status": "ok"}`. Useful to check the server is up.

Interactive documentation is available at <http://127.0.0.1:8000/docs> while the backend runs.

---

## Project structure

```
.
├── desktop.py            Desktop launcher (backend + static server + native window)
├── server.mjs            Node dev server used by `npm start`
├── index.html            Page structure, including the cover screen
├── package.json
├── backend/
│   ├── app.py            FastAPI app and /solve endpoint
│   ├── astar.py          The A* implementation and solvability check
│   ├── requirements.txt
│   └── tests/
│       └── test_astar.py
└── src/
    ├── app.js            State, events, mode switching, replay controls
    ├── render.js         Draws boards, OPEN, CLOSED, stats and the h(n) note
    ├── solver.js         Goal state, heuristics, neighbours, tile distances
    ├── api.js            Calls the backend and converts the trace into replay events
    ├── styles.css        Base styles and the cover screen
    └── ui.css            The game interface ("The Taquin Times")
```

---

## Running the tests

```powershell
python -m pytest backend/tests
```

The tests cover the A\* implementation in `backend/astar.py`.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `ImportError: attempted relative import with no known parent package` | `app.py` uses `from .astar import solve`, so it must be run as part of the package. Use `python -m uvicorn backend.app:app` from the project root, not `python app.py`. |
| Red note: *"Couldn't reach the A\* backend"* | The backend is not running, or requests are not reaching it. Check `http://127.0.0.1:8000/health`. |
| *Backend error (404)* | The front-end calls `/api/solve` but the backend route is `/solve`. Whatever serves the page must strip the `/api` prefix when forwarding. `desktop.py` does this. |
| *Backend error (501)* | An old process is still holding the front-end port and answering with a plain file server. Close the window and stop the old process (`netstat -ano \| findstr :3000`, then `taskkill /PID <pid> /F`). |
| `webview` import underlined in the editor | The editor is using a different Python than the one with `pywebview` installed. Select the `.venv` interpreter (*Python: Select Interpreter*). |
| "Backend already running on port 8000, reusing it." | Not an error. `desktop.py` detected a backend you started yourself and will use it. |
| Solve button is greyed out | The board already equals the goal. Press Shuffle or move a tile first. |

---

## Glossary

| Term | Meaning |
|---|---|
| **State / board** | One arrangement of the nine squares. |
| **Node** | A board plus the bookkeeping A\* keeps about it: its g, h, f, the move that created it and its parent. |
| **Expand** | Generate every board reachable from a node by one legal slide. |
| **Heuristic, h(n)** | An estimate of the remaining moves to the goal. |
| **g(n)** | The exact number of moves from the start to this node. |
| **f(n) = g + h** | The estimated total length of the best solution through this node. |
| **OPEN** | Nodes discovered but not yet expanded, ordered by lowest f. |
| **CLOSED** | Nodes already expanded; never expanded again. |
| **Admissible** | A heuristic that never overestimates the true remaining cost. |
| **Optimal** | The shortest possible solution. A\* with an admissible heuristic guarantees it. |
| **Taquin** | The French name for the sliding-tile puzzle. |