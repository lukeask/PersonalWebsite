/**
 * Resolve a path against a working directory.
 *
 * - Expands `~` and `~/...` to the provided home directory
 * - Prepends cwd if the path is relative
 * - Normalizes `.`, `..`, and duplicate slashes
 */
export function resolvePath(
  path: string,
  cwd: string,
  home = "/home/guest",
): string {
  let p = path;
  if (p === "~" || p.startsWith("~/")) p = home + p.slice(1);
  if (!p.startsWith("/")) p = (cwd === "/" ? "" : cwd) + "/" + p;
  const parts = p.split("/");
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  }
  return "/" + resolved.join("/");
}

/**
 * Join a directory path and a bare entry name into a single absolute path.
 *
 * Handles the root directory case: when `dir` is `"/"`, the result is
 * `"/" + name` rather than `"//name"`.
 *
 * @param dir  - Absolute directory path. Must not have a trailing slash
 *               unless it is the root `"/"`.
 * @param name - Bare entry name. Must not contain slashes.
 * @returns The joined absolute path.
 *
 * @example
 * joinPath("/home/guest", "projects")  // → "/home/guest/projects"
 * joinPath("/", "etc")                 // → "/etc"
 */
export function joinPath(dir: string, name: string): string {
  return dir === "/" ? `/${name}` : `${dir}/${name}`;
}
