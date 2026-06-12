import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { UserProvider } from "@/lib/hooks/useUser";
import { OrganizationProvider } from "@/lib/hooks/useOrganization";
import { DebugLogger } from "@/components/debug-logger";
import "./globals.css";

// "The Plan Room" type pair — self-hosted via next/font (downloaded at build,
// served same-origin; no runtime Google requests).
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "EstimatePros.ai — Construction Estimation",
    template: "%s — EstimatePros.ai",
  },
  description: "Transform HOVER PDFs into professional Excel takeoffs in minutes",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="antialiased">
        <DebugLogger />
        <UserProvider>
          <OrganizationProvider>
            {children}
          </OrganizationProvider>
        </UserProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
