import "./globals.css";

export const metadata = {
  title: "Gestion locative — 1 bd Clémenceau, Binic",
  description: "Registre de gestion locative privé",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className="font-sans">{children}</body>
    </html>
  );
}
