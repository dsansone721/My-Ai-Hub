import { LineChart, Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/Card";

const templates = [
  {
    name: "DCF Valuation",
    description: "Project free cash flows and discount to present value.",
  },
  {
    name: "Comparable Companies",
    description: "Multiples-based valuation against a peer set.",
  },
  {
    name: "Three-Statement Model",
    description: "Linked income statement, balance sheet, and cash flows.",
  },
  {
    name: "LBO Model",
    description: "Debt-financed buyout returns analysis.",
  },
];

export default function FinancialModelsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Financial Models"
        description="Spin up valuation, forecast, and scenario models. Start from a template or import an existing workbook."
        icon={LineChart}
        action={
          <button className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover">
            <Plus className="h-4 w-4" /> New model
          </button>
        }
      />

      <section>
        <h2 className="text-sm font-semibold text-white">Templates</h2>
        <p className="text-sm text-muted">Start from a battle-tested layout.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.name}>
              <CardBody>
                <h3 className="text-sm font-semibold text-white">{t.name}</h3>
                <p className="mt-1 text-sm text-muted">{t.description}</p>
                <button className="mt-4 text-xs font-medium text-accent hover:text-accent-hover">
                  Use template →
                </button>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-white">Recent models</h2>
        <Card className="mt-4">
          <CardBody>
            <p className="text-sm text-muted">
              No models yet. Create one to get started.
            </p>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
