/**
 * Shopping Link data model.
 *
 * For the MVP, links are SEARCH URLs on each retailer's site — no scraping,
 * no exact product URLs. The shape, however, already carries the fields a
 * future product/affiliate API will populate (productUrl, price, availability)
 * so swapping a search-only generator for a real product link is a one-line
 * change inside the provider, not a data-model migration.
 */

export type Retailer =
  // UK
  | "tesco"
  | "asda"
  | "sainsburys"
  | "morrisons"
  | "aldi-uk"
  | "lidl-uk"
  // Italy
  | "esselunga"
  | "conad"
  | "coop"
  | "carrefour-it"
  | "lidl-it"
  | "eurospin"
  | "md"
  | "penny"
  // Germany
  | "aldi"
  | "lidl"
  | "rewe"
  | "edeka"
  | "kaufland"
  // France
  | "carrefour"
  | "auchan"
  | "leclerc"
  | "intermarche"
  // Spain
  | "mercadona"
  | "carrefour-es"
  | "lidl-es"
  | "dia"
  // USA
  | "walmart"
  | "target"
  | "kroger"
  | "whole-foods"
  // Cross-market / Delivery / Marketplaces
  | "amazon-fresh"
  | "deliveroo"
  | "uber-eats"
  | "just-eat-grocery"
  | "glovo"
  | "everli"
  | "lieferando"
  | "wolt"
  | "instacart";



export type Availability = "unknown" | "in_stock" | "out_of_stock";

export interface ShoppingLink {
  id: string;
  itemName: string;
  retailer: Retailer;
  retailerName: string;
  city: string;
  country: string;
  productName: string | null;
  productUrl: string | null;
  searchUrl: string;
  price: number | null;
  currency: string | null;
  availability: Availability;
  confidenceScore: number;
  lastChecked: string;
}
