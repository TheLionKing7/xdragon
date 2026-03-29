/**
 * PLACE AT: xdragon/app/ui/app/src/gotypes.ts
 *
 * Class-based types matching the original xDragon Go backend contracts.
 * REPLACES the interface-only version we created earlier.
 */

// ── User ────────────────────────────────────────────────────
export class User {
  id:        string;
  email:     string;
  name?:     string;
  avatarurl?: string;
  plan?:     string;

  constructor(data: Partial<User> = {}) {
    this.id        = data.id        ?? "";
    this.email     = data.email     ?? "";
    this.name      = data.name;
    this.avatarurl = data.avatarurl;
    this.plan      = data.plan;
  }
}

// ── Model ────────────────────────────────────────────────────
export class Model {
  model:       string;
  digest?:     string;
  modified_at?: Date;

  constructor(data: Partial<{ model: string; digest: string; modified_at: Date }> = {}) {
    this.model       = data.model       ?? "";
    this.digest      = data.digest;
    this.modified_at = data.modified_at;
  }

  isCloud(): boolean {
    return this.model.endsWith("cloud");
  }
}

// ── Message ──────────────────────────────────────────────────
export class Message {
  role:     "user" | "assistant" | "system" | "tool";
  content:  string;
  images?:  string[];
  id?:      string;
  createdAt?: string;

  constructor(data: Partial<Message> = {}) {
    this.role      = data.role      ?? "user";
    this.content   = data.content   ?? "";
    this.images    = data.images;
    this.id        = data.id;
    this.createdAt = data.createdAt;
  }
}

// ── Chat ─────────────────────────────────────────────────────
export class Chat {
  id:          string;
  title?:      string;
  userExcerpt?: string;
  createdAt:   string;
  updatedAt:   string;

  constructor(data: Partial<Chat> = {}) {
    this.id          = data.id          ?? "";
    this.title       = data.title;
    this.userExcerpt = data.userExcerpt;
    this.createdAt   = data.createdAt   ?? new Date().toISOString();
    this.updatedAt   = data.updatedAt   ?? new Date().toISOString();
  }
}

// ── ChatsResponse ────────────────────────────────────────────
export class ChatsResponse {
  items: Chat[];

  constructor(data: Partial<{ items: unknown[] }> = {}) {
    this.items = (data.items ?? []).map((c) => new Chat(c as Partial<Chat>));
  }
}

// ── ChatResponse ─────────────────────────────────────────────
export class ChatResponse {
  id:        string;
  messages:  Message[];
  createdAt: string;
  updatedAt: string;
  title?:    string;

  constructor(data: Partial<ChatResponse> = {}) {
    this.id        = data.id        ?? "";
    this.messages  = (data.messages ?? []).map((m) => new Message(m));
    this.createdAt = data.createdAt ?? new Date().toISOString();
    this.updatedAt = data.updatedAt ?? new Date().toISOString();
    this.title     = data.title;
  }
}

// ── ChatRequest ──────────────────────────────────────────────
export class ChatRequest {
  model:        string;
  prompt:       string;
  index?:       number;
  attachments?: { filename: string; data: string }[];
  web_search:   boolean;
  file_tools:   boolean;
  forceUpdate?: boolean;
  think?:       boolean | string;

  constructor(data: Partial<ChatRequest> = {}) {
    this.model       = data.model       ?? "";
    this.prompt      = data.prompt      ?? "";
    this.index       = data.index;
    this.attachments = data.attachments;
    this.web_search  = data.web_search  ?? false;
    this.file_tools  = data.file_tools  ?? false;
    this.forceUpdate = data.forceUpdate;
    this.think       = data.think;
  }
}

// ── ChatEvent ────────────────────────────────────────────────
export class ChatEvent {
  eventName: string;
  message?:  Partial<Message>;
  done?:     boolean;
  [key: string]: unknown;

  constructor(data: Record<string, unknown> = {}) {
    this.eventName = (data.eventName as string) ?? "chat";
    this.message   = data.message   as Partial<Message>;
    this.done      = data.done      as boolean;
    Object.assign(this, data);
  }
}

// ── DownloadEvent ─────────────────────────────────────────────
export class DownloadEvent {
  eventName:  string;
  status:     string;
  digest?:    string;
  total?:     number;
  completed?: number;
  error?:     string;

