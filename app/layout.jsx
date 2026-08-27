import "./globals.css";

export const metadata = {
  title: "Gestion locative — 1 bd Clémenceau, Binic",
  description: "Registre de gestion locative privé",
  applicationName: "Clémenceau",
  // Écran d'accueil iOS : sans ces réglages, Safari ouvre l'app dans un onglet
  // classique au lieu du mode plein écran.
  appleWebApp: {
    capable: true,
    title: "Clémenceau",
    statusBarStyle: "black-translucent",
  },
};

export const viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // laisse la page s'étendre sous l'encoche
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        {/* Next n'émet plus que "mobile-web-app-capable" ; les iOS antérieurs
            à 16.4 ne reconnaissent que cette variante-ci pour le plein écran. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
