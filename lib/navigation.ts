import {
  Briefcase,
  GraduationCap,
  Building2,
  Key,
  Radio,
  DollarSign,
  BookOpen,
  LineChart,
  BarChart3,
  FileText,
  Presentation,
  Image as ImageIcon,
  Handshake,
  Home,
  MessageSquare,
  FileSignature,
  Megaphone,
  Users,
  Tag,
  Eye,
  Mic,
  Send,
  Award,
  TrendingUp,
  Search,
  CalendarDays,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  name: string;
  href: string;
  description: string;
  icon: LucideIcon;
};

export type NavSubsection = {
  name: string;
  icon: LucideIcon;
  items: NavItem[];
};

export type NavSection = {
  name: string;
  icon: LucideIcon;
  subsections: NavSubsection[];
};

export const sections: NavSection[] = [
  {
    name: "Work",
    icon: Briefcase,
    subsections: [
      {
        name: "FACG",
        icon: Building2,
        items: [
          {
            name: "Financial Models",
            href: "/financial-models",
            description: "DCF, comps, three-statement, and LBO models.",
            icon: LineChart,
          },
          {
            name: "Comparables Analysis",
            href: "/comparables-analysis",
            description: "Build and compare peer multiples for any target.",
            icon: BarChart3,
          },
          {
            name: "Investor Prospectus",
            href: "/investor-prospectus",
            description: "Draft polished prospectuses for investor review.",
            icon: BookOpen,
          },
          {
            name: "Pitch Decks",
            href: "/pitch-decks",
            description: "Generate and iterate on pitch deck narratives.",
            icon: Presentation,
          },
          {
            name: "Image Generator",
            href: "/image-generator",
            description: "Create on-brand visuals for decks and listings.",
            icon: ImageIcon,
          },
          {
            name: "Deal Tracker",
            href: "/deal-tracker",
            description: "Track deals through sourcing, diligence, and close.",
            icon: Handshake,
          },
        ],
      },
      {
        name: "Campus Key",
        icon: Key,
        items: [
          {
            name: "Listing Generator",
            href: "/listing-generator",
            description: "Spin up listing copy for properties in seconds.",
            icon: Home,
          },
          {
            name: "Tenant Outreach",
            href: "/tenant-outreach",
            description: "Draft tenant emails, follow-ups, and renewals.",
            icon: MessageSquare,
          },
          {
            name: "Lease Summarizer",
            href: "/lease-summarizer",
            description: "Distill leases into key terms, dates, and risks.",
            icon: FileSignature,
          },
          {
            name: "Social Marketing",
            href: "/social-marketing",
            description: "Plan and write posts across social channels.",
            icon: Megaphone,
          },
          {
            name: "CRM",
            href: "/crm",
            description: "Lightweight contact and pipeline management.",
            icon: Users,
          },
          {
            name: "Promotion Generator",
            href: "/promotion-generator",
            description: "Generate promo offers, flyers, and campaigns.",
            icon: Tag,
          },
        ],
      },
    ],
  },
  {
    name: "School",
    icon: GraduationCap,
    subsections: [
      {
        name: "WFUV",
        icon: Radio,
        items: [
          {
            name: "Spotting Board",
            href: "/spotting-board",
            description: "Game-day spotting board for broadcasts.",
            icon: Eye,
          },
          {
            name: "Post-Game Scripts",
            href: "/post-game-scripts",
            description: "Draft post-game wraps and recap scripts.",
            icon: Mic,
          },
          {
            name: "Twitter Automation",
            href: "/twitter-automation",
            description: "Schedule and auto-draft game-day tweets.",
            icon: Send,
          },
        ],
      },
      {
        name: "Finance",
        icon: DollarSign,
        items: [
          {
            name: "SIE Tutor",
            href: "/sie-tutor",
            description: "Practice questions and explanations for the SIE.",
            icon: Award,
          },
          {
            name: "Real Estate License Tutor",
            href: "/real-estate-license-tutor",
            description: "Study and quiz for your real estate license exam.",
            icon: Home,
          },
          {
            name: "Portfolio Analyst",
            href: "/portfolio-analyst",
            description: "Analyze portfolio risk, attribution, and exposure.",
            icon: TrendingUp,
          },
        ],
      },
      {
        name: "Student Tools",
        icon: BookOpen,
        items: [
          {
            name: "Research Assistant",
            href: "/research-assistant",
            description: "Deep research with cited, synthesized answers.",
            icon: Search,
          },
          {
            name: "Weekly Briefing",
            href: "/weekly-briefing",
            description: "On-demand weekly markets and macro briefing.",
            icon: CalendarDays,
          },
          {
            name: "Dashboard",
            href: "/dashboard",
            description: "Overview of every tool in your hub.",
            icon: LayoutDashboard,
          },
        ],
      },
    ],
  },
];

export const allItems: NavItem[] = sections.flatMap((s) =>
  s.subsections.flatMap((sub) => sub.items)
);

export function findItem(href: string): NavItem | undefined {
  return allItems.find((i) => i.href === href);
}
