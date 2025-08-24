import esbuild from "esbuild";
import path from "path";
import * as fs from "fs";
import { createDynamicTypes } from "./dynamic-types";
import { generateChainData } from "./prebuild-generate-chain-data";

export const entries = ["index.ts"];

export const esBuildContext: esbuild.BuildOptions = {
  entryPoints: entries,
  bundle: true,
  outdir: "dist",
};

async function main() {
    await generateChainData();
    await createDynamicTypes();

    // Ensure `dist` exists and write a minimal, useful package.json there
    ensureDistDir();
    populateDistPackageJson();

  try {
    await buildForEnvironments();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

function populateDistPackageJson(): void {
  const rootPkgPath = path.resolve(__dirname, "..", "package.json");
  let rootPkg: any = {};
  try {
    const raw = fs.readFileSync(rootPkgPath, "utf8");
    rootPkg = JSON.parse(raw);
  } catch (err) {
    console.warn(`Could not read root package.json at ${rootPkgPath}, using defaults.`);
  }

  const distPkg: any = {
    name: rootPkg.name || path.basename(path.resolve(__dirname, "..")),
    version: rootPkg.version || "0.0.0",
    description: rootPkg.description || "",
    main: "./cjs/index.js",
    module: "./esm/index.js",
    types: "./index.d.ts",
    exports: {
      ".": {
      require: "./cjs/index.js",
        import: "./esm/index.js"
      }
    },
    sideEffects: false,
    license: rootPkg.license || "UNLICENSED"
  };

  if (rootPkg.repository) distPkg.repository = rootPkg.repository;
  if (rootPkg.author) distPkg.author = rootPkg.author;
  // Keep the dist package.json small and explicit about what files are published
  distPkg.files = ["cjs/", "esm/", "dynamic.d.ts", "types/"];

  // Remove any leftover root index.js to avoid duplication when cleaning up old builds
  try {
    const rootIndex = path.resolve(__dirname, "..", "dist", "index.js");
    if (fs.existsSync(rootIndex)) fs.unlinkSync(rootIndex);
  } catch (err) {
    // non-fatal
  }

  const outPath = path.resolve(__dirname, "..", "dist", "package.json");
  fs.writeFileSync(outPath, JSON.stringify(distPkg, null, 2) + "\n", "utf8");
  console.log(`Wrote ${outPath}`);
}

async function buildForEnvironments() {
  ensureDistDir();

  await esbuild
    .build({
      ...esBuildContext,
      tsconfig: "tsconfig.node.json",
      platform: "node",
      outdir: "dist/cjs",
      format: "cjs",
    })
    .then(() => {
      console.log("Node.js esbuild complete");
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
  esbuild
    .build({
      ...esBuildContext,
      tsconfig: "tsconfig.web.json",
      platform: "browser",
      outdir: "dist/esm",
      format: "esm",
    })
    .then(() => {
      console.log("Frontend esbuild complete");
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

function ensureDistDir() {
  const distPath = path.resolve(__dirname, "..", "dist");
  if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath, { recursive: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});