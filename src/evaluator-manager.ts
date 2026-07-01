import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { Decoder, Encoder } from "@msgpack/msgpack";
import { PklBindingError, PklError } from "./errors.ts";
import {
  type CreateEvaluatorResponse,
  type EvaluateResponse,
  type ListRequest,
  type LogMessage,
  MessageCode,
  type MessageCodeValue,
  type ReadModuleRequest,
  type ReadResourceRequest,
} from "./messages.ts";
import type { ModuleReader, PathElement, ResourceReader } from "./reader.ts";

type Id = number | bigint;

interface PendingEvaluator {
  resolve: (evaluatorId: Id) => void;
  reject: (err: Error) => void;
}

interface PendingEvaluate {
  resolve: (result: Uint8Array) => void;
  reject: (err: Error) => void;
}

/** Per-evaluator state the manager needs to route server-initiated requests. */
export interface EvaluatorHooks {
  moduleReaders: Map<string, ModuleReader>;
  resourceReaders: Map<string, ResourceReader>;
  onLog: (msg: LogMessage) => void;
  pendingEvaluations: Map<string, PendingEvaluate>;
}

/**
 * Owns a single `pkl server` child process and multiplexes the message-passing
 * protocol across any number of {@link Evaluator}s. Most users go through the
 * higher-level `newEvaluator` / `newProjectEvaluator` helpers rather than
 * constructing this directly.
 */
export class EvaluatorManager {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly encoder = new Encoder({ useBigInt64: true });
  private nextRequestId = 1;
  private closed = false;
  private startupError: Error | undefined;

  private readonly pendingCreate = new Map<string, PendingEvaluator>();
  private readonly evaluators = new Map<string, EvaluatorHooks>();

