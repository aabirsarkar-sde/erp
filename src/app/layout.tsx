import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BRAND, EDITION } from "@/lib/core/edition";

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s · ${BRAND.short}` },
  description: BRAND.description,
  manifest: "/manifest.webmanifest",
  icons: { icon: "/brand-icon.svg" },
};
export const viewport: Viewport = { themeColor: EDITION === "crm" ? "#2752c4" : "#0d857e", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-edition={EDITION}>
      <body>{children}</body>
    </html>
  );
}
