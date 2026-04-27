import { Eye, Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/Card";

const columns = [
  { name: "Watching", count: 0 },
  { name: "In Progress", count: 0 },
  { name: "Action Taken", count: 0 },
];

export default function SpottingBoardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Spotting Board"
        description="Track ideas, leads, and opportunities through your pipeline. Drag cards as their status changes."
        icon={Eye}
        action={
          <button className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover">
            <Plus className="h-4 w-4" /> Add card
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {columns.map((col) => (
          <Card key={col.name} className="bg-surface/60">
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">{col.name}</h3>
                <span className="rounded-md bg-elevated px-2 py-0.5 text-xs text-muted">
                  {col.count}
                </span>
              </div>
              <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted">
                No items yet
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
