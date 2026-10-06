"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, ReactNode> = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 11.5 12 4l8 7.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  closet: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v4M12 7l-8 5v9h16v-9l-8-5Z" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  looks: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>,
  vitrine: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 8 5.5 4h13L20 8" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 8v11h16V8" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 12v3M15 12v3" strokeLinecap="round"/></svg>,
  loja: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 9.5 5.5 4h13L20 9.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0M5.5 12.5V20h13v-7.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  gestao: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  perfil: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6" strokeLinecap="round"/></svg>,
};

const TABS = [
  { href: "/home", key: "home", label: "Início" },
  { href: "/closet", key: "closet", label: "Meu Closet" },
  { href: "/looks", key: "looks", label: "Looks" },
  { href: "/vitrine", key: "vitrine", label: "Vitrine" },
  { href: "/perfil", key: "perfil", label: "Perfil" },
];

export default function BottomNav({ isAdmin = false, adminBadge = 0, hasStore = false }: { isAdmin?: boolean; adminBadge?: number; hasStore?: boolean }) {
  const pathname = usePathname();
  // Administradora ganha a aba "Gestão" (separada do Perfil), com selo de avisos não lidos.
  const extra = [
    ...(hasStore ? [{ href: "/minha-vitrine", key: "loja", label: "Minha loja" }] : []),
    ...(isAdmin ? [{ href: "/admin", key: "gestao", label: "Gestão" }] : []),
  ];
  const tabs = [...TABS.slice(0, 4), ...extra, TABS[4]];
  return (
    <nav className="bottom-nav">
      {tabs.map((t) => {
        const active = t.href === "/admin" ? pathname.startsWith("/admin")
          : t.href === "/minha-vitrine" ? pathname.startsWith("/minha-vitrine") || pathname.startsWith("/provador")
          : pathname === t.href;
        return (
          <Link key={t.href} href={t.href} className={active ? "active" : ""}>
            <span className="nav-icon">
              {ICONS[t.key]}
              {t.key === "gestao" && adminBadge > 0 && <span className="nav-badge" aria-label={`${adminBadge} aviso${adminBadge === 1 ? "" : "s"} novo${adminBadge === 1 ? "" : "s"}`}>{adminBadge > 9 ? "9+" : adminBadge}</span>}
            </span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
