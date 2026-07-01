import { Decoder } from "@msgpack/msgpack";
import { PklBindingError } from "./errors.ts";
import {
  ClassRef,
  DataSize,
  DataSizeUnit,
  Duration,
  DurationUnit,
  IntSeq,
  Pair,
  PklObject,
  Regex,
  TypeAliasRef,
} from "./pkl.ts";

/** Type codes for Pkl's binary value encoding (slot 0 of each array). */
enum Code {
  Object = 0x1,
  Map = 0x2,
  Mapping = 0x3,
  List = 0x4,
  Listing = 0x5,
  Set = 0x6,
  Duration = 0x7,
  DataSize = 0x8,
  Pair = 0x9,
  IntSeq = 0xa,
  Regex = 0xb,
  Class = 0xc,
  TypeAlias = 0xd,
  Function = 0xe,
  Bytes = 0xf,
  // Object members
  Property = 0x10,
  Entry = 0x11,
  Element = 0x12,
}

/**
 * Decode the `result` bytes of an Evaluate Response (Pkl binary encoding) into
 * native JavaScript values. See {@link PklObject} and the classes in `pkl.ts`
 * for how each Pkl type maps onto JavaScript.
 */
export function decodePklBinary(bytes: Uint8Array): unknown {
  // `useBigInt64` keeps 64-bit Pkl integers exact (they arrive as `bigint`;
  // smaller ints stay `number`). MessagePack maps decode to plain objects, so
  // Pkl `Map`/`Mapping` keys are stringified when converted to a JS `Map`.
  const decoder = new Decoder({ useBigInt64: true });
  const raw = decoder.decode(bytes);
  return decodeValue(raw);
}

function decodeValue(v: unknown): unknown {
  // Primitives (and null) pass through as decoded by MessagePack. Everything
  // non-primitive is encoded as an array whose first element is a type code.
  if (v === null || typeof v !== "object") return v;
  if (v instanceof Uint8Array) return v; // top-level msgpack bin (rare)
  if (!Array.isArray(v)) {
    // Should not happen for well-formed Pkl output, but be defensive.
    throw new PklBindingError(
      `unexpected non-array object in Pkl binary encoding: ${typeof v}`,
    );
  }
  return decodeArray(v);
}

function decodeArray(arr: unknown[]): unknown {
  const code = arr[0] as number;
  switch (code) {
    case Code.Object:
      return decodeObject(arr);
    case Code.Map:
    case Code.Mapping:
      return decodeMap(arr[1]);
    case Code.List:
    case Code.Listing:
      return decodeList(arr[1]);
    case Code.Set:
      return new Set(decodeList(arr[1]));
    case Code.Duration:
      return new Duration(arr[1] as number, arr[2] as DurationUnit);
    case Code.DataSize:
      return new DataSize(arr[1] as number, arr[2] as DataSizeUnit);
    case Code.Pair:
      return new Pair(decodeValue(arr[1]), decodeValue(arr[2]));
    case Code.IntSeq:
      return new IntSeq(arr[1] as number, arr[2] as number, arr[3] as number);
    case Code.Regex:
      return new Regex(arr[1] as string);
    case Code.Class:
      return new ClassRef(arr[1] as string, arr[2] as string);
    case Code.TypeAlias:
      return new TypeAliasRef(arr[1] as string, arr[2] as string);
    case Code.Bytes:
      return arr[1] as Uint8Array;
    case Code.Function:
      throw new PklBindingError(
        "cannot decode a Pkl function value; functions cannot cross the binding boundary",
      );
    default:
      throw new PklBindingError(
        `unknown Pkl binary encoding type code: 0x${code.toString(16)}`,
      );
  }
}

function decodeList(v: unknown): unknown[] {
  const arr = v as unknown[];
  return arr.map(decodeValue);
}

function decodeMap(v: unknown): Map<unknown, unknown> {
  const out = new Map<unknown, unknown>();
  // MessagePack maps decode to a JS Map by default in @msgpack/msgpack only
  // when configured; the default decodes to an object. Pkl uses map format, so
  // we accept both a Map and a plain object here.
  if (v instanceof Map) {
    for (const [k, val] of v) out.set(decodeValue(k), decodeValue(val));
  } else if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out.set(k, decodeValue(val));
    }
  }
  return out;
}

function decodeObject(arr: unknown[]): PklObject {
  const className = arr[1] as string;
  const moduleUri = arr[2] as string;
  const members = (arr[3] as unknown[]) ?? [];

  const properties: Record<string, unknown> = {};
  const entries = new Map<unknown, unknown>();
  const elements: unknown[] = [];

  for (const m of members) {
    const member = m as unknown[];
    const memberCode = member[0] as number;
    switch (memberCode) {
      case Code.Property:
        properties[member[1] as string] = decodeValue(member[2]);
        break;
      case Code.Entry:
        entries.set(decodeValue(member[1]), decodeValue(member[2]));
        break;
      case Code.Element:
        elements[member[1] as number] = decodeValue(member[2]);
        break;
      default:
        throw new PklBindingError(
          `unknown Pkl object member code: 0x${memberCode.toString(16)}`,
        );
    }
  }

  return new PklObject(className, moduleUri, properties, entries, elements);
}
