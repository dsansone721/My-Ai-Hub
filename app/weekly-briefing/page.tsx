import { CalendarDays, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/Card";

const sections = [
  {
    title: "Markets",
    description: "Headline indices, sector rotation, and notable single names.",
  },
  {
    title: "Macro",
    description: "Rates, FX, commodities, and the data prints that mattered.",
  },
  {
    title: "Portfolio",
    description: "Performance, attribution, and risk on your watchlist.",
  },
  {
    title: "Reading list",
    description: "Long-form pieces worth your time this week.",
  },
];

export default function WeeklyBriefingPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Weekly Briefing"
        description="Your weekly market and portfolio briefing — generated on demand from the sources you trust."
        icon={CalendarDays}
        action={
          <button className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover">
            <RefreshCw className="h-4 w-4" /> Generate this week&rsquo;s briefing
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Card key={s.title}>
            <CardBody>
              <h3 className="text-sm font-semibold text-white">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.description}</p>
              <p className="mt-4 text-xs text-muted/80">
                Briefing not yet generated.
              </p>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
