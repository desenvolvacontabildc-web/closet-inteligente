"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, ReactNode> = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 11.5 12 4l8 7.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  closet: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v4M12 7l-8 5v9h16v-9l-8-5Z" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  looks: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>,
  vitrine: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 8 5.5 4h13L20 8" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 8v11h16V8" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 12v3M15 12v3" strokeLinecap="round"/></svg>,
  perfil: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6" strokeLinecap="round"/></svg>,
};

const TABS = [
  { href: "/home", key: "home", label: "Início" },
  { href: "/closet", key: "closet", label: "Meu Closet" },
  { href: "/looks", key: "looks", label: "Looks" },
  { href: "/vitrine", key: "vitrine", label: "Vitrine" },
  { href: "/perfil", key: "perfil", label: "Perfil" },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={pathname === t.href ? "active" : ""}>
          {ICONS[t.key]}
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
