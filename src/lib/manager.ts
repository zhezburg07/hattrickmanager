import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";

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

export interface ManagerUserIdResult {
  userId: string | null;
  // По одной строке на попытку — точная причина, если не получилось (HTTP-код
  // и начало тела ответа, либо текст ошибки разбора/сети) — раньше эти
  // причины просто проглатывались молча (см. git-историю /api/auth/callback),
  // из-за чего единственный сбой на этом шаге стало невозможно
  // продиагностировать.
  diagnostics: string[];
}

// UserID нужен, чтобы выдать долгоживущую сессию сайта (см.
// src/lib/hattrickTokensDb.ts) — но получение UserID НЕ должно блокировать
// сам вход: если manager.xml не отвечает, /api/auth/callback всё равно
// пускает пользователя внутрь по обычной (не долгоживущей) сессии. Пробуем
// несколько раз подряд на случай временного сбоя/задержки сразу после
// обмена токена, но при неудаче — просто честно возвращаем причину, а не
// бросаем исключение.
export async function resolveManagerUserId(
  tokens: StoredHattrickTokens,
  attempts = 2,
): Promise<ManagerUserIdResult> {
  const diagnostics: string[] = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const raw = await requestChppXmlRaw("manager", {}, tokens);
      if (raw.httpStatus < 200 || raw.httpStatus >= 300) {
        diagnostics.push(`Попытка ${attempt}: HTTP ${raw.httpStatus} — ${raw.rawXml.slice(0, 200)}`);
        continue;
      }
      const userId = parseManagerXml(raw.rawXml).userId;
      return { userId, diagnostics };
    } catch (err) {
      const message = err instanceof Error ? err.message : "неизвестная ошибка";
      diagnostics.push(`Попытка ${attempt}: ${message}`);
    }
  }
  return { userId: null, diagnostics };
}
