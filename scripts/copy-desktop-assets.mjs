import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const targetDir = path.join("dist", "src", "desktop");
mkdirSync(targetDir, { recursive: true });
copyFileSync(path.join("src", "desktop", "preload.cjs"), path.join(targetDir, "preload.cjs"));
