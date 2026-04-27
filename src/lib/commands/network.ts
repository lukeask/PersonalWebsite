import React from "react";

import type { Command, CommandOutput } from "@/lib/types";
import { registry } from "@/lib/shell/registry";
import { markCurlDone } from "@/lib/ctf/game";
import { errOut } from "@/lib/util/output";
import { BicepCurlDisplay } from "@/lib/commands/fun/bicep-curl-display";

// --- Helpers ---

function out(lines: string[], exitCode = 0): CommandOutput {
  return { lines: lines.map((content) => ({ content })), exitCode };
}

// --- ping ---

const APT_ERRORS = [
  "E: Unable to locate mass appeal",
  "E: Package 'social-skills' has no installation candidate",
  "E: You don't have enough RAM for that",
  "E: Couldn't find package 'motivation' in the cache",
  "E: Package 'free-time' has no installation candidate",
  "E: dpkg was interrupted, you must manually run 'sudo dpkg --configure -a' (just kidding, this isn't real)",
];

let aptErrorIdx = 0;
function nextAptError(): string {
  const err = APT_ERRORS[aptErrorIdx % APT_ERRORS.length];
  aptErrorIdx++;
  return err;
}

const pingCommand: Command = {
  name: "ping",
  aliases: [],
  description: "Send ICMP ECHO_REQUEST to network hosts",
  usage: "ping <host>",
  execute(args, _flags, _stdin, _ctx) {
    const host = args[0];
    if (!host) return errOut("ping: missing host operand");

    if (host !== "askew.sh" && host !== "localhost" && host !== "127.0.0.1") {
      return out([`ping: ${host}: Name or service not known`], 2);
    }

    const displayHost = host === "localhost" ? "127.0.0.1" : host;

    const pings = [1, 2, 3, 4].map((seq) => {
      // Sub-millisecond latency — the server is right here in your browser.
      const time = (Math.random() * 0.08 + 0.01).toFixed(3);
      return `64 bytes from ${displayHost}: icmp_seq=${seq} ttl=64 time=${time} ms`;
    });

    return out([
      `PING ${host} (${displayHost}): 56 data bytes`,
      ...pings,
      "",
      `--- ${host} ping statistics ---`,
      `4 packets transmitted, 4 received, 0% packet loss`,
      `round-trip min/avg/max = 0.010/0.050/0.090 ms  (it's localhost — what did you expect?)`,
    ]);
  },
};

// --- curl ---

const curlCommand: Command = {
  name: "curl",
  aliases: [],
  description: "Transfer a URL",
  usage: "curl <url>",
  execute(_args, _flags, _stdin, _ctx) {
    // Any curl invocation unlocks the `break` command (CTF Path B) and does bicep curls
    markCurlDone();

    return {
      lines: [{ content: React.createElement(BicepCurlDisplay) }],
      exitCode: 0,
    };
  },
};

// --- wget ---