  constructor(command = process.env.PKL_EXECUTABLE || "pkl", args: string[] = []) {
    this.child = spawn(command, [...args, "server"], {
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;

    this.child.on("error", (err) => {
      this.startupError = new PklBindingError(
        `failed to start pkl (command: "${command}"): ${err.message}. ` +
          `Ensure the pkl CLI is installed and on PATH, or set PKL_EXECUTABLE.`,
      );
      this.failAll(this.startupError);
    });

    this.child.on("exit", (code, signal) => {
      if (this.closed) return;
      const err = new PklBindingError(
        `pkl server exited unexpectedly (code=${code}, signal=${signal})`,
      );
      this.failAll(err);
    });

    // Surface pkl's own stderr (stack traces, native crashes) for debugging.
    this.child.stderr.on("data", (chunk: Buffer) => {
      if (process.env.PKL_DEBUG) process.stderr.write(chunk);
    });

    void this.readLoop();
  }

  /** Send a Create Evaluator Request and resolve with the assigned id. */
  createEvaluator(
    body: Record<string, unknown>,
    hooks: EvaluatorHooks,
  ): Promise<Id> {
    if (this.startupError) return Promise.reject(this.startupError);
    const requestId = this.nextRequestId++;
    return new Promise<Id>((resolve, reject) => {
      this.pendingCreate.set(String(requestId), {
        resolve: (evaluatorId) => {
          this.evaluators.set(String(evaluatorId), hooks);
          resolve(evaluatorId);
        },
        reject,
      });
      this.send(MessageCode.CreateEvaluatorRequest, { ...body, requestId });
    });
  }

  /** Send an Evaluate Request and resolve with the raw result bytes. */
  evaluate(evaluatorId: Id, moduleUri: string, moduleText: string | undefined, expr: string | undefined): Promise<Uint8Array> {
    if (this.closed || this.startupError) {
      return Promise.reject(this.startupError ?? new PklBindingError("evaluator manager is closed"));
    }
    const requestId = this.nextRequestId++;
    const hooks = this.evaluators.get(String(evaluatorId));
    if (!hooks) return Promise.reject(new PklBindingError("unknown or closed evaluator"));
    return new Promise<Uint8Array>((resolve, reject) => {
      hooks.pendingEvaluations.set(String(requestId), { resolve, reject });
      const body: Record<string, unknown> = { requestId, evaluatorId, moduleUri };
      if (moduleText !== undefined) body.moduleText = moduleText;
      if (expr !== undefined) body.expr = expr;
      this.send(MessageCode.EvaluateRequest, body);
    });
  }

  /** Tell the server to release an evaluator's resources. */
  closeEvaluator(evaluatorId: Id): void {
    if (this.closed) return;
    this.evaluators.delete(String(evaluatorId));
    this.send(MessageCode.CloseEvaluator, { evaluatorId });
  }

  /** Shut down the server process and reject anything still in flight. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.child.stdin.end();
    } catch {
      // ignore
    }
    this.child.kill();
    this.failAll(new PklBindingError("evaluator manager was closed"));
  }

  get nextId(): number {
    return this.nextRequestId++;
  }

  private send(code: MessageCodeValue, body: Record<string, unknown>): void {
    const encoded = this.encoder.encode([code, body]);
    // Copy out of the encoder's reused buffer before handing to the stream.
    this.child.stdin.write(Buffer.from(encoded));
  }

  private failAll(err: Error): void {
    for (const p of this.pendingCreate.values()) p.reject(err);
    this.pendingCreate.clear();
    for (const hooks of this.evaluators.values()) {
      for (const p of hooks.pendingEvaluations.values()) p.reject(err);
      hooks.pendingEvaluations.clear();
    }
  }

  private async readLoop(): Promise<void> {
    const decoder = new Decoder({ useBigInt64: true });
    try {
      for await (const msg of decoder.decodeStream(this.child.stdout)) {
        if (!Array.isArray(msg) || msg.length !== 2) continue;
        const [code, body] = msg as [number, Record<string, unknown>];
        this.dispatch(code, body);
      }
    } catch (err) {
      if (!this.closed) {
        this.failAll(
          new PklBindingError(
            `error reading from pkl server: ${(err as Error).message}`,
          ),
        );
      }
    }
  }

  private dispatch(code: number, body: Record<string, unknown>): void {
    switch (code) {
      case MessageCode.CreateEvaluatorResponse:
        this.onCreateEvaluatorResponse(body as unknown as CreateEvaluatorResponse);
        break;
      case MessageCode.EvaluateResponse:
        this.onEvaluateResponse(body as unknown as EvaluateResponse);
        break;
      case MessageCode.Log:
        this.onLog(body as unknown as LogMessage);
        break;
      case MessageCode.ReadResourceRequest:
        void this.onReadResource(body as unknown as ReadResourceRequest);
        break;
      case MessageCode.ReadModuleRequest:
        void this.onReadModule(body as unknown as ReadModuleRequest);
        break;
      case MessageCode.ListResourcesRequest:
        void this.onList(body as unknown as ListRequest, "resource");
        break;
      case MessageCode.ListModulesRequest:
        void this.onList(body as unknown as ListRequest, "module");
        break;
      // Initialize*ReaderRequest and CloseExternalProcess are only used by the
      // external-reader protocol, which this binding does not act as.
      default:
        break;
    }
  }

  private onCreateEvaluatorResponse(body: CreateEvaluatorResponse): void {
    const pending = this.pendingCreate.get(String(body.requestId));
    if (!pending) return;
    this.pendingCreate.delete(String(body.requestId));
    if (body.error != null && body.error !== "") {
      pending.reject(new PklBindingError(body.error));
    } else if (body.evaluatorId == null) {
      pending.reject(new PklBindingError("pkl returned no evaluator id"));
    } else {
      pending.resolve(body.evaluatorId as Id);
    }
  }

  private onEvaluateResponse(body: EvaluateResponse): void {
    const hooks = this.evaluators.get(String(body.evaluatorId));
    const pending = hooks?.pendingEvaluations.get(String(body.requestId));
    if (!hooks || !pending) return;
    hooks.pendingEvaluations.delete(String(body.requestId));
    if (body.error != null && body.error !== "") {
      pending.reject(new PklError(body.error));
    } else {
      pending.resolve(body.result ?? new Uint8Array());
    }
  }

  private onLog(body: LogMessage): void {
    const hooks = this.evaluators.get(String(body.evaluatorId));
    hooks?.onLog(body);
  }

  private async onReadResource(body: ReadResourceRequest): Promise<void> {
    const hooks = this.evaluators.get(String(body.evaluatorId));
    const reader = hooks && readerForUri(hooks.resourceReaders, body.uri);
    const respond = (contents?: Uint8Array, error?: string) =>
      this.send(MessageCode.ReadResourceResponse, {
        requestId: body.requestId,
        evaluatorId: body.evaluatorId,
        ...(contents !== undefined ? { contents } : {}),
        ...(error !== undefined ? { error } : {}),
      });
    if (!reader) {
      respond(undefined, `No resource reader registered for scheme of "${body.uri}"`);
      return;
    }
    try {
      const result = await reader.read(body.uri);
      respond(typeof result === "string" ? new TextEncoder().encode(result) : result);
    } catch (err) {
      respond(undefined, (err as Error).message);
    }
  }

  private async onReadModule(body: ReadModuleRequest): Promise<void> {
    const hooks = this.evaluators.get(String(body.evaluatorId));
    const reader = hooks && readerForUri(hooks.moduleReaders, body.uri);
    const respond = (contents?: string, error?: string) =>
      this.send(MessageCode.ReadModuleResponse, {
        requestId: body.requestId,
        evaluatorId: body.evaluatorId,
        ...(contents !== undefined ? { contents } : {}),
        ...(error !== undefined ? { error } : {}),
      });
    if (!reader) {
      respond(undefined, `No module reader registered for scheme of "${body.uri}"`);
      return;
    }
    try {
      respond(await reader.read(body.uri));
    } catch (err) {
      respond(undefined, (err as Error).message);
    }
  }

  private async onList(body: ListRequest, kind: "resource" | "module"): Promise<void> {
    const hooks = this.evaluators.get(String(body.evaluatorId));
    const readers = kind === "resource" ? hooks?.resourceReaders : hooks?.moduleReaders;
    const reader = readers && readerForUri(readers, body.uri);
    const responseCode =
      kind === "resource" ? MessageCode.ListResourcesResponse : MessageCode.ListModulesResponse;
    const respond = (pathElements?: PathElement[], error?: string) =>
      this.send(responseCode, {
        requestId: body.requestId,
        evaluatorId: body.evaluatorId,
        ...(pathElements !== undefined ? { pathElements } : {}),
        ...(error !== undefined ? { error } : {}),
      });
    if (!reader || !reader.listElements) {
      respond(undefined, `Reader for "${body.uri}" does not support listing`);
      return;
    }
    try {
      respond(await reader.listElements(body.uri));
    } catch (err) {
      respond(undefined, (err as Error).message);
    }
  }
}

function schemeOf(uri: string): string {
  const idx = uri.indexOf(":");
  return idx === -1 ? uri : uri.slice(0, idx);
}

function readerForUri<T>(readers: Map<string, T>, uri: string): T | undefined {
  return readers.get(schemeOf(uri));
}
