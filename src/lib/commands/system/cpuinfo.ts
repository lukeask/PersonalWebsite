// --- /proc/cpuinfo generator ---
// Export this and call it at app startup, then write the result into the
// overlay filesystem at /proc/cpuinfo so `cat /proc/cpuinfo` works.

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

function getCpuModel(): string {
  if (!isBrowser()) return "AskewOS Virtual CPU";
  const ua = navigator.userAgent;
  if (/Mac OS X/i.test(ua)) return "Apple-class Browser CPU";
  if (/Windows NT/i.test(ua)) return "Intel-class Browser CPU";
  return "AskewOS Virtual CPU";
}

export function generateProcCpuInfo(): string {
  const cores = isBrowser() ? (navigator.hardwareConcurrency ?? 2) : 2;
  const arch = getArch();
  const model = getCpuModel();

  return Array.from({ length: cores }, (_, i) =>
    [
      `processor\t: ${i}`,
      `vendor_id\t: AskewOS`,
      `cpu family\t: 42`,
      `model\t\t: 1`,
      `model name\t: ${model}`,
      `cpu MHz\t\t: 2400.000`,
      `cache size\t: 256 KB`,
      `physical id\t: 0`,
      `siblings\t: ${cores}`,
      `core id\t\t: ${i}`,
      `cpu cores\t: ${cores}`,
      `address sizes\t: 48 bits physical, 48 bits virtual`,
      `flags\t\t: js wasm webgl webgpu crypto subtle ${arch}`,
      `bogomips\t: 4800.00`,
      "",
    ].join("\n"),
  ).join("\n");
}
