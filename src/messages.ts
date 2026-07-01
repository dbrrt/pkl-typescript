/**
 * Message codes and payload shapes for the Pkl message-passing API.
 * See https://pkl-lang.org/main/current/bindings-specification/message-passing-api.html
 *
 * Every message on the wire is a two-element MessagePack array:
 * `[code, body]`, where `code` is one of the constants below and `body` is a
 * map of the fields documented per message.
 */
export const MessageCode = {
  CreateEvaluatorRequest: 0x20,
  CreateEvaluatorResponse: 0x21,
  CloseEvaluator: 0x22,
  EvaluateRequest: 0x23,
  EvaluateResponse: 0x24,
  Log: 0x25,
  ReadResourceRequest: 0x26,
  ReadResourceResponse: 0x27,
  ReadModuleRequest: 0x28,
  ReadModuleResponse: 0x29,
  ListResourcesRequest: 0x2a,
  ListResourcesResponse: 0x2b,
  ListModulesRequest: 0x2c,
  ListModulesResponse: 0x2d,
  InitializeModuleReaderRequest: 0x2e,
  InitializeModuleReaderResponse: 0x2f,
  InitializeResourceReaderRequest: 0x30,
  InitializeResourceReaderResponse: 0x31,
  CloseExternalProcess: 0x32,
} as const;

export type MessageCodeValue = (typeof MessageCode)[keyof typeof MessageCode];

// ---- Client -> Server ----

export interface ClientResourceReaderSpec {
  scheme: string;
  hasHierarchicalUris: boolean;
  isGlobbable: boolean;
}

export interface ClientModuleReaderSpec extends ClientResourceReaderSpec {
  isLocal: boolean;
}

export interface HttpProxy {
  proxy?: { address: string; noProxy?: string[] };
}

export interface ProjectOrDependency {
  projectFileUri?: string;
  type?: string;
  packageUri?: string;
  checksums?: { sha256: string };
  dependencies?: Record<string, ProjectOrDependency>;
}

export interface CreateEvaluatorRequest {
  requestId: number;
  allowedModules?: string[];
  allowedResources?: string[];
  clientModuleReaders?: ClientModuleReaderSpec[];
  clientResourceReaders?: ClientResourceReaderSpec[];
  modulePaths?: string[];
  env?: Record<string, string>;
  properties?: Record<string, string>;
  timeoutSeconds?: number;
  rootDir?: string;
  cacheDir?: string;
  outputFormat?: string;
  project?: ProjectOrDependency;
  http?: HttpProxy;
  externalModuleReaders?: Record<string, { executable: string; arguments?: string[] }>;
  externalResourceReaders?: Record<string, { executable: string; arguments?: string[] }>;
}

export interface EvaluateRequest {
  requestId: number;
  evaluatorId: number;
  moduleUri: string;
  moduleText?: string;
  expr?: string;
}

export interface CloseEvaluator {
  evaluatorId: number;
}

export interface ReadResourceResponse {
  requestId: number;
  evaluatorId: number;
  contents?: Uint8Array;
  error?: string;
}

export interface ReadModuleResponse {
  requestId: number;
  evaluatorId: number;
  contents?: string;
  error?: string;
}

export interface PathElement {
  name: string;
  isDirectory: boolean;
}

export interface ListResponse {
  requestId: number;
  evaluatorId: number;
  pathElements?: PathElement[];
  error?: string;
}

// ---- Server -> Client ----

export interface CreateEvaluatorResponse {
  requestId: number;
  evaluatorId?: number;
  error?: string;
}

export interface EvaluateResponse {
  requestId: number;
  evaluatorId: number;
  result?: Uint8Array;
  error?: string;
}

export interface LogMessage {
  evaluatorId: number;
  level: number; // 0 = trace, 1 = warn
  message: string;
  frameUri: string;
}

export interface ReadResourceRequest {
  requestId: number;
  evaluatorId: number;
  uri: string;
}

export interface ReadModuleRequest {
  requestId: number;
  evaluatorId: number;
  uri: string;
}

export interface ListRequest {
  requestId: number;
  evaluatorId: number;
  uri: string;
}
