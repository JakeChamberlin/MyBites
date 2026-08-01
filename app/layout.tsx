import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/montserrat/800.css";
import "@fontsource/montserrat/900.css";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "pass-kitchen-board.jakechamberlinphoto.chatgpt.site";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og-custom.png`;

  return {
    title: "MyBites",
    description: "Build your floor, move every table, and serve the right one at the right time.",
    openGraph: {
      title: "MyBites",
      description: "Build your floor, move every table, and serve the right one at the right time.",
      type: "website",
      images: [{ url: imageUrl, width: 1792, height: 938, alt: "MyBites restaurant floor dashboard" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "MyBites",
      description: "Build your floor, move every table, and serve the right one at the right time.",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
