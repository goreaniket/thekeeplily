import type { Product } from './catalog';

export type CartLine = { key:string; productId:string; quantity:number; variant:string; personalisation:string; customisation:boolean };
export const lineUnitPrice = (line:CartLine, product:Product) => (product.salePrice ?? product.regularPrice) + (product.variantPricing[line.variant] ?? 0) + (line.customisation ? product.customisationCharge : 0);
