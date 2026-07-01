/**
 * Custom readers let Pkl resolve `import`s and `read()`s against schemes your
 * host program controls (e.g. `secret:`, `env:`, an in-memory registry).
 *
 * A reader declares the `scheme` it handles and how the URI space behaves, then
 * supplies `read` (and optionally `listElements` for globbing).
 */
export interface ResourceReader {
  /** URI scheme handled by this reader, without the trailing colon (e.g. `"secret"`). */
  scheme: string;
  /**
   * Whether URIs are hierarchical (path-like). Hierarchical URIs support
   * relative resolution and, if `isGlobbable`, globbing.
   */
  hasHierarchicalUris: boolean;
  /** Whether Pkl may enumerate this reader's URIs via glob imports. */
  isGlobbable: boolean;

  /** Return the resource bytes for `uri`. Strings are encoded as UTF-8. */
  read(uri: string): Uint8Array | string | Promise<Uint8Array | string>;

  /** Enumerate the elements directly under `uri`. Required if `isGlobbable`. */
  listElements?(uri: string): PathElement[] | Promise<PathElement[]>;
}

export interface ModuleReader {
  /** URI scheme handled by this reader, without the trailing colon. */
  scheme: string;
  hasHierarchicalUris: boolean;
  isGlobbable: boolean;
  /**
   * Whether resolved modules are treated as local. Local modules may be
   * imported with `import` and can themselves import file-based modules.
   */
  isLocal: boolean;

  /** Return the Pkl source text of the module at `uri`. */
  read(uri: string): string | Promise<string>;

  /** Enumerate the elements directly under `uri`. Required if `isGlobbable`. */
  listElements?(uri: string): PathElement[] | Promise<PathElement[]>;
}

export interface PathElement {
  /** Name of the element relative to its parent. */
  name: string;
  /** Whether the element is a directory (has children). */
  isDirectory: boolean;
}
