import { MAIN_BRAND, SUB_BRANDS } from '../content/brands';
import { BrandLogo } from './BrandLogo';

/**
 * The company's logo row, as in the hiring poster: effekktive (the umbrella), a divider, then the
 * companies under it. Brands whose logo has not been received yet are skipped.
 */
export function BrandStrip({ className = '' }) {
  const subBrands = SUB_BRANDS.filter((brand) => brand.logo);

  return (
    <ul className={`flex flex-wrap items-center gap-x-6 gap-y-4 sm:gap-x-8 ${className}`}>
      <li>
        <BrandLogo brand={MAIN_BRAND} className="h-5" />
      </li>
      <li aria-hidden="true" className="h-5 w-px bg-line" />
      {subBrands.map((brand) => (
        <li key={brand.id}>
          <BrandLogo brand={brand} className="h-5" />
        </li>
      ))}
    </ul>
  );
}
