import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Raybon ERP",
    short_name: "Raybon",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0d857e",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
