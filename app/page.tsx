import Link from "next/link";
import { LayoutDashboard, ArrowUpRight, Activity, Zap, Clock } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/Card";
import { navigation } from "@/lib/navigation";

const stats = [
  { label: "Active tools", value: "7", icon: Zap },
  { label: "Runs this week", value: "—", icon: Activity },
  { label: "Last update", value: "Today", icon: Clock },
];

export default function DashboardPage() {
  const tools = navigation.filter((n) => n.href !== "/");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Welcome back. Jump into any tool below or check what's happening across your hub."
        icon={LayoutDashboard}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardBody className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">
                    {s.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {s.value}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <Icon className="h-5 w-5" />
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Your tools</h2>
            <p className="text-sm text-muted">
              Each card is a focused workspace. Add functionality as you go.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.href}
                href={tool.href}
                className="group rounded-xl border border-border bg-surface p-5 shadow-card transition-colors hover:border-accent/50 hover:bg-elevated"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted transition-colors group-hover:text-white" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-white">
                  {tool.name}
                </h3>
                <p className="mt-1 text-sm text-muted leading-snug">
                  {tool.description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
