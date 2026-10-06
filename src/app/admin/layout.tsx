import type { ReactNode } from "react";
import AdminNav from "./admin-nav";

/** Moldura da área de Gerenciamento do app (separada do Perfil): título + atalhos entre as áreas.
 * O controle de acesso continua em cada página/ação (funções SQL só respondem a administradora). */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="admin-shell" style={{ maxWidth: 760, margin: "0 auto", padding: "16px 16px 0" }}>
    <span className="eyebrow">GERENCIAMENTO DO APP</span>
    <AdminNav />
    {children}
  </div>;
}
