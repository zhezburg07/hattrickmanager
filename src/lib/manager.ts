import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";
import { requestChppXmlRaw, type StoredHattrickTokens } from "./hattrickApi";

export interface RealManagerInfo {
  userId: string;
  loginName: string;
}

// Разбирает XML-ответ CHPP на файл managercompendium.xml — это единственный
// файл CHPP, который отдаёт стабильный идентификатор именно МЕНЕДЖЕРА
// (UserID), а не команды (TeamID из teamdetails.xml может однажды
// отличаться, если у пользователя несколько команд). UserID и нужен как
// ключ для хранения истории навыков между визитами (см.
// src/lib/playerHistoryDb.ts) — в отличие от access-токена, он не меняется
// и не истекает.
//
// ВАЖНО: файл называется "managercompendium", а не "manager" — прежнее имя
// было неверным и стабильно давало HTTP 401 (CHPP не распознаёт
// несуществующий файл как валидный запрос). Подтверждено по официальной
// схеме CHPP: константа имени файла — "managercompendium", версия "1.7".
// Структура ответа тоже отличается от того, что предполагалось раньше:
// UserID встречается ДВАЖДЫ — как <User> прямо в корне (ID пользователя,
// от чьего имени выполнен запрос) и как <Manager><UserID> внутри контейнера
// Manager (тот же менеджер, но внутри его собственных данных). Проверяем
// оба варианта на случай различий в конкретном ответе.
export function parseManagerXml(xml: string): RealManagerInfo {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "managercompendium");

  const manager = root?.Manager;
  const userId = String(manager?.UserID ?? root?.User ?? root?.UserID ?? "");

  if (!userId) {
    throw new Error("В ответе managercompendium.xml нет UserID.");
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// UserID нужен, чтобы выдать долгоживущую сессию сайта (см.
// src/lib/hattrickTokensDb.ts) — но получение UserID НЕ должно блокировать
// сам вход: если managercompendium.xml не отвечает, /api/auth/callback всё
// равно пускает пользователя внутрь по обычной (не долгоживущей) сессии.
// Пробуем несколько раз подряд на случай временного сбоя/задержки сразу
// после обмена токена, но при неудаче — просто честно возвращаем причину, а
// не бросаем исключение.
//
// ИСПРАВЛЕНО (срочный баг — реальный новый пользователь получал HTTP 401
// дважды подряд сразу после OAuth, см. чат "Срочно: реальный пользователь
// не может подключиться"): между попытками раньше не было вообще никакой
// паузы — обе попытки уходили практически одновременно (разница — только
// время сетевого round-trip), что не даёт никакой защиты от временной
// задержки в самом Hattrick (только что выданный Access Token может быть
// готов для чтения командных файлов на chppxml.ashx на секунду-две раньше,
// чем для managercompendium.xml — не подтверждено официально, но 401 сразу
// после успешного обмена токена на access_token.ashx больше похож на это,
// чем на неверную подпись/токен, — тот же самый токен в это же самое время
// уже читает другие файлы). Явная версия "1.7" — та же версия, что уже
// заявлена подтверждённой в комментарии к parseManagerXml выше, но раньше
// нигде не передавалась явно (шёл дефолт "1.5" из requestChppXmlRaw).
const MANAGER_COMPENDIUM_VERSION = "1.7";

export async function resolveManagerUserId(
  tokens: StoredHattrickTokens,
  attempts = 2,
): Promise<ManagerUserIdResult> {
  const diagnostics: string[] = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) await sleep(1500);
    try {
      const raw = await requestChppXmlRaw("managercompendium", { version: MANAGER_COMPENDIUM_VERSION }, tokens);
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
