import { AppShell } from "@/components/app-shell";
import { SettingsPreferences } from "@/components/settings-preferences";

export default function SettingsPage() {
  return (
    <AppShell active="Settings" eyebrow="Application preferences" title="Settings">
      <section className="page-card settings-card">
        <div className="section-heading">
          <div><p>Performance chart</p><h2>Chart preferences</h2></div>
        </div>
        <SettingsPreferences />
      </section>
    </AppShell>
  );
}
