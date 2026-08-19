// Калькулятор оптимальной минуты замены (шаг 2 — коэффициент выносливости).
// См. чат "Калькулятор оптимальной минуты замены" — шаг 1 (сбор
// rating_stars_full/rating_stars_end_of_match в match_role_predictions, см.
// matchRolePredictionsDb.ts) уже реализован. НЕ используется в UI — только
// backend-утилита, готовая к подключению, когда дойдёт очередь до самого
// калькулятора замены.

// НАШ формат хранения (players.xml → SquadPlayer.stamina → snapshotOf() →
// player_weekly_stat_snapshots.stamina → match_role_predictions.stamina, см.
// src/lib/squadPlayers.ts:115-116) — целые проценты 0-100, округлённые от
// сырого CHPP-уровня StaminaSkill по шкале 0-9: `round(level/9*100)`.
// ПОДТВЕРЖДЕНО эмпирически (см. чат "Уточнить формат поля stamina из CHPP")
// — реально наблюдаемые в match_role_predictions значения 33/44/56/67/78
// точно легли в сетку round(level/9*100) для level=3..7, подтверждая N=9.
//
// НЕ ПУТАТЬ с staminaToLevel в src/data/squad.ts — та функция переводит те
// же проценты в ДРУГУЮ, словесную шкалу 0-8 (та же, что у Формы, formWord)
// исключительно для отображения в интерфейсе ("Состав"/"Расстановка").
// Здесь — обратное преобразование в СЫРОЙ CHPP-уровень 0-9, который
// ожидает официальная формула Stamina factor ниже, две шкалы (0-8 для
// отображения и 0-9 для формулы) намеренно разные и не взаимозаменяемы.
const STAMINA_LEVEL_MAX = 9;

// Обратное преобразование round(level/9*100) → level. Точно восстанавливает
// level для всех значений, реально порождаемых прямым преобразованием (см.
// комментарий выше) — для процентов НЕ на этой сетке (например, старые
// данные, посчитанные другой формулой, или ручной ввод) даёт ближайший
// целый уровень как честное приближение, не более того.
export function staminaPercentToLevel(staminaPercent: number): number {
  const clampedPercent = Math.max(0, Math.min(100, staminaPercent));
  return Math.max(0, Math.min(STAMINA_LEVEL_MAX, Math.round((clampedPercent / 100) * STAMINA_LEVEL_MAX)));
}

// Официальная формула Hattrick (см. чат "Калькулятор оптимальной минуты
// замены") — Stamina factor = ((level + 6.5) / 14) ^ 0.6, level — сырой
// уровень навыка выносливости CHPP (0-9, см. STAMINA_LEVEL_MAX выше). При
// level=0 даёт ≈0.63, при максимуме level=9 — ≈1.06 (подтверждено в этом же
// чате как ожидаемый диапазон).
//
// НЕ используется калькулятором минуты замены (см. staminaRetentionAtMinute
// ниже) — подтверждено (тот же чат): это два описания ОДНОГО эффекта из
// одного источника вики (формула стоит прямо под таблицей "Midfield Stamina
// Effect"), комбинировать оба означало бы задвоить штраф за выносливость.
// Намеренно оставлена как отдельная независимая утилита на будущее — общая
// оценка "боеспособности" вне контекста конкретной минуты матча.
export function staminaFactor(level: number): number {
  return Math.pow((level + 6.5) / 14, 0.6);
}

// ---- Удержание рейтинга по ходу матча (таблица "Midfield Stamina Effect",
// wiki.hattrick.org/wiki/Stamina) ----
//
// Значения — ДОЛЯ базового (полного) рейтинга, ещё сохранившаяся к этой
// минуте матча (несмотря на название "Drop percentage" на вики — уточнено
// пользователем: Formidable=100% на 45' значит рейтинг ЕЩЁ НЕ просел, а не
// что просел на 100%). Кумулятивно от начала матча — значение на 90' не
// доп. падение поверх 45', а итоговое состояние от старта. level=0 в
// таблице нет (шкала начинается с level=1, "Disastrous") — ниже level
// временно приравнивается к 1 (см. staminaRetentionAtMinute) как самый
// безопасный вариант из двух, что предложил PM, до отдельного решения,
// когда дойдёт до реализации самого калькулятора.
const STAMINA_RETENTION_CHECKPOINTS: Record<number, { at45: number; at90: number; at120: number }> = {
  1: { at45: 0.58, at90: 0.26, at120: 0.1 }, // Disastrous
  2: { at45: 0.64, at90: 0.35, at120: 0.1 }, // Wretched
  3: { at45: 0.7, at90: 0.44, at120: 0.14 }, // Poor
  4: { at45: 0.76, at90: 0.53, at120: 0.27 }, // Weak
  5: { at45: 0.82, at90: 0.62, at120: 0.4 }, // Inadequate
  6: { at45: 0.88, at90: 0.71, at120: 0.53 }, // Passable
  7: { at45: 0.94, at90: 0.8, at120: 0.66 }, // Solid
  8: { at45: 1.0, at90: 0.9, at120: 0.79 }, // Excellent
  9: { at45: 1.0, at90: 1.0, at120: 0.92 }, // Formidable
};

function lerp(x0: number, y0: number, x1: number, y1: number, x: number): number {
  if (x1 === x0) return y0;
  return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
}

// Линейная интерполяция между чекпоинтами (0'→100% — до начала матча
// просадки ещё нет ни у кого, независимо от уровня выносливости — 45' →
// 90' → 120'). За пределами 120' данных в таблице нет — берём значение на
// 120' как плоскую экстраполяцию (честнее, чем гадать дальнейшее падение).
// Возвращает долю (0-1), не проценты — напрямую умножается на базовый
// рейтинг игрока в этот момент матча.
export function staminaRetentionAtMinute(level: number, minute: number): number {
  const clampedLevel = Math.max(1, Math.min(9, Math.round(level)));
  const row = STAMINA_RETENTION_CHECKPOINTS[clampedLevel];
  const m = Math.max(0, minute);

  if (m <= 45) return lerp(0, 1, 45, row.at45, m);
  if (m <= 90) return lerp(45, row.at45, 90, row.at90, m);
  if (m <= 120) return lerp(90, row.at90, 120, row.at120, m);
  return row.at120;
}
