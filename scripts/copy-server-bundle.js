import fs from "node:fs";
import path from "node:path";

const distServerDir = path.resolve(process.cwd(), "dist", "server");
const sourceFile = path.join(distServerDir, "index.js");
const targetFile = path.join(distServerDir, "server.js");

if (!fs.existsSync(sourceFile)) {
  throw new Error(`Cannot copy SSR bundle because ${sourceFile} does not exist.`);
}

fs.copyFileSync(sourceFile, targetFile);
