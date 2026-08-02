import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

// bcryptjs — тот же алгоритм bcrypt (тот, что просил пользователь), только
// написанный на чистом JavaScript, без нативного модуля. Настоящий пакет
// "bcrypt" требует компилятор на сервере при установке (node-gyp) — на
// серверless-хостинге (Vercel и т.п.) это часто ломается. bcryptjs даёт те же
// хеши и ту же защиту, просто без этого риска при развёртывании.
const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Логин для регистрации (см. /api/auth/register) — буквы (включая
// не-латинские, \p{L}), цифры, подчёркивание и дефис, 3-24 символа.
export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 24;

export function isValidUsername(username: string): boolean {
  return /^[\p{L}\p{N}_-]{3,24}$/u.test(username.trim());
}

// Минимальная длина — не "надёжный пароль" в полном смысле (спецсимволы и
// т.п.), просто разумный минимум, чтобы не завести пароль из 1 символа.
export const MIN_PASSWORD_LENGTH = 8;

export function isValidPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

// Случайный токен для ссылки сброса пароля — 32 байта (256 бит) в hex,
// достаточно длинный, чтобы его нельзя было подобрать перебором.
export function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}
