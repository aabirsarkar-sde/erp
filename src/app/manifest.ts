import type { MetadataRoute } from "next";
import { BRAND, EDITION } from "@/lib/core/edition";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.short,
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: EDITION === "crm" ? "#2752c4" : "#0d857e",
    icons: [{ src: "/brand-icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
