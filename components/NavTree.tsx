"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  sections,
  type NavSection,
  type NavSubsection,
  type NavItem,
} from "@/lib/navigation";

function isItemActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function subsectionContainsActive(sub: NavSubsection, pathname: string) {
  return sub.items.some((i) => isItemActive(i.href, pathname));
}

function sectionContainsActive(section: NavSection, pathname: string) {
  return section.subsections.some((s) => subsectionContainsActive(s, pathname));
}

type Props = {
  pathname: string;
  onNavigate?: () => void;
};

export function NavTree({ pathname, onNavigate }: Props) {
  return (
    <div className="space-y-1">
      {sections.map((section) => (
        <SectionGroup
          key={section.name}
          section={section}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

function SectionGroup({
  section,
  pathname,
  onNavigate,
}: {
  section: NavSection;
  pathname: string;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const SectionIcon = section.icon;
  const hasActive = sectionContainsActive(section, pathname);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted hover:bg-elevated hover:text-white"
      >
        <SectionIcon
          className={`h-3.5 w-3.5 ${hasActive ? "text-accent" : ""}`}
        />
        <span className="flex-1">{section.name}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${
            open ? "rotate-0" : "-rotate-90"
          }`}
        />
      </button>

      {open && (
        <div className="mt-1 space-y-0.5 pl-2">
          {section.subsections.map((sub) => (
            <SubsectionGroup
              key={sub.name}
              subsection={sub}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SubsectionGroup({
  subsection,
  pathname,
  onNavigate,
}: {
  subsection: NavSubsection;
  pathname: string;
  onNavigate?: () => void;
}) {
  const hasActive = subsectionContainsActive(subsection, pathname);
  const [open, setOpen] = useState(hasActive);
  const SubIcon = subsection.icon;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium transition-colors ${
          hasActive
            ? "text-white"
            : "text-muted hover:bg-elevated hover:text-white"
        }`}
      >
        <SubIcon
          className={`h-3.5 w-3.5 ${
            hasActive ? "text-accent" : "text-muted group-hover:text-white"
          }`}
        />
        <span className="flex-1">{subsection.name}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted transition-transform ${
            open ? "rotate-0" : "-rotate-90"
          }`}
        />
      </button>

      {open && (
        <div className="mt-0.5 space-y-0.5 border-l border-border pl-2 ml-3">
          {subsection.items.map((item) => (
            <LeafLink
              key={item.href}
              item={item}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LeafLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const active = isItemActive(item.href, pathname);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
        active
          ? "bg-accent-soft text-white"
          : "text-muted hover:bg-elevated hover:text-white"
      }`}
    >
      <Icon
        className={`h-4 w-4 flex-shrink-0 ${
          active ? "text-accent" : "text-muted group-hover:text-white"
        }`}
      />
      <span className="truncate">{item.name}</span>
      {active && (
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />
      )}
    </Link>
  );
}
