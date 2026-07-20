import { describeChppErrorCode } from "./chppErrorCodes";

export interface ChppErrorInfo {
  code: number;
  message: string;
}

// Если в разобранном XML-ответе есть поле Error — CHPP сообщает об ошибке
// вместо данных (неверный/просроченный токен, файл недоступен для этого
// приложения и т.п.). Возвращает структурированную информацию (код + текст)
// или null, если ошибки нет.
export function extractChppError(root: Record<string, unknown> | undefined | null): ChppErrorInfo | null {
  if (!root || !root.Error) return null;
  return { code: Number(root.ErrorCode ?? -1), message: String(root.Error) };
}

// Если Hattrick вернул ошибку (неверный/просроченный токен, опечатка в имени
// файла, файл недоступен для этого приложения и т.п.), CHPP присылает не
// структуру с данными, а плоские поля Error/ErrorCode прямо в корне ответа.
// Эта функция ловит такой случай и превращает его в понятную ошибку с
// названием файла и расшифровкой кода, чтобы было видно, какой именно
// запрос не удался и почему (см. полный список кодов в chppErrorCodes.ts).
export function assertNoChppError(root: Record<string, unknown> | undefined, fileLabel: string): void {
  if (!root) {
    throw new Error(`Ответ Hattrick на "${fileLabel}" не похож на XML CHPP (нет корневого узла HattrickData).`);
  }
  const error = extractChppError(root);
  if (error) {
    throw new Error(`Hattrick вернул ошибку на "${fileLabel}": ${error.message} — код ${describeChppErrorCode(error.code)}`);
  }
}

// Определяет, была ли ошибка (из assertNoChppError выше, где угодно в коде)
// именно про недействительный/отозванный/просроченный OAuth-токен (код 0,
// NotLoggedIn) — а не про что-то другое (сеть, неизвестный ID и т.п.). Нужно,
// чтобы вежливо предложить заново пройти OAuth вместо обычного сообщения об
// ошибке (см. чат, пункт 5 — редко, но токен может протухнуть/быть отозван
// пользователем на самом Hattrick).
export function isChppAuthError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("(NotLoggedIn)");
}
