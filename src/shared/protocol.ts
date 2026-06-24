import { z } from "zod";

export const CLIENT_PROTOCOL_VERSION = 1;

export type PeerRole = "bridge" | "controller";

export type Envelope<TType extends string = string, TPayload = unknown> = {
  v: number;
  type: TType;
  payload: TPayload;
  requestId?: string;
  sentAt: number;
};

export type SessionSummary = {
  sessionId: string;
  deviceName: string;
  connectedAt: number;
  lastSeenAt: number;
  bridgeOnline: boolean;
  controllers: number;
  capabilities: string[];
  codex?: CodexTargetStatus;
};

export type CodexTargetStatus = {
  connected: boolean;
  userAgent?: string;
  codexHome?: string;
  platformOs?: string;
  platformFamily?: string;
  lastError?: string;
};

export type ControllerHello = {
  role: "controller";
  pairingCode: string;
  sessionId?: string;
  token?: string;
};

export type BridgeHello = {
  role: "bridge";
  token: string;
  deviceName: string;
  sessionId?: string;
  capabilities: string[];
};

export type HelloPayload = ControllerHello | BridgeHello;

export type RpcRequestPayload = {
  target: "bridge" | "codex";
  method: string;
  params?: unknown;
};

export type RpcResponsePayload = {
  ok: boolean;
  result?: unknown;
  error?: string;
};

export type CodexEventPayload = {
  direction: "from-codex" | "to-codex";
  message: unknown;
};

export type ApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

export const envelopeSchema = z.object({
  v: z.number(),
  type: z.string().min(1),
  payload: z.unknown(),
  requestId: z.string().optional(),
  sentAt: z.number()
});

export const helloSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("bridge"),
    token: z.string().min(1),
    deviceName: z.string().min(1),
    sessionId: z.string().optional(),
    capabilities: z.array(z.string())
  }),
  z.object({
    role: z.literal("controller"),
    pairingCode: z.string().min(1),
    sessionId: z.string().optional(),
    token: z.string().optional()
  })
]);

export const rpcRequestSchema = z.object({
  target: z.enum(["bridge", "codex"]),
  method: z.string().min(1),
  params: z.unknown().optional()
});

export function createEnvelope<TType extends string, TPayload>(
  type: TType,
  payload: TPayload,
  requestId?: string
): Envelope<TType, TPayload> {
  return {
    v: CLIENT_PROTOCOL_VERSION,
    type,
    payload,
    requestId,
    sentAt: Date.now()
  };
}

export function parseEnvelope(raw: string): Envelope {
  const envelope = envelopeSchema.parse(JSON.parse(raw)) as Envelope;
  if (envelope.v !== CLIENT_PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocol version: ${envelope.v}`);
  }
  return envelope;
}

export function textInput(text: string) {
  return {
    type: "text",
    text,
    text_elements: []
  };
}
