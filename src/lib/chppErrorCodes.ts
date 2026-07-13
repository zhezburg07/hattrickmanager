// Официальные коды ошибок CHPP (из документации Hattrick).
export const chppErrorCodeName: Record<number, string> = {
  [-1]: "NoInformation",
  0: "NotLoggedIn",
  1: "AccessDenied",
  2: "FileNotSpecified",
  3: "FileNotSupported",
  4: "POSTNotSupported",
  5: "MustUsePOSTForThisAction",
  6: "OnlyForSupporters",
  7: "NotSupportedVersion",
  10: "InvalidParameter",
  50: "UnknownTeamID",
  51: "UnknownMatchID",
  52: "UnknownActionType",
  53: "MatchIDNotSubscribedTo",
  54: "UnknownYouthTeamID",
  55: "UnknownYouthPlayerID",
  56: "UnknownPlayerID",
  57: "UnknownLeagueID",
  58: "UnknownLeagueLevelUnitID",
};

export const chppErrorCodeDescriptionRu: Record<number, string> = {
  [-1]: "Нет информации",
  0: "Не авторизован — токен недействителен, просрочен или не был передан",
  1: "Доступ запрещён этому приложению",
  2: "В запросе не указан параметр file",
  3: "Такой файл не поддерживается CHPP",
  4: "Метод POST не поддерживается для этого файла",
  5: "Для этого действия нужен метод POST",
  6: "Доступно только пользователям с Hattrick Supporter",
  7: "Неподдерживаемая версия API (параметр version)",
  10: "Некорректный параметр запроса",
  50: "Неизвестный TeamID",
  51: "Неизвестный MatchID",
  52: "Неизвестный actionType",
  53: "MatchID, на который нет подписки",
  54: "Неизвестный юношеский TeamID",
  55: "Неизвестный юношеский PlayerID",
  56: "Неизвестный PlayerID",
  57: "Неизвестный LeagueID",
  58: "Неизвестный LeagueLevelUnitID",
};

export function describeChppErrorCode(code: number): string {
  const name = chppErrorCodeName[code] ?? "Unknown";
  const description = chppErrorCodeDescriptionRu[code] ?? "неизвестный код ошибки";
  return `${code} (${name}) — ${description}`;
}
