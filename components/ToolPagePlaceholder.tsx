import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/Card";
import { findItem } from "@/lib/navigation";

type Props = {
  href: string;
  note?: string;
};

export function ToolPagePlaceholder({ href, note }: Props) {
  const item = findItem(href);
  if (!item) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-muted">
            Missing nav entry for <code className="text-white">{href}</code>.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={item.name}
        description={item.description}
        icon={item.icon}
      />

      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-center gap-2 text-accent">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Coming soon
            </span>
          </div>
          <p className="text-sm text-muted">
            {note ??
              `This is the workspace for ${item.name}. Wire up your data sources, prompts, or UI here — the layout, navigation, and styling will stay consistent across the hub.`}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
