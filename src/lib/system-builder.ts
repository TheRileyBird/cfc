import { formatPrice, getProductByHandle, type ShopifyProductDetail } from './shopify';

export interface SystemProductConfig {
  title: string;
  shortTitle?: string;
  description?: string;
  details?: string;
  benefits?: string[];
  handle: string;
}

export interface SystemProduct extends SystemProductConfig {
  variantId: string;
  price: number;
  formattedPrice: string;
  availableForSale: boolean;
}

export interface SystemOption {
  id: 'starter' | 'complete' | 'premium';
  name: string;
  tagline: string;
  eyebrow: string;
  description: string;
  cta: string;
  featured: boolean;
  treatmentIds: Array<'appleStem' | 'colorCorrection' | 'hydration'>;
  retinolIds: Array<'retinolCream' | 'retinolEye'>;
}

export const productConfig = {
  cleansers: [
    {
      title: 'NAD+ Jamin Jasmine Cleanser',
      shortTitle: 'Jamin Jasmine Cleanser',
      description: 'Universal cleanser',
      details: 'Cleanse and refresh your skin with probiotics, hyaluronic acid, and niacinamide. Ideal for daily use, this gentle cleanser removes impurities while hydrating and strengthening the skin barrier.',
      benefits: [
        'Gently cleanses without over-drying',
        "Strengthens the skin's natural defenses",
        'Boosts hydration and calms redness',
        'Safe for sensitive, dry, and combination skin',
      ],
      handle: 'jamin-jasmine-nad-cleanser',
    },
    {
      title: 'NAD+ Bamboo Firming Cleanser',
      shortTitle: 'NAD+ Bamboo Firming Cleanser',
      description: 'Firming cleanse for mature or laxity-prone skin.',
      details: 'A refreshing NAD+ cleanser designed to leave skin clean, smooth, and supported.',
      benefits: ['Supports a firmer feel', 'Refreshes without stripping', 'Pairs well with retinol routines'],
      handle: 'nad-bamboo-firming-cleanser',
    },
    {
      title: 'Age Defying Brightening Cleanser',
      shortTitle: 'Age Defying Brightening Cleanser',
      description: 'Brightening cleanse for dullness and uneven tone.',
      details: 'A polished daily cleanse for clients focused on glow, texture, and visible renewal.',
      benefits: ['Helps brighten dull tone', 'Smooths the look of texture', 'Preps skin for CFC GLOW'],
      handle: 'age-defying-brightening-cleanser',
    },
  ],
  treatments: {
    appleStem: {
      title: 'Apple Stem Wrinkle Eraser',
      handle: 'apple-stem-wrinkle-eraser',
    },
    colorCorrection: {
      title: 'Color Correction C&E Serum',
      handle: 'color-correction-c-e-serum',
    },
    hydration: {
      title: 'Pure Hydration Hyaluronic Acid Serum',
      handle: 'pure-hydration-ha',
    },
  },
  spf: [
    {
      title: 'Pure Sun Defense SPF 50+',
      description: 'Clear medical-grade SPF.',
      handle: 'pure-sun-defense-sunscreen',
    },
    {
      title: 'Sun Kissed Protection Tinted SPF 30',
      description: 'Tinted medical-grade SPF.',
      handle: 'sun-kissed-protection-sunscreen',
    },
  ],
  retinols: {
    retinolCream: {
      title: 'NAD+ Age Defying Retinol Cream 0.5%',
      handle: 'nad-age-defying-retinol',
    },
    retinolEye: {
      title: 'Revitalizing Retinol Eye Cream',
      handle: 'revitalizing-retinol-eye-serum',
    },
  },
  upsells: [
    {
      title: 'T Tightening and Firming Serum',
      handle: 't-tightening-and-firming-serum',
    },
    {
      title: 'Quad Glow Elite LED Mask',
      handle: 'cfc-quad-glow-elite-led-mask-presale',
    },
  ],
} as const;

