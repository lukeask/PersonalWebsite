import type { FileSystem } from "@/lib/types";

// ─── Easter Egg State ────────────────────────────────────────────────────────

const EGGS_LS_KEY = "askew:eggs";

/** All known easter egg IDs, in display order. */
const ALL_EGGS = ["cowsay", "figlet", "rm-rf", "bicep-curl", "snake", "nano"] as const;
type EggId = (typeof ALL_EGGS)[number];

export function getFoundEggs(): string[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(EGGS_LS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function markEggFound(id: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    const found = getFoundEggs();
    if (!found.includes(id)) {
      found.push(id);
      localStorage.setItem(EGGS_LS_KEY, JSON.stringify(found));
    }
  } catch {
    // SSR or quota — ignore
  }
}

// ─── CTF Game State ──────────────────────────────────────────────────────────

const CTF_LS_KEY = "askew:ctf";

export interface CTFState {
  /** Player has run curl (unlocks the `break` command) */
  hasDoneCurl: boolean;
  /** Directories captured in the last backup cron run */
  lastBackupDirs: string[];
  /** Timestamp of last backup cron run (0 = never) */
  lastBackupTime: number;
  /** The root password has been revealed via decryption */
  rootPasswordRevealed: boolean;
  /** How many times sudo has been invoked (drives hint progression) */
  sudoInvocations: number;
}

const DEFAULT_STATE: CTFState = {
  hasDoneCurl: false,
  lastBackupDirs: [],
  lastBackupTime: 0,
  rootPasswordRevealed: false,
  sudoInvocations: 0,
};

/** The root password the player discovers by decrypting accountpasswords.txt.enc */
export const ROOT_PASSWORD = "toor_askew2020";

/** The encryption passphrase for Path A (puzzle clues) */
export const ENC_PASSPHRASE = "askew2020";

/** The decrypted content of accountpasswords.txt.enc */
export const DECRYPTED_PASSWORDS = [
  "# askew.sh system credentials - CONFIDENTIAL",
  "# Last updated: 2020-01-15",
  "",
  "[root]",
  `password: ${ROOT_PASSWORD}`,
  "",
  "[services]",
  "backup_user: bkup_s3rvice!",
  "db_admin: (see vault)",
  "",
  "# ──────────────────────────────────────────",
  "# Nice work. You found the credentials.",
  `# Flag: CTF{wr1t4bl3_conf_r00ts_backup_pwn3d}`,
  "#",
  `# Run:  su root ${ROOT_PASSWORD}`,
  "# ──────────────────────────────────────────",
].join("\n");

// ─── State persistence ───────────────────────────────────────────────────────

export function loadCTFState(): CTFState {
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_STATE };
    const raw = localStorage.getItem(CTF_LS_KEY);
    return raw ? { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<CTFState>) } : { ...DEFAULT_STATE };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveCTFState(state: CTFState): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(CTF_LS_KEY, JSON.stringify(state));
    }
  } catch {
    // SSR or quota — ignore
  }
}

export function markCurlDone(): void {
  const state = loadCTFState();
  state.hasDoneCurl = true;
  saveCTFState(state);
}

/** Increment the sudo invocation counter and return the new count. */
export function incrementSudo(): number {
  const state = loadCTFState();
  state.sudoInvocations++;
  saveCTFState(state);
  return state.sudoInvocations;
}

export function markRootPasswordRevealed(): void {
  const state = loadCTFState();
  state.rootPasswordRevealed = true;
  saveCTFState(state);
}

// ─── Backup cron simulation ──────────────────────────────────────────────────

const BACKUP_CONF_PATH = "/opt/scripts/backup.conf";
const BACKUP_ARCHIVE_PATH = "/var/backups/latest.tar.gz";
const BACKUP_LOG_PATH = "/var/log/backup.log";
const CRON_INTERVAL_MS = 60 * 1000; // 1 minute

/**
 * Runs a single backup cycle: reads backup.conf, records what was backed up,
 * writes a marker file at /var/backups/latest.tar.gz, and appends to the log.
 */
