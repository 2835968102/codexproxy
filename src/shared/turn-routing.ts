import { isRecord } from "./json.js";

const FINISHED_TURN_STATUSES = new Set([
  "completed",
  "complete",
  "succeeded",
  "success",
  "failed",
  "error",
  "cancelled",
  "canceled",
  "interrupted"
]);

export type TurnSendRequest =
  | {
      method: "turn.start";
      params: {
        threadId: string;
        prompt: string;
        cwd?: string;
      };
    }
  | {
      method: "turn.steer";
      params: {
        threadId: string;
        expectedTurnId: string;
        prompt: string;
      };
    };

export function buildTurnSendRequest(values: {
  threadId: string;
  prompt: string;
  cwd?: string;
  activeTurnId?: string;
}): TurnSendRequest {
  const activeTurnId = values.activeTurnId?.trim();
  if (activeTurnId) {
    return {
      method: "turn.steer",
      params: {
        threadId: values.threadId,
        expectedTurnId: activeTurnId,
        prompt: values.prompt
      }
    };
  }

  return {
    method: "turn.start",
    params: {
      threadId: values.threadId,
      prompt: values.prompt,
      ...(values.cwd ? { cwd: values.cwd } : {})
    }
  };
}

export function activeTurnIdFromTurns(turns: unknown): string | undefined {
  if (!Array.isArray(turns)) {
    return undefined;
  }

  return turns
    .slice()
    .sort((a, b) => turnTimestamp(b) - turnTimestamp(a))
    .map((turn) => (isActiveTurn(turn) ? turnId(turn) : undefined))
    .find((id): id is string => Boolean(id));
}

function isActiveTurn(turn: unknown) {
  if (!isRecord(turn)) {
    return false;
  }

  if (turn.completedAt !== undefined && turn.completedAt !== null) {
    return false;
  }

  const status = typeof turn.status === "string" ? normalizeStatus(turn.status) : "";
  return Boolean(status) && !FINISHED_TURN_STATUSES.has(status);
}

function turnId(turn: unknown) {
  if (!isRecord(turn)) {
    return undefined;
  }

  if (typeof turn.id === "string" && turn.id.trim()) {
    return turn.id;
  }
  if (typeof turn.turnId === "string" && turn.turnId.trim()) {
    return turn.turnId;
  }
  return undefined;
}

function turnTimestamp(turn: unknown) {
  if (!isRecord(turn)) {
    return 0;
  }

  return (
    timestampToMs(turn.updatedAt) ||
    timestampToMs(turn.startedAt) ||
    timestampToMs(turn.createdAt) ||
    timestampToMs(turn.completedAt)
  );
}

function timestampToMs(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1000000000000 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function normalizeStatus(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}
