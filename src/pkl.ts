/**
 * Runtime representations of Pkl values that have no natural JavaScript
 * equivalent. Primitive Pkl values decode to their obvious JS counterparts
 * (String -> string, Int/Float -> number, Boolean -> boolean, Null -> null),
 * and collections decode to native structures:
 *
 *   - `List` / `Listing`       -> Array
 *   - `Set`                    -> Set
 *   - `Map` / `Mapping`        -> Map
 *   - `Dynamic` / typed objects -> {@link PklObject}
 *
 * The classes below cover the remaining structured Pkl types.
 */

/** A Pkl `Duration` (e.g. `5.min`), normalized to its declared unit. */
export class Duration {
  constructor(
    readonly value: number,
    readonly unit: DurationUnit,
  ) {}

  /** The duration converted to a plain number of the given unit. */
  toUnit(unit: DurationUnit): number {
    return (this.value * DURATION_NANOS[this.unit]) / DURATION_NANOS[unit];
  }

  /** Nanoseconds as a number (may lose precision for very large values). */
  get nanos(): number {
    return this.value * DURATION_NANOS[this.unit];
  }

  toString(): string {
    return `${this.value}.${this.unit}`;
  }
}

export type DurationUnit = "ns" | "us" | "ms" | "s" | "min" | "h" | "d";

const DURATION_NANOS: Record<DurationUnit, number> = {
  ns: 1,
  us: 1e3,
  ms: 1e6,
  s: 1e9,
  min: 60e9,
  h: 3600e9,
  d: 86400e9,
};

/** A Pkl `DataSize` (e.g. `1.5.gib`), normalized to its declared unit. */
export class DataSize {
  constructor(
    readonly value: number,
    readonly unit: DataSizeUnit,
  ) {}

  /** The size converted to a plain number of the given unit. */
  toUnit(unit: DataSizeUnit): number {
    return (this.value * DATASIZE_BYTES[this.unit]) / DATASIZE_BYTES[unit];
  }

  /** Bytes as a number (may lose precision for very large values). */
  get bytes(): number {
    return this.value * DATASIZE_BYTES[this.unit];
  }

  toString(): string {
    return `${this.value}.${this.unit}`;
  }
}

export type DataSizeUnit =
  | "b"
  | "kb"
  | "mb"
  | "gb"
  | "tb"
  | "pb"
  | "kib"
  | "mib"
  | "gib"
  | "tib"
  | "pib";

const DATASIZE_BYTES: Record<DataSizeUnit, number> = {
  b: 1,
  kb: 1e3,
  mb: 1e6,
  gb: 1e9,
  tb: 1e12,
  pb: 1e15,
  kib: 2 ** 10,
  mib: 2 ** 20,
  gib: 2 ** 30,
  tib: 2 ** 40,
  pib: 2 ** 50,
};

/** A Pkl `Pair<A, B>`. */
export class Pair<A = unknown, B = unknown> {
  constructor(
    readonly first: A,
    readonly second: B,
  ) {}
}

/** A Pkl `IntSeq` (e.g. `IntSeq(1, 10).step(2)`). */
export class IntSeq {
  constructor(
    readonly start: number,
    readonly end: number,
    readonly step: number,
  ) {}

  /** Materialize the sequence into an array of numbers. */
  toArray(): number[] {
    const out: number[] = [];
    if (this.step > 0) {
      for (let i = this.start; i <= this.end; i += this.step) out.push(i);
    } else if (this.step < 0) {
      for (let i = this.start; i >= this.end; i += this.step) out.push(i);
    }
    return out;
  }

  [Symbol.iterator](): Iterator<number> {
    return this.toArray()[Symbol.iterator]();
  }
}

/** A Pkl `Regex`. `toRegExp()` produces a JavaScript `RegExp`. */
export class Regex {
  constructor(readonly pattern: string) {}

  toRegExp(flags?: string): RegExp {
    return new RegExp(this.pattern, flags);
  }

  toString(): string {
    return this.pattern;
  }
}

/** A reference to a Pkl `Class` value. */
export class ClassRef {
  constructor(
    readonly name: string,
    readonly moduleUri: string,
  ) {}
}

/** A reference to a Pkl `TypeAlias` value. */
export class TypeAliasRef {
  constructor(
    readonly name: string,
    readonly moduleUri: string,
  ) {}
}

/**
 * A structured Pkl object: either a `Dynamic` or an instance of a typed Pkl
 * class (including modules, which are objects too).
 *
 * Properties are exposed as own-enumerable fields, so ordinary property access
 * and destructuring work: `obj.host`, `const { host } = obj`. Keyed entries
 * (from a `Mapping`-like body) and list elements are kept separately and can be
 * read via {@link entries} and {@link elements}.
 *
 * The Pkl class name and defining module URI are attached as non-enumerable
 * metadata so they do not interfere with `JSON.stringify` or iteration.
 */
export class PklObject {
  /** Fully-qualified name of the Pkl class, or `"Dynamic"`. */
  readonly $className!: string;
  /** URI of the module that defines the class (empty for `Dynamic`). */
  readonly $moduleUri!: string;
  private readonly $entries!: Map<unknown, unknown>;
  private readonly $elements!: unknown[];

  constructor(
    className: string,
    moduleUri: string,
    properties: Record<string, unknown>,
    entries: Map<unknown, unknown>,
    elements: unknown[],
  ) {
    Object.assign(this, properties);
    Object.defineProperty(this, "$className", {
      value: className,
      enumerable: false,
    });
    Object.defineProperty(this, "$moduleUri", {
      value: moduleUri,
      enumerable: false,
    });
    Object.defineProperty(this, "$entries", {
      value: entries,
      enumerable: false,
    });
    Object.defineProperty(this, "$elements", {
      value: elements,
      enumerable: false,
    });
  }

  /** Keyed entries declared in the object body (e.g. `["key"] = value`). */
  get entries(): Map<unknown, unknown> {
    return this.$entries;
  }

  /** Positional elements declared in the object body (e.g. `new { 1; 2 }`). */
  get elements(): readonly unknown[] {
    return this.$elements;
  }

  /** The named properties of this object as a plain record. */
  toObject(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(this)) out[key] = (this as any)[key];
    return out;
  }

  // Allow arbitrary property access under strict indexing.
  [key: string]: unknown;
}
