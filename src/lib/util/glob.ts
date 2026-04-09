/**
 * Convert a glob pattern to a RegExp.
 *
 * Supported syntax:
 *   **  — matches any sequence of characters including '/' (globstar)
 *   *   — matches any sequence of characters except '/'
 *   ?   — matches exactly one character except '/'
 *   All other characters are treated as literals (escaped).
 *
 * The returned RegExp matches the full string (anchored with ^ and $).
 *
 * @param pattern - the glob pattern to compile
 * @param basePath - the directory to root the pattern in; patterns that do not
 *   start with '/' are prefixed with `basePath + "/"` before compilation.
 */
export function globToRegex(pattern: string, basePath: string): RegExp {
  const prefix = basePath === "/" ? "/" : basePath + "/";
  const fullPattern = pattern.startsWith("/") ? pattern : prefix + pattern;
  let regex = "";
  let i = 0;
  while (i < fullPattern.length) {
    const ch = fullPattern[i];
    if (ch === "*" && fullPattern[i + 1] === "*") {
      if (fullPattern[i + 2] === "/") {
        regex += "(?:.+/)?";
        i += 3;
      } else {
        regex += ".*";
        i += 2;
      }
    } else if (ch === "*") {
      regex += "[^/]*";
      i++;
    } else if (ch === "?") {
      regex += "[^/]";
      i++;
    } else if (".+^${}()|[]\\".includes(ch)) {
      regex += "\\" + ch;
      i++;
    } else {
      regex += ch;
      i++;
    }
  }
  return new RegExp("^" + regex + "$");
}
