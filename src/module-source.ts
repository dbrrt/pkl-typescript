import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * A source of Pkl to evaluate. Either a reference to a module by URI/path, or
 * literal Pkl text with an associated (possibly synthetic) URI.
 */
export interface ModuleSource {
  /** The URI the evaluator uses to identify and resolve the module. */
  uri: string;
  /** Literal module text, when the source is not read from `uri`. */
  text?: string;
}

/** Evaluate a Pkl module from a local file path. */
export function FileSource(...pathParts: string[]): ModuleSource {
  const abs = resolve(...pathParts);
  return { uri: pathToFileURL(abs).toString() };
}

/** Evaluate a Pkl module identified by an absolute URI (e.g. `package://…`, `https://…`, `pkl:…`). */
export function UriSource(uri: string): ModuleSource {
  return { uri };
}

/**
 * Evaluate literal Pkl text. The optional `uri` names the synthetic module so
 * relative imports and error messages have a sensible base; it defaults to
 * `repl:text`.
 */
export function TextSource(text: string, uri = "repl:text"): ModuleSource {
  return { uri, text };
}
