from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from .astar import solve

app = FastAPI(title="Taquin A* Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SolveRequest(BaseModel):
    board: list[int] = Field(min_length=9, max_length=9)
    heuristic: Literal["manhattan", "misplaced"] = "manhattan"

    @field_validator("board")
    @classmethod
    def valid_permutation(cls, board: list[int]) -> list[int]:
        if sorted(board) != list(range(9)):
            raise ValueError("board must be a permutation of 0 to 8")
        return board


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/solve")
def solve_endpoint(request: SolveRequest) -> dict:
    try:
        return solve(request.board, request.heuristic)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
