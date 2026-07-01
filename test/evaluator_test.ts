import { assert, assertEquals, assertInstanceOf, assertRejects } from "@std/assert";
import { fromFileUrl } from "@std/path";
import {
  DataSize,
  Duration,
  FileSource,
  newEvaluator,
  Pair,
  PklError,
  PklObject,
  type ResourceReader,
  TextSource,
} from "../src/index.ts";

const fixture = fromFileUrl(new URL("./fixtures/config.pkl", import.meta.url));

Deno.test("evaluateExpression: primitive arithmetic", async () => {
  const ev = await newEvaluator();
  try {
    assertEquals(await ev.evaluateExpression(TextSource("res = 1 + 2"), "res"), 3);
    assertEquals(await ev.evaluateExpression(TextSource('res = "a" + "b"'), "res"), "ab");
    assertEquals(await ev.evaluateExpression(TextSource("res = true"), "res"), true);
  } finally {
    ev.close();
  }
});

Deno.test("evaluateModule: decodes a full module into a PklObject", async () => {
  const ev = await newEvaluator();
  try {
    const cfg = await ev.evaluateModule<PklObject>(FileSource(fixture));
    assertInstanceOf(cfg, PklObject);
    assertEquals(cfg.name, "svc");
    assertEquals(cfg.replicas, 3);
    assertEquals(cfg.enabled, true);
    assertEquals(cfg.ratio, 0.5);
    assertEquals(cfg.nickname, null);

    assertInstanceOf(cfg.timeout, Duration);
    assertEquals((cfg.timeout as Duration).toUnit("s"), 30);

    assertInstanceOf(cfg.maxSize, DataSize);
    assertEquals((cfg.maxSize as DataSize).toUnit("mib"), 10);

    assertEquals(cfg.tags, ["a", "b", "c"]);

    assertInstanceOf(cfg.labels, Map);
    assertEquals((cfg.labels as Map<string, string>).get("env"), "prod");

    assertInstanceOf(cfg.ports, Set);
    assert((cfg.ports as Set<number>).has(443));

    assertInstanceOf(cfg.coords, Pair);
    assertEquals((cfg.coords as Pair).first, 1);
    assertEquals((cfg.coords as Pair).second, 2);

    const endpoints = cfg.endpoints as PklObject[];
    assertEquals(endpoints.length, 2);
    assertEquals(endpoints[0].path, "/health");
    assertEquals(endpoints[0].method, "GET");
    assertEquals(endpoints[1].method, "POST");
  } finally {
    ev.close();
  }
});

Deno.test("evaluateExpression: navigate into the module", async () => {
  const ev = await newEvaluator();
  try {
    assertEquals(await ev.evaluateExpression(FileSource(fixture), "replicas"), 3);
    assertEquals(await ev.evaluateExpression(FileSource(fixture), "endpoints[1].path"), "/submit");
  } finally {
    ev.close();
  }
});

Deno.test("evaluateOutputText: renders JSON", async () => {
  const ev = await newEvaluator({ outputFormat: "json" });
  try {
    const text = await ev.evaluateOutputText(TextSource('x = 1\ny = "hi"'));
    const parsed = JSON.parse(text);
    assertEquals(parsed, { x: 1, y: "hi" });
  } finally {
    ev.close();
  }
});

Deno.test("evaluateOutputJson: parses rendered JSON", async () => {
  const ev = await newEvaluator();
  try {
    const val = await ev.evaluateOutputJson<{ a: number[] }>(
      TextSource("a = new Listing { 1; 2; 3 }"),
    );
    assertEquals(val.a, [1, 2, 3]);
  } finally {
    ev.close();
  }
});

Deno.test("custom resource reader", async () => {
  const reader: ResourceReader = {
    scheme: "secret",
    hasHierarchicalUris: false,
    isGlobbable: false,
    read(uri) {
      return `value-for-${uri.slice("secret:".length)}`;
    },
  };
  const ev = await newEvaluator({
    resourceReaders: [reader],
    allowedResources: ["secret:"],
  });
  try {
    const val = await ev.evaluateExpression(
      TextSource('res = read("secret:token").text'),
      "res",
    );
    assertEquals(val, "value-for-token");
  } finally {
    ev.close();
  }
});

Deno.test("PklError on evaluation failure", async () => {
  const ev = await newEvaluator();
  try {
    await assertRejects(
      () => ev.evaluateExpression(TextSource("x = 1 / 0 as Int"), "x"),
      PklError,
    );
    // Evaluator remains usable after an error.
    assertEquals(await ev.evaluateExpression(TextSource("y = 5"), "y"), 5);
  } finally {
    ev.close();
  }
});

Deno.test("using disposes the evaluator", async () => {
  {
    using ev = await newEvaluator();
    assertEquals(await ev.evaluateExpression(TextSource("z = 42"), "z"), 42);
  }
});
