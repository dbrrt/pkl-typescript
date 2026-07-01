import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { isAbsolute, resolve } from "node:path";
import { buildCreateRequest, buildHooks, Evaluator } from "./evaluator.ts";
import { EvaluatorManager } from "./evaluator-manager.ts";
import {
  type EvaluatorOptions,
  noopLogger,
  preconfiguredOptions,
} from "./evaluator-options.ts";
import { PklBindingError } from "./errors.ts";
import { decodePklBinary } from "./decoder.ts";
import type { ProjectOrDependency } from "./messages.ts";

export {
  Evaluator,
} from "./evaluator.ts";
export { EvaluatorManager } from "./evaluator-manager.ts";
export {
  type EvaluatorOptions,
  type Logger,
  noopLogger,
  stderrLogger,
  preconfiguredOptions,
} from "./evaluator-options.ts";
export { PklError, PklBindingError } from "./errors.ts";
export {
  type ModuleSource,
  FileSource,
  TextSource,
  UriSource,
} from "./module-source.ts";
export {
  type ModuleReader,
  type ResourceReader,
  type PathElement,
} from "./reader.ts";
export {
  ClassRef,
  DataSize,
  type DataSizeUnit,
  Duration,
  type DurationUnit,
  IntSeq,
  Pair,
  PklObject,
  Regex,
  TypeAliasRef,
} from "./pkl.ts";
export { decodePklBinary } from "./decoder.ts";

/**
 * Create an {@link Evaluator} backed by a freshly spawned `pkl server` process.
 * The returned evaluator owns that process; calling {@link Evaluator.close}
 * shuts it down. Options default to {@link preconfiguredOptions}.
 *
 * ```ts
 * const ev = await newEvaluator();
 * try {
 *   const cfg = await ev.evaluateModule(FileSource("config.pkl"));
 * } finally {
 *   ev.close();
 * }
 * ```
 */
export async function newEvaluator(
  options: EvaluatorOptions = {},
  pklCommand?: string,
): Promise<Evaluator> {
  const merged: EvaluatorOptions = { ...preconfiguredOptions(), ...options };
  const manager = new EvaluatorManager(pklCommand);
  return await spawnEvaluator(manager, merged, true);
}

/**
 * Create an evaluator configured from a `PklProject` file, so that dependency
 * resolution and project-declared settings apply. `projectDir` is the directory
 * containing `PklProject`.
 */
export async function newProjectEvaluator(
  projectDir: string,
  options: EvaluatorOptions = {},
  pklCommand?: string,
): Promise<Evaluator> {
  const dir = isAbsolute(projectDir) ? projectDir : resolve(projectDir);
  const manager = new EvaluatorManager(pklCommand);
  const merged: EvaluatorOptions = {
    ...preconfiguredOptions(),
    ...options,
    projectDir: dir,
  };
  // Load the project's deps by evaluating its PklProject with a throwaway
  // evaluator, then attach the resolved project to the real create request.
  const project = await loadProject(manager, merged, dir);
  return await spawnEvaluator(manager, merged, true, project);
}

async function spawnEvaluator(
  manager: EvaluatorManager,
  options: EvaluatorOptions,
  ownsManager: boolean,
  project?: ProjectOrDependency,
): Promise<Evaluator> {
  const body = buildCreateRequest(options);
  if (project) body.project = project;
  const hooks = buildHooks(options);
  try {
    const evaluatorId = await manager.createEvaluator(body, hooks);
    return new Evaluator(manager, evaluatorId, ownsManager, options.logger ?? noopLogger);
  } catch (err) {
    if (ownsManager) manager.close();
    throw err;
  }
}

/**
 * Evaluate a project's `PklProject` and `PklProject.deps.json` into the
 * dependency structure the Create Evaluator Request expects.
 */
async function loadProject(
  manager: EvaluatorManager,
  options: EvaluatorOptions,
  dir: string,
): Promise<ProjectOrDependency> {
  const projectFile = resolve(dir, "PklProject");
  const projectFileUri = pathToFileURL(projectFile).toString();

  // Evaluate the project's declared dependencies via the pkl:Project schema.
  const body = buildCreateRequest(options);
  const hooks = buildHooks(options);
  const evaluatorId = await manager.createEvaluator(body, hooks);
  try {
    const bytes = await manager.evaluate(
      evaluatorId,
      projectFileUri,
      undefined,
      "import(\"pkl:Project\").resolve(module).dependencies",
    );
    const deps = decodePklBinary(bytes);
    return toProject(projectFileUri, deps);
  } catch {
    // If the project has no resolvable dependencies, fall back to just naming
    // the project file so relative imports still resolve.
    return { projectFileUri };
  } finally {
    manager.closeEvaluator(evaluatorId);
  }
}

function toProject(projectFileUri: string, deps: unknown): ProjectOrDependency {
  const dependencies: Record<string, ProjectOrDependency> = {};
  if (deps && typeof deps === "object") {
    const entries = deps instanceof Map ? deps : Object.entries(deps as object);
    for (const [name, dep] of entries as Iterable<[unknown, any]>) {
      dependencies[String(name)] = {
        type: dep?.type ?? "local",
        packageUri: dep?.packageUri,
        projectFileUri: dep?.projectFileUri,
      };
    }
  }
  return { projectFileUri, dependencies };
}

/** Read a local file's bytes (used by the codegen CLI for module text). */
export function readModuleFile(path: string): string {
  if (!path) throw new PklBindingError("empty module path");
  return readFileSync(path, "utf8");
}
