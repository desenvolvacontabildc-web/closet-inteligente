"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Início" },
  { href: "/admin/usuarias", label: "Usuárias" },
  { href: "/admin/precos", label: "Preços" },
  { href: "/admin/descontos", label: "Descontos" },
  { href: "/admin/beneficios", label: "Benefícios" },
  { href: "/admin/parceiras", label: "Parcerias" },
  { href: "/admin/tendencias", label: "Tendências" },
  { href: "/admin/achadinhos", label: "Achadinhos" },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="admin-subnav" aria-label="Áreas de gerenciamento">
      {LINKS.map((l) => {
        const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
        return <Link key={l.href} href={l.href} className={active ? "active" : ""}>{l.label}</Link>;
      })}
    </nav>
  );
}
