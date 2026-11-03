import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { MAIN_BRAND, SUB_BRANDS } from '@/content/brands';

const publicDir = path.join(process.cwd(), 'public');
const brandsWithLogo = [MAIN_BRAND, ...SUB_BRANDS].filter((brand) => brand.logo);
const entries = brandsWithLogo.map((brand) => [brand.name, brand]);
const isPng = (publicPath) => publicPath.endsWith('.png');
const readFile = (publicPath) => readFileSync(path.join(publicDir, publicPath));
const readSvg = (publicPath) => readFile(publicPath).toString('utf8');

/** [width, height] as the image itself declares them (SVG header, or the PNG's IHDR chunk) */
function declaredSize(publicPath) {
  if (isPng(publicPath)) {
    const png = readFile(publicPath);
    return [png.readUInt32BE(16), png.readUInt32BE(20)];
  }
  const header = readSvg(publicPath).match(/<svg width="(\d+)" height="(\d+)"/);
  return [Number(header[1]), Number(header[2])];
}

describe('brand logos', () => {
  it('has effekktive as the main brand, with a logo', () => {
    expect(MAIN_BRAND.name).toBe('effekktive');
    expect(MAIN_BRAND.logo).not.toBeNull();
  });

  it('has every company of the poster, in its order, each with a logo', () => {
    expect(SUB_BRANDS.map((brand) => brand.name)).toEqual(['Spazio', 'eventplus.app', 'mettaclass', 'Startus', 'DoitXR']);
    expect(SUB_BRANDS.filter((brand) => !brand.logo)).toEqual([]);
  });

  it.each(entries)('%s has both theme files and they match their declared size', (_name, brand) => {
    const { onDark, onLight, width, height } = brand.logo;
    expect(existsSync(path.join(publicDir, onDark))).toBe(true);
    expect(existsSync(path.join(publicDir, onLight))).toBe(true);
    expect(declaredSize(onDark)).toEqual([width, height]);
    expect(declaredSize(onLight)).toEqual([width, height]);
  });

  it.each(entries.filter(([, brand]) => !isPng(brand.logo.onLight)))('%s: the light file has no white left, so it shows on a light background', (_name, brand) => {
    expect(readSvg(brand.logo.onLight)).not.toMatch(/fill="(white|#fff|#ffffff|#F9F9F9)"/i);
  });

  it.each(entries.filter(([, brand]) => !isPng(brand.logo.onLight)))('%s: the SVGs are static images (no scripts, event handlers or external references)', (_name, brand) => {
    [brand.logo.onDark, brand.logo.onLight].forEach((file) => {
      expect(readSvg(file)).not.toMatch(/<script|\son\w+=|<foreignObject|<image|href="https?:|javascript:/i);
    });
  });

  it.each(entries.filter(([, brand]) => isPng(brand.logo.onLight)))('%s: the PNG files are real PNGs and the light one is not a copy of the dark one', (_name, brand) => {
    const { onDark, onLight } = brand.logo;
    [onDark, onLight].forEach((file) => expect(readFile(file).subarray(1, 4).toString('latin1')).toBe('PNG'));
    expect(readFile(onLight).equals(readFile(onDark))).toBe(false);
  });
});
