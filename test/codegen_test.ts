import { assertStringIncludes } from "@std/assert";
import { fromFileUrl } from "@std/path";
import { generateTypes } from "../src/codegen/index.ts";

const fixture = fromFileUrl(new URL("./fixtures/config.pkl", import.meta.url));

Deno.test("generateTypes: emits interfaces and maps Pkl types", async () => {
  const { filename, contents } = await generateTypes(fixture);

  assertStringIncludes(filename, "config.pkl.ts");
  assertStringIncludes(contents, "DO NOT EDIT");

  // Module interface, named after the file.
  assertStringIncludes(contents, "export interface Config {");
  assertStringIncludes(contents, "name: string;");
  assertStringIncludes(contents, "replicas: number;");
  assertStringIncludes(contents, "enabled: boolean;");
  assertStringIncludes(contents, "tags: string[];");
  assertStringIncludes(contents, "labels: Map<string, string>;");
  assertStringIncludes(contents, "ports: Set<number>;");
  assertStringIncludes(contents, "coords: Pair<number, number>;");
  assertStringIncludes(contents, "timeout: Duration;");
  assertStringIncludes(contents, "maxSize: DataSize;");
  assertStringIncludes(contents, "nickname: string | null;");
  assertStringIncludes(contents, "endpoints: Endpoint[];");

  // Nested class interface with a string-literal union.
  assertStringIncludes(contents, "export interface Endpoint {");
  assertStringIncludes(contents, 'method: "GET" | "POST";');

  // Runtime type import.
  assertStringIncludes(contents, "import type { DataSize, Duration, Pair }");

  // Doc comments are carried over.
  assertStringIncludes(contents, "/** The service name. */");
});
