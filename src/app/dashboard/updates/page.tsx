import Header from "@/components/Header";
import Footer from "@/components/Footer";
import UpdatesSection from "@/components/dashboard/UpdatesSection";
import styles from "@/components/dashboard/Dashboard.module.css";

export default function UpdatesPage() {
  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.stack}`} style={{ paddingBottom: 72 }}>
          <UpdatesSection />
        </div>
      </main>
      <Footer />
    </>
  );
}
