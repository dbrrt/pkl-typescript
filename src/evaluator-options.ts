import type { ModuleReader, ResourceReader } from "./reader.ts";

/** Log output emitted by Pkl `trace()` calls and evaluator warnings. */
export interface Logger {
  trace(message: string, frameUri: string): void;
  warn(message: string, frameUri: string): void;
}

/** A logger that writes warnings to `stderr` and ignores traces. */
export const noopLogger: Logger = {
  trace() {},
  warn() {},
};

/** A logger that writes both traces and warnings to `stderr`. */
export const stderrLogger: Logger = {
  trace(message, frameUri) {
    process.stderr.write(`pkl: trace: ${message} (${frameUri})\n`);
  },
  warn(message, frameUri) {
    process.stderr.write(`pkl: warn: ${message} (${frameUri})\n`);
  },
};

/**
 * Configuration for an {@link Evaluator}. All fields are optional; the defaults
 * mirror the security posture of `preconfiguredOptions` in the other official
 * bindings: file, package, projectpackage, https, env, prop and pkl resources
 * are allowed, and modules from those schemes may be imported.
 */
export interface EvaluatorOptions {
  /** Allowlist of URI patterns Pkl may resolve as resources (regex-like globs). */
  allowedResources?: string[];
  /** Allowlist of URI patterns Pkl may resolve as modules. */
  allowedModules?: string[];
  /** External properties, readable in Pkl via `read("prop:<name>")`. */
  properties?: Record<string, string>;
  /** Environment variables, readable via `read("env:<name>")`. */
  env?: Record<string, string>;
  /** Directories searched for `modulepath:` imports. */
  modulePaths?: string[];
  /** Evaluation timeout, in seconds. */
  timeoutSeconds?: number;
  /** Restricts file access to below this directory. */
  rootDir?: string;
  /** Directory for the module cache (downloaded packages). */
  cacheDir?: string;
  /** Custom module readers keyed by scheme. */
  moduleReaders?: ModuleReader[];
  /** Custom resource readers keyed by scheme. */
  resourceReaders?: ResourceReader[];
  /** Where Pkl `trace()`/warnings are delivered. Defaults to {@link noopLogger}. */
  logger?: Logger;
  /** Output format for `evaluateOutputText` (e.g. `"json"`, `"yaml"`, `"pcf"`). */
  outputFormat?: string;
  /** Absolute path to a `PklProject` file to load dependency settings from. */
  projectDir?: string;
}

const DEFAULT_ALLOWED_MODULES = [
  "pkl:",
  "repl:",
  "file:",
  "modulepath:",
  "https:",
  "package:",
  "projectpackage:",
];

const DEFAULT_ALLOWED_RESOURCES = [
  "env:",
  "prop:",
  "file:",
  "modulepath:",
  "https:",
  "package:",
  "projectpackage:",
  "pkl:",
];

/** Options equivalent to the CLI defaults; a safe baseline to spread from. */
export function preconfiguredOptions(): EvaluatorOptions {
  return {
    allowedModules: [...DEFAULT_ALLOWED_MODULES],
    allowedResources: [...DEFAULT_ALLOWED_RESOURCES],
    env: { ...process.env } as Record<string, string>,
  };
}
