// Некоторые текстовые поля CHPP (например, matchdetails.xml EventList/
// EventText, playerevents.xml PlayerEvent/EventText) — это тот же текст,
// что показывает сам Hattrick в своих отчётах, и может содержать HTML-
// разметку (ссылки на игроков/арену/команды вида <a href="...">Имя</a>) —
// подтверждено на живом ответе. Убираем теги и раскодируем базовые HTML-
// сущности, оставляя только читаемый текст.
export function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}
