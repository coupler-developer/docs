import fs from "node:fs";
import path from "node:path";

export function readRegularRepoFile(repoRoot, relativePath) {
  const normalizedRoot = path.resolve(repoRoot);
  const absolutePath = path.resolve(normalizedRoot, relativePath);
  const pathFromRoot = path.relative(normalizedRoot, absolutePath);
  if (
    pathFromRoot.length === 0 ||
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(pathFromRoot)
  ) {
    return null;
  }

  try {
    let currentPath = normalizedRoot;
    const components = pathFromRoot.split(path.sep);
    for (const [index, component] of components.entries()) {
      currentPath = path.join(currentPath, component);
      const fileStat = fs.lstatSync(currentPath);
      if (
        fileStat.isSymbolicLink() ||
        (index < components.length - 1 && !fileStat.isDirectory()) ||
        (index === components.length - 1 && !fileStat.isFile())
      ) {
        return null;
      }
    }
    return fs.readFileSync(absolutePath, "utf8");
  } catch {
    return null;
  }
}
