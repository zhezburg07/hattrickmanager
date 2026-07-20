import type { Metadata } from "next";
import { Suspense } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ResetPasswordForm from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Новый пароль — HattrickManager",
  description: "Установка нового пароля по ссылке из письма.",
};

export default function ResetPasswordPage() {
  return (
    <>
      <Header />
      <main>
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
