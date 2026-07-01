#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { generateTypes } from "./generator.ts";

interface CliArgs {
  modules: string[];
  outDir: string;
  packageName?: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { modules: [], outDir: ".", help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "-h":
      case "--help":
        args.help = true;
        break;
      case "-o":
      case "--out-dir":
        args.outDir = argv[++i] ?? ".";
        break;
      case "--package-name":
        args.packageName = argv[++i];
        break;
      default:
        if (a && a.startsWith("-")) {
          throw new Error(`unknown option: ${a}`);
        } else if (a) {
          args.modules.push(a);
        }
    }
  }
  return args;
}

const USAGE = `pkl-gen-typescript — generate TypeScript types from Pkl modules

Usage:
  pkl-gen-typescript [options] <module.pkl> [<module.pkl> ...]

Options:
  -o, --out-dir <dir>       Directory to write generated .ts files (default: .)
      --package-name <name> Import specifier for runtime types (default: pkl-typescript)
  -h, --help                Show this help
`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.modules.length === 0) {
    process.stdout.write(USAGE);
    process.exit(args.help ? 0 : 1);
  }

  const outDir = resolve(args.outDir);
  mkdirSync(outDir, { recursive: true });

  for (const modulePath of args.modules) {
    const file = await generateTypes(modulePath, {
      packageName: args.packageName,
    });
    const target = join(outDir, file.filename);
    writeFileSync(target, file.contents);
    process.stdout.write(`generated ${target}\n`);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`pkl-gen-typescript: ${(err as Error).message}\n`);
  process.exit(1);
});
