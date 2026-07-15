import { cookies } from "next/headers";
import { buildAuthorizationHeader, buildOAuthParams, HATTRICK_OAUTH_URLS } from "./hattrickOAuth";

export interface StoredHattrickTokens {
  accessToken: string;
  accessTokenSecret: string;
}

// Читает постоянный ключ доступа, сохранённый в cookie на шаге 3 OAuth
// (см. /api/auth/callback). Если пользователь ещё не подключал команду —
// вернёт null, и вызывающий код должен показать демо-данные.
export function getStoredHattrickTokens(): StoredHattrickTokens | null {
  const cookieStore = cookies();
  const accessToken = cookieStore.get("hattrick_access_token")?.value;
  const accessTokenSecret = cookieStore.get("hattrick_access_token_secret")?.value;

  if (!accessToken || !accessTokenSecret) return null;
  return { accessToken, accessTokenSecret };
}

// Hattrick UserID, сохранённый в cookie при входе (см. /api/auth/callback) —
// стабильный ключ для истории навыков между визитами (см.
// src/lib/playerHistoryDb.ts). Может отсутствовать, даже если пользователь
// подключён (например, если запрос manager.xml не удался при входе) — тогда
// история между визитами просто не сохраняется, остальной сайт работает как
// обычно.
export function getStoredHattrickUserId(): string | null {
  return cookies().get("hattrick_user_id")?.value ?? null;
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
