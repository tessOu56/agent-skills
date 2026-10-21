import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

export async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

export async function walkFiles(rootDir) {
  const files = [];

  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        files.push(path.relative(rootDir, full).split(path.sep).join("/"));
      }
    }
  }

  if (await pathExists(rootDir)) {
    await walk(rootDir);
  }
  return files.sort();
}

export async function readBinary(filePath) {
  return readFile(filePath);
}

export async function writeBinary(filePath, buffer) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, buffer);
}

export async function emptyDir(dir) {
  await rm(dir, { recursive: true, force: true });
  await ensureDir(dir);
}

export async function copyDir(src, dest) {
  await ensureDir(path.dirname(dest));
  await cp(src, dest, { recursive: true });
}

export function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}
