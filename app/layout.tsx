import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "My AI Hub",
  description:
    "A personal hub of AI-powered tools for research, finance, and productivity.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-screen bg-background font-sans text-white antialiased">
        <Sidebar />
        <div className="md:pl-64">
          <MobileNav />
          <main className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10 max-w-6xl mx-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
