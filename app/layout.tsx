import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MaintainAI | Equipment triage",
  description: "AI-assisted equipment maintenance triage with human review."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
