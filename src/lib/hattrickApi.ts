import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { buildAuthorizationHeader, buildOAuthParams, HATTRICK_OAUTH_URLS } from "./hattrickOAuth";
import { SESSION_COOKIE, verifySessionCookieValue } from "./siteSession";
import { getHattrickTokens } from "./hattrickTokensDb";

export interface StoredHattrickTokens {
  accessToken: string;
  accessTokenSecret: string;
}

// Читает собственную долгоживущую cookie сессии сайта (см.
// src/lib/siteSession.ts), проверяет подпись и по извлечённому из неё
// Hattrick UserID достаёт сохранённый в базе OAuth-токен (см.
// src/lib/hattrickTokensDb.ts) — так пользователю не нужно заново проходить
// OAuth-авторизацию Hattrick на каждом визите, пока он сам не выйдет
// (/api/auth/logout) или не отзовёт доступ на самом Hattrick.
//
// Запасной путь ("мягкий" вход, см. /api/auth/callback): если при входе не
// удалось определить Hattrick UserID (manager.xml не ответил) — долгоживущая
// cookie сессии сайта не выдаётся вообще, но токен всё равно кладётся прямо
// в обычную cookie браузера (без базы данных). Здесь мы проверяем и её —
// иначе такой вход вообще не работал бы. Апгрейд до долгоживущей сессии,
// если manager.xml сработает позже, — см. /api/auth/session-upgrade.
export async function getStoredHattrickTokens(): Promise<StoredHattrickTokens | null> {
  const cookieStore = cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE)?.value;

  if (cookieValue) {
    const userId = verifySessionCookieValue(cookieValue);
    if (userId) {
      try {
        const tokens = await getHattrickTokens(userId);
        if (tokens) return tokens;
      } catch {
        // база недоступна — попробуем запасную cookie ниже
      }
    }
  }

  const legacyToken = cookieStore.get("hattrick_access_token")?.value;
  const legacyTokenSecret = cookieStore.get("hattrick_access_token_secret")?.value;
  if (legacyToken && legacyTokenSecret) {
    return { accessToken: legacyToken, accessTokenSecret: legacyTokenSecret };
  }

  return null;
}

// Для страниц личного кабинета (/dashboard/**): src/app/dashboard/layout.tsx
// уже перенаправляет неподключённых пользователей на главную раньше, чем
// отрендерится любая из этих страниц, так что к моменту вызова здесь токены
// гарантированно есть. Redirect на всякий случай — защита от прямого вызова
// без layout (например, из будущего API-роута), а не ожидаемый путь.
export async function getRequiredHattrickTokens(): Promise<StoredHattrickTokens> {
  const tokens = await getStoredHattrickTokens();
  if (!tokens) {
    redirect("/");
  }
  return tokens;
}

// Hattrick UserID зашит (подписанным) внутрь cookie сессии сайта — отдельной
// cookie для него больше не заводим. В отличие от getStoredHattrickTokens
// выше, здесь не нужен поход в базу, поэтому функция остаётся синхронной.
export function getStoredHattrickUserId(): string | null {
  const cookieValue = cookies().get(SESSION_COOKIE)?.value;
  if (!cookieValue) return null;
  return verifySessionCookieValue(cookieValue);
}

export interface ChppRawResponse {
  file: string;
  httpStatus: number;
  rawXml: string;
  tokenPreview: string; // замаскированный токен — виден только первые/последние символы
}

// Маскирует токен для отладочного вывода: видно, что он реально есть и что
// он одинаковый во всех запросах, но полное значение не светится на экране.
function maskToken(token: string): string {
  if (token.length <= 8) return "*".repeat(token.length);
  return `${token.slice(0, 4)}…${token.slice(-4)} (длина ${token.length})`;
}

// Низкоуровневый запрос к chppxml.ashx — НЕ бросает исключение при ошибке
// (ни сетевой, ни HTTP-статусе, ни ошибке самого CHPP в теле ответа): всегда
// возвращает то, что реально пришло, чтобы отладочная панель могла
// показать сырой ответ целиком. Используется и обычным кодом (fetchChppXml
// ниже), и временной отладочной панелью на дашборде.
export async function requestChppXmlRaw(
  file: string,
  params: Record<string, string>,
  tokens: StoredHattrickTokens,
): Promise<ChppRawResponse> {
  const consumerKey = process.env.HATTRICK_CONSUMER_KEY;
  const consumerSecret = process.env.HATTRICK_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new Error("Не заданы HATTRICK_CONSUMER_KEY / HATTRICK_CONSUMER_SECRET в .env.local.");
  }

  const queryParams = { file, version: "1.5", ...params };
  const url = HATTRICK_OAUTH_URLS.chppXml;

  const oauthParams = buildOAuthParams(
    "GET",
    url,
    {
      consumerKey,
      consumerSecret,
      token: tokens.accessToken,
      tokenSecret: tokens.accessTokenSecret,
    },
    {}, // extraOAuthParams — здесь не нужны, все стандартные уже добавляются
    queryParams, // requestParams — file/version, участвуют в подписи, но не в заголовке
  );

  const searchParams = new URLSearchParams(queryParams);
  const fullUrl = `${url}?${searchParams.toString()}`;

  const response = await fetch(fullUrl, {
    method: "GET",
    headers: { Authorization: buildAuthorizationHeader(oauthParams) },
    cache: "no-store",
  });

  const bodyText = await response.text();

  return {
    file,
    httpStatus: response.status,
    rawXml: bodyText,
    tokenPreview: maskToken(tokens.accessToken),
  };
}

// Запрашивает конкретный XML-файл CHPP (teamdetails, playerdetails,
// training, economy и т.д.) от имени подключённого пользователя — запрос
// подписывается его постоянным ключом доступа (Access Token), полученным
// при OAuth-авторизации. Возвращает исходный текст XML-ответа. В отличие от
// requestChppXmlRaw — бросает исключение при не-200 статусе, чтобы обычный
// (не отладочный) код мог просто использовать try/catch.
export async function fetchChppXml(
  file: string,
  params: Record<string, string>,
  tokens: StoredHattrickTokens,
): Promise<string> {
  const result = await requestChppXmlRaw(file, params, tokens);

  if (result.httpStatus < 200 || result.httpStatus >= 300) {
    throw new Error(`Hattrick вернул ошибку (${result.httpStatus}) при запросе файла "${file}": ${result.rawXml.slice(0, 300)}`);
  }

  return result.rawXml;
}
