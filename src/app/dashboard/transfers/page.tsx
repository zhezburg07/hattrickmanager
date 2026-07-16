import Header from "@/components/Header";
import Footer from "@/components/Footer";
import TransfersSection from "@/components/dashboard/TransfersSection";
import styles from "@/components/dashboard/Dashboard.module.css";
import { getRequiredHattrickTokens } from "@/lib/hattrickApi";
import { resolveTransferListings } from "@/lib/transferMarket";

export default async function TransfersPage() {
  const tokens = getRequiredHattrickTokens();
  const { listings, error } = await resolveTransferListings(tokens);

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          <TransfersSection listings={listings} unavailable={error !== null} />
        </div>
      </main>
      <Footer />
    </>
  );
}
