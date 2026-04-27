import { Search, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/Card";

export default function ResearchAssistantPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Research Assistant"
        description="Ask a deep research question and the assistant will gather sources, synthesize findings, and cite as it goes."
        icon={Search}
      />

      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 focus-within:border-accent">
            <Search className="h-4 w-4 text-muted" />
            <input
              type="text"
              placeholder="What do you want to research?"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-muted focus:outline-none"
            />
            <button className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-white hover:bg-accent-hover">
              <Sparkles className="h-3.5 w-3.5" /> Research
            </button>
          </div>
          <p className="text-xs text-muted">
            Try: &ldquo;Compare the moats of NVDA, AMD, and AVGO over the last
            five years.&rdquo;
          </p>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardBody>
            <h2 className="text-sm font-semibold text-white">Findings</h2>
            <p className="mt-2 text-sm text-muted">
              Run a query above and your synthesized answer will appear here
              with inline citations.
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="text-sm font-semibold text-white">Sources</h2>
            <p className="mt-2 text-sm text-muted">
              No sources yet.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
