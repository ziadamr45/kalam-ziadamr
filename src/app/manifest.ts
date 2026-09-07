import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "كلام له لازمة",
    short_name: "كلام",
    description: "مش كل كلام لازم يتقال.. بس فيه كلام له لازمة.",
    id: "/",
    start_url: "/",
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    orientation: "portrait",
    background_color: "#FDFBF7",
    theme_color: "#F8F4EC",
    categories: ["news", "education", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
