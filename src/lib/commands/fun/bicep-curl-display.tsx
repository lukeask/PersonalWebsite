"use client";

import { useState, useEffect } from "react";

// ASCII frames for a person doing a bicep curl
// Arm goes down → mid → fully curled → flex
const FRAMES = [
  // Frame 0: rest, arm down
  [
    "   \\o/  ",
    "    |   ",
    "   / \\  ",
  ],
  // Frame 1: starting curl
  [
    "   \\o   ",
    "    |\\  ",
    "   / \\  ",
  ],
  // Frame 2: mid curl
  [
    "   \\o   ",
    "    |~  ",
    "   / \\  ",
  ],
  // Frame 3: fully curled
  [
    "   \\o   ",
    "    |`  ",
    "   / \\  ",
  ],
  // Frame 4: flex — arm up, muscle pop
  [
    "  💪o   ",
    "    |   ",
    "   / \\  ",
  ],
];

const REP_COUNT = 3;

export function BicepCurlDisplay() {
  const [frameIdx, setFrameIdx] = useState(0);
  const [reps, setReps] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Each rep cycles through frames 0→1→2→3→4→0
    const frameSequence = [0, 1, 2, 3, 4];
    let sequencePos = 0;
    let completedReps = 0;

    const id = setInterval(() => {
      sequencePos++;
      if (sequencePos >= frameSequence.length) {
        sequencePos = 0;
        completedReps++;
        setReps(completedReps);
        if (completedReps >= REP_COUNT) {
          clearInterval(id);
          setTimeout(() => setDone(true), 400);
          return;
        }
      }
      setFrameIdx(frameSequence[sequencePos]);
    }, 150);

    return () => clearInterval(id);
  }, []);

  const frame = FRAMES[frameIdx];

  return (
    <div className="font-mono">
      <div className="text-terminal-dim mb-1">
        {`curl: performing ${REP_COUNT}x bicep curls...`}
      </div>
      <div className="text-terminal-text">
        {frame.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
      {reps > 0 && !done && (
        <div className="text-terminal-dim mt-1">
          {`rep ${reps}/${REP_COUNT} complete`}
        </div>
      )}
      {done && (
        <div className="mt-1">
          <div className="text-terminal-bold">You are now stronger.</div>
          <div className="text-terminal-dim">
            {`(break command unlocked — crack open encrypted files)`}
          </div>
        </div>
      )}
    </div>
  );
}
