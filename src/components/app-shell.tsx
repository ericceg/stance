import Link from "next/link";
import {
  ArrowDownToLine,
  ChartPie,
  ShieldCheck,
  Landmark,
  LayoutDashboard,
  Plus,
  ReceiptText,
  Settings2,
  TriangleAlert,
  WalletCards,
} from "lucide-react";

const navigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/breakdown", label: "Breakdown", icon: ChartPie },
  { href: "/holdings", label: "Holdings", icon: WalletCards },
  { href: "/transactions", label: "Transactions", icon: Landmark },
  { href: "/fees", label: "Fees", icon: ReceiptText },
  { href: "/import", label: "Import", icon: ArrowDownToLine },
];

const mobileNavigation = [
  ...navigation,
  { href: "/data-issues", label: "Data issues", icon: TriangleAlert },
  { href: "/settings", label: "Settings", icon: Settings2 },
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
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark"><ChartPie aria-hidden="true" /></span>
          <span><strong>Stance</strong><small>Investment workspace</small></span>
        </Link>

        <div className="workspace-label">Personal workspace<span>CHF</span></div>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link className={`nav-item ${active === label ? "is-active" : ""}`} aria-current={active === label ? "page" : undefined} href={href} key={label}>
              <Icon aria-hidden="true" />{label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-foot">
          <Link className={`nav-item ${active === "Data issues" ? "is-active" : ""}`} aria-current={active === "Data issues" ? "page" : undefined} href="/data-issues">
            <TriangleAlert aria-hidden="true" />Data issues
            <small className={issueCount > 0 ? "issue-count has-issues" : "issue-count"}>{issueCount}</small>
          </Link>
          <Link className={`nav-item ${active === "Settings" ? "is-active" : ""}`} aria-current={active === "Settings" ? "page" : undefined} href="/settings"><Settings2 aria-hidden="true" />Settings</Link>
          <div className="local-badge"><ShieldCheck aria-hidden="true" /><span><strong>Private by design</strong><small>Your portfolio. Your data.</small></span></div>
        </div>
      </aside>

      <main className="main-column" id="main-content" tabIndex={-1}>
        <header className="topbar">
          <div className="topbar-context"><span>Workspace</span><span>/</span><strong>{active}</strong></div>
          <Link className="primary-button" href="/transactions/new"><Plus aria-hidden="true" />Add transaction</Link>
        </header>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {mobileNavigation.map(({ href, label, icon: Icon }) => (
            <Link className={active === label ? "is-active" : ""} aria-current={active === label ? "page" : undefined} href={href} key={label}><Icon aria-hidden="true" />{label}</Link>
          ))}
        </nav>
        <div className="page-content"><div className="page-heading"><div><p>{eyebrow}</p><h1>{title}</h1></div><span className="reporting-badge">Reporting in <strong>CHF</strong></span></div>{children}<footer className="workspace-footer"><span>Stance · Personal investing, clearly.</span><Link href="/settings">Workspace settings</Link></footer></div>
      </main>
    </div>
  );
}
