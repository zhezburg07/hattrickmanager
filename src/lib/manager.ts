import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";

export interface RealManagerInfo {
  userId: string;
  loginName: string;
}

// Разбирает XML-ответ CHPP на файл manager.xml — это единственный файл CHPP,
// который отдаёт стабильный идентификатор именно МЕНЕДЖЕРА (UserID), а не
// команды (TeamID из teamdetails.xml может однажды отличаться, если у
// пользователя несколько команд). UserID и нужен как ключ для хранения
// истории навыков между визитами (см. src/lib/playerHistoryDb.ts) — в
// отличие от access-токена, он не меняется и не истекает.
export function parseManagerXml(xml: string): RealManagerInfo {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "manager");

  const manager = root?.Manager;
  const userId = String(manager?.UserID ?? root?.UserID ?? "");

  if (!userId) {
    throw new Error("В ответе manager.xml нет UserID.");
  }

  return {
    userId,
    loginName: String(manager?.Loginname ?? ""),
  };
}