const wgetCommand: Command = {
  name: "wget",
  aliases: [],
  description: "Non-interactive network downloader",
  usage: "wget <url>",
  execute(args, _flags, _stdin, _ctx) {
    const url = args[0];
    if (!url) return errOut("wget: missing URL");

    const isLocal =
      url === "localhost" ||
      url === "127.0.0.1" ||
      url.replace(/^https?:\/\//, "").replace(/\/$/, "") === "askew.sh";

    if (isLocal) {
      return out([
        `--2026-04-07 00:00:00--  ${url}`,
        `Resolving ${url}... 127.0.0.1`,
        `Connecting to ${url}|127.0.0.1|:80... connected.`,
        "HTTP request sent, awaiting response... 200 OK",
        "Saved: 'index.html' (but you're already reading it)",
      ]);
    }

    return out([
      `--2026-04-07 00:00:00--  ${url}`,
      `Resolving ${url}...`,
      `wget: unable to resolve host address '${url}'`,
      "(Network access is simulated. The only host that resolves is askew.sh.)",
    ], 4);
  },
};

// --- ssh ---

const sshCommand: Command = {
  name: "ssh",
  aliases: [],
  description: "OpenSSH remote login client",
  usage: "ssh [user@]host",
  execute(args, _flags, _stdin, _ctx) {
    const target = args[0];
    if (!target) return errOut("ssh: missing destination");

    const host = target.includes("@") ? target.split("@").pop()! : target;
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "askew.sh";

    if (isLocal) {
      return out(["You're already here."]);
    }

    return out([
      `ssh: connect to host ${host} port 22: Connection refused`,
      "(Only this terminal exists. There's nowhere else to go.)",
    ], 255);
  },
};

// --- nslookup / dig ---

const nslookupCommand: Command = {
  name: "nslookup",
  aliases: ["dig"],
  description: "Query Internet name servers",
  usage: "nslookup <host>",
  execute(args, _flags, _stdin, _ctx) {
    const host = args[0] ?? "askew.sh";
    const isAskew = host === "askew.sh";
    const ip = isAskew ? "127.0.0.1" : "browser://local";

    return out([
      `Server:   8.8.8.8`,
      `Address:  8.8.8.8#53`,
      ``,
      `Non-authoritative answer:`,
      `Name:   ${host}`,
      `Address: ${ip}`,
      isAskew ? "(Turns out the server was inside you all along.)" : "",
    ].filter((l) => l !== undefined));
  },
};

// --- apt / apt-get ---

const aptCommand: Command = {
  name: "apt",
  aliases: ["apt-get"],
  description: "APT package manager",
  usage: "apt <install|update|...> [package]",
  execute(args, _flags, _stdin, _ctx) {
    const sub = args[0];

    if (sub === "update") {
      return out([
        "Hit:1 https://askew.sh/repo stable InRelease",
        "Reading package lists... Done",
        "All packages are up to date.",
      ]);
    }

    if (sub === "install") {
      const pkg = args[1] ?? "something";
      return out([
        `Reading package lists... Done`,
        `Building dependency tree... Done`,
        `Reading state information... Done`,
        `E: Unable to locate package '${pkg}'`,
        nextAptError(),
      ], 100);
    }

    if (sub === "upgrade") {
      return out([
        "Reading package lists... Done",
        "Building dependency tree... Done",
        "0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.",
        "(This terminal is already at peak performance.)",
      ]);
    }

    return out([
      `apt: unknown command '${sub ?? ""}'`,
      "Usage: apt <install|update|upgrade> [package]",
    ], 1);
  },
};

// --- ifconfig / ip addr ---

const ifconfigCommand: Command = {
  name: "ifconfig",
  aliases: [],
  description: "Configure network interfaces",
  usage: "ifconfig [interface]",
  execute(_args, _flags, _stdin, _ctx) {
    return out([
      "lo0: flags=8049<UP,LOOPBACK,RUNNING,MULTICAST> mtu 16384",
      "        inet 127.0.0.1 netmask 0xff000000",
      "        inet6 ::1 prefixlen 128",
      "        inet6 fe80::1%lo0 prefixlen 64 scopeid 0x1",
      "        nd6 options=201<PERFORMNUD,DAD>",
      "",
      "browser0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500",
      "        inet 127.0.0.1 netmask 0xffffff00 broadcast 127.0.0.255",
      "        ether de:ad:be:ef:00:01",
      "        media: autoselect (1000baseT <full-duplex>)",
      "        status: active",
    ]);
  },
};

const ipCommand: Command = {
  name: "ip",
  aliases: [],
  description: "Show/manipulate routing, network devices, interfaces",
  usage: "ip addr [show]",
  execute(args, _flags, _stdin, _ctx) {
    const sub = args[0];
    if (sub === "addr" || sub === "address" || sub === "a" || !sub) {
      return out([
        "1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN",
        "    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00",
        "    inet 127.0.0.1/8 scope host lo",
        "       valid_lft forever preferred_lft forever",
        "    inet6 ::1/128 scope host",
        "       valid_lft forever preferred_lft forever",
        "2: browser0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP",
        "    link/ether de:ad:be:ef:00:01 brd ff:ff:ff:ff:ff:ff",
        "    inet 127.0.0.1/24 brd 127.0.0.255 scope global browser0",
        "       valid_lft forever preferred_lft forever",
      ]);
    }

    return errOut(`ip: unknown object '${sub}'\nUsage: ip addr [show]`);
  },
};

// --- Register ---

registry.register(pingCommand);
registry.register(curlCommand);
registry.register(wgetCommand);
registry.register(sshCommand);
registry.register(nslookupCommand);
registry.register(aptCommand);
registry.register(ifconfigCommand);
registry.register(ipCommand);
