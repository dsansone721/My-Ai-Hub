import {
  LayoutDashboard,
  FileText,
  LineChart,
  Image as ImageIcon,
  Eye,
  GraduationCap,
  Search,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  name: string;
  href: string;
  description: string;
  icon: LucideIcon;
};

export const navigation: NavItem[] = [
  {
    name: "Dashboard",
    href: "/",
    description: "Overview of every tool in your hub.",
    icon: LayoutDashboard,
  },
  {
    name: "Earnings Summarizer",
    href: "/earnings-summarizer",
    description: "Distill earnings calls and reports into key takeaways.",
    icon: FileText,
  },
  {
    name: "Financial Models",
    href: "/financial-models",
    description: "Build and review valuation, DCF, and forecast models.",
    icon: LineChart,
  },
  {
    name: "Property Images",
    href: "/property-images",
    description: "Generate and manage real-estate property visuals.",
    icon: ImageIcon,
  },
  {
    name: "Spotting Board",
    href: "/spotting-board",
    description: "Track ideas, leads, and opportunities in one place.",
    icon: Eye,
  },
  {
    name: "SIE Tutor",
    href: "/sie-tutor",
    description: "Practice questions and concepts for the SIE exam.",
    icon: GraduationCap,
  },
  {
    name: "Research Assistant",
    href: "/research-assistant",
    description: "Run deep research across the web with AI synthesis.",
    icon: Search,
  },
  {
    name: "Weekly Briefing",
    href: "/weekly-briefing",
    description: "Your weekly market and portfolio briefing, on demand.",
    icon: CalendarDays,
  },
];
