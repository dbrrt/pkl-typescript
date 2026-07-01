// Builds an npm-consumable package (CJS + ESM + .d.ts) from the Deno sources
// using dnt, so Node.js users can `npm install pkl-typescript`.
//
//   deno task build
//
// Output is written to ./npm.
import { build, emptyDir } from "@deno/dnt";

const outDir = "./npm";
await emptyDir(outDir);

await build({
  entryPoints: [
    "./src/index.ts",
    { name: "./codegen", path: "./src/codegen/index.ts" },
    { kind: "bin", name: "pkl-gen-typescript", path: "./src/codegen/cli.ts" },
  ],
  outDir,
  shims: { deno: false },
  // These are real Node built-ins; dnt maps `node:` specifiers directly.
  test: false,
  typeCheck: "both",
  declaration: "separate",
  compilerOptions: {
    lib: ["ESNext"],
    target: "ES2022",
  },
  package: {
    name: "pkl-typescript",
    version: Deno.args[0] ?? "0.1.0",
    description:
      "TypeScript bindings for Apple Pkl: evaluate Pkl modules from Node.js and generate TypeScript types from Pkl schemas.",
    license: "Apache-2.0",
    keywords: ["pkl", "pkl-lang", "configuration", "config", "bindings", "codegen"],
    engines: { node: ">=18" },
    repository: { type: "git", url: "git+https://github.com/authdog/pkl-typescript.git" },
    dependencies: { "@msgpack/msgpack": "^3.1.2" },
    devDependencies: { "@types/node": "^22" },
  },
  async postBuild() {
    await Deno.copyFile("README.md", `${outDir}/README.md`).catch(() => {});
  },
});
