import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Closet Inteligente",
    short_name: "Closet",
    description: "Uma consultora pessoal que conhece você e conhece o seu closet.",
    start_url: "/home",
    display: "standalone",
    background_color: "#fbf8f6",
    theme_color: "#b25b76",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
