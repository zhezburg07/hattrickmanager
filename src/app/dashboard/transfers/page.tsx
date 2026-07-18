import Header from "@/components/Header";
import Footer from "@/components/Footer";
import TransfersSection from "@/components/dashboard/TransfersSection";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens } from "@/lib/hattrickApi";
import { resolveTransferHistory } from "@/lib/transferMarket";

export default async function TransfersPage() {
  const tokens = await getRequiredHattrickTokens();
  const { data: history, error } = await resolveTransferHistory(tokens);

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          <TransfersSection history={history} historyError={error} />
        </div>
      </main>
      <Footer />
    </>
  );
}
