import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SquadTable from "@/components/dashboard/SquadTable";
import DemoModeBanner from "@/components/dashboard/DemoModeBanner";
import SyncFailedScreen from "@/components/dashboard/SyncFailedScreen";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens, getStoredHattrickUserId } from "@/lib/hattrickApi";
import { ensureSynced, getStoredSquadData } from "@/lib/chppSync";
import { getPreviousWeekSnapshots, trainingWeekKey } from "@/lib/playerHistoryDb";
import { getAllRoleCalibrations } from "@/lib/matchRolePredictionsDb";
import { RATING_FORMULA_VERSION } from "@/components/dashboard/zoneRatings";

// Раньше эта страница сама делала живые запросы к CHPP (players.xml,
// teamdetails.xml, matchlineup.xml для рейтингов последних матчей,
// worlddetails.xml для флагов игроков) при каждом открытии. Теперь читает
// уже сохранённые данные (см. src/lib/chppSync.ts — тот же ключ "players",
// что использует Обзор, только обогащён национальностью и рейтингами
// последних матчей, которые Обзору не требовались). Сама синхронизация
// происходит один раз автоматически при первом визите в кабинет (см.
// dashboard/page.tsx, ensureSynced) или по кнопке "Обновить данные".
export default async function SquadPage() {
  const tokens = await getRequiredHattrickTokens();
  const hattrickUserId = await getStoredHattrickUserId();

  const syncStatus = hattrickUserId ? await ensureSynced(hattrickUserId, tokens) : null;
  if (syncStatus && syncStatus.status === "failed" && !syncStatus.lastSyncedAt) {
    return <SyncFailedScreen lastError={syncStatus.lastError} />;
  }

  const { players, error, trainerPlayerId } = hattrickUserId
    ? await getStoredSquadData(hattrickUserId)
    : { players: null, error: null, trainerPlayerId: undefined };

  // Стрелки роста/падения навыков — сравнение с предыдущей ТРЕНИРОВОЧНОЙ
  // неделей (см. src/lib/playerHistoryDb.ts). Запись текущего снимка теперь
  // происходит во время синхронизации (см. chppSync.ts) — здесь только
  // чтение уже сохранённого предыдущего снимка, без похода в CHPP.
  const prevByPlayerId =
    players && hattrickUserId ? await getPreviousWeekSnapshots(hattrickUserId, trainingWeekKey(new Date())) : {};

  // "Потенциал" здесь теперь считается той же формулой, что и число на
  // слоте поля (computePlayerPotential в zoneRatings.ts), включая
  // калибровку по реальным звёздам — коэффициенты общие на все аккаунты
  // (см. тот же приём в dashboard/lineup/page.tsx). Пустой объект (а не
  // ошибка), если БД недоступна или данных ещё мало.
  let calibrations: Awaited<ReturnType<typeof getAllRoleCalibrations>> = {};
  try {
    calibrations = await getAllRoleCalibrations(RATING_FORMULA_VERSION);
  } catch {
    // Калибровка — необязательное дополнение поверх сырого рейтинга, не
    // должна ронять саму страницу "Состав".
  }

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          {error && <DemoModeBanner title="Не удалось загрузить реальный состав" reasons={[error]} />}
          {players && (
            <SquadTable
              players={players}
              prevByPlayerId={prevByPlayerId}
              trainerPlayerId={trainerPlayerId}
              calibrations={calibrations}
            />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
