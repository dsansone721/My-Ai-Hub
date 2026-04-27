"use client";

import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { NavTree } from "./NavTree";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-border bg-surface">
      <div className="flex items-center gap-2 px-6 h-16 border-b border-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight text-white">My AI Hub</p>
          <p className="text-[11px] text-muted -mt-0.5">Personal workspace</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <NavTree pathname={pathname} />
      </nav>

      <div className="border-t border-border px-4 py-4">
        <div className="rounded-lg bg-elevated p-3">
          <p className="text-xs font-medium text-white">Deployed on Vercel</p>
          <p className="mt-1 text-[11px] leading-snug text-muted">
            Push to main to ship updates automatically.
          </p>
        </div>
      </div>
    </aside>
  );
}
