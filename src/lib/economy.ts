import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";

export interface FinanceIncomeBreakdown {
  spectators: number;
  sponsors: number;
  soldPlayers: number;
  commission: number;
  // Остаток: incomeSum минус все статьи выше. Гарантирует, что сумма
  // показанных строк всегда точно совпадает с реальным итогом Hattrick,
  // даже если какое-то из предполагаемых названий полей ниже (see comment
  // above parseWeekData) в вашем ответе отсутствует или называется иначе.
  other: number;
}

export interface FinanceExpenseBreakdown {
  players: number; // Зарплата
  arena: number; // Содержание стадиона
  arenaBuilding: number; // Строительство стадиона
  staff: number; // Персонал
  youth: number; // Затраты на молодёжь
  boughtPlayers: number; // Купленные игроки (включает ЗП за 1-ю неделю в клубе)
  interest: number; // Проценты по кредиту
  // Остаток — см. комментарий у FinanceIncomeBreakdown.other.
  other: number;
}

export interface FinanceWeekData {
  income: FinanceIncomeBreakdown;
  incomeSum: number;
  expense: FinanceExpenseBreakdown;
  expenseSum: number;
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
  // Сырые поля <Team> из economy.xml — только для временной диагностической
  // панели (см. SHOW_ECONOMY_DEBUG в dashboard/finance/page.tsx), чтобы
  // можно было свериться с реальными названиями полей, если какие-то из
  // предположений ниже окажутся не теми на живом аккаунте.
  rawTeamFields: Record<string, unknown>;
}

function num(value: unknown): number {
  return Number(value ?? 0);
}

// Подтверждённые на реальном ответе economy.xml названия полей (см.
// git-историю, задача "Wire Финансы page to real economy.xml data"): Cash,
// SupportersPopularityID, FanClubSize, LastIncomeSpectators,
// LastIncomeSponsors, LastIncomeTemporary, LastIncomeFinancial,
// LastIncomeSum, LastCostsPlayers, LastCostsArena, LastCostsStaff,
// LastCostsYouth, LastCostsTemporary, LastCostsFinancial, LastCostsSum.
//
// Более детальные статьи (проданные/купленные игроки отдельно, строительство
// стадиона отдельно от содержания, комиссионные, проценты по кредиту)
// открытая документация CHPP не описывает — ниже лучшие предположения по
// правдоподобным названиям полей. Если поле не нашлось, остаётся 0, а
// разница уходит в статью "Разовый" (FinanceIncomeBreakdown.other /
// FinanceExpenseBreakdown.other) — поэтому итоговые суммы дохода/расхода
// (incomeSum/expenseSum, из подтверждённых LastIncomeSum/LastCostsSum)
// всегда верны независимо от того, угаданы ли более мелкие статьи.
function parseWeekData(team: Record<string, unknown>): FinanceWeekData {
  const incomeSum = num(team.LastIncomeSum);
  const expenseSum = num(team.LastCostsSum);

  const spectators = num(team.LastIncomeSpectators);
  const sponsors = num(team.LastIncomeSponsors);
  const soldPlayers = num(team.LastIncomeSoldPlayers);
  const commission = num(team.LastIncomeCommission ?? team.LastIncomeFinancial);
  const incomeOther = incomeSum - spectators - sponsors - soldPlayers - commission;

  const players = num(team.LastCostsPlayers);
  const arena = num(team.LastCostsArena);
  const arenaBuilding = num(team.LastCostsArenaBuilding ?? team.LastCostsStadiumBuilding);
  const staff = num(team.LastCostsStaff);
  const youth = num(team.LastCostsYouth);
  const boughtPlayers = num(team.LastCostsBoughtPlayers ?? team.LastCostsTransfer);
  const interest = num(team.LastCostsInterest ?? team.LastCostsFinancial);
  const expenseOther = expenseSum - players - arena - arenaBuilding - staff - youth - boughtPlayers - interest;

  return {
    income: { spectators, sponsors, soldPlayers, commission, other: incomeOther },
    incomeSum,
    expense: { players, arena, arenaBuilding, staff, youth, boughtPlayers, interest, other: expenseOther },
    expenseSum,
    cash: num(team.Cash),
  };
}

// Разбирает XML-ответ CHPP на файл economy.xml — оттуда же берутся и
// финансы, и данные о болельщиках (в CHPP нет отдельного файла fans.xml,
// всё нужное уже есть здесь: Cash, LastIncomeSum/LastCostsSum, FanClubSize,
// SupportersPopularity).
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
