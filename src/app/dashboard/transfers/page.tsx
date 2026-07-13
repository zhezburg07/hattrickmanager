import Header from "@/components/Header";
import Footer from "@/components/Footer";
import TransfersSection from "@/components/dashboard/TransfersSection";
import styles from "@/components/dashboard/Dashboard.module.css";

export default function TransfersPage() {
  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          <TransfersSection />
        </div>
      </main>
      <Footer />
    </>
  );
}
