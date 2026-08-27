import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Un package-lock.json traîne plus haut dans l'arborescence de la machine :
  // sans cette ligne, Next devine la racine du projet à cet endroit-là et
  // avertit à chaque build.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
};

export default nextConfig;
