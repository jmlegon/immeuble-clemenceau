/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      // Le caractère « registre » de l'application repose entièrement sur
      // font-serif. Laissée au défaut de Tailwind, la pile donnait Georgia sur
      // macOS et Windows mais Times sur iOS — deux dessins très différents, sur
      // l'écran qui sert le plus. Cette pile place des faces proches de Georgia
      // en tête sur chaque plateforme, sans dépendance réseau.
      fontFamily: {
        serif: [
          "Iowan Old Style", "Palatino Linotype", "Palatino", "Book Antiqua",
          "Georgia", "Cambria", "Times New Roman", "serif",
        ],
      },
    },
  },
  plugins: [],
};
