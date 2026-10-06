// The catalog. Prices are in cents. To take real payments, paste a Stripe
// Payment Link for a product into `paymentLink` (see README.md).
export const CURRENCY = "USD";

export const PRODUCTS = [
  { id: "mug-ember", name: "Ember Stoneware Mug", category: "Kitchen", price: 2400, rating: 4.8, stock: 24,
    colors: ["#c2410c", "#fdba74"], shape: "mug",
    description: "Hand-glazed 12 oz stoneware mug with a speckled ember finish. Dishwasher and microwave safe." },
  { id: "pour-over", name: "Glass Pour-Over Set", category: "Kitchen", price: 3800, rating: 4.6, stock: 12,
    colors: ["#0f766e", "#99f6e4"], shape: "drop",
    description: "Borosilicate dripper and 600 ml carafe with a reusable stainless filter. Brews 1–4 cups." },
  { id: "linen-apron", name: "Washed Linen Apron", category: "Kitchen", price: 3200, rating: 4.7, stock: 18,
    colors: ["#57534e", "#d6d3d1"], shape: "square",
    description: "Stonewashed European linen with two deep pockets and adjustable cross-back straps." },
  { id: "candle-cedar", name: "Cedar & Smoke Candle", category: "Home", price: 2800, rating: 4.9, stock: 30,
    colors: ["#78350f", "#fcd34d"], shape: "flame",
    description: "Soy-coconut wax in a reusable amber jar. Notes of cedarwood, vetiver and campfire. 50-hour burn." },
  { id: "throw-wool", name: "Merino Wool Throw", category: "Home", price: 11800, rating: 4.7, stock: 6,
    colors: ["#1e3a8a", "#bfdbfe"], shape: "waves",
    description: "Ultra-soft 130 × 180 cm throw knitted from responsibly sourced merino. Naturally temperature-regulating." },
  { id: "planter", name: "Terracotta Planter", category: "Home", price: 2200, rating: 4.5, stock: 40,
    colors: ["#9a3412", "#fed7aa"], shape: "pot",
    description: "Unglazed 6-inch terracotta pot with drainage hole and matching saucer. Plant not included." },
  { id: "notebook", name: "Dot-Grid Notebook", category: "Desk", price: 1600, rating: 4.8, stock: 50,
    colors: ["#166534", "#bbf7d0"], shape: "grid",
    description: "A5, 192 pages of 100 gsm fountain-pen-friendly paper. Lay-flat binding and numbered pages." },
  { id: "desk-lamp", name: "Arc Desk Lamp", category: "Desk", price: 8900, rating: 4.6, stock: 9,
    colors: ["#334155", "#fde68a"], shape: "arc",
    description: "Dimmable warm LED with a weighted brass base and 3 color temperatures. USB-C powered." },
  { id: "pen-brass", name: "Solid Brass Pen", category: "Desk", price: 4200, rating: 4.9, stock: 15,
    colors: ["#a16207", "#fef08a"], shape: "line",
    description: "Machined from a single brass bar; develops a warm patina over time. Takes standard G2 refills." },
  { id: "tote", name: "Waxed Canvas Tote", category: "Carry", price: 6400, rating: 4.7, stock: 14,
    colors: ["#3f6212", "#d9f99d"], shape: "bag",
    description: "Water-resistant waxed canvas with leather handles and an interior zip pocket. Fits a 15\" laptop." },
  { id: "bottle", name: "Insulated Bottle", category: "Carry", price: 3400, rating: 4.6, stock: 0,
    colors: ["#7c3aed", "#ddd6fe"], shape: "bottle",
    description: "750 ml double-wall steel keeps drinks cold for 24 hours or hot for 12. Leak-proof lid." },
  { id: "wallet", name: "Slim Leather Wallet", category: "Carry", price: 5600, rating: 4.8, stock: 20,
    colors: ["#7f1d1d", "#fecaca"], shape: "card",
    description: "Full-grain vegetable-tanned leather. Holds 8 cards and folded bills in a 6 mm profile." },
];

// Discount codes: percent off the subtotal, or free shipping.
export const PROMO_CODES = {
  WELCOME10: { type: "percent", value: 10, label: "10% off your order" },
  FREESHIP: { type: "shipping", label: "Free shipping" },
};

export const SHIPPING = { flat: 800, freeOver: 7500 };
export const TAX_RATE = 0.08;
