import pytest

from backend.astar import GOAL, heuristic, neighbors, solve


def test_heuristic_values():
    assert heuristic(GOAL, "manhattan") == 0
    assert heuristic((8, 1, 3, 0, 2, 4, 7, 6, 5), "manhattan") == 3
    assert heuristic((8, 1, 3, 7, 2, 4, 0, 6, 5), "manhattan") == 4
    assert heuristic((1, 2, 3, 8, 0, 4, 7, 5, 6), "manhattan") == 2


def test_goal_neighbors_are_legal_and_do_not_mutate_goal():
    result = neighbors(GOAL)
    assert len(result) == 4
    assert GOAL == (1, 2, 3, 8, 0, 4, 7, 6, 5)
    assert {move for move, _ in result} == {"up", "down", "left", "right"}


def test_reference_search_snapshot_and_moves():
    result = solve([8, 1, 3, 0, 2, 4, 7, 6, 5], "manhattan")
    assert result["solved"] is True
    assert result["expanded"] == 4
    assert result["moves"] == ["up", "right", "down"]
    assert result["steps"][-1]["goal"] is True
    root_children = {child["move"]: child for child in result["steps"][0]["children"]}
    assert (root_children["up"]["g"], root_children["up"]["h"], root_children["up"]["f"]) == (1, 2, 3)
    assert (root_children["down"]["g"], root_children["down"]["h"], root_children["down"]["f"]) == (1, 4, 5)
    assert (root_children["right"]["g"], root_children["right"]["h"], root_children["right"]["f"]) == (1, 4, 5)


def test_goal_is_zero_move_route():
    result = solve(list(GOAL), "manhattan")
    assert result["solved"] is True
    assert result["moves"] == []
    assert result["path"] == [list(GOAL)]


def test_wrong_parity_is_rejected_without_search():
    result = solve([1, 2, 3, 8, 0, 4, 7, 5, 6], "manhattan")
    assert result["solved"] is False
    assert result["solvable"] is False
    assert result["steps"] == []
    assert result["expanded"] == 0


def test_invalid_board_is_rejected():
    with pytest.raises(ValueError):
        solve([1, 2, 3, 4, 5, 6, 7, 8, 8], "manhattan")
