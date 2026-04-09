import { describe, it, expect } from "vitest";
import * as path from "node:path";
import {
  parseFrontmatter,
  buildFilesystem,
  buildManifest,
} from "../build-filesystem";

const CONTENT_DIR = path.resolve(process.cwd(), "content");

describe("parseFrontmatter", () => {
  it("extracts YAML frontmatter from markdown", () => {
    const raw = "---\ntitle: Hello\ndate: 2026-01-01\ntags: [a, b]\n---\n# Body";
    const result = parseFrontmatter(raw);
    expect(result.data.title).toBe("Hello");
    expect(result.data.date).toBe("2026-01-01");
    expect(result.data.tags).toEqual(["a", "b"]);
    expect(result.content).toBe("# Body");
  });

  it("returns raw content when no frontmatter present", () => {
    const raw = "# No frontmatter here";
    const result = parseFrontmatter(raw);
    expect(result.data).toEqual({});
    expect(result.content).toBe(raw);
  });
});

describe("buildFilesystem", () => {
  const files = buildFilesystem(CONTENT_DIR);

  it("produces a non-empty file map", () => {
    expect(Object.keys(files).length).toBeGreaterThan(0);
  });

  it("contains content paths from content/ directory", () => {
    expect(files).toHaveProperty("/home/luke/blog/2026-04-07-hello-world.md");
    expect(files).toHaveProperty("/home/luke/projects/placeholder/README.md");
    expect(files).toHaveProperty("/home/luke/resume.md");
  });

  it("contains expected system files", () => {
    expect(files).toHaveProperty("/etc/os-release");
    expect(files).toHaveProperty("/etc/passwd");
    expect(files).toHaveProperty("/home/luke/.bashrc");
    expect(files).toHaveProperty("/home/luke/.bash_history");
    expect(files).toHaveProperty("/home/luke/.ssh/id_rsa");
    expect(files).toHaveProperty("/home/luke/.ssh/id_rsa.pub");
    expect(files).toHaveProperty("/var/log/privacy.md");
    expect(files).toHaveProperty("/home/luke/crontab.txt");
  });

  it("contains expected directories", () => {
    expect(files["/home/guest"]?.stat.type).toBe("directory");
    expect(files["/home/luke/.easter-eggs"]?.stat.type).toBe("directory");
    expect(files["/home/luke/blog"]?.stat.type).toBe("directory");
    expect(files["/etc"]?.stat.type).toBe("directory");
  });

  it("creates parent directories for all files", () => {
    expect(files["/home/luke/.ssh"]?.stat.type).toBe("directory");
    expect(files["/home/luke"]?.stat.type).toBe("directory");
    expect(files["/home"]?.stat.type).toBe("directory");
    expect(files["/var/log"]?.stat.type).toBe("directory");
  });

  it("stores valid file content and stat", () => {
    const bashrc = files["/home/luke/.bashrc"];
    expect(bashrc.content).toContain("alias");
    expect(bashrc.stat.type).toBe("file");
    expect(bashrc.stat.size).toBeGreaterThan(0);
    expect(bashrc.stat.permissions).toBe("rw-r--r--");
  });

  it("sets restrictive permissions on private key", () => {
    expect(files["/home/luke/.ssh/id_rsa"].stat.permissions).toBe("rw-------");
  });
});

describe("buildManifest", () => {
  const files = buildFilesystem(CONTENT_DIR);
  const manifest = buildManifest(files);

  it("has required fields", () => {
    expect(manifest).toHaveProperty("version");
    expect(manifest).toHaveProperty("buildTime");
    expect(typeof manifest.buildTime).toBe("number");
    expect(manifest).toHaveProperty("files");
  });

  it("includes only files (not directories) in hash map", () => {
    const manifestPaths = Object.keys(manifest.files);
    expect(manifestPaths.length).toBeGreaterThan(0);
    for (const p of manifestPaths) {
      expect(files[p].stat.type).toBe("file");
    }
  });

  it("produces valid SHA-256 hashes", () => {
    for (const hash of Object.values(manifest.files)) {
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
