import type { PositionGroup } from "@/data/squad";

export type DragPayload =
  | { playerId: number; from: "bench" }
  | { playerId: number; from: "slot"; group: PositionGroup; index: number }
  | { playerId: number; from: "sub"; index: number };

export function serializePayload(payload: DragPayload): string {
  return JSON.stringify(payload);
}

export function parsePayload(data: string): DragPayload | null {
  try {
    return JSON.parse(data) as DragPayload;
  } catch {
    return null;
  }
}