  constructor(data: Partial<DownloadEvent> = {}) {
    this.eventName = "download";
    this.status    = (data as Record<string,unknown>).status as string ?? "";
    this.digest    = (data as Record<string,unknown>).digest    as string;
    this.total     = (data as Record<string,unknown>).total     as number;
    this.completed = (data as Record<string,unknown>).completed as number;
    this.error     = (data as Record<string,unknown>).error     as string;
  }
}

// ── ErrorEvent ───────────────────────────────────────────────
export class ErrorEvent {
  eventName: string;
  error:     string;
  message?:  string;

  constructor(data: Partial<ErrorEvent> = {}) {
    this.eventName = "error";
    this.error     = (data as Record<string,unknown>).error   as string ?? "";
    this.message   = (data as Record<string,unknown>).message as string;
  }
}

// ── Settings ─────────────────────────────────────────────────
export class Settings {
  Expose:        boolean;
  Browser:       boolean;
  Models:        string;
  NumCtx:        number;
  AgentMode:     boolean;
  Cloud:         boolean;
  AutoUpdate:    boolean;
  ModelDir:      string;
  [key: string]: unknown;

  constructor(data: Partial<Record<string, unknown>> = {}) {
    this.Expose     = Boolean(data.Expose     ?? data.expose     ?? false);
    this.Browser    = Boolean(data.Browser    ?? data.browser    ?? false);
    this.Models     = String (data.Models     ?? data.models     ?? "");
    this.NumCtx     = Number (data.NumCtx     ?? data.num_ctx    ?? 0);
    this.AgentMode  = Boolean(data.AgentMode  ?? data.agentMode  ?? false);
    this.Cloud      = Boolean(data.Cloud      ?? data.cloud      ?? false);
    this.AutoUpdate = Boolean(data.AutoUpdate ?? data.autoUpdate ?? false);
    this.ModelDir   = String (data.ModelDir   ?? data.modelDir   ?? "");
    Object.assign(this, data);
  }
}

// ── ModelCapabilitiesResponse ─────────────────────────────────
export class ModelCapabilitiesResponse {
  capabilities: string[];

  constructor(data: Partial<{ capabilities: string[] }> = {}) {
    this.capabilities = data.capabilities ?? [];
  }

  supportsVision(): boolean {
    return this.capabilities.includes("vision");
  }
  supportsTools(): boolean {
    return this.capabilities.includes("tools");
  }
}

// ── InferenceComputeResponse ──────────────────────────────────
export class InferenceComputeResponse {
  type:    string;
  label:   string;
  memory?: number;

  constructor(data: Partial<InferenceComputeResponse> = {}) {
    this.type   = data.type   ?? "cpu";
    this.label  = data.label  ?? "CPU";
    this.memory = data.memory;
  }
}

// ── File / Attachment ─────────────────────────────────────────
export class File {
  name:     string;
  type:     string;
  size:     number;
  data?:    string;    // base64
  content?: string;   // text content

  constructor(data: Partial<File> = {}) {
    this.name    = (data as Record<string,unknown>).name    as string ?? "";
    this.type    = (data as Record<string,unknown>).type    as string ?? "";
    this.size    = (data as Record<string,unknown>).size    as number ?? 0;
    this.data    = (data as Record<string,unknown>).data    as string;
    this.content = (data as Record<string,unknown>).content as string;
  }
}

// ── Conversation / Session ────────────────────────────────────
export class Conversation {
  id:        string;
  messages:  Message[];
  model:     string;
  createdAt: string;
  updatedAt: string;

  constructor(data: Partial<Record<string,unknown>> = {}) {
    this.id        = data.id        as string ?? "";
    this.messages  = ((data.messages as unknown[]) ?? []).map((m) => new Message(m as Partial<Message>));
    this.model     = data.model     as string ?? "";
    this.createdAt = data.createdAt as string ?? new Date().toISOString();
    this.updatedAt = data.updatedAt as string ?? new Date().toISOString();
  }
}

// ── Pull progress ─────────────────────────────────────────────
export class PullProgress {
  status:     string;
  digest?:    string;
  total?:     number;
  completed?: number;

  constructor(data: Partial<PullProgress> = {}) {
    this.status    = (data as Record<string,unknown>).status    as string ?? "";
    this.digest    = (data as Record<string,unknown>).digest    as string;
    this.total     = (data as Record<string,unknown>).total     as number;
    this.completed = (data as Record<string,unknown>).completed as number;
  }
}

// ── Version ───────────────────────────────────────────────────
export class Version {
  version: string;
  constructor(data: Partial<{version: string}> = {}) {
    this.version = data.version ?? "";
  }
}