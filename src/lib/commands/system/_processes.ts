// --- Process List (shared ground truth) ---
// `ps` and `top`/`htop` both read from here.
// Add new entries as site features ship — see .agents/notes.md.

export interface ProcessEntry {
  pid: number;
  user: string;
  cpu: number; // base %CPU
  mem: number; // base %MEM
  vsz: number; // virtual size, KB
  rss: number; // resident set size, KB
  stat: string;
  start: string;
  command: string;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getProcessList(username: string): ProcessEntry[] {
  const cores = isBrowser() ? (navigator.hardwareConcurrency ?? 2) : 2;

  return [
    // fmt: pid, user, cpu, mem, vsz(KB), rss(KB), stat, start, command
    { pid: 1,   user: "root",     cpu: 0.0, mem: 0.1, vsz: 1234,       rss: 512,   stat: "Ss",  start: "00:00", command: "init" },
    { pid: 2,   user: "root",     cpu: 0.0, mem: 0.0, vsz: 0,          rss: 0,     stat: "S",   start: "00:00", command: "[kthreadd]" },
    { pid: 3,   user: "root",     cpu: 0.0, mem: 0.0, vsz: 0,          rss: 0,     stat: "I",   start: "00:00", command: `[kworker/u${cores * 2}:0]` },
    { pid: 42,  user: "root",     cpu: 0.0, mem: 0.2, vsz: 6728,       rss: 1024,  stat: "Ss",  start: "00:00", command: "sshd" },
    { pid: 137, user: "root",     cpu: 0.1, mem: 0.1, vsz: 2304,       rss: 768,   stat: "Ss",  start: "00:00", command: "cron" },
    { pid: 201, user: "root",     cpu: 0.0, mem: 0.3, vsz: 8192,       rss: 2048,  stat: "Sl",  start: "00:00", command: "telemetryd" },
    { pid: 256, user: "www-data", cpu: 1.2, mem: 2.1, vsz: 512000,     rss: 65536, stat: "Sl",  start: "00:01", command: "node server.js" },
    { pid: 257, user: "www-data", cpu: 0.0, mem: 0.8, vsz: 204800,     rss: 32768, stat: "Sl+", start: "1970",  command: "npm install" },
    { pid: 301, user: username,   cpu: 0.4, mem: 1.1, vsz: 10240,      rss: 4096,  stat: "Ss",  start: "00:02", command: "bash" },
    { pid: 302, user: username,   cpu: 2.3, mem: 1.4, vsz: 32768,      rss: 8192,  stat: "S+",  start: "00:02", command: `vim /home/${username}/resume.md` },
    { pid: 501, user: "root",     cpu: 0.0, mem: 0.1, vsz: 1949,       rss: 64,    stat: "S",   start: "1949",  command: "weil_conjectd" },
    { pid: 502, user: "root",     cpu: 0.0, mem: 0.0, vsz: 0,          rss: 0,     stat: "I",   start: "00:00", command: "[kworker/cohomology:0]" },
    { pid: 503, user: username,   cpu: 0.1, mem: 0.2, vsz: 4096,       rss: 1024,  stat: "Sl",  start: "00:03", command: "chabauty_colemand" },
    // shor_eccd: Shor's algorithm against secp256k1. VSZ is enormous because
    // quantum computers don't use classical memory (obviously). RSS is 0 for
    // the same reason. This is totally running on a quantum computer.
    { pid: 504, user: username,   cpu: 3.7, mem: 0.0, vsz: 9007199254, rss: 0,     stat: "R+",  start: "00:03", command: "shor_eccd --target secp256k1 --qubits 4096" },
    { pid: 505, user: username,   cpu: 0.0, mem: 0.0, vsz: 0,          rss: 0,     stat: "I",   start: "00:00", command: "[zeta/0]" },
  ];
}
