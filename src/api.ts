export type HeuristicName = 'manhattan' | 'misplaced';

export interface BackendNode {
  id: number;
  board: number[];
  state: string;
  g: number;
  h: number;
  f: number;
  move: string | null;
  parent: number | null;
  depth: number;
  status?: 'inserted' | 'discarded';
  reason?: string;
}

export interface BackendStep {
  step: number;
  popped: BackendNode;
  children: BackendNode[];
  open: BackendNode[];
  open_before: BackendNode[];
  open_size: number;
  closed_size: number;
  closed: Array<{ board: number[]; state: string }>;
  inserted: BackendNode[];
  discarded: BackendNode[];
  goal: boolean;
}

export interface SolveResponse {
  solved: boolean;
  solvable: boolean;
  moves: string[];
  path: number[][];
  steps: BackendStep[];
  expanded: number;
  generated: number;
  time_ms: number;
}

export async function solvePuzzle(board: number[], heuristic: HeuristicName): Promise<SolveResponse> {
  const response = await fetch('/api/solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ board, heuristic }),
  });
  if (!response.ok) throw new Error(`Backend error (${response.status})`);
  return response.json() as Promise<SolveResponse>;
}
