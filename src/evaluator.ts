import { decodePklBinary } from "./decoder.ts";
import { PklBindingError } from "./errors.ts";
import type { EvaluatorHooks, EvaluatorManager } from "./evaluator-manager.ts";
import { type EvaluatorOptions, type Logger, noopLogger } from "./evaluator-options.ts";
import type { LogMessage } from "./messages.ts";
import type { ModuleSource } from "./module-source.ts";
import type { ModuleReader, ResourceReader } from "./reader.ts";

/**
 * Evaluates Pkl modules. Obtain one via `newEvaluator` / `newProjectEvaluator`.
 *
 * An Evaluator holds resources in the underlying `pkl server` process and must
 * be {@link close}d when no longer needed. `newEvaluator` returns an evaluator
 * whose {@link close} also shuts down the process it owns.
 */
export class Evaluator {
  private closed = false;

  /** @internal */
  constructor(
    private readonly manager: EvaluatorManager,
    private readonly evaluatorId: number | bigint,
    private readonly ownsManager: boolean,
    private readonly logger: Logger,
  ) {}

  /**
   * Evaluate `source` and decode the whole module into native values (a
   * {@link PklObject}). Equivalent to reading the module's value.
   */
  async evaluateModule<T = unknown>(source: ModuleSource): Promise<T> {
    return this.decode<T>(await this.evaluateRaw(source, undefined));
  }

  /**
   * Evaluate a Pkl `expr` in the context of `source` and decode the result.
   * For example `expr = "metadata.version"` or `"servers[0].port"`.
   */
  async evaluateExpression<T = unknown>(source: ModuleSource, expr: string): Promise<T> {
    return this.decode<T>(await this.evaluateRaw(source, expr));
  }

  /**
   * Evaluate `source` and return its rendered output text (`output.text`),
   * honoring the evaluator's `outputFormat` (JSON, YAML, PCF, …).
   */
  async evaluateOutputText(source: ModuleSource): Promise<string> {
    const raw = await this.evaluateRaw(source, "output.text");
    return this.decode<string>(raw);
  }

  /**
   * Evaluate `source` and parse its JSON rendering into a plain JS value.
   * A convenient shortcut when you just want data, not {@link PklObject}s.
   */
  async evaluateOutputJson<T = unknown>(source: ModuleSource): Promise<T> {
    const bytes = await this.evaluateRaw(
      source,
      "new JsonRenderer {}.renderDocument(output.value)",
    );
    return JSON.parse(this.decode<string>(bytes)) as T;
  }

  /** The raw, undecoded Pkl binary bytes for `expr` (or the whole module). */
  async evaluateRaw(source: ModuleSource, expr: string | undefined): Promise<Uint8Array> {
    if (this.closed) throw new PklBindingError("evaluator is closed");
    return this.manager.evaluate(this.evaluatorId, source.uri, source.text, expr);
  }

  private decode<T>(bytes: Uint8Array): T {
    return decodePklBinary(bytes) as T;
  }

  /** Release this evaluator (and, if it owns one, its `pkl server` process). */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.manager.closeEvaluator(this.evaluatorId);
    if (this.ownsManager) this.manager.close();
  }

  [Symbol.dispose](): void {
    this.close();
  }
}

/** Build the Create Evaluator Request body from user options. */
export function buildCreateRequest(options: EvaluatorOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (options.allowedModules) body.allowedModules = options.allowedModules;
  if (options.allowedResources) body.allowedResources = options.allowedResources;
  if (options.properties) body.properties = options.properties;
  if (options.env) body.env = options.env;
  if (options.modulePaths) body.modulePaths = options.modulePaths;
  if (options.timeoutSeconds != null) body.timeoutSeconds = options.timeoutSeconds;
  if (options.rootDir) body.rootDir = options.rootDir;
  if (options.cacheDir) body.cacheDir = options.cacheDir;
  if (options.outputFormat) body.outputFormat = options.outputFormat;

  if (options.moduleReaders?.length) {
    body.clientModuleReaders = options.moduleReaders.map((r) => ({
      scheme: r.scheme,
      hasHierarchicalUris: r.hasHierarchicalUris,
      isGlobbable: r.isGlobbable,
      isLocal: r.isLocal,
    }));
  }
  if (options.resourceReaders?.length) {
    body.clientResourceReaders = options.resourceReaders.map((r) => ({
      scheme: r.scheme,
      hasHierarchicalUris: r.hasHierarchicalUris,
      isGlobbable: r.isGlobbable,
    }));
  }
  return body;
}

/** Build the per-evaluator hooks the manager uses for routing. */
export function buildHooks(options: EvaluatorOptions): EvaluatorHooks {
  const logger = options.logger ?? noopLogger;
  const moduleReaders = new Map<string, ModuleReader>();
  for (const r of options.moduleReaders ?? []) moduleReaders.set(r.scheme, r);
  const resourceReaders = new Map<string, ResourceReader>();
  for (const r of options.resourceReaders ?? []) resourceReaders.set(r.scheme, r);
  return {
    moduleReaders,
    resourceReaders,
    pendingEvaluations: new Map(),
    onLog: (msg: LogMessage) => {
      if (msg.level === 0) logger.trace(msg.message, msg.frameUri);
      else logger.warn(msg.message, msg.frameUri);
    },
  };
}
