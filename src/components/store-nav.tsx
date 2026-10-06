import Link from "next/link";

/** Menu da área da loja (perfil de parceira dentro da conta da usuária). */
export default function StoreNav({ active }: { active: "vitrine" | "provador" }) {
  return <nav className="admin-subnav" aria-label="Menu da loja">
    <Link href="/minha-vitrine" className={active === "vitrine" ? "active" : ""}>Minha vitrine</Link>
    <Link href="/provador" className={active === "provador" ? "active" : ""}>Provador</Link>
    <Link href="/vitrine">Ver a vitrine como cliente</Link>
  </nav>;
}
