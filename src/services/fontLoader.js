const buildGoogleFontsUrl = (fonts = []) => {
  const googleFonts = fonts.filter((f) => f.google_font !== false && f.name);

  if (googleFonts.length === 0) return null;

  const families = googleFonts.map((f) => {
    const name = f.name.replace(/ /g, "+");
    const weights =
      f.weights && f.weights.length > 0 ? `:wght@${f.weights.join(";")}` : "";
    return `family=${name}${weights}`;
  });

  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
};

module.exports = { buildGoogleFontsUrl };
