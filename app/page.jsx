import { redirect } from "next/navigation";

// Redirection côté serveur. Auparavant faite dans un useEffect, elle obligeait
// le navigateur à charger puis exécuter le JavaScript avant de partir ailleurs :
// lancée depuis l'icône iOS, l'application s'ouvrait sur un écran blanc.
export default function Home() {
  redirect("/dashboard");
}
