import { FileText, Upload } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/Card";

export default function EarningsSummarizerPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Earnings Summarizer"
        description="Paste an earnings transcript or upload a report to generate the key takeaways, guidance changes, and analyst Q&A highlights."
        icon={FileText}
        action={
          <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-white hover:border-accent/60">
            <Upload className="h-4 w-4" /> Upload transcript
          </button>
        }
      />

      <Card>
        <CardBody className="space-y-4">
          <label className="block text-sm font-medium text-white">
            Transcript
          </label>
          <textarea
            rows={10}
            placeholder="Paste the earnings call transcript here…"
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-white placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex justify-end">
            <button className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover">
              Summarize
            </button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="text-sm font-semibold text-white">Summary</h2>
          <p className="mt-2 text-sm text-muted">
            Output will appear here once you run a summary.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
