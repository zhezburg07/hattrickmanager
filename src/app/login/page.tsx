import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Войти по email — HattrickManager",
  description: "Быстрый вход в личный кабинет по email и паролю.",
};

export default function LoginPage() {
  return (
    <>
      <Header />
      <main>
        <LoginForm />
      </main>
      <Footer />
    </>
  );
}
