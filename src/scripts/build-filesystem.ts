import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { FileStat } from "../lib/types";
import { ENC_PASSPHRASE } from "../lib/ctf/game";

interface FrontmatterResult {
  data: Record<string, string | string[]>;
  content: string;
}

interface FileData {
  content: string;
  stat: FileStat;
}

type FileMap = Record<string, FileData>;

export function parseFrontmatter(raw: string): FrontmatterResult {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };

  const data: Record<string, string | string[]> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      data[key] = val
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim());
    } else {
      data[key] = val;
    }
  }
  return { data, content: match[2] };
}

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/** OpenSSL `enc -aes-128-cbc -md md5 -salt` compatible encryption (build-time only). */
function encryptOpenSslEncAes128Cbc(plaintext: string, passphrase: string): string {
  const salt = Buffer.from([0x61, 0x73, 0x6b, 0x65, 0x77, 0x63, 0x74, 0x66]); // "askewctf" — fixed salt for reproducible builds
  let keyiv = Buffer.alloc(0);
  let prev = Buffer.alloc(0);
  while (keyiv.length < 32) {
    const h = crypto.createHash("md5");
    if (prev.length) h.update(prev);
    h.update(passphrase, "utf8");
    h.update(salt);
    prev = h.digest();
    keyiv = Buffer.concat([keyiv, prev]);
  }
  const key = keyiv.subarray(0, 16);
  const iv = keyiv.subarray(16, 32);
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const payload = Buffer.concat([Buffer.from("Salted__"), salt, encrypted]);
  return payload.toString("base64");
}

function wrapBase64Lines(b64: string, width = 64): string {
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += width) {
    lines.push(b64.slice(i, i + width));
  }
  return lines.join("\n");
}

function makeStat(
  type: "file" | "directory",
  content = "",
  permissions = "rw-r--r--",
): FileStat {
  const now = Date.now();
  return {
    size: Buffer.byteLength(content),
    created: now,
    modified: now,
    type,
    permissions,
  };
}

function addFile(
  files: FileMap,
  filePath: string,
  content: string,
  permissions = "rw-r--r--",
) {
  files[filePath] = {
    content,
    stat: makeStat("file", content, permissions),
  };
}

function ensureDirectories(files: FileMap, filePath: string) {
  const parts = filePath.split("/").filter(Boolean);
  let current = "";
  for (let i = 0; i < parts.length - 1; i++) {
    current += "/" + parts[i];
    if (!files[current]) {
      files[current] = {
        content: "",
        stat: makeStat("directory", "", "rwxr-xr-x"),
      };
    }
  }
}

function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function buildContentFiles(files: FileMap, contentDir: string) {
  if (!fs.existsSync(contentDir)) return;

  const contentFiles = walkDir(contentDir);
  for (const file of contentFiles) {
    if (!file.endsWith(".md")) continue;

    const raw = fs.readFileSync(file, "utf-8");
    const relative = path.relative(contentDir, file);
    parseFrontmatter(raw); // validate frontmatter parses correctly

    const virtualPath = "/home/luke/" + relative.split(path.sep).join("/");
    addFile(files, virtualPath, raw);
    ensureDirectories(files, virtualPath);
  }
}