export function runBackup(fs: FileSystem): void {
  let confContent: string;
  try {
    confContent = fs.read(BACKUP_CONF_PATH);
  } catch {
    return; // conf doesn't exist yet — skip
  }

  // Parse backup.conf: one directory per line, ignore comments and blanks
  const dirs = confContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const state = loadCTFState();
  state.lastBackupDirs = dirs;
  state.lastBackupTime = Date.now();
  saveCTFState(state);

  // Calculate a fake archive size based on backed-up dirs
  let totalSize = 0;
  for (const dir of dirs) {
    try {
      if (fs.exists(dir) && fs.isDirectory(dir)) {
        totalSize += collectFiles(fs, dir).length * 1024;
      }
    } catch {
      // dir doesn't exist — skip
    }
  }

  // Write a fake tarball marker so `ls /var/backups/` shows it
  const fakeArchive = `[binary tar.gz archive — ${(totalSize / 1024).toFixed(0)}K compressed]`;
  try {
    fs.write(BACKUP_ARCHIVE_PATH, fakeArchive);
  } catch {
    // overlay not ready
  }

  // Append to backup log
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const logLine = `[${timestamp}] backup.sh: archived ${dirs.length} directories (${(totalSize / 1024).toFixed(0)}K) → ${BACKUP_ARCHIVE_PATH}`;
  try {
    const existing = fs.exists(BACKUP_LOG_PATH) ? fs.read(BACKUP_LOG_PATH) : "";
    fs.write(BACKUP_LOG_PATH, existing ? existing + "\n" + logLine : logLine);
  } catch {
    // ignore
  }
}

/**
 * Starts the backup cron timer. Returns a cleanup function.
 * Runs an initial backup immediately, then every CRON_INTERVAL_MS.
 */
export function startBackupCron(fs: FileSystem): () => void {
  // Run once immediately on startup
  runBackup(fs);

  const id = setInterval(() => runBackup(fs), CRON_INTERVAL_MS);
  return () => clearInterval(id);
}

// ─── Progress file ───────────────────────────────────────────────────────────

const PROGRESS_PATH = "/home/guest/progress.md";

const EGG_LABELS: Record<EggId, string> = {
  cowsay:      "cowsay",
  figlet:      "figlet",
  "rm-rf":     "rm -rf /",
  "bicep-curl": "curl (🦾)",
  snake:       "Snake Game (python)",
  nano:        "nano (Have you tried vim?)",
};

/** Check whether the current user in localStorage is root. */
function isRootUser(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem("askew:current-user");
    if (!raw) return false;
    const u = JSON.parse(raw) as { username?: string };
    return u.username === "root";
  } catch {
    return false;
  }
}

/** Generate the markdown content for progress.md. */
export function generateProgressMd(): string {
  const ctf = loadCTFState();
  const found = new Set(getFoundEggs());
  const hasRoot = isRootUser();

  const check = (done: boolean) => (done ? "[x]" : "[ ]");

  const ctfSection = [
    "## CTF: Privilege Escalation",
    "",
    `- ${check(ctf.hasDoneCurl)} Ran curl (unlocked the \`break\` command)`,
    `- ${check(ctf.rootPasswordRevealed)} Decrypted the root credentials`,
    `- ${check(hasRoot)} Gained root access`,
  ].join("\n");

  const foundCount = ALL_EGGS.filter((id) => found.has(id)).length;
  const eggLines = ALL_EGGS.map((id) => {
    const done = found.has(id);
    const label = done ? EGG_LABELS[id] : "???";
    return `- ${check(done)} ${label}`;
  });

  const eggSection = [
    `## Easter Eggs (${foundCount}/${ALL_EGGS.length})`,
    "",
    ...eggLines,
  ].join("\n");

  return ["# Progress", "", ctfSection, "", eggSection, ""].join("\n");
}

/** Write the progress file to the overlay filesystem. */
export function updateProgressFile(fs: FileSystem): void {
  try {
    fs.write(PROGRESS_PATH, generateProgressMd());
  } catch {
    // Overlay may not be ready (SSR) — ignore
  }
}

// ─── File collection helper (used by tar) ────────────────────────────────────

/** Recursively collect all file paths under a directory. */
export function collectFiles(fs: FileSystem, dirPath: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.list(dirPath);
    for (const entry of entries) {
      const fullPath = dirPath === "/" ? `/${entry}` : `${dirPath}/${entry}`;
      if (fs.isDirectory(fullPath)) {
        results.push(...collectFiles(fs, fullPath));
      } else {
        results.push(fullPath);
      }
    }
  } catch {
    // directory doesn't exist or can't be listed
  }
  return results;
}
