"use client";

import { useState, useEffect, useRef } from "react";

export function ForkBombDisplay() {
  const [pids, setPids] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const nextPid = useRef(1337);
  const count = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      if (count.current >= 24) {
        clearInterval(id);
        setTimeout(() => setDone(true), 800);
        return;
      }
      setPids((prev) => [...prev, nextPid.current++]);
      count.current++;
    }, 60);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="font-mono">
      {pids.map((pid, i) => (
        <div key={i} className="text-terminal-dim">
          {`bash: fork: pid ${pid}: spawning child process...`}
        </div>
      ))}
      {done && (
        <div className="text-terminal-bold mt-1">
          System stabilized. Nice try.
        </div>
      )}
    </div>
  );
}
