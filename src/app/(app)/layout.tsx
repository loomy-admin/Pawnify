import React from "react";
import { requireSession } from "@/lib/auth/session";
import { Sidebar } from "@/components/sidebar";
import { LiveMarketTicker } from "@/components/live-market-ticker";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const user = session.user as unknown as {
    name: string;
    email: string;
    role: string;
  };

  return (
    <div
      className="flex min-h-screen"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      <Sidebar user={user} />
      <main className="flex-1 min-w-0 overflow-x-hidden flex flex-col">
        <LiveMarketTicker userRole={user.role} />
        <div className="w-full flex-1 p-4 sm:p-6 lg:p-8 pt-16 lg:pt-8 animate-fadeIn flex flex-col">
          {children}
        </div>
      </main>
    </div>
  );
}
