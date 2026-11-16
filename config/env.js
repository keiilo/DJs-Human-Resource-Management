// Loads this HR folder's .env into process.env. Values already set (for example from the shell)
// are never overwritten. Import this file FIRST so every module sees the settings.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HR_ENV_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");

const parseEnv = (text) => {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (/^(["']).*\1$/.test(value)) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, ""); // strip an inline comment on unquoted values
    }
    values[match[1]] = value;
  }
  return values;
};

export const hrEnvLoaded = fs.existsSync(HR_ENV_FILE);

if (hrEnvLoaded) {
  const values = parseEnv(fs.readFileSync(HR_ENV_FILE, "utf8"));
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
