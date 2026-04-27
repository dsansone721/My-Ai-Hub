import Link from "next/link";
import { LayoutDashboard, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { sections } from "@/lib/navigation";

export default function DashboardPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        title="Dashboard"
        description="Welcome back. Jump into any tool below — they're grouped by Work and School."
        icon={LayoutDashboard}
      />

      {sections.map((section) => {
        const SectionIcon = section.icon;
        return (
          <section key={section.name} className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <SectionIcon className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {section.name}
                </h2>
                <p className="text-xs text-muted">
                  {section.subsections.length} groups ·{" "}
                  {section.subsections.reduce(
                    (n, s) => n + s.items.length,
                    0
                  )}{" "}
                  tools
                </p>
              </div>
            </div>

            {section.subsections.map((sub) => {
              const SubIcon = sub.icon;
              return (
                <div key={sub.name} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <SubIcon className="h-3.5 w-3.5 text-muted" />
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {sub.name}
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {sub.items.map((tool) => {
                      const Icon = tool.icon;
                      return (
                        <Link
                          key={tool.href}
                          href={tool.href}
                          className="group rounded-xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent/50 hover:bg-elevated"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
                              <Icon className="h-4 w-4" />
                            </div>
                            <ArrowUpRight className="h-4 w-4 text-muted transition-colors group-hover:text-white" />
                          </div>
                          <h4 className="mt-3 text-sm font-semibold text-white">
                            {tool.name}
                          </h4>
                          <p className="mt-1 text-xs leading-snug text-muted">
                            {tool.description}
                          </p>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