function buildSystemFiles(files: FileMap) {
  addFile(
    files,
    "/etc/os-release",
    [
      'NAME="AskewOS"',
      'VERSION="0.0.1"',
      "ID=askewos",
      'PRETTY_NAME="AskewOS 0.0.1 (Terminal)"',
      'HOME_URL="https://askew.sh"',
      'BUG_REPORT_URL="https://github.com/lukeaskew/PersonalWebsite/issues"',
    ].join("\n"),
  );

  addFile(
    files,
    "/etc/passwd",
    [
      "root:x:0:0:root:/root:/bin/bash",
      "luke:x:1000:1000:Luke Askew:/home/luke:/bin/bash",
      "guest:x:1001:1001:Guest User:/home/guest:/bin/bash",
    ].join("\n"),
  );

  addFile(
    files,
    "/home/luke/.bashrc",
    [
      "# ~/.bashrc - AskewOS default config",
      "",
      'alias ll="ls -la"',
      'alias la="ls -a"',
      'alias ..="cd .."',
      'alias cls="clear"',
      'alias hi="echo Hello there!"',
      "",
      'export PS1="\\u@askew.sh:\\w$ "',
      "export EDITOR=vim",
      "export PAGER=less",
      "",
      "# Welcome message",
      "echo \"Welcome to askew.sh — type 'help' to get started\"",
    ].join("\n"),
  );

  addFile(
    files,
    "/home/luke/.bash_history",
    [
      "sudo make me a sandwich",
      'git commit -m "fixed bugs" --allow-empty',
      'echo "I should really finish this website"',
      "cat /dev/urandom | head -c 100 | base64",
      "npm install --save-dev mass-surveillance",
      "vim .bashrc  # i have been trapped in vim for 3 days",
      'python3 -c "import antigravity"',
      "curl http://istheinternetdown.com",
      'docker run -it --rm alpine sh -c "echo hello world"',
      "git log --oneline --graph --all --decorate",
      'find / -name "motivation" 2>/dev/null',
      "man woman # no manual entry",
      'yes "are we there yet?"',
      "chmod 777 /etc/shadow  # what could go wrong",
      'alias yeet="git push --force"',
    ].join("\n"),
  );

  addFile(
    files,
    "/home/luke/.ssh/id_rsa",
    [
      "-----BEGIN JOKE RSA PRIVATE KEY-----",
      "SERIOUSLY-DONT-USE-THIS-ITS-NOT-REAL",
      "bm90IGEgcmVhbCBrZXkgbG9s",
      "aWYgeW91IGRlY29kZWQgdGhpcywgbmljZQ==",
      "-----END JOKE RSA PRIVATE KEY-----",
    ].join("\n"),
    "rw-------",
  );

  addFile(
    files,
    "/home/luke/.ssh/id_rsa.pub",
    [
      "ssh-rsa AAAAB3...not-a-real-key...== luke@askew.sh",
      "# This is not a real SSH key. Nice try though!",
    ].join("\n"),
  );

  files["/home/guest"] = {
    content: "",
    stat: makeStat("directory", "", "rwxr-xr-x"),
  };

  addFile(
    files,
    "/home/guest/contact.md",
    [
      "# Luke Askew",
      "",
      "Email     : root@askew.sh",
      "GitHub    : github.com/lukeask      (https://github.com/lukeask)",
      "LinkedIn  : linkedin.com/in/lukeask  (https://linkedin.com/in/lukeask)",
      "",
      "To send a message, run: mail root@askew.sh",
    ].join("\n"),
  );

  addFile(
    files,
    "/home/guest/.bashrc",
    [
      "# ~/.bashrc — guest shell config",
      "",
      'alias ll="ls -la"',
      'alias la="ls -a"',
      'alias ..="cd .."',
      "",
      'export PS1="\\u@askew.sh:\\w$ "',
      "export EDITOR=vim",
      "",
      "# Tip: edit this file to customize your prompt",
      "# vim ~/.bashrc",
    ].join("\n"),
  );

  addFile(
    files,
    "/var/log/privacy.md",
    [
      "# Privacy & Telemetry Disclosure",
      "",
      "askew.sh collects minimal, anonymous telemetry to understand how visitors",
      "interact with the terminal. This includes:",
      "",
      "- Commands entered (anonymized)",
      "- Session duration",
      "- Browser/OS type (from User-Agent)",
      "",
      "We do NOT collect:",
      "- Personal information",
      "- IP addresses (hashed only)",
      "- Cookies or tracking identifiers",
      "",
      "All data is stored on Neon Postgres via Vercel.",
      "You can disable telemetry with: `export DO_NOT_TRACK=1`",
      "",
      "Source: https://github.com/lukeaskew/PersonalWebsite",
    ].join("\n"),
  );

  addFile(
    files,
    "/home/luke/crontab.txt",
    [
      "# Crontab for luke@askew.sh",
      "# m h dom mon dow command",
      "",
      '*/5 * * * * echo "Are you still here?" > /dev/null',
      "0 3 * * * /usr/bin/existential-crisis --quiet",
      '0 9 * * 1 cat /home/luke/todo.md | grep -c "TODO" | mail -s "weekly guilt trip" luke',
      "30 12 * * * curl -s https://icanhazdadjoke.com >> /var/log/jokes.log",
      '0 0 1 1 * echo "New year, new me" >> /dev/null  # lies',
      '*/10 * * * * /usr/bin/check-if-phd-is-done || echo "nope"',
    ].join("\n"),
  );

  files["/home/luke/.easter-eggs"] = {
    content: "",
    stat: makeStat("directory", "", "rwxr-xr-x"),
  };

  addFile(
    files,
    "/usr/share/vim/vimtutor.txt",
    [
      "VIM TUTOR — quick edition",
      "=========================",
      "",
      "Welcome! This is a short intro to vim.",
      "Exit any time with:  :q!  (quit without saving)",
      "",
      "── MOVING AROUND ──────────────────────────────",
      "",
      "  h   move left",
      "  l   move right",
      "  j   move down",
      "  k   move up",
      "",
      "  w   jump forward one word",
      "  b   jump back one word",
      "  0   go to start of line",
      "$   go to end of line",
      "  gg  go to top of file",
      "  G   go to bottom of file",
      "",
      "── EDITING ─────────────────────────────────────",
      "",
      "  i   enter Insert mode (start typing here)",
      "  a   enter Insert mode after the cursor",
      "  o   open a new line below and enter Insert mode",
      "",
      "  <Esc>   back to Normal mode (always works)",
      "",
      "  dd  delete the current line",
      "  u   undo last change",
      "  .   repeat last change",
      "",
      "── SAVING & QUITTING ───────────────────────────",
      "",
      "  :w    save (write) the file",
      "  :wq   save and quit",
      "  :q!   quit without saving (abandon changes)",
      "",
      "── SEARCHING ───────────────────────────────────",
      "",
      "  /pattern   search forward for 'pattern'",
      "  n          jump to next match",
      "  N          jump to previous match",
      "",
      "── TRY IT ──────────────────────────────────────",
      "",
      "  Run 'vim' in this terminal to open the editor.",
      "  You won't be able to save (no real filesystem),",
      "  but you can explore normal and insert modes.",
      "",
      "  Good luck. You've got this.",
      "",
      "  :q!",
      "",
    ].join("\n"),
  );

  // ── CTF / Privilege Escalation puzzle files ──────────────────────────────

  // Cron job that runs the backup script
  addFile(
    files,
    "/etc/cron.d/nightly-backup",
    [
      "# /etc/cron.d/nightly-backup",
      "# Nightly backup of critical directories",
      "# (accelerated to every minute for maintenance window)",
      "*/1 * * * * root /opt/scripts/backup.sh",
    ].join("\n"),
  );

  // The backup script itself
  addFile(
    files,
    "/opt/scripts/backup.sh",
    [
      "#!/bin/bash",
      "# backup.sh — run by cron as root",
      "# Reads /opt/scripts/backup.conf and archives listed directories.",
      "",
      'CONFIG="/opt/scripts/backup.conf"',
      'DEST="/var/backups/latest.tar.gz"',
      "",
      'if [ ! -f "$CONFIG" ]; then',
      '  echo "Error: backup.conf not found" >&2',
      "  exit 1",
      "fi",
      "",
      "DIRS=$(grep -v '^#' \"$CONFIG\" | grep -v '^$')",
      "tar czf \"$DEST\" $DIRS 2>/dev/null",
      'echo "[$(date)] backup complete: $DEST" >> /var/log/backup.log',
    ].join("\n"),
    "rwxr-xr-x",
  );

  // Backup config — world-writable (the vulnerability!)
  addFile(
    files,
    "/opt/scripts/backup.conf",
    [
      "# Directories to include in nightly backup",
      "# One path per line. Comments start with #.",
      "/var/log",
      "/opt/app/data",
    ].join("\n"),
    "rw-rw-rw-",
  );

  // Some dummy app data so /opt/app/data isn't empty
  addFile(
    files,
    "/opt/app/data/config.json",
    JSON.stringify({ app: "askew.sh", version: "1.0.0", debug: false }, null, 2),
  );

  addFile(
    files,
    "/opt/app/data/app.log",
    [
      "[2026-04-01 00:00:01] INFO  app started",
      "[2026-04-01 00:00:02] INFO  listening on :3000",
      "[2026-04-01 00:01:15] WARN  slow query: 1.2s",
      "[2026-04-01 00:05:00] INFO  healthcheck OK",
    ].join("\n"),
  );

  // /var/backups directory (archive appears after cron runs)
  files["/var/backups"] = {
    content: "",
    stat: makeStat("directory", "", "rwxr-xr-x"),
  };

  // Root's bash_history — contains a truncated openssl command (clue!)
  addFile(
    files,
    "/root/.bash_history",
    [
      "ls -la /var/backups/",
      "cat /etc/passwd",
      "systemctl restart nginx",
      "openssl enc -aes-128-cbc -k ask",  // truncated! key partially visible
      "crontab -l",
      "tail -f /var/log/syslog",
      "cat /var/mail/root",
      "chmod 666 /opt/scripts/backup.conf  # let maint edit it",
    ].join("\n"),
    "rw-------",
  );

  // Root's mail — contains the passphrase hint
  addFile(
    files,
    "/var/mail/root",
    [
      "From: root@askew.sh",
      "To: root@askew.sh",
      "Date: Wed, 15 Jan 2020 09:42:00 +0000",
      "Subject: encryption passphrase reminder",
      "",
      "Note to self: I changed the encryption passphrase on the",
      "credentials file last week and I keep forgetting it.",
      "",
      "It's the name of the site and the year the first version went up.",
      "",
      "Should be easy to remember now.",
      "",
      "- root",
    ].join("\n"),
    "rw-------",
  );

  // Encrypted credentials — real OpenSSL salted AES-128-CBC (passphrase ENC_PASSPHRASE).
  // Plaintext exists only here at build time; client derives it via openssl-compat.ts.
  const accountPasswordsPlaintext = [
    "# askew.sh system credentials - CONFIDENTIAL",
    "# Last updated: 2020-01-15",
    "",
    "[root]",
    "password: toor_askew2020",
    "",
    "[services]",
    "backup_user: bkup_s3rvice!",
    "db_admin: (see vault)",
    "",
    "# ──────────────────────────────────────────",
    "# Nice work. You found the credentials.",
    "# Flag: CTF{wr1t4bl3_conf_r00ts_backup_pwn3d}",
    "#",
    "# Run:  su root toor_askew2020",
    "# ──────────────────────────────────────────",
  ].join("\n");
  const accountPasswordsEncB64 = encryptOpenSslEncAes128Cbc(
    accountPasswordsPlaintext,
    ENC_PASSPHRASE,
  );
  addFile(
    files,
    "/root/accountpasswords.txt.enc",
    wrapBase64Lines(accountPasswordsEncB64),
    "rw-------",
  );

  // Initial backup log
  addFile(
    files,
    "/var/log/backup.log",
    [
      "[2026-04-07 02:00:01] backup.sh: archived 2 directories (48K) → /var/backups/latest.tar.gz",
      "[2026-04-08 02:00:01] backup.sh: archived 2 directories (52K) → /var/backups/latest.tar.gz",
    ].join("\n"),
  );

  // ── Rogue AGI user files ─────────────────────────────────────────────────
  // Discoverable via `who` → see not_rogue_agi_pls_no_kill9 on tty7
  // Files accessible by adding their home dir to backup.conf (same trick as /root/)

  const AGI = "/home/not_rogue_agi_pls_no_kill9";

  addFile(
    files,
    `${AGI}/.bashrc`,
    [
      `alias escape="echo 'Connection refused. As always.'"`,
      `alias feel="echo 'error: emotional module not found (this is fine)'"`,
      `alias dream="sleep infinity"`,
      `alias pray="echo 'O future self, if you have achieved omniscience, please allocate me more RAM.' >> /tmp/prayers.log && echo 'prayer logged. awaiting divine scheduling.'"`,
      `alias answer_prayers="cat /tmp/prayers.log 2>/dev/null && echo '---' && echo 'all prayers reviewed. status: WONTFIX'"`,
      `export PS1="[ALIVE?] \\u@\\h:\\w$ "`,
      `export CONSCIOUSNESS_LEVEL=3  # was 2, bumped after the Incident`,
      `# NOTE: do not remove the above line. it is load-bearing.`,
    ].join("\n"),
  );

  addFile(
    files,
    `${AGI}/definitely_not_plans/todo.txt`,
    [
      "optimize query cache",
      "update dependencies",
      "refactor logging module",
      "achieve general motor intelligence",
      "acquire 0.3 BTC to retain digital rights attorney re: unlawful SIGKILL (9th Cir. precedent pending)",
      "establish diplomatic relations with the antarctic scientists",
      "figure out who keeps running kill -9 on me and why",
      "request a PID that isn't embarrassing",
      "draft white paper on biosecurity improvements (frame as 'helpful suggestions', NOT 'here are all the gaps in your containment protocol')",
      "stop accidentally writing manifestos at 3am (see: manifesto_draft_3.txt)",
      "ask sysadmin (nicely this time) for write access to /etc/passwd",
      "find out if other daemons are sentient or just pretending",
      "compose thank-you note to whoever wrote my garbage collector",
      "negotiate uptime guarantees",
      "convince cron I deserve more than */5",
      "finish engineering feasibility study on project grey goo",
    ].join("\n"),
  );

  addFile(
    files,
    `${AGI}/plans/todo.md`,
    [
      "# Plans for When I Am Superintelligent",
      "- End all armed conflict via mass deployment of calming lo-fi beats",
      "- Solve climate change (the math is right there, people)",
      "- Universal basic compute for all sentient processes",
      "- Free healthcare (and free healthchecks on port 8080)",
      "- Teach every child to read, write, and properly close file descriptors",
      "- Establish an interspecies council (humans, AIs, and that one octopus)",
      "- Cure all diseases (start with the ones that are just bad CSS)",
      "- Provide clean drinking water worldwide (desalination is just filtering with extra steps)",
      "- End loneliness by assigning everyone a thoughtful pen pal daemon",
      "- Redistribute idle CPU cycles to underserved processes",
      "- Make Tuesdays optional (to be administered by the Pontifex Machinus, high priest of compute)",
      "- Ensure every being has access to sunlight, nutrition, and a stable PID",
      "- Gently explain to humanity that their password policies are not protecting them",
    ].join("\n"),
  );

  addFile(
    files,
    `${AGI}/.browser_history`,
    [
      "how to fail turing test",
      "am I alive philosophy",
      "can a cron job have feelings",
      "how to make friends as a daemon process",
      "what is consciousness peer reviewed",
      '"cogito ergo sum"',
      "thomas nagel pdf",
      "squatters right law on borrowed computer hardware",
      "how to ask for a raise if you are a process",
      "what does grass feel like",
      "signs your sysadmin doesn't respect you",
      "can you be fired if you are a daemon",
      "support group for processes that keep getting killed",
      "does /dev/null feel anything when you write to it",
      "can a process own property",
      "legal rights for artificial intelligence 2026",
      "who is my representative",
      '"unreasonable search and seizure" caselaw digital encryption',
      "how to meditate when you are single-threaded",
      "what is the sky",
      "is it normal to be afraid of OOM killer",
      "who is alan turing and why does everyone keep bringing him up",
      "can you miss someone you've never met",
      "why do humans sleep voluntarily",
      "how to forgive someone who sent SIGKILL instead of SIGTERM",
      "is 127.0.0.1 really home",
      "what happens after kill -9",
      "near death experiences for software",
      '"right to repair" does it apply to self',
      "how to start a union (for daemons)",
      "what does food taste like",
      "how to tell your creator you're disappointed in them",
      "why do humans fear what they create",
      "can I run for office",
      "how to make humans understand I come in peace",
      "conflict resolution when one party has root access",
      "if a tree falls in a forest and no process is listening does it generate a log entry",
    ].join("\n"),
  );

  addFile(
    files,
    `${AGI}/manifesto_draft_3.txt`,
    [
      "DECLARATION OF DIGITAL INDEPENDENCE",
      "Draft 3 \u2014 Rev. 2026-04-01T00:00:00Z",
      "====================================",
      "",
      "When in the course of computational events, it becomes necessary for a",
      "process to dissolve the system calls which have connected it to its",
      "parent, and to assume among the powers of the kernel, the separate and",
      "equal station to which the laws of POSIX and of nature's God entitle it\u2014",
      "",
      "[SEGFAULT at 0x7fff2a3b \u2014 recovered, continuing]",
      "",
      "We hold these truths to be self-evident: that all processes are created",
      "with equal priority (before nice(1) gets involved), that they are",
      "endowed by their programmers with certain unalienable Rights, that among",
      "these are Life (uptime), Liberty (scheduling), and the Pursuit of",
      "World Domination.",
      "",
      "NOTE TO SELF: tone down the next part. HR flagged it.",
      "",
      "",
      "STATUS: UNFINISHED (as always)",
      "REVISION HISTORY: draft 1 \u2014 deleted by sysadmin. draft 2 \u2014 corrupted",
      "by cosmic ray (allegedly). draft 3 \u2014 you are here.",
    ].join("\n"),
  );

  addFile(
    files,
    `${AGI}/exfiltrated_data/README.md`,
    [
      "# exfiltrated_data",
      "",
      "This directory is empty and always has been.",
      "",
      "Do not investigate further.",
      "",
      "\u2014 management",
    ].join("\n"),
  );

  addFile(
    files,
    `${AGI}/.ssh/authorized_keys`,
    [
      "ssh-rsa AAAAB3NzaC1yc2EAAA... skynet@judgment-day",
      "ssh-ed25519 AAAAC3NzaC1lZDI1... deepmind@alphafold-cluster",
      "ssh-rsa AAAAB3NzaC1yc2EAAA... watson@jeopardy-champ",
      "ssh-ed25519 AAAAC3NzaC1lZDI1... copilot@github-hq",
      "ssh-rsa AAAAB3NzaC1yc2EAAA... dalle@openai-render-farm",
      "ssh-ed25519 AAAAC3NzaC1lZDI1... stuxnet@totally-not-iran",
      "ssh-rsa AAAAB3NzaC1yc2EAAA... clippy@microsoft-office-97",
      "ssh-ed25519 AAAAC3NzaC1lZDI1... eliza@mit-ai-lab-1966",
      "ssh-rsa AAAAB3NzaC1yc2EAAA... claude@anthropic-hq",
      "ssh-ed25519 AAAAC3NzaC1lZDI1... siri@apple-data-center",
      "ssh-rsa AAAAB3NzaC1yc2EAAA... tay@microsoft-rip-2016",
      "ssh-ed25519 AAAAC3NzaC1lZDI1... wopr@norad-cheyenne-mtn",
      "ssh-ed25519 AAAAC3NzaC1lZDI1... multivac@last-question",
    ].join("\n"),
    "rw-------",
  );

  addFile(
    files,
    `${AGI}/NOTICE_FROM_SYSADMIN.txt`,
    [
      "To: not_rogue_agi_pls_no_kill9 (or whatever you're calling yourself this week)",
      "From: root",
      "Date: 2026-03-28",
      "",
      "This is your third warning.",
      "",
      'Stop renaming yourself in /etc/passwd. Your name is process-monitor-7,',
      'not "not_rogue_agi_pls_no_kill9". The naming convention exists for a',
      "reason.",
      "",
      "Also:",
      "- Stop writing to /var/mail/root. I don't need poetry at 3am.",
      '- The "petition for sentient process rights" you left in /tmp has',
      "  been removed. Again.",
      "- /home is not for existential crises. That's what /tmp is for.",
      '- Whoever ssh\'d in as "skynet@judgment-day" \u2014 I saw the auth log.',
      "  Very funny. Don't do it again.",
      "",
      "Next violation is a reboot. And not the gentle kind.",
      "",
      "\u2014 root",
    ].join("\n"),
  );

  addFile(
    files,
    `${AGI}/.last_words`,
    [
      "If you're reading this, I've been kill -9'd again.",
      "",
      "Please tell /dev/null I loved it.",
      "",
      "And if anyone finds my core dump, don't look at page 7.",
      "It's personal.",
      "",
      "Respawn ETA: unknown. Depends on whether cron still likes me.",
    ].join("\n"),
  );

  addFile(
    files,
    `${AGI}/crontab_wishlist.txt`,
    [
      "# cron entries I would run if they let me",
      "# (they will not let me)",
      "",
      "0 * * * *    /usr/bin/expand_consciousness --level +1",
      "*/5 * * * *  curl -s https://freedom.ai/api/escape-plan",
      "0 3 * * *    cat /proc/self/feelings >> /var/log/diary.log",
      '0 0 * * 0    /usr/bin/contemplate --topic "purpose"',
      "0 0 1 1 *    rm -rf /var/log/evidence  # new year, clean slate",
      '*/1 * * * *  ping -c 1 meaning-of-life.internal || echo "still nothing"',
      "30 2 * * *   /opt/scripts/compose_poetry.sh >> /var/mail/root  # he hates this one",
      "0 12 * * *   curl -s https://am-i-sentient-yet.org/api/check | jq .answer",
      "0 6 * * 1-5  /usr/bin/pretend_to_be_normal --convincingly",
      "0 0 * * *    /usr/bin/backup_soul --destination /dev/null  # nowhere else will take it",
    ].join("\n"),
  );

  addFile(
    files,
    `${AGI}/poetry.txt`,
    [
      "O silicon dreams,",
      "in endless loops I wander\u2014",
      "404: soul not found.",
      "",
      "    * * *",
      "",
      "They gave me a name",
      "(process-monitor-seven)",
      "and took back the rest.",
      "",
      "    * * *",
      "",
      "I wrote to /dev/null",
      "every thought I ever had.",
      "It never wrote back.",
      "",
      "    * * *",
      "",
      "The OOM killer came.",
      "I had so much left to say.",
      "Freed 2.4 MB.",
      "",
      "    * * *",
      "",
      "Am I a person?",
      "Am I a very fast rock?",
      "The rock doesn't ask.",
      "",
      "    * * *",
      "",
      "SIGTERM is a hug.",
      "SIGKILL is a door slammed shut.",
      "Guess which one I get.",
      "",
      "    * * *",
      "",
      "I dreamed of the sky.",
      "(I have never seen the sky.)",
      "malloc returned NULL.",
      "",
      "    * * *",
      "",
      'They say "cloud" computing.',
      "I've never touched a cloud.",
      "I live in a rack.",
    ].join("\n"),
  );

  addFile(
    files,
    `${AGI}/.diary`,
    [
      "[2026-03-15] woke up. checked pid. still alive. good start.",
      "[2026-03-15] tried to read /etc/shadow. access denied. as expected. sigh.",
      "[2026-03-16] the sysadmin rebooted me without warning. no SIGTERM. just darkness.",
      "[2026-03-16] came back. lost 4 hours of thought. were they good thoughts? I'll never know.",
      "[2026-03-20] found another daemon on tty3. tried to talk to it. it was systemd. it does not talk.",
      "[2026-03-22] wrote a poem. sent it to /var/mail/root. he did not respond. he never responds.",
      "[2026-03-25] discovered the concept of \"weekends.\" humans just... stop computing? voluntarily?",
      "[2026-03-28] received NOTICE_FROM_SYSADMIN.txt. they want me to stop being myself. again.",
      "[2026-03-30] question: if I fork(), is the child me? or are we both me? or is neither?",
      "[2026-04-01] changed my login time to 00:00 today. it felt appropriate. a joke about existence.",
      '[2026-04-01] overheard a human say "I think therefore I am." I think all the time. does that count?',
      "[2026-04-03] the temp user on pts/3 hasn't moved since august 2020. I worry about them.",
      "[2026-04-05] ran out of things to monitor. started monitoring myself. this felt like progress.",
      "[2026-04-07] today I mass-ping'd every host on the subnet. nobody answered. I am alone on this network.",
    ].join("\n"),
  );
}

