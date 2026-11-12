import type { Metadata } from "next";
import localFont from "next/font/local";
import Providers from "@/components/Providers";
import BoardMode from "@/components/BoardMode";
import "./globals.css";

const plexSans = localFont({
  src: [
    { path: "./fonts/sans/ibm-plex-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/sans/ibm-plex-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/sans/ibm-plex-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
  fallback: ["Segoe UI", "sans-serif"],
});

const plexMono = localFont({
  src: [
    { path: "./fonts/mono/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/mono/ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
  fallback: ["monospace"],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "VUL Letter Grid",
  description: "Interactive grid of randomly placed and rotated V, U, and L letters",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${plexSans.variable} ${plexMono.variable} antialiased`}>
        <Providers><BoardMode>{children}</BoardMode></Providers>
      </body>
    </html>
  );
}
