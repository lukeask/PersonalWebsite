import type { Command, CommandOutput, UserIdentity } from "@/lib/types";
import { registry } from "@/lib/shell/registry";
import { ROOT_PASSWORD } from "@/lib/ctf/game";
import { errOut } from "@/lib/util/output";

// --- Storage keys ---

const USERS_LS_KEY = "askew:users";
const CURRENT_USER_LS_KEY = "askew:current-user";
const PASSWORDS_LS_KEY = "askew:passwords";

// --- Stored user shape ---

interface StoredUser {
  username: string;
  uid: number;
  groups: string[];
  home: string;
  loginTime: number; // ms since epoch, recorded when user was created/last switched to
}

// --- Fake who entries (permanent fixtures) ---

interface WhoEntry {
  user: string;
  tty: string;
  loginTime: string; // pre-formatted
}

const FIXTURE_WHO_ENTRIES: WhoEntry[] = [
  { user: "temp",                     tty: "pts/3",  loginTime: "2020-08-20 00:18" },
  { user: "not_rogue_agi_pls_no_kill9", tty: "tty7", loginTime: "2025-04-01 00:00" },
];

// --- localStorage helpers (SSR-safe) ---

function lsGet<T>(key: string): T | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function lsSet<T>(key: string, value: T): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // silently fail (SSR / storage quota)
  }
}

// --- Default guest user ---

const GUEST_USER: StoredUser = {
  username: "guest",
  uid: 1000,
  groups: ["guest"],
  home: "/home/guest",
  loginTime: 0,
};

// --- User registry helpers ---

export function loadUsers(): StoredUser[] {
  return lsGet<StoredUser[]>(USERS_LS_KEY) ?? [];
}

/**
 * Ensure the guest user exists in localStorage. Call this on app startup.
 * On first visit (empty storage) this seeds the users list and sets the
 * current user to guest. Idempotent — safe to call on every load.
 */
export function ensureGuestUser(): void {
  const users = loadUsers();
  if (!users.some((u) => u.username === "guest")) {
    users.unshift({ ...GUEST_USER, loginTime: Date.now() });
    saveUsers(users);
  }
  if (!loadCurrentUser()) {
    const guestIdentity: UserIdentity = {
      username: "guest",
      uid: 1000,
      groups: ["guest"],
      home: "/home/guest",
      ps1: "guest@askew.sh:~$",
    };
    saveCurrentUser(guestIdentity);
  }
}

function saveUsers(users: StoredUser[]): void {
  lsSet(USERS_LS_KEY, users);
}

function loadPasswords(): Record<string, string> {
  return lsGet<Record<string, string>>(PASSWORDS_LS_KEY) ?? {};
}

function savePasswords(pw: Record<string, string>): void {
  lsSet(PASSWORDS_LS_KEY, pw);
}

/** Persist the current user so it survives page reload. */
export function saveCurrentUser(user: UserIdentity): void {
  lsSet(CURRENT_USER_LS_KEY, user);
}

/** Load persisted current user (may be null on first visit). */
export function loadCurrentUser(): UserIdentity | null {
  return lsGet<UserIdentity>(CURRENT_USER_LS_KEY);
}

