import "./globals.css";

export const metadata = {
  title: "Nextアプリを作成",
  description: "create next appで生成されました",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
