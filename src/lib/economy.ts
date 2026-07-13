import { XMLParser } from "fast-xml-parser";
import { assertNoChppError } from "./chppError";

export interface RealFinanceLine {
  label: string;
  amount: number;
}

export interface RealEconomy {
  cash: number;
  lastWeekIncome: number;
  lastWeekExpense: number;
  fanClubSize: number;
  supportersPopularity: number; // 0-9, официальная шкала CHPP (SupportersPopularityID)
  // Разбивка дохода/расхода за последнюю неделю — читается из LastIncome*/
  // LastCosts* полей (то же, что дают LastIncomeSum/LastCostsSum в сумме).
  incomeBreakdown: RealFinanceLine[];
  expenseBreakdown: RealFinanceLine[];
}

// Разбирает XML-ответ CHPP на файл economy.xml — оттуда же берутся и
// финансы, и данные о болельщиках (в CHPP нет отдельного файла fans.xml,
// всё нужное уже есть здесь: Cash, LastIncomeSum/LastCostsSum,
// FanClubSize, SupportersPopularity).
export function parseEconomyXml(xml: string): RealEconomy {
  const parser = new XMLParser();
  const data = parser.parse(xml);

  const root = data?.HattrickData;
  assertNoChppError(root, "economy");

  const team = root?.Team;
  if (!team) {
    throw new Error('В ответе economy.xml нет данных о команде ("Team").');
  }

  // В разных источниках это поле встречается и как SupportersPopularity, и
  // как SupportersPopularityID — проверяем оба варианта на всякий случай.
  const popularityRaw = team.SupportersPopularityID ?? team.SupportersPopularity ?? 0;

  const incomeBreakdown: RealFinanceLine[] = [
    { label: "Зрители", amount: Number(team.LastIncomeSpectators ?? 0) },
    { label: "Спонсоры", amount: Number(team.LastIncomeSponsors ?? 0) },
    { label: "Разовые (трансферы и др.)", amount: Number(team.LastIncomeTemporary ?? 0) },
    { label: "Финансовые операции", amount: Number(team.LastIncomeFinancial ?? 0) },
  ];

  const expenseBreakdown: RealFinanceLine[] = [
    { label: "Зарплаты игроков", amount: Number(team.LastCostsPlayers ?? 0) },
    { label: "Содержание стадиона", amount: Number(team.LastCostsArena ?? 0) },
    { label: "Персонал", amount: Number(team.LastCostsStaff ?? 0) },
    { label: "Молодёжная академия", amount: Number(team.LastCostsYouth ?? 0) },
    { label: "Разовые", amount: Number(team.LastCostsTemporary ?? 0) },
    { label: "Финансовые операции", amount: Number(team.LastCostsFinancial ?? 0) },
  ];

  return {
    cash: Number(team.Cash ?? 0),
    lastWeekIncome: Number(team.LastIncomeSum ?? 0),
    lastWeekExpense: Number(team.LastCostsSum ?? 0),
    fanClubSize: Number(team.FanClubSize ?? 0),
    supportersPopularity: Number(popularityRaw),
    incomeBreakdown,
    expenseBreakdown,
  };
}
