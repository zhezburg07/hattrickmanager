import crypto from "crypto";

// Фиксированные адреса CHPP (Community Hattrick Provider Protocol) — они не
// секретны, поэтому просто константы в коде, а не переменные окружения.
export const HATTRICK_OAUTH_URLS = {
  requestToken: "https://chpp.hattrick.org/oauth/request_token.ashx",
  authorize: "https://chpp.hattrick.org/oauth/authorize.aspx",
  accessToken: "https://chpp.hattrick.org/oauth/access_token.ashx",
  chppXml: "https://chpp.hattrick.org/chppxml.ashx",
};

// Процентное кодирование по правилам OAuth 1.0a (RFC 3986) — строже, чем
// стандартный encodeURIComponent: тот не кодирует !, *, ' и (), а OAuth
// требует кодировать и их тоже. Без этого подпись не совпадёт с той, что
// посчитает сервер Hattrick, и запрос будет отклонён.
function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function generateNonce(): string {
  // oauth_nonce — одноразовая случайная строка, чтобы один и тот же подписанный
  // запрос нельзя было повторно отправить (защита от повторного использования).
  return crypto.randomBytes(16).toString("hex");
}

export interface OAuthCredentials {
  consumerKey: string;
  consumerSecret: string;
  token?: string; // oauth_token — есть на шагах Access Token и запросов данных, отсутствует на Request Token
  tokenSecret?: string; // секрет, соответствующий token
}

// Считает все oauth_-параметры запроса, включая итоговую "oauth_signature" —
// цифровую подпись, которая доказывает Hattrick, что запрос действительно
// от нашего приложения (подписано Consumer Secret) и, если есть токен, от
// имени конкретного пользователя (подписано ещё и Token Secret).
//
// extraOAuthParams — дополнительные oauth_-параметры (например,
// oauth_callback на шаге Request Token, oauth_verifier на шаге Access
// Token) — они участвуют и в подписи, и в самом заголовке Authorization.
//
// requestParams — обычные параметры запроса (например, file/version при
// запросе данных из chppxml.ashx) — по правилам OAuth 1.0a они ОБЯЗАНЫ
// участвовать в подписи (иначе подпись не совпадёт), но НЕ должны попадать в
// заголовок Authorization — там передаются только oauth_-параметры, а сами
// requestParams едут отдельно, в строке запроса (?file=...&version=...).
export function buildOAuthParams(
  method: string,
  url: string,
  credentials: OAuthCredentials,
  extraOAuthParams: Record<string, string> = {},
  requestParams: Record<string, string> = {},
): Record<string, string> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credentials.consumerKey,
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
    ...extraOAuthParams,
  };

  if (credentials.token) {
    oauthParams.oauth_token = credentials.token;
  }

  // Строка для подписи: ВСЕ параметры (и oauth_-, и обычные requestParams)
  // сортируются по имени и склеиваются в единый нормализованный вид — так
  // того же результата легко достигает и сервер Hattrick, чтобы сверить
  // нашу подпись со своей.
  const paramsForSigning = { ...oauthParams, ...requestParams };
  const normalizedParams = Object.keys(paramsForSigning)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(paramsForSigning[key])}`)
    .join("&");

  const baseString = [method.toUpperCase(), percentEncode(url), percentEncode(normalizedParams)].join("&");

  // Ключ подписи — Consumer Secret и (если есть) Token Secret, склеенные через
  // "&". Именно поэтому Consumer Secret нельзя терять или передавать в
  // браузер: любой, кто его знает, сможет подделать подпись от имени нашего
  // приложения.
  const signingKey = `${percentEncode(credentials.consumerSecret)}&${percentEncode(credentials.tokenSecret ?? "")}`;

  const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

  // Возвращаем только oauth_-параметры (+ подпись) — requestParams сюда
  // намеренно не попадают, см. пояснение выше.
  return {
    ...oauthParams,
    oauth_signature: signature,
  };
}

// Собирает готовый заголовок "Authorization: OAuth ..." из подписанных
// параметров — именно так CHPP ожидает получать OAuth-данные запроса.
export function buildAuthorizationHeader(params: Record<string, string>): string {
  const headerParams = Object.keys(params)
    .map((key) => `${percentEncode(key)}="${percentEncode(params[key])}"`)
    .join(", ");
  return `OAuth ${headerParams}`;
}
