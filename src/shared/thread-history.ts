import { isRecord } from "./json.js";

export type ChatHistoryMessage = {
  id?: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp?: number;
};

export function messagesFromThreadHistory(thread: unknown): ChatHistoryMessage[] {
  return turnsFromThreadHistory(thread)
    .slice()
    .sort(compareTurns)
    .flatMap((turn) => {
      if (!isRecord(turn) || !Array.isArray(turn.items)) {
        return [];
      }
      const timestamp = timestampFrom(turn);
      return turn.items.flatMap((item) => messageFromItem(item, timestamp));
    });
}

export function turnsFromThreadHistory(thread: unknown): unknown[] {
  if (Array.isArray(thread)) {
    return thread;
  }
  if (!isRecord(thread)) {
    return [];
  }
  if (Array.isArray(thread.turns)) {
    return thread.turns;
  }
  if (isRecord(thread.thread) && Array.isArray(thread.thread.turns)) {
    return thread.thread.turns;
  }
  if (Array.isArray(thread.data)) {
    return thread.data;
  }
  return [];
}

export function messagesFromCodexEvent(message: unknown): ChatHistoryMessage[] {
  if (!isRecord(message) || message.method !== "item/completed" || !isRecord(message.params)) {
    return [];
  }

  return messageFromItem(message.params.item, timestampFrom(message.params) ?? timestampFrom(message.params.item));
}

function messageFromItem(item: unknown, timestamp: number | undefined): ChatHistoryMessage[] {
  if (!isRecord(item) || typeof item.type !== "string") {
    return [];
  }

  const id = typeof item.id === "string" ? item.id : undefined;
  if (item.type === "userMessage") {
    const text = userContentToText(item.content);
    return text ? [{ id, role: "user", text, timestamp }] : [];
  }

  if (item.type === "agentMessage" && typeof item.text === "string" && item.text.trim()) {
    return [{ id, role: "assistant", text: item.text, timestamp }];
  }

  if (item.type === "plan" && typeof item.text === "string" && item.text.trim()) {
    return [{ id, role: "system", text: `计划\n${item.text}`, timestamp }];
  }

  if (item.type === "commandExecution" && typeof item.command === "string") {
    const output =
      typeof item.aggregatedOutput === "string" && item.aggregatedOutput.trim()
        ? `\n\n${item.aggregatedOutput}`
        : "";
    return [{ id, role: "system", text: `命令\n${item.command}${output}`, timestamp }];
  }

  return [];
}

function userContentToText(content: unknown) {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (!isRecord(item) || typeof item.type !== "string") {
        return "";
      }
      if (item.type === "text" && typeof item.text === "string") {
        return item.text;
      }
      if (item.type === "image" && typeof item.url === "string") {
        return `[图片] ${item.url}`;
      }
      if (item.type === "localImage" && typeof item.path === "string") {
        return `[本地图片] ${item.path}`;
      }
      if (item.type === "mention") {
        return `@${typeof item.name === "string" ? item.name : "mention"}`;
      }
      if (item.type === "skill") {
        return `[技能] ${typeof item.name === "string" ? item.name : ""}`.trim();
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function compareTurns(a: unknown, b: unknown) {
  return turnTimestamp(a) - turnTimestamp(b);
}

function turnTimestamp(turn: unknown) {
  return timestampFrom(turn) ?? 0;
}

function timestampFrom(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }
  const timestamp = value.completedAt ?? value.startedAt ?? value.updatedAt ?? value.createdAt;
  return typeof timestamp === "number" ? timestamp : undefined;
}
