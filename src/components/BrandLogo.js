import Image from 'next/image';

/**
 * A brand logo that follows the theme: the white file on the dark theme, the ink one on the light
 * theme. Both are in the page and CSS shows one (`.dark` on <html> or on an ancestor).
 * `className` sets the height (e.g. "h-5"); the width follows the logo's proportions.
 */
export function BrandLogo({ brand, className = 'h-5' }) {
  const { logo, name } = brand;
  const sizeProps = { width: logo.width, height: logo.height, className: `${className} w-auto` };

  return (
    <>
      <Image src={logo.onDark} alt={name} {...sizeProps} className={`hidden dark:block ${sizeProps.className}`} />
      <Image src={logo.onLight} alt={name} {...sizeProps} className={`dark:hidden ${sizeProps.className}`} />
    </>
  );
}
