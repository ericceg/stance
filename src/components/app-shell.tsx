import Link from "next/link";
import {
  ArrowDownToLine,
  DatabaseZap,
  Landmark,
  LayoutDashboard,
  Plus,
  Settings2,
  TriangleAlert,
  WalletCards,
} from "lucide-react";

const navigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/#holdings", label: "Holdings", icon: WalletCards },
  { href: "/transactions", label: "Transactions", icon: Landmark },
  { href: "/import", label: "Import", icon: ArrowDownToLine },
];

export function AppShell({
  children,
  active = "Overview",
  issueCount = 0,
  title,
  eyebrow,
}: {
  children: React.ReactNode;
  active?: string;
  issueCount?: number;
  title: string;
  eyebrow: string;
}) {
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">P</span>
          <span><strong>PersPort</strong><small>Portfolio</small></span>
        </Link>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link className={`nav-item ${active === label ? "is-active" : ""}`} href={href} key={label}>
              <Icon aria-hidden="true" />{label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-foot">
          <Link className={`nav-item ${active === "Data issues" ? "is-active" : ""}`} href="/data-issues">
            <TriangleAlert aria-hidden="true" />Data issues
            <small className={issueCount > 0 ? "issue-count has-issues" : "issue-count"}>{issueCount}</small>
          </Link>
          <span className="nav-item is-disabled" aria-disabled="true"><Settings2 aria-hidden="true" />Settings<small>Soon</small></span>
          <div className="local-badge"><DatabaseZap aria-hidden="true" /><span><strong>Local data</strong><small>SQLite · private</small></span></div>
        </div>
      </aside>

      <main className="main-column">
        <header className="topbar">
          <div><p>{eyebrow}</p><h1>{title}</h1></div>
          <Link className="primary-button" href="/transactions/new"><Plus aria-hidden="true" />Transaction</Link>
        </header>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link className={active === label ? "is-active" : ""} href={href} key={label}><Icon aria-hidden="true" />{label}</Link>
          ))}
        </nav>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
