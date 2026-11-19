import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EnvBanner } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "TE One — Enterprise Customer Relationship Management Platform",
  description: "TE One, platform CRM milik Trilogika Edutama.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>
        <EnvBanner />
        {children}
      </body>
    </html>
  );
}
