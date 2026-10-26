from __future__ import annotations

from dataclasses import dataclass
from itertools import count
import heapq
import time
from typing import Literal

GOAL: tuple[int, ...] = (1, 2, 3, 8, 0, 4, 7, 6, 5)
HeuristicName = Literal["manhattan", "misplaced"]
MOVES = (("up", -1, 0), ("down", 1, 0), ("left", 0, -1), ("right", 0, 1))
GOAL_POS = {tile: position for position, tile in enumerate(GOAL)}


@dataclass
class Node:
    state: tuple[int, ...]
    g: int
    parent: "Node | None"
    move: str | None
    h: int
    f: int
    node_id: int


def validate_board(board: list[int] | tuple[int, ...]) -> tuple[int, ...]:
    state = tuple(board)
    if len(state) != 9 or sorted(state) != list(range(9)):
        raise ValueError("board must be a permutation of 0 to 8")
    return state


def blank_index(state: tuple[int, ...]) -> int:
    return state.index(0)


def neighbors(state: tuple[int, ...]) -> list[tuple[str, tuple[int, ...]]]:
    b = blank_index(state)
    r, c = divmod(b, 3)
    result: list[tuple[str, tuple[int, ...]]] = []
    for name, dr, dc in MOVES:
        nr, nc = r + dr, c + dc
        if 0 <= nr < 3 and 0 <= nc < 3:
            t = nr * 3 + nc
            new = list(state)
            new[b], new[t] = new[t], new[b]
            result.append((name, tuple(new)))
    return result


def manhattan(state: tuple[int, ...]) -> int:
    total = 0
    for position, tile in enumerate(state):
        if tile == 0:
            continue
        home = GOAL_POS[tile]
        total += abs(position // 3 - home // 3) + abs(position % 3 - home % 3)
    return total


def misplaced(state: tuple[int, ...]) -> int:
    return sum(tile != 0 and tile != GOAL[position] for position, tile in enumerate(state))


def heuristic(state: tuple[int, ...], name: HeuristicName) -> int:
    return misplaced(state) if name == "misplaced" else manhattan(state)


def inversion_count(state: tuple[int, ...]) -> int:
    values = [tile for tile in state if tile != 0]
    return sum(values[i] > values[j] for i in range(len(values)) for j in range(i + 1, len(values)))


def is_solvable(state: tuple[int, ...]) -> bool:
    return inversion_count(state) % 2 == inversion_count(GOAL) % 2


def node_payload(node: Node | None) -> dict | None:
    if node is None:
        return None
    return {
        "id": node.node_id,
        "board": list(node.state),
        "state": "".join(map(str, node.state)),
        "g": node.g,
        "h": node.h,
        "f": node.f,
        "move": node.move,
        "parent": node.parent.node_id if node.parent else None,
        "depth": node.g,
    }


def ordered_open(heap: list[tuple[int, int, int, Node]], limit: int = 15) -> list[dict]:
    return [node_payload(item[3]) for item in sorted(heap, key=lambda item: (item[0], item[1], item[2]))[:limit]]


def path_to(node: Node | None) -> list[list[int]]:
    path: list[list[int]] = []
    while node is not None:
        path.append(list(node.state))
        node = node.parent
    path.reverse()
    return path


def solve(board: list[int], heuristic_name: HeuristicName = "manhattan") -> dict:
    started = time.perf_counter()
    start = validate_board(board)
    if not is_solvable(start):
        return {"solved": False, "solvable": False, "moves": [], "path": [], "steps": [], "expanded": 0, "generated": 0, "time_ms": (time.perf_counter() - started) * 1000}

    sequence = count()
    next_id = count(1)
    root_h = heuristic(start, heuristic_name)
    root = Node(start, 0, None, None, root_h, root_h, next(next_id))
    open_heap: list[tuple[int, int, int, Node]] = [(root.f, root.h, next(sequence), root)]
    best_g = {start: 0}
    closed: set[tuple[int, ...]] = set()
    expanded = 0
    generated = 1
    steps: list[dict] = []
    goal_node: Node | None = None

    while open_heap:
        before_open = ordered_open(open_heap)
        _, _, _, node = heapq.heappop(open_heap)
        if node.state in closed or best_g.get(node.state) != node.g:
            continue

        expanded += 1
        is_goal = node.state == GOAL
        children: list[dict] = []
        inserted: list[dict] = []
        discarded: list[dict] = []

        if is_goal:
            goal_node = node
        else:
            closed.add(node.state)
            for move, child_state in neighbors(node.state):
                child_g = node.g + 1
                child_h = heuristic(child_state, heuristic_name)
                child = Node(child_state, child_g, node, move, child_h, child_g + child_h, next(next_id))
                child_data = node_payload(child)
                known_g = best_g.get(child_state)
                if child_state in closed:
                    child_data["status"] = "discarded"
                    child_data["reason"] = "closed"
                    discarded.append(child_data)
                elif known_g is not None and known_g <= child_g:
                    child_data["status"] = "discarded"
                    child_data["reason"] = "better path already known"
                    discarded.append(child_data)
                else:
                    best_g[child_state] = child_g
                    heapq.heappush(open_heap, (child.f, child.h, next(sequence), child))
                    generated += 1
                    child_data["status"] = "inserted"
                    inserted.append(child_data)
                children.append(child_data)

        closed_snapshot = [{"board": list(state), "state": "".join(map(str, state))} for state in reversed(list(closed))]
        steps.append({
            "step": expanded,
            "popped": node_payload(node),
            "children": children,
            "open": ordered_open(open_heap),
            "open_before": before_open,
            "open_size": len(open_heap),
            "closed_size": len(closed),
            "closed": closed_snapshot,
            "inserted": inserted,
            "discarded": discarded,
            "goal": is_goal,
        })
        if is_goal:
            break

    solved = goal_node is not None
    moves: list[str] = []
    cursor = goal_node
    while cursor is not None and cursor.parent is not None:
        moves.append(cursor.move or "")
        cursor = cursor.parent
    moves.reverse()
    return {
        "solved": solved,
        "solvable": True,
        "moves": moves,
        "path": path_to(goal_node),
        "steps": steps,
        "expanded": expanded,
        "generated": generated,
        "time_ms": (time.perf_counter() - started) * 1000,
    }