/** Trivial hash — not for security, just so the password isn't plaintext at a glance. */
function hashPassword(pw: string): string {
  let h = 5381;
  for (let i = 0; i < pw.length; i++) {
    h = ((h << 5) + h) ^ pw.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

function nextUid(): number {
  const users = loadUsers();
  if (users.length === 0) return 1001;
  return Math.max(...users.map((u) => u.uid)) + 1;
}

function userExists(username: string): boolean {
  return loadUsers().some((u) => u.username === username);
}

// --- Format helpers ---

function formatWhoTime(ms: number): string {
  const d = new Date(ms);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const day = String(d.getDate()).padStart(2, "0");
  const hh  = String(d.getHours()).padStart(2, "0");
  const mm  = String(d.getMinutes()).padStart(2, "0");
  return `${months[d.getMonth()]} ${day} ${hh}:${mm}`;
}

function makePsOne(username: string, cwd: string): string {
  const display = cwd.startsWith("/home/" + username)
    ? "~" + cwd.slice(("/home/" + username).length)
    : cwd;
  const sigil = username === "root" ? "#" : "$";
  return `${username}@askew.sh:${display || "/"}${sigil}`;
}

function ok(lines: CommandOutput["lines"]): CommandOutput {
  return { lines, exitCode: 0 };
}

// --- adduser ---

const adduserCommand: Command = {
  name: "adduser",
  aliases: ["useradd"],
  description: "Create a new user account",
  usage: "adduser <username>",
  execute(args, _flags, _stdin, ctx) {
    if (args.length === 0) return errOut("adduser: missing username");

    const username = args[0];

    // Root is special — CTF only
    if (username === "root") {
      // CTF-HINT — edit this string when wiring up the CTF puzzle entry point (T-403)
      return errOut(
        [
          `adduser: 'root' already exists.`,
          `(Nice try though. Some doors require a key, not a command.)`,
        ].join("\n")
      );
    }

    // Validate: simple alphanumeric + dash/underscore, no spaces
    if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(username)) {
      return errOut(
        `adduser: invalid username '${username}'\n` +
        `  Usernames must start with a letter or underscore, contain only [a-z0-9_-], max 32 chars.`
      );
    }

    if (userExists(username)) {
      return errOut(`adduser: user '${username}' already exists`);
    }

    const uid = nextUid();
    const home = `/home/${username}`;

    // Create home directory in the overlay filesystem
    try {
      ctx.fs.write(`${home}/.profile`, `# ${username}'s profile\nexport HOME=${home}\n`);
    } catch {
      // Overlay may not support this yet — not fatal
    }

    const newUser: StoredUser = {
      username,
      uid,
      groups: [username],
      home,
      loginTime: Date.now(),
    };

    const users = loadUsers();
    users.push(newUser);
    saveUsers(users);

    // Password prompt (cosmetic — fun, not secure)
    const pwPrompt: CommandOutput["lines"] = [
      { content: "" },
      { content: `Adding user '${username}' ...`, style: "dim" },
      { content: `Adding new group '${username}' (${uid}) ...`, style: "dim" },
      { content: `Adding new user '${username}' (${uid}) with group '${username}' ...`, style: "dim" },
      { content: `Creating home directory '/home/${username}' ... done`, style: "dim" },
      { content: "" },
      { content: "┌─────────────────────────────────────┐", style: "bold" },
      { content: "│  Set password for " + username.padEnd(18) + "│", style: "bold" },
      { content: "└─────────────────────────────────────┘", style: "bold" },
      { content: "" },
      { content: `New password: [type 'passwd ${username} <password>' to set one]`, style: "dim" },
      { content: "" },
      { content: `✓ User '${username}' created. Welcome aboard.` },
    ];

    return ok(pwPrompt);
  },
};

// --- passwd ---

const passwdCommand: Command = {
  name: "passwd",
  aliases: [],
  description: "Change user password",
  usage: "passwd [username] <password>",
  execute(args, _flags, _stdin, ctx) {
    let target: string;
    let newPw: string;

    if (args.length === 1) {
      // passwd <password> — change own password
      target = ctx.user.username;
      newPw = args[0];
    } else if (args.length >= 2) {
      // passwd <username> <password>
      target = args[0];
      newPw = args[1];
    } else {
      return errOut("passwd: usage: passwd [username] <password>");
    }

    if (target === "root") {
      // CTF-HINT — edit this string when wiring up the CTF puzzle (T-403)
      return errOut("passwd: root's password is not something you can just... set.");
    }

    if (target !== ctx.user.username && !userExists(target)) {
      return errOut(`passwd: user '${target}' does not exist`);
    }

    const pws = loadPasswords();
    const hash = hashPassword(newPw);
    pws[target] = hash;
    savePasswords(pws);

    const strength = newPw.length < 6 ? "weak 💀" : newPw.length < 12 ? "fine" : "strong 💪";

    return ok([
      { content: `Updating password for ${target}.` },
      {
        content:
          `[${"█".repeat(Math.min(newPw.length, 20)).padEnd(20)}] ` +
          `strength: ${strength}`,
        style: "dim",
      },
      { content: `passwd: password updated successfully.` },
    ]);
  },
};

// --- su / chuser ---

const suCommand: Command = {
  name: "su",
  aliases: ["chuser"],
  description: "Switch user identity",
  usage: "su [username]",
  execute(args, _flags, _stdin, ctx) {
    const targetName = args[0] ?? "root";

    if (targetName === "root") {
      const providedPw = args[1] ?? "";
      if (providedPw === ROOT_PASSWORD) {
        // CTF victory! Grant root access
        const rootIdentity: UserIdentity = {
          username: "root",
          uid: 0,
          groups: ["root"],
          home: "/root",
          ps1: "root@askew.sh:\\w# ",
        };
        ctx.setUser(rootIdentity);
        ctx.setCwd("/root");
        saveCurrentUser(rootIdentity);

        return ok([
          { content: "" },
          { content: "╔════════════════════════════════════════════════╗", style: "bold" },
          { content: "║                                                ║", style: "bold" },
          { content: "║   root@askew.sh — access granted.              ║", style: "bold" },
          { content: "║                                                ║", style: "bold" },
          { content: "║   You found the misconfigured backup,          ║", style: "bold" },
          { content: "║   exfiltrated the credentials, cracked         ║", style: "bold" },
          { content: "║   the encryption, and escalated to root.       ║", style: "bold" },
          { content: "║                                                ║", style: "bold" },
          { content: "║   Flag: CTF{wr1t4bl3_conf_r00ts_backup_pwn3d} ║", style: "bold" },
          { content: "║                                                ║", style: "bold" },
          { content: "╚════════════════════════════════════════════════╝", style: "bold" },
          { content: "" },
        ]);
      }

      if (!providedPw) {
        return errOut(
          [
            `su: Authentication failure.`,
            ``,
            `(root access isn't just handed out. there might be a way...`,
            ` but you haven't found it yet.)`,
          ].join("\n")
        );
      }
      return errOut("su: Authentication failure.");
    }

    const users = loadUsers();
    const stored = users.find((u) => u.username === targetName);

    if (!stored) {
      return errOut(`su: user '${targetName}' does not exist`);
    }

    // Optional password check
    const pws = loadPasswords();
    const storedHash = pws[targetName];
    if (storedHash) {
      const providedPw = args[1] ?? "";
      if (hashPassword(providedPw) !== storedHash) {
        if (!providedPw) {
          return errOut(
            `su: password required for '${targetName}'\n` +
            `  Usage: su ${targetName} <password>`
          );
        }
        return errOut(`su: Authentication failure.`);
      }
    }

    // Update login time in storage
    stored.loginTime = Date.now();
    saveUsers(users);

    const newIdentity: UserIdentity = {
      username: stored.username,
      uid: stored.uid,
      groups: stored.groups,
      home: stored.home,
      ps1: makePsOne(stored.username, stored.home),
    };

    ctx.setUser(newIdentity);
    ctx.setCwd(stored.home);
    saveCurrentUser(newIdentity);

    return ok([
      { content: `Switched to user: ${targetName}` },
    ]);
  },
};

// --- users ---

const usersCommand: Command = {
  name: "users",
  aliases: [],
  description: "List all known user accounts",
  usage: "users",
  execute(_args, _flags, _stdin, _ctx) {
    const users = loadUsers();
    if (users.length === 0) {
      return ok([{ content: "No users found. Try adduser <name>.", style: "dim" }]);
    }
    const lines: CommandOutput["lines"] = users.map((u) => ({
      content: `${u.username.padEnd(20)} uid=${u.uid}  home=${u.home}`,
    }));
    return ok(lines);
  },
};

// --- who ---

const whoCommand: Command = {
  name: "who",
  aliases: [],
  description: "Show who is logged in",
  usage: "who",
  execute(_args, _flags, _stdin, ctx) {
    const header = "NAME                     LINE       TIME";

    const currentEntry = {
      user: ctx.user.username,
      tty: "pts/0",
      loginTime: formatWhoTime(Date.now()),
    };

    const allEntries = [currentEntry, ...FIXTURE_WHO_ENTRIES];

    const lines: CommandOutput["lines"] = [
      { content: header, style: "dim" },
      ...allEntries.map((e) => ({
        content:
          e.user.padEnd(25) +
          e.tty.padEnd(11) +
          (typeof e.loginTime === "string" ? e.loginTime : formatWhoTime(e.loginTime as number)),
      })),
    ];

    return ok(lines);
  },
};

// --- Register ---

registry.register(adduserCommand);
registry.register(passwdCommand);
registry.register(suCommand);
registry.register(usersCommand);
registry.register(whoCommand);
