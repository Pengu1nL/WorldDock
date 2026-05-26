import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "界坞 WorldDock · 前端原型",
  description: "世界观创作者的专业工作台",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      data-app-theme="light"
      data-density="regular"
      data-title-font="serif"
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Source+Serif+4:wght@500;600;700&family=Noto+Serif+SC:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
