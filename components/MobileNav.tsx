"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Sparkles } from "lucide-react";
import { navigation } from "@/lib/navigation";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="md:hidden">
      <div className="flex items-center justify-between h-14 px-4 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold text-white">My AI Hub</span>
        </div>
        <button
          aria-label="Toggle navigation"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md p-2 text-muted hover:bg-elevated hover:text-white"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <nav className="border-b border-border bg-surface px-3 py-3 space-y-1">
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
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-accent-soft text-white"
                    : "text-muted hover:bg-elevated hover:text-white"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-accent" : ""}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
