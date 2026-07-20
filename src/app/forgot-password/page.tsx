import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Забыли пароль — HattrickManager",
  description: "Сброс пароля для входа по email.",
};

export default function ForgotPasswordPage() {
  return (
    <>
      <Header />
      <main>
        <ForgotPasswordForm />
      </main>
      <Footer />
    </>
  );
}
