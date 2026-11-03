/**
 * The company brands. effekktive is the umbrella and the main logo of the app; the rest are the
 * companies under it. Logos live in public/brand as two files per brand, because they are drawn
 * for dark backgrounds: `<id>-on-dark.<ext>` (white) and `<id>-on-light.<ext>` (same logo, ink
 * instead of white, brand colors untouched). SVG is the default; Spazio and DoitXR only came as
 * PNG (cropped to the logo, 80 px high), so they pass 'png'.
 *
 * `logo: null` means the file has not been received yet; the brand is skipped until it is added
 * (drop both files in public/brand and set `logo` with the image's width/height).
 */
const logo = (id, width, height, extension = 'svg') => ({
  width,
  height,
  onDark: `/brand/${id}-on-dark.${extension}`,
  onLight: `/brand/${id}-on-light.${extension}`,
});

export const MAIN_BRAND = { id: 'effekktive', name: 'effekktive', logo: logo('effekktive', 164, 32) };

// Same order as the company's hiring poster
export const SUB_BRANDS = [
  { id: 'spazio', name: 'Spazio', logo: logo('spazio', 270, 80, 'png') },
  { id: 'eventplus', name: 'eventplus.app', logo: logo('eventplus', 180, 27) },
  { id: 'mettaclass', name: 'mettaclass', logo: logo('mettaclass', 147, 24) },
  { id: 'startus', name: 'Startus', logo: logo('startus', 157, 32) },
  { id: 'doitxr', name: 'DoitXR', logo: logo('doitxr', 295, 80, 'png') },
];
