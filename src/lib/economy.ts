import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";

export interface FinanceIncomeBreakdown {
  spectators: number; // IncomeSpectators / LastIncomeSpectators
  sponsors: number; // IncomeSponsors / LastIncomeSponsors
  commission: number; // IncomeFinancial / LastIncomeFinancial
  // IncomeTemporary/LastIncomeTemporary — Hattrick не делит эту сумму на
  // "проданные игроки", "разовые бонусы" и т.п. отдельными полями, так что
  // показываем её одной строкой, не пытаясь угадать дальнейшую разбивку.
  temporary: number;
}

export interface FinanceExpenseBreakdown {
  players: number; // CostsPlayers / LastCostsPlayers — Зарплата
  arena: number; // CostsArena / LastCostsArena — Содержание стадиона
  staff: number; // CostsStaff / LastCostsStaff — Персонал
  youth: number; // CostsYouth / LastCostsYouth — Затраты на молодёжь
  interest: number; // CostsFinancial / LastCostsFinancial — Проценты по кредиту
  // CostsTemporary/LastCostsTemporary — сюда же входят "купленные игроки" и
  // "строительство стадиона" (отдельных полей под них Hattrick не даёт).
  temporary: number;
}

export interface FinanceWeekData {
  income: FinanceIncomeBreakdown;
  incomeSum: number; // IncomeSum / LastIncomeSum — реальный итог от CHPP, не пересчитан из статей
  expense: FinanceExpenseBreakdown;
  expenseSum: number; // CostsSum / LastCostsSum — реальный итог от CHPP
  // ExpectedWeeksTotal (эта неделя, план) / LastWeeksTotal (прошлая неделя,
  // факт) — реальное поле прибыли/убытка от CHPP, не пересчитывается как
  // incomeSum - expenseSum на клиенте.
  profit: number;
}

export interface RealEconomy {
  cash: number; // Cash
  // Ожидаемая касса на следующей неделе — реальное поле ExpectedCash.
  expectedCash: number;
  fanClubSize: number;
  supportersPopularity: number; // 0-9, официальная шкала CHPP (SupportersPopularityID)
  // Эта неделя — план (бюджет), ещё не завершившаяся неделя.
  thisWeek: FinanceWeekData;
  // Прошлая неделя — уже завершившийся, реальный факт. Раньше "прошлая
  // неделя" бралась не отсюда, а из собственной БД-истории сайта (снимок
  // недельной давности) — ИСПРАВЛЕНО: economy.xml прямо содержит факт за
  // прошлую неделю в полях с префиксом "Last" (подтверждено по независимому
  // CHPP-клиенту github.com/lucianoq/hattrick), так что это доступно сразу,
  // без необходимости ждать неделю накопления собственной истории. См.
  // git-историю src/lib/financeHistoryDb.ts (удалён как более ненужный).
  lastWeek: FinanceWeekData;
  // Сырые поля <Team> из economy.xml — раньше показывались во временной
  // диагностической панели (см. историю SHOW_ECONOMY_DEBUG в
  // dashboard/finance/page.tsx). Оставлено на будущее, если понадобится
  // диагностировать что-то ещё в этом файле.
  rawTeamFields: Record<string, unknown>;
}

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// ПОДТВЕРЖДЁННЫЙ баг (сверено пользователем с реальными суммами на самом
// hattrick.org): все денежные поля economy.xml приходят в 10 раз меньше
// реальной суммы. Проверка на null/undefined/NaN — до умножения, а не после,
// чтобы отсутствующее или нечисловое поле безопасно давало 0, а не NaN/сбой
// (именно так проявился прошлый 500-эффект при поспешном фиксе).
function money(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n * 10 : 0;
}

// Разбирает недельный блок economy.xml — общий для "этой" (без префикса) и
// "прошлой" (префикс "Last") недели, поля называются одинаково с точностью
// до префикса (подтверждено по независимому CHPP-клиенту
// github.com/lucianoq/hattrick): IncomeSpectators/LastIncomeSpectators,
// CostsPlayers/LastCostsPlayers и т.д. Итоговые суммы (IncomeSum/CostsSum)
// читаются напрямую из ответа CHPP, а не пересчитываются из статей — так
// показанный итог гарантированно совпадает с реальным, даже если какая-то
// мелкая статья не разбита отдельно.
function parseWeekData(team: Record<string, unknown>, prefix: "" | "Last", profitFieldName: string): FinanceWeekData {
  const field = (name: string) => team[`${prefix}${name}`];

  const spectators = money(field("IncomeSpectators"));
  const sponsors = money(field("IncomeSponsors"));
  const commission = money(field("IncomeFinancial"));
  const temporaryIncome = money(field("IncomeTemporary"));
  const incomeSumRaw = field("IncomeSum");
  const incomeSum = incomeSumRaw !== undefined ? money(incomeSumRaw) : spectators + sponsors + commission + temporaryIncome;

  // CostsPlayers — так называется поле в уже подтверждённом на живом ответе
  // разборе; CostsPlayer (без "s") оставлен как запасной вариант названия
  // на случай расхождения по недельному префиксу.
  const players = money(field("CostsPlayers") ?? field("CostsPlayer"));
  const arena = money(field("CostsArena"));
  const staff = money(field("CostsStaff"));
  const youth = money(field("CostsYouth"));
  const interest = money(field("CostsFinancial"));
  const temporaryExpense = money(field("CostsTemporary"));
  const costsSumRaw = field("CostsSum");
  const expenseSum = costsSumRaw !== undefined ? money(costsSumRaw) : players + arena + staff + youth + interest + temporaryExpense;

  const profitRaw = team[profitFieldName];
  const profit = profitRaw !== undefined ? money(profitRaw) : incomeSum - expenseSum;

  return {
    income: { spectators, sponsors, commission, temporary: temporaryIncome },
    incomeSum,
    expense: { players, arena, staff, youth, interest, temporary: temporaryExpense },
    expenseSum,
    profit,
  };
}

// Разбирает XML-ответ CHPP на файл economy.xml — оттуда же берутся и
// финансы, и данные о болельщиках (в CHPP нет отдельного файла fans.xml,
// всё нужное уже есть здесь: Cash, FanClubSize, SupportersPopularity).
export function parseEconomyXml(xml: string): RealEconomy {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "economy");

  const team = root?.Team;
  if (!team) {
    throw new Error('В ответе economy.xml нет данных о команде ("Team").');
  }

  const popularityRaw = team.SupportersPopularityID ?? team.SupportersPopularity ?? 0;

  return {
    cash: money(team.Cash),
    expectedCash: money(team.ExpectedCash),
    fanClubSize: num(team.FanClubSize),
    supportersPopularity: num(popularityRaw),
    thisWeek: parseWeekData(team, "", "ExpectedWeeksTotal"),
    lastWeek: parseWeekData(team, "Last", "LastWeeksTotal"),
    rawTeamFields: team,
  };
}
