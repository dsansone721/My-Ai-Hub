"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { navigation } from "@/lib/navigation";

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

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-accent-soft text-white"
                  : "text-muted hover:bg-elevated hover:text-white"
              }`}
            >
              <Icon
                className={`h-4 w-4 flex-shrink-0 ${
                  isActive ? "text-accent" : "text-muted group-hover:text-white"
                }`}
              />
              <span className="truncate">{item.name}</span>
              {isActive && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />
              )}
            </Link>
          );
        })}
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
