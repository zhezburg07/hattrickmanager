import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

// Простая защита /admin одним паролем (ADMIN_PASSWORD в переменных
// окружения) — без отдельной таблицы пользователей-администраторов, это
// личная панель владельца сайта, а не многопользовательская система входа.
//
// Cookie хранит не сам пароль, а HMAC-подпись фиксированной строки ключом
// ADMIN_PASSWORD — подделать её, не зная пароль, нельзя, а сравнение и на
// шаге входа, и при проверке cookie идёт через timingSafeEqual (защита от
// атак по времени сравнения).
export const ADMIN_SESSION_COOKIE = "admin_session";

function sessionToken(password: string): string {
  return createHmac("sha256", password).update("hattrickmanager-admin-session").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Проверяет введённый пароль против ADMIN_PASSWORD — при совпадении
// возвращает значение для cookie сессии, иначе null. Тоже null, если
// ADMIN_PASSWORD вообще не задан на сервере (тогда войти нельзя ни с каким
// паролем — это осознанное поведение, а не баг).
export function verifyAdminPassword(password: string): string | null {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return null;
  if (!safeEqual(password, expected)) return null;
  return sessionToken(expected);
}

export function isAdminPasswordConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export function isAdminAuthenticated(): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const cookieValue = cookies().get(ADMIN_SESSION_COOKIE)?.value;
  if (!cookieValue) return false;
  return safeEqual(cookieValue, sessionToken(expected));
}
