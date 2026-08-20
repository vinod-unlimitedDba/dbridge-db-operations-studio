import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./ssh-workspace.css";
import "./execution-plan-investigator.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og-plan-investigator.png`;
  return {
    title: "DB Operations Studio",
    description: "A unified database operations workspace with visual execution-plan comparison, ranked performance culprits, DevOps tools, and guided incident response.",
    openGraph: { title: "DB Operations Studio", description: "One cockpit. Every system.", images: [{ url: image, width: 1733, height: 877, alt: "DB Operations Studio execution plan investigator" }] },
    twitter: { card: "summary_large_image", title: "DB Operations Studio", description: "One cockpit. Every system.", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
