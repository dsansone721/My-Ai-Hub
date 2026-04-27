import type { LucideIcon } from "lucide-react";

type PageHeaderProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  action?: React.ReactNode;
};

export function PageHeader({ title, description, icon: Icon, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-start md:justify-between">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
        </div>
      </div>
      {action && <div className="md:flex-shrink-0">{action}</div>}
    </div>
  );
}
