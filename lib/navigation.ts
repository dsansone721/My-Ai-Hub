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
  Image as ImageIcon,
  Handshake,
  Home,
  MessageSquare,
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
  Gauge,
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

export const topLevel: NavItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    description: "Overview of every tool in your hub.",
    icon: LayoutDashboard,
  },
];

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
            name: "Deal Engine",
            href: "/deal-tracker",
            description: "End-to-end HUD deal pipeline — intake, comps, underwriting, stress test, and package generation.",
            icon: Handshake,
          },
          {
            name: "Property Comparables",
            href: "/property-comparables",
            description: "HUD multifamily rent comp set with market analysis and underwriting insights.",
            icon: BarChart3,
          },
          {
            name: "Stress Test Models",
            href: "/stress-test-models",
            description: "Run scenarios and stress tests across model assumptions.",
            icon: Gauge,
          },
          {
            name: "Renderings Generator",
            href: "/renderings-generator",
            description: "Generate property renderings and on-brand visuals for pitch decks and investor packages.",
            icon: ImageIcon,
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
            name: "Financial Models",
            href: "/financial-models",
            description: "DCF, comps, three-statement, and LBO models.",
            icon: LineChart,
          },
          {
            name: "Earnings Summarizer",
            href: "/earnings-summarizer",
            description: "Distill earnings calls and reports into key takeaways.",
            icon: FileText,
          },
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
        ],
      },
    ],
  },
];

export const allItems: NavItem[] = [
  ...topLevel,
  ...sections.flatMap((s) => s.subsections.flatMap((sub) => sub.items)),
];

export function findItem(href: string): NavItem | undefined {
  return allItems.find((i) => i.href === href);
}
