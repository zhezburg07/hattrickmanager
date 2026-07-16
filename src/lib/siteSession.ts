import { createHmac, timingSafeEqual } from "crypto";

// Собственная долгоживущая cookie сессии сайта — хранит НЕ сам OAuth-токен
// Hattrick (тот теперь лежит в базе, см. src/lib/hattrickTokensDb.ts), а
// только подписанный Hattrick UserID. Подпись — HMAC ключом
// HATTRICK_CONSUMER_SECRET (тот же секрет, что уже используется для подписи
// запросов к CHPP, но с отдельной строкой домена "site-session:", чтобы
// подписи не пересекались по смыслу с OAuth) — поэтому не нужна отдельная
// переменная окружения только ради этой cookie: подделать её, не зная
// HATTRICK_CONSUMER_SECRET, нельзя.
export const SESSION_COOKIE = "hm_session";

function sign(userId: string): string {
  const secret = process.env.HATTRICK_CONSUMER_SECRET ?? "";
  return createHmac("sha256", secret).update(`site-session:${userId}`).digest("hex");
}

export function buildSessionCookieValue(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

// Проверяет cookie и возвращает Hattrick UserID, если подпись верна — иначе
// null (cookie отсутствует, подделана, либо HATTRICK_CONSUMER_SECRET не
// задан на сервере). Сравнение подписи — через timingSafeEqual, как и в
// src/lib/adminAuth.ts, чтобы не давать атаки по времени сравнения.
export function verifySessionCookieValue(value: string): string | null {
  if (!process.env.HATTRICK_CONSUMER_SECRET) return null;

  const dotIndex = value.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const userId = value.slice(0, dotIndex);
  const signature = value.slice(dotIndex + 1);
  const expected = sign(userId);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? userId : null;
}