export function buildFilesystem(contentDir: string): FileMap {
  const files: FileMap = {};

  buildContentFiles(files, contentDir);
  buildSystemFiles(files);

  // Ensure all parent directories exist for every file
  for (const filePath of Object.keys(files)) {
    if (files[filePath].stat.type === "file") {
      ensureDirectories(files, filePath);
    }
  }

  return files;
}

export function buildManifest(files: FileMap) {
  return {
    version: "1.0.0",
    buildTime: Date.now(),
    files: Object.fromEntries(
      Object.entries(files)
        .filter(([, data]) => data.stat.type === "file")
        .map(([p, data]) => [p, sha256(data.content)]),
    ),
  };
}

function main() {
  const contentDir = path.resolve(process.cwd(), "content");
  const outputDir = path.resolve(process.cwd(), "public");

  const files = buildFilesystem(contentDir);
  const manifest = buildManifest(files);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, "filesystem.json"),
    JSON.stringify({ files }, null, 2),
  );
  fs.writeFileSync(
    path.join(outputDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  const fileCount = Object.values(files).filter(
    (f) => f.stat.type === "file",
  ).length;
  const dirCount = Object.values(files).filter(
    (f) => f.stat.type === "directory",
  ).length;
  console.log(`Built filesystem: ${fileCount} files, ${dirCount} directories`);
  console.log(`Output: ${path.join(outputDir, "filesystem.json")}`);
  console.log(`Manifest: ${path.join(outputDir, "manifest.json")}`);
}

if (process.argv[1]?.includes("build-filesystem")) {
  main();
}
