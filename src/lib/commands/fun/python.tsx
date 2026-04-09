"use client";

import { useState, useEffect, useRef, useCallback } from "react";

import type { Command } from "@/lib/types";
import { registry } from "@/lib/shell/registry";
import { markEggFound } from "@/lib/ctf/game";

// --- Snake game ---

const BOARD_W = 30;
const BOARD_H = 15;

type Point = { x: number; y: number };
type Dir = "right" | "left" | "up" | "down";

const HEAD_CHAR: Record<Dir, string> = {
  right: ">",
  left: "<",
  up: "^",
  down: "v",
};

function randomFood(snake: Point[]): Point {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const p = {
      x: Math.floor(Math.random() * BOARD_W),
      y: Math.floor(Math.random() * BOARD_H),
    };
    if (!snake.some((s) => s.x === p.x && s.y === p.y)) return p;
  }
}

function makeNewGame() {
  return {
    snake: [
      { x: 15, y: 7 },
      { x: 14, y: 7 },
      { x: 13, y: 7 },
    ] as Point[],
    food: { x: 5, y: 4 } as Point,
    score: 0,
    dir: "right" as Dir,
    nextDir: "right" as Dir,
    gameOver: false,
    won: false,
    started: false,
    exited: false,
  };
}

function SnakeGame() {
  const gameRef = useRef(makeNewGame());
  const [, bump] = useState(0);
  const forceUpdate = useCallback(() => bump((n) => n + 1), []);

  // Keyboard input — cleaned up on unmount or after exit
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const g = gameRef.current;

      // Once exited, remove the listener and let all keys pass through
      if (g.exited) {
        window.removeEventListener("keydown", handler, true);
        return;
      }

      if (e.key === "q" || e.key === "Q") {
        e.preventDefault();
        e.stopPropagation();
        g.exited = true;
        window.removeEventListener("keydown", handler, true);
        forceUpdate();
        return;
      }

      // vim hjkl bindings only — no arrow keys, no WASD
      const DIR_MAP: Record<string, Dir> = {
        h: "left",
        j: "down",
        k: "up",
        l: "right",
      };
      const newDir = DIR_MAP[e.key];
      if (!newDir) return;

      e.preventDefault();
      e.stopPropagation();

      // Restart after game over
      if (g.gameOver) {
        const fresh = makeNewGame();
        fresh.nextDir = newDir;
        fresh.started = true;
        gameRef.current = fresh;
        forceUpdate();
        return;
      }

      // Block 180° reversal
      const cur = g.dir;
      if (
        (newDir === "up" && cur === "down") ||
        (newDir === "down" && cur === "up") ||
        (newDir === "left" && cur === "right") ||
        (newDir === "right" && cur === "left")
      )
        return;

      g.nextDir = newDir;
      if (!g.started) g.started = true;
      forceUpdate();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [forceUpdate]);

  // Game loop — 150 ms tick
  useEffect(() => {
    const id = setInterval(() => {
      const g = gameRef.current;
      if (g.exited || g.gameOver || !g.started) return;

      g.dir = g.nextDir;
      const head = g.snake[0];
      const newHead: Point = {
        x: head.x + (g.dir === "right" ? 1 : g.dir === "left" ? -1 : 0),
        y: head.y + (g.dir === "down" ? 1 : g.dir === "up" ? -1 : 0),
      };

      // Wall collision
      if (
        newHead.x < 0 ||
        newHead.x >= BOARD_W ||
        newHead.y < 0 ||
        newHead.y >= BOARD_H
      ) {
        g.gameOver = true;
        forceUpdate();
        return;
      }

      // Self collision
      if (g.snake.some((s) => s.x === newHead.x && s.y === newHead.y)) {
        g.gameOver = true;
        forceUpdate();
        return;
      }

      const ateFood = newHead.x === g.food.x && newHead.y === g.food.y;
      if (ateFood) {
        g.score += 10;
        g.snake = [newHead, ...g.snake];
        if (g.snake.length >= BOARD_W * BOARD_H) {
          g.won = true;
          g.gameOver = true;
        } else {
          g.food = randomFood(g.snake);
        }
      } else {
        g.snake = [newHead, ...g.snake.slice(0, -1)];
      }

      forceUpdate();
    }, 150);
    return () => clearInterval(id);
  }, [forceUpdate]);

  const g = gameRef.current;

  if (g.exited) {
    return (
      <span className="text-terminal-dim">
        [snake exited — score: {g.score}]
      </span>
    );
  }

  // Build ASCII board
  const boardLines: string[] = [];
  boardLines.push("+" + "-".repeat(BOARD_W) + "+");
  for (let y = 0; y < BOARD_H; y++) {
    let row = "|";
    for (let x = 0; x < BOARD_W; x++) {
      const isHead = g.snake[0].x === x && g.snake[0].y === y;
      const isBody = !isHead && g.snake.slice(1).some((s) => s.x === x && s.y === y);
      const isFood = g.food.x === x && g.food.y === y;
      if (isHead) row += HEAD_CHAR[g.dir];
      else if (isBody) row += "o";
      else if (isFood) row += "*";
      else row += " ";
    }
    row += "|";
    boardLines.push(row);
  }
  boardLines.push("+" + "-".repeat(BOARD_W) + "+");

  const status = g.gameOver
    ? g.won
      ? `You won! Score: ${g.score}  [hjkl to restart]`
      : `Game over. Score: ${g.score}  [hjkl to restart]`
    : g.started
      ? `Score: ${g.score}  hjkl to move  q to quit`
      : `hjkl to start  q to quit`;

  return (
    <div className="font-mono">
      {boardLines.map((row, i) => (
        <div key={i} className="whitespace-pre">
          {row}
        </div>
      ))}
      <div className="text-terminal-dim mt-1">{status}</div>
      {g.gameOver && !g.won && (
        <div className="text-terminal-dim text-xs">
          Just kidding, this is JavaScript.
        </div>
      )}
    </div>
  );
}

// --- python / python3 ---

const pythonCommand: Command = {
  name: "python",
  aliases: ["python3"],
  description: "Python interpreter",
  usage: "python [script]",
  execute() {
    markEggFound("snake");
    return { lines: [{ content: <SnakeGame /> }], exitCode: 0 };
  },
};

// --- Register ---

registry.register(pythonCommand);