export const systems: SystemOption[] = [
  {
    id: 'starter',
    name: 'Starter System',
    tagline: 'Begin here.',
    eyebrow: 'Begin here',
    description: 'One cleanser, Apple Stem Wrinkle Eraser, and your preferred medical-grade sunscreen.',
    cta: 'Start Your Skin Journey',
    featured: false,
    treatmentIds: ['appleStem'],
    retinolIds: [],
  },
  {
    id: 'complete',
    name: 'Complete System',
    tagline: 'The full transformation.',
    eyebrow: 'Most popular',
    description: 'Choose one cleanser, then automatically add CFC GLOW: Apple Stem, Color Correction C&E, and Pure Hydration.',
    cta: 'Build the Complete System',
    featured: true,
    treatmentIds: ['appleStem', 'colorCorrection', 'hydration'],
    retinolIds: [],
  },
  {
    id: 'premium',
    name: 'Premium Collection',
    tagline: 'For women who are serious.',
    eyebrow: 'Advanced routine',
    description: 'Choose one cleanser, add CFC GLOW, sunscreen, and both retinols. Firming serum and LED mask are suggested after.',
    cta: 'Build Your Premium Routine',
    featured: false,
    treatmentIds: ['appleStem', 'colorCorrection', 'hydration'],
    retinolIds: ['retinolCream', 'retinolEye'],
  },
];

function productFromShopify(config: SystemProductConfig, product: ShopifyProductDetail | null): SystemProduct {
  const variant = product?.variants.edges.find(({ node }) => node.availableForSale)?.node ?? product?.variants.edges[0]?.node;
  const amount = variant?.price.amount ?? product?.priceRange.minVariantPrice.amount ?? '0';
  const currency = product?.priceRange.minVariantPrice.currencyCode ?? 'USD';

  return {
    ...config,
    variantId: variant?.id ?? '',
    price: parseFloat(amount) || 0,
    formattedPrice: formatPrice(amount, currency),
    availableForSale: product?.availableForSale ?? false,
  };
}

async function hydrate(config: SystemProductConfig): Promise<SystemProduct> {
  return productFromShopify(config, await getProductByHandle(config.handle));
}

export async function getSystemBuilderData() {
  const [cleansers, spf, upsells, appleStem, colorCorrection, hydration, retinolCream, retinolEye] = await Promise.all([
    Promise.all(productConfig.cleansers.map(hydrate)),
    Promise.all(productConfig.spf.map(hydrate)),
    Promise.all(productConfig.upsells.map(hydrate)),
    hydrate(productConfig.treatments.appleStem),
    hydrate(productConfig.treatments.colorCorrection),
    hydrate(productConfig.treatments.hydration),
    hydrate(productConfig.retinols.retinolCream),
    hydrate(productConfig.retinols.retinolEye),
  ]);

  return {
    products: {
      cleansers,
      spf,
      glow: [appleStem, colorCorrection, hydration],
      treatments: { appleStem, colorCorrection, hydration },
      retinols: { retinolCream, retinolEye },
      upsells,
    },
    systems,
  };
}

export function getSystemPriceRange(data: Awaited<ReturnType<typeof getSystemBuilderData>>, system: SystemOption): string {
  const treatmentTotal = system.treatmentIds.reduce((total, id) => total + data.products.treatments[id].price, 0);
  const retinolTotal = system.retinolIds.reduce((total, id) => total + data.products.retinols[id].price, 0);
  const options = data.products.cleansers.flatMap((cleanser) =>
    data.products.spf.map((spf) => cleanser.price + treatmentTotal + retinolTotal + spf.price)
  );
  const min = Math.min(...options);
  const max = Math.max(...options);

  if (!Number.isFinite(min) || !Number.isFinite(max)) return '$0';
  if (min === max) return formatPrice(String(min));
  return `${formatPrice(String(min))}-${formatPrice(String(max))}`;
}
