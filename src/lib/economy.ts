import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";

export interface FinanceIncomeBreakdown {
  spectators: number; // IncomeSpectators
  sponsors: number; // IncomeSponsors
  commission: number; // IncomeFinancial
  // IncomeTemporary — Hattrick не делит эту сумму на "проданные игроки",
  // "разовые бонусы" и т.п. отдельными полями, так что показываем её одной
  // строкой, не пытаясь угадать дальнейшую разбивку.
  temporary: number;
}

export interface FinanceExpenseBreakdown {
  players: number; // CostsPlayers — Зарплата
  arena: number; // CostsArena — Содержание стадиона
  staff: number; // CostsStaff — Персонал
  youth: number; // CostsYouth — Затраты на молодёжь
  interest: number; // CostsFinancial — Проценты по кредиту
  // CostsTemporary — сюда же входят "купленные игроки" и "строительство
  // стадиона" (отдельных полей под них Hattrick не даёт) — одна строка, без
  // дальнейшего дробления.
  temporary: number;
}

export interface FinanceWeekData {
  income: FinanceIncomeBreakdown;
  incomeSum: number; // = сумма всех статей income выше
  expense: FinanceExpenseBreakdown;
  expenseSum: number; // = сумма всех статей expense выше
  cash: number;
}

export interface RealEconomy {
  cash: number;
  fanClubSize: number;
  supportersPopularity: number; // 0-9, официальная шкала CHPP (SupportersPopularityID)
  thisWeek: FinanceWeekData;
  // То же самое, что thisWeek.incomeSum/expenseSum — оставлено отдельными
  // скалярными полями для обратной совместимости с FinanceSummary.tsx
  // (Обзор) и dashboard/page.tsx, которые ждут именно эти имена.
  lastWeekIncome: number;
  lastWeekExpense: number;
  // Сырые поля <Team> из economy.xml — раньше показывались во временной
  // диагностической панели (см. историю SHOW_ECONOMY_DEBUG в
  // dashboard/finance/page.tsx), пока названия полей ниже не были сверены с
  // живым ответом. Сейчас сверены — оставлено на будущее, если понадобится
  // диагностировать что-то ещё в этом файле.
  rawTeamFields: Record<string, unknown>;
}

function num(value: unknown): number {
  return Number(value ?? 0);
}

// Названия полей ниже подтверждены на реальном ответе economy.xml (см.
// диагностику в чате): IncomeSpectators, IncomeSponsors, IncomeTemporary,
// IncomeFinancial, CostsArena, CostsPlayers, CostsStaff, CostsYouth,
// CostsTemporary, CostsFinancial, Cash. Hattrick не отдаёт отдельные поля
// для "проданных"/"купленных игроков" и "строительства стадиона" — эти
// суммы физически входят в IncomeTemporary/CostsTemporary, поэтому здесь
// показывается только то, что реально можно разделить, а "Разовый"
// остаётся единой строкой без дальнейшего дробления.
function parseWeekData(team: Record<string, unknown>): FinanceWeekData {
  const spectators = num(team.IncomeSpectators);
  const sponsors = num(team.IncomeSponsors);
  const commission = num(team.IncomeFinancial);
  const temporaryIncome = num(team.IncomeTemporary);
  const incomeSum = spectators + sponsors + commission + temporaryIncome;

  const players = num(team.CostsPlayers);
  const arena = num(team.CostsArena);
  const staff = num(team.CostsStaff);
  const youth = num(team.CostsYouth);
  const interest = num(team.CostsFinancial);
  const temporaryExpense = num(team.CostsTemporary);
  const expenseSum = players + arena + staff + youth + interest + temporaryExpense;

  return {
    income: { spectators, sponsors, commission, temporary: temporaryIncome },
    incomeSum,
    expense: { players, arena, staff, youth, interest, temporary: temporaryExpense },
    expenseSum,
    cash: num(team.Cash),
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
  const thisWeek = parseWeekData(team);

  return {
    cash: num(team.Cash),
    fanClubSize: num(team.FanClubSize),
    supportersPopularity: num(popularityRaw),
    thisWeek,
    lastWeekIncome: thisWeek.incomeSum,
    lastWeekExpense: thisWeek.expenseSum,
    rawTeamFields: team,
  };
}
