import { isRecord } from "./json.js";

export type ChatHistoryMessage = {
  id?: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp?: number;
};

export function messagesFromThreadHistory(thread: unknown): ChatHistoryMessage[] {
  const turns = isRecord(thread) && Array.isArray(thread.turns) ? thread.turns : [];
  return turns
    .slice()
    .sort(compareTurns)
    .flatMap((turn) => {
      if (!isRecord(turn) || !Array.isArray(turn.items)) {
        return [];
      }
      const timestamp =
        typeof turn.completedAt === "number"
          ? turn.completedAt
          : typeof turn.startedAt === "number"
            ? turn.startedAt
            : undefined;
      return turn.items.flatMap((item) => messageFromItem(item, timestamp));
    });
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
    const output = typeof item.aggregatedOutput === "string" && item.aggregatedOutput.trim()
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
  if (!isRecord(turn)) {
    return 0;
  }
  if (typeof turn.startedAt === "number") {
    return turn.startedAt;
  }
  if (typeof turn.completedAt === "number") {
    return turn.completedAt;
  }
  return 0;
}
