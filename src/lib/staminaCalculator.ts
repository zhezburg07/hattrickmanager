// Калькулятор оптимальной минуты замены (шаг 2 — коэффициент выносливости).
// См. чат "Калькулятор оптимальной минуты замены" — шаг 1 (сбор
// rating_stars_full/rating_stars_end_of_match в match_role_predictions, см.
// matchRolePredictionsDb.ts) уже реализован; здесь только официальная
// формула Stamina factor + конвертация нашего хранимого формата в неё.
// НЕ используется в UI — только backend-утилита, пока не согласована модель
// падения рейтинга по ходу матча (см. staminaDropByMinute ниже — вопрос
// пользователю, а не реализация).

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
export function staminaFactor(level: number): number {
  return Math.pow((level + 6.5) / 14, 0.6);
}
