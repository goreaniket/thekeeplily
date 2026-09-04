export type Product = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  category: string;
  otherCategory?: string;
  shortDescription: string;
  fullDescription: string;
  regularPrice: number;
  salePrice?: number;
  mainImage: string;
  additionalImages: string[];
  material: string;
  dimensions: string;
  colours: string[];
  sizes: string[];
  variants: string[];
  variantPricing: Record<string, number>;
  customisable: boolean;
  customisationOptions: string[];
  customisationCharge: number;
  customisationNotes: string;
  stockQuantity: number | null;
  availability: 'available' | 'unavailable';
  madeToOrder: boolean;
  preparationTime: string;
  careInstructions: string;
  labels: string[];
  tags: string[];
  visibility: boolean;
  featured: boolean;
  bestseller: boolean;
  newArrival: boolean;
  createdAt: string;
  updatedAt: string;
  imagePosition: string;
};

// Local catalogue used only until the owner's Google Sheet endpoint is configured.
// One object mirrors one spreadsheet row; the UI never assumes a fixed count.
export const localCatalogue: Product[] = [
  {
    id:'kl-clay-heart', sku:'KL-CC-001', name:'Pressed Flower Heart Charm', slug:'pressed-flower-heart-charm', category:'Clay Charms',
    shortDescription:'A soft pink keepsake charm with a delicate botanical impression.',
    fullDescription:'A tiny heart made for bags, keys and gifting moments. Each piece is finished by hand, so the little variations are part of its charm.',
    regularPrice:249, mainImage:'/keeplily-collection.png', additionalImages:[], material:'Hand-finished clay, cord and metal finding', dimensions:'Approx. 5 × 5 cm', colours:['Blush Pink','Ivory'], sizes:['One size'], variants:['Charm only','Charm + gift card'], variantPricing:{'Charm only':0,'Charm + gift card':79},
    customisable:true, customisationOptions:['Colour','Initials'], customisationCharge:49, customisationNotes:'Add your initials or preferred colour below.', stockQuantity:null, availability:'available', madeToOrder:true, preparationTime:'Preparation time will be confirmed before dispatch.', careInstructions:'Keep dry and handle gently. Wipe with a soft cloth.', labels:['CUSTOMISABLE','MADE TO ORDER'], tags:['birthday','friendship','keepsake'], visibility:true, featured:true, bestseller:true, newArrival:false, createdAt:'2026-01-10', updatedAt:'2026-08-30', imagePosition:'36% 64%'
  },
  {
    id:'kl-candle-blush', sku:'KL-CD-001', name:'Blush Petal Candle', slug:'blush-petal-candle', category:'Candles',
    shortDescription:'A small, warm candle poured for slow evenings and thoughtful gifting.',
    fullDescription:'A softly styled handmade candle in a blush vessel. Made to bring a little warmth to desks, bedside tables and gift boxes.',
    regularPrice:399, mainImage:'/keeplily-collection.png', additionalImages:[], material:'Wax blend, cotton wick and reusable ceramic vessel', dimensions:'Approx. 7 × 7 cm', colours:['Blush'], sizes:['Mini','Classic'], variants:['Mini','Classic'], variantPricing:{Mini:0,Classic:180}, customisable:false, customisationOptions:[], customisationCharge:0, customisationNotes:'', stockQuantity:null, availability:'available', madeToOrder:false, preparationTime:'Dispatch timeline shown at checkout.', careInstructions:'Trim wick before each burn. Never leave a burning candle unattended.', labels:['BESTSELLER'], tags:['birthday','self-gifting','home'], visibility:true, featured:true, bestseller:true, newArrival:false, createdAt:'2026-01-18', updatedAt:'2026-08-28', imagePosition:'55% 18%'
  },
  {
    id:'kl-phone-pearl', sku:'KL-PA-001', name:'Pearl Blush Phone Charm', slug:'pearl-blush-phone-charm', category:'Phone Accessories',
    shortDescription:'A soft pearl-and-pink wrist charm that makes your everyday phone feel special.',
    fullDescription:'A lightweight beaded phone charm finished with blush accents. Designed as a decorative accessory and a sweet little gift.',
    regularPrice:299, mainImage:'/keeplily-collection.png', additionalImages:[], material:'Acrylic beads, cord and alloy details', dimensions:'Approx. 18 cm loop', colours:['Pearl Blush','Berry Pink'], sizes:['One size'], variants:['Pearl Blush','Berry Pink'], variantPricing:{'Pearl Blush':0,'Berry Pink':0}, customisable:true, customisationOptions:['Colour mix','Initial bead'], customisationCharge:39, customisationNotes:'Tell us the colour mood or initial you would like.', stockQuantity:null, availability:'available', madeToOrder:true, preparationTime:'Preparation time will be confirmed before dispatch.', careInstructions:'Avoid pulling, water and perfume. This is a decorative accessory.', labels:['NEW','CUSTOMISABLE'], tags:['friendship','self-gifting','phone'], visibility:true, featured:true, bestseller:false, newArrival:true, createdAt:'2026-07-12', updatedAt:'2026-08-29', imagePosition:'58% 76%'
  },
  {
    id:'kl-card-botanical', sku:'KL-CR-001', name:'Botanical Keepsake Card', slug:'botanical-keepsake-card', category:'Cards',
    shortDescription:'A softly scalloped handmade card for words they will want to keep.',
    fullDescription:'A tactile keepsake card with delicate botanical detailing. Leave the inside blank or add a handwritten-style message.',
    regularPrice:179, mainImage:'/keeplily-collection.png', additionalImages:[], material:'Textured paper and pressed botanical details', dimensions:'Approx. A6', colours:['Cream','Blush'], sizes:['A6'], variants:['Blank inside','Add gift message'], variantPricing:{'Blank inside':0,'Add gift message':30}, customisable:true, customisationOptions:['Gift message'], customisationCharge:30, customisationNotes:'Your message will be reviewed for layout before making.', stockQuantity:null, availability:'available', madeToOrder:true, preparationTime:'Preparation time will be confirmed before dispatch.', careInstructions:'Keep flat, clean and dry.', labels:['CUSTOMISABLE'], tags:['birthday','anniversary','friendship'], visibility:true, featured:false, bestseller:false, newArrival:true, createdAt:'2026-07-22', updatedAt:'2026-08-25', imagePosition:'82% 24%'
  },
  {
    id:'kl-wax-meadow', sku:'KL-WS-001', name:'Little Meadow Wax Sachet', slug:'little-meadow-wax-sachet', category:'Wax Sachets',
    shortDescription:'A botanical wax keepsake tied with a soft ribbon for cupboards and gifting.',
    fullDescription:'A decorative wax sachet made with dried botanical details. A thoughtful addition to gift boxes and small spaces.',
    regularPrice:349, mainImage:'/keeplily-collection.png', additionalImages:[], material:'Scented wax, dried botanicals and satin ribbon', dimensions:'Approx. 10 × 6 cm', colours:['Ivory','Blush'], sizes:['One size'], variants:['Ivory','Blush'], variantPricing:{Ivory:0,Blush:0}, customisable:true, customisationOptions:['Ribbon colour','Scent preference'], customisationCharge:0, customisationNotes:'Share a preferred colour mood; availability will be confirmed.', stockQuantity:null, availability:'available', madeToOrder:true, preparationTime:'Preparation time will be confirmed before dispatch.', careInstructions:'Do not light. Keep away from heat, direct sunlight, children and pets.', labels:['MADE TO ORDER'], tags:['festive','self-gifting','home'], visibility:true, featured:true, bestseller:false, newArrival:false, createdAt:'2026-02-02', updatedAt:'2026-08-20', imagePosition:'69% 80%'
  },
  {
    id:'kl-gift-set', sku:'KL-GF-001', name:'A Little Love Gift Set', slug:'a-little-love-gift-set', category:'Gift Sets', otherCategory:'Custom Gifts',
    shortDescription:'A gentle mix of Keeplily favourites, wrapped into one thoughtful gesture.',
    fullDescription:'A curated keepsake set built around the mood and occasion you choose. Final contents and preparation time are confirmed after your request.',
    regularPrice:899, mainImage:'/keeplily-collection.png', additionalImages:[], material:'Mixed handmade keepsakes and gift packaging', dimensions:'Varies by selection', colours:['Blush & Cream','Custom theme'], sizes:['Small','Classic'], variants:['Small','Classic'], variantPricing:{Small:0,Classic:350}, customisable:true, customisationOptions:['Theme','Card message','Colour palette'], customisationCharge:99, customisationNotes:'Tell us who it is for and the feeling you want the gift to carry.', stockQuantity:null, availability:'available', madeToOrder:true, preparationTime:'Timeline and final inclusions are confirmed after review.', careInstructions:'Individual care notes are included with the set.', labels:['CUSTOMISABLE','MADE TO ORDER'], tags:['birthday','anniversary','festive'], visibility:true, featured:true, bestseller:true, newArrival:false, createdAt:'2026-03-15', updatedAt:'2026-08-30', imagePosition:'68% 50%'
  }
];

export const categories = ['Clay Charms','Candles','Phone Accessories','Cards','Wax Sachets'];
export const formatINR = (value:number) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(value);
