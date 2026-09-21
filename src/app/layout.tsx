import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Closet Inteligente", themeColor: "#b25b76" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
import "./globals.css";
