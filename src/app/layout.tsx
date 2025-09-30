import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "Wireframe Generator",
    description:
        "Upload any design screenshot and instantly convert it into a clean, editable wireframe sketch with smart edge detection and easy crossbox annotations.",
    metadataBase: new URL("https://wireframe-generator-gilt.vercel.app"),

    openGraph: {
        title: "Wireframe Generator",
        description:
            "Convert any UI screenshot into a clean wireframe sketch — instantly!",
        url: "https://wireframe-generator-gilt.vercel.app",
        siteName: "Wireframe Generator",
        images: [
            {
                url: "/opengraph-image.png",
                width: 1200,
                height: 630,
                alt: "Wireframe Generator Preview",
            },
        ],
        locale: "en_US",
        type: "website",
    },

    twitter: {
        card: "summary_large_image",
        title: "Wireframe Generator",
        description:
            "Convert any UI screenshot into a clean wireframe sketch — instantly!",
        images: ["/twitter-image.png"],
    },

    icons: {
        icon: "/favicon.ico",
    },
};

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
        <body
            className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
        {children}
        </body>
        </html>
    );
}
