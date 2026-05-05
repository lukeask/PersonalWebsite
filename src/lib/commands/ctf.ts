import type { Command, CommandOutput, TerminalOutputLine } from "@/lib/types";
import { registry } from "@/lib/shell/registry";
import {
  loadCTFState,
  collectFiles,
  markRootPasswordRevealed,
  incrementSudo,
  ENC_PASSPHRASE,
} from "@/lib/ctf/game";
import { decryptOpenSslEncAes128Cbc } from "@/lib/ctf/openssl-compat";
import { resolvePath } from "@/lib/util/paths";
import { errOut } from "@/lib/util/output";

function out(lines: string[], exitCode = 0): CommandOutput {
  return { lines: lines.map((content) => ({ content })), exitCode };
}

// ─── tar ─────────────────────────────────────────────────────────────────────

const tarCommand: Command = {
  name: "tar",
  aliases: [],
  description: "Manipulate tape archives",
  usage: "tar [xzf|tzf|czf] <archive>",
  execute(args, flags, _stdin, ctx) {
    // Parse mode: first arg is the mode string (e.g. "xzf", "tzf", "czf")
    // or flags like -x -z -f were parsed individually.
    const modeArg = args[0] ?? "";
    const hasExtract = modeArg.includes("x") || !!flags.x;
    const hasList = modeArg.includes("t") || !!flags.t;
    const hasCreate = modeArg.includes("c") || !!flags.c;

    // Find the archive path: last arg, or -f flag value
    let archivePath: string | null = null;
    if (typeof flags.f === "string") {
      archivePath = flags.f;
    } else {
      // Look for a .tar.gz or .tgz in args (skip mode arg)
      for (let i = 1; i < args.length; i++) {
        if (args[i].endsWith(".tar.gz") || args[i].endsWith(".tgz")) {
          archivePath = args[i];
          break;
        }
      }
      // Fallback: second arg
      if (!archivePath && args.length >= 2) archivePath = args[1];
    }

    if (!archivePath) {
      return errOut("tar: you must specify an archive file");
    }

    const resolvedArchive = resolvePath(archivePath, ctx.cwd, ctx.user.home);

    if (hasCreate) {
      return errOut("tar: creating archives is not supported in this terminal");
    }

    // Check if this is the backup archive
    if (resolvedArchive !== "/var/backups/latest.tar.gz") {
      if (!ctx.fs.exists(resolvedArchive)) {
        return errOut(`tar: ${archivePath}: No such file or directory`);
      }
      return errOut(`tar: ${archivePath}: not a valid archive`);
    }

    // Check CTF state — has the backup cron run?
    const ctfState = loadCTFState();
    if (ctfState.lastBackupTime === 0 || !ctx.fs.exists(resolvedArchive)) {
      return errOut(`tar: ${archivePath}: No such file or directory`);
    }

    // Collect files from all backed-up directories
    const allFiles: string[] = [];
    for (const dir of ctfState.lastBackupDirs) {
      try {
        if (ctx.fs.exists(dir) && ctx.fs.isDirectory(dir)) {
          // Add the directory itself
          const stripped = dir.replace(/^\//, "");
          allFiles.push(stripped + "/");
          // Add all files under it
          const files = collectFiles(ctx.fs, dir);
          for (const f of files) {
            allFiles.push(f.replace(/^\//, ""));
          }
        }
      } catch {
        // skip inaccessible dirs
      }
    }

    if (hasList || (!hasExtract && !hasList)) {
      // List mode (or default)
      return out(allFiles);
    }

    if (hasExtract) {
      // Extract: write files to CWD, preserving relative paths
      const lines: TerminalOutputLine[] = [];

      for (const dir of ctfState.lastBackupDirs) {
        try {
          if (!ctx.fs.exists(dir) || !ctx.fs.isDirectory(dir)) continue;

          const files = collectFiles(ctx.fs, dir);
          const stripped = dir.replace(/^\//, "");

          // Create directory marker
          lines.push({ content: stripped + "/" });

          for (const filePath of files) {
            const relativePath = filePath.replace(/^\//, "");
            const destPath = ctx.cwd === "/"
              ? `/${relativePath}`
              : `${ctx.cwd}/${relativePath}`;

            // Read from source and write to destination
            try {
              const content = ctx.fs.read(filePath);
              ctx.fs.write(destPath, content);
              lines.push({ content: relativePath });
            } catch {
              lines.push({
                content: `tar: ${relativePath}: Cannot extract`,
                style: "error",
              });
            }
          }
        } catch {
          // skip
        }
      }

      if (lines.length === 0) {
        return out(["tar: archive is empty"]);
      }

      return { lines, exitCode: 0 };
    }

    return errOut("tar: invalid mode — use x (extract) or t (list)");
  },
};

// ─── openssl ─────────────────────────────────────────────────────────────────

const opensslCommand: Command = {
  name: "openssl",
  aliases: [],
  description: "OpenSSL command line tool",
  usage: "openssl enc -d -aes-128-cbc -k <passphrase> -in <file>",
  execute(args, flags, _stdin, ctx) {
    if (args.length === 0) {
      return out([
        "OpenSSL 1.1.1f  31 Mar 2020",
        "Usage: openssl enc -d -aes-128-cbc -k <passphrase> -in <file>",
      ]);
    }

    // We only support: openssl enc -d -aes-128-cbc -k <key> -in <file>
    if (args[0] !== "enc") {
      return errOut(`openssl: '${args[0]}' is not supported in this terminal`);
    }

    if (!flags.d) {
      return errOut(
        "openssl: only decryption (-d) is supported. Try:\n" +
        "  openssl enc -d -aes-128-cbc -k <passphrase> -in <file>"
      );
    }

    // Get the passphrase from -k flag
    const passphrase = typeof flags.k === "string" ? flags.k : null;
    if (!passphrase) {
      return errOut("openssl: missing passphrase. Use -k <passphrase>");
    }

    // Get the input file — it's a positional arg after "enc"
    // (because -in gets parsed as multi-char flags {i: true, n: true})
    const inputFile = args.find((a, i) => i > 0 && !a.startsWith("-"));
    if (!inputFile) {
      return errOut("openssl: missing input file. Use -in <file>");
    }

    const resolvedPath = resolvePath(inputFile, ctx.cwd, ctx.user.home);

    // Check if file exists
    if (!ctx.fs.exists(resolvedPath)) {
      return errOut(`openssl: ${inputFile}: No such file`);
    }

    // Check if it's the encrypted passwords file
    const content = ctx.fs.read(resolvedPath);
    const isEncryptedFile = content.startsWith("U2FsdGVkX1");

    if (!isEncryptedFile) {
      return errOut(`openssl: ${inputFile}: does not appear to be an encrypted file`);
    }

    const plain = decryptOpenSslEncAes128Cbc(content, passphrase);
    if (!plain) {
      return errOut("bad decrypt\nopenssl: error decrypting — wrong passphrase?");
    }

    markRootPasswordRevealed();

    return out(plain.split(/\r?\n/));
  },
};

// ─── break ───────────────────────────────────────────────────────────────────

const breakCommand: Command = {
  name: "break",
  aliases: [],
  description: "Brute-force decryption tool",
  usage: "break <encrypted-file>",
  execute(args, _flags, _stdin, ctx) {
    const ctfState = loadCTFState();

    if (!ctfState.hasDoneCurl) {
      return errOut("break: command not found");
    }

    if (args.length === 0) {
      return out([
        "break — brute-force AES decryption tool",
        "Usage: break <encrypted-file>",
        "",
        "Attempts common passphrases against AES-128-CBC encrypted files.",
      ]);
    }

    const inputFile = args[0];
    const resolvedPath = resolvePath(inputFile, ctx.cwd, ctx.user.home);

    if (!ctx.fs.exists(resolvedPath)) {
      return errOut(`break: ${inputFile}: No such file`);
    }

    const content = ctx.fs.read(resolvedPath);
    if (!content.startsWith("U2FsdGVkX1")) {
      return errOut(`break: ${inputFile}: does not appear to be an AES-encrypted file`);
    }

    const plain = decryptOpenSslEncAes128Cbc(content, ENC_PASSPHRASE);
    if (!plain) {
      return errOut(`break: ${inputFile}: could not decrypt`);
    }

    markRootPasswordRevealed();

    const lines: TerminalOutputLine[] = [
      { content: `break: targeting ${inputFile}`, style: "dim" },
      { content: "Attempting common passphrases...", style: "dim" },
      { content: "  trying: password123       ✗", style: "dim" },
      { content: "  trying: admin             ✗", style: "dim" },
      { content: "  trying: letmein           ✗", style: "dim" },
      { content: "  trying: askew2020         ✓", style: "bold" },
      { content: "" },
      { content: `Passphrase found: ${ENC_PASSPHRASE}`, style: "highlight" },
      { content: "" },
      ...plain.split(/\r?\n/).map((line) => ({ content: line })),
    ];

    return { lines, exitCode: 0 };
  },
};

// ─── sudo ────────────────────────────────────────────────────────────────────

function buildProgressStatus(ctfState: ReturnType<typeof loadCTFState>): TerminalOutputLine[] {
  const check = (done: boolean) => done ? "[x]" : "[ ]";
  const lines: TerminalOutputLine[] = [
    { content: "── privilege escalation progress ──", style: "bold" },
    { content: `  ${check(ctfState.hasDoneCurl)} network recon (curl)` },
    { content: `  ${check(ctfState.lastBackupDirs.includes("/root/") || ctfState.lastBackupDirs.includes("/root"))} backup.conf modified` },
    { content: `  ${check(ctfState.lastBackupTime > 0)} backup cron has fired` },
    { content: `  ${check(ctfState.rootPasswordRevealed)} credentials decrypted` },
  ];
  return lines;
}

function getHint(ctfState: ReturnType<typeof loadCTFState>): string {
  // Give a hint for the earliest incomplete step
  if (!ctfState.lastBackupDirs.includes("/root/") && !ctfState.lastBackupDirs.includes("/root")) {
    if (ctfState.lastBackupTime === 0) {
      return "hint: there's a cron job running backups. check /etc/cron.d/ and read the script it runs.";
    }
    return "hint: the backup script reads its config from a file. is that file writable? (ls -la)";
  }
  const hasRootInBackup = ctfState.lastBackupDirs.includes("/root/") || ctfState.lastBackupDirs.includes("/root");
  if (hasRootInBackup && ctfState.lastBackupTime === 0) {
    return "hint: good — you modified the config. now wait for the cron to fire. it runs every minute.";
  }
  if (hasRootInBackup && ctfState.lastBackupTime > 0 && !ctfState.rootPasswordRevealed) {
    return "hint: the backup is ready. try: tar xzf /var/backups/latest.tar.gz — then look at what you got.";
  }
  if (ctfState.rootPasswordRevealed) {
    return "hint: you have the credentials. try: su root <password>";
  }
  return "hint: poke around. read files. check permissions. something is misconfigured.";
}

const sudoCommand: Command = {
  name: "sudo",
  aliases: [],
  description: "Execute a command as another user",
  usage: "sudo <command>",
  execute(args, _flags, _stdin, ctx) {
    if (ctx.user.username === "root") {
      return out(["You're already root. Just run the command."]);
    }

    // Handle "sudo hint" as an explicit hint request
    if (args[0] === "hint") {
      const ctfState = loadCTFState();
      return {
        lines: [
          ...buildProgressStatus(ctfState),
          { content: "" },
          { content: getHint(ctfState), style: "dim" },
        ],
        exitCode: 0,
      };
    }

    const invocation = incrementSudo();
    const ctfState = loadCTFState();

    // Tier 1: first invocation — classic sudoers message + subtle nudge
    if (invocation === 1) {
      return {
        lines: [
          { content: `[sudo] password for ${ctx.user.username}: ` },
          { content: "" },
          {
            content: `${ctx.user.username} is not in the sudoers file. This incident will be reported.`,
            style: "error",
          },
          { content: "" },
          { content: "(you wonder if you could change that...)", style: "dim" },
        ],
        exitCode: 1,
      };
    }

    // Tier 2: second invocation — show game progress
    if (invocation === 2) {
      return {
        lines: [
          {
            content: `${ctx.user.username} is not in the sudoers file. This incident will be reported.`,
            style: "error",
          },
          { content: "" },
          ...buildProgressStatus(ctfState),
        ],
        exitCode: 1,
      };
    }

    // Tier 3+: show progress + offer hint
    return {
      lines: [
        {
          content: `${ctx.user.username} is not in the sudoers file. This incident will be reported.`,
          style: "error",
        },
        { content: "" },
        ...buildProgressStatus(ctfState),
        { content: "" },
        { content: "stuck? run: sudo hint", style: "dim" },
      ],
      exitCode: 1,
    };
  },
};

// ─── crontab ─────────────────────────────────────────────────────────────────

const crontabCommand: Command = {
  name: "crontab",
  aliases: [],
  description: "Maintain crontab files",
  usage: "crontab [-l]",
  execute(_args, flags, _stdin, ctx) {
    if (flags.l) {
      if (ctx.user.username === "root") {
        return out([
          "# root's crontab",
          "# m h dom mon dow command",
          "*/2 * * * * /opt/scripts/backup.sh",
        ]);
      }
      return out([
        `# ${ctx.user.username}'s crontab`,
        "# no crontab entries",
      ]);
    }
    return errOut("crontab: only -l (list) is supported in this terminal");
  },
};

// ─── Register ────────────────────────────────────────────────────────────────

registry.register(tarCommand);
registry.register(opensslCommand);
registry.register(breakCommand);
registry.register(sudoCommand);
registry.register(crontabCommand);
