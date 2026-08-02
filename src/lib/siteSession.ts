import { createHmac, timingSafeEqual } from "crypto";

// Собственная долгоживущая cookie сессии сайта — хранит НЕ сам OAuth-токен
// Hattrick (тот теперь лежит в базе, см. src/lib/accountsDb.ts), а только
// подписанный внутренний ID аккаунта (accounts.id, см. accountsDb.ts) —
// РАНЬШЕ это был напрямую Hattrick UserID (аккаунт и Hattrick-подключение
// были одной сущностью); после разделения на accounts/hattrick_connections
// это просто opaque-строка, за подписью которой ничего не меняется. Для
// аккаунтов, перенесённых из старой схемы (или созданных первым OAuth-
// подключением без предварительной регистрации), accountId буквально равен
// hattrick_user_id — поэтому уже выданные ранее cookie продолжают работать
// без единого изменения в этой функции. Подпись — HMAC ключом
// HATTRICK_CONSUMER_SECRET (тот же секрет, что уже используется для подписи
// запросов к CHPP, но с отдельной строкой домена "site-session:", чтобы
// подписи не пересекались по смыслу с OAuth) — поэтому не нужна отдельная
// переменная окружения только ради этой cookie: подделать её, не зная
// HATTRICK_CONSUMER_SECRET, нельзя.
export const SESSION_COOKIE = "hm_session";

function sign(accountId: string): string {
  const secret = process.env.HATTRICK_CONSUMER_SECRET ?? "";
  return createHmac("sha256", secret).update(`site-session:${accountId}`).digest("hex");
}

export function buildSessionCookieValue(accountId: string): string {
  return `${accountId}.${sign(accountId)}`;
}

// Проверяет cookie и возвращает ID аккаунта, если подпись верна — иначе null
// (cookie отсутствует, подделана, либо HATTRICK_CONSUMER_SECRET не задан на
// сервере). Сравнение подписи — через timingSafeEqual, как и в
// src/lib/adminAuth.ts, чтобы не давать атаки по времени сравнения.
export function verifySessionCookieValue(value: string): string | null {
  if (!process.env.HATTRICK_CONSUMER_SECRET) return null;

  const dotIndex = value.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const accountId = value.slice(0, dotIndex);
  const signature = value.slice(dotIndex + 1);
  const expected = sign(accountId);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? accountId : null;
}
