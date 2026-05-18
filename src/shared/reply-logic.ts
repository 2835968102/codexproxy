export type AssistantMessageCandidate = {
  id?: string;
  text: string;
  ts: number;
  phase?: "commentary" | "final_answer" | null;
};

export function selectLatestAssistantMessage(candidates: AssistantMessageCandidate[]) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const finalAnswerCandidates = candidates.filter((candidate) => candidate.phase === "final_answer");
  const pool = finalAnswerCandidates.length > 0 ? finalAnswerCandidates : candidates;

  return pool.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0))[0] ?? null;
}

export type PendingUserBubble = {
  text: string;
};

export function createPendingUserBubbleTracker() {
  let pending: PendingUserBubble | null = null;

  return {
    register(text: string) {
      pending = { text };
      return pending;
    },
    consume(text: string) {
      if (!pending || pending.text !== text) {
        return false;
      }
      pending = null;
      return true;
    },
    clear() {
      pending = null;
    }
  };
}
