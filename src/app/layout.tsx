import type { Metadata } from "next";
import type { ReactNode } from "react";
import { withProfile } from "@/server/profile-session";
import { resolveAccent } from "@/server/accent";
import BottomNav from "./bottom-nav";

export const metadata: Metadata = { title: "Closet Inteligente", themeColor: "#a9714c" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  let profile = null;
  try {
    profile = await withProfile(async (c, userId) => {
      const q = await c.query("SELECT experience_tokens FROM profiles WHERE user_id=$1 AND onboarding_completed", [userId]);
      return q.rows[0] || null;
    });
  } catch { /* nunca deixar um erro aqui derrubar o layout inteiro do site */ }
  const accent = resolveAccent(profile?.experience_tokens?.accent);
  return (
    <html lang="pt-BR">
      <body style={{ "--accent": accent } as React.CSSProperties}>
        {children}
        {profile && <BottomNav />}
      </body>
    </html>
  );
}
import "./globals.css";
