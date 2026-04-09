import type { Command } from "@/lib/types";
import { registry } from "@/lib/shell/registry";

// --- Constants ---

const OS_NAME = "AskewOS";
const OS_VERSION = "1.0.0";
const HOSTNAME = "askew.sh";

// --- Helpers ---

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function getArch(): string {
  if (!isBrowser()) return "x86_64";
  const ua = navigator.userAgent;
  if (/arm64|aarch64/i.test(ua)) return "aarch64";
  if (/armv7/i.test(ua)) return "armv7l";
  return "x86_64";
}

// --- uname ---

const unameCommand: Command = {
  name: "uname",
  aliases: [],
  description: "print system information",
  usage: "uname [-a|-s|-r|-m]",
  execute(_args, flags) {
    if (flags.a) {
      const arch = getArch();
      const cores = isBrowser() ? (navigator.hardwareConcurrency ?? 2) : 2;
      return {
        lines: [
          {
            content: `${OS_NAME} ${HOSTNAME} ${OS_VERSION} #1 SMP JavaScript ${arch} Browser/${cores}core`,
          },
        ],
        exitCode: 0,
      };
    }
    if (flags.r) return { lines: [{ content: OS_VERSION }], exitCode: 0 };
    if (flags.m) return { lines: [{ content: getArch() }], exitCode: 0 };
    return { lines: [{ content: OS_NAME }], exitCode: 0 };
  },
};

// --- Register ---

registry.register(unameCommand);
