import { createClient } from "./client";

// Types
export interface Trade {
  value: string;
  label: string;
}

export interface Category {
  trade: string;
  category: string;
  label: string; // Formatted display name
  productCount: number;
}

export interface Product {
  id: string;
  trade: string;
  category: string;
  productName: string;
  displayName: string | null;
  manufacturer: string;
  sku: string;
  unit: string;
}

// Hardcoded miscellaneous trade (not in DB)
export const MISC_TRADE: Trade = { value: "miscellaneous", label: "Miscellaneous" };

export const MISC_CATEGORIES: Category[] = [
  { trade: "miscellaneous", category: "overhead", label: "Overhead", productCount: 0 },
  { trade: "miscellaneous", category: "labor_adjustment", label: "Labor & Insurance", productCount: 0 },
  { trade: "miscellaneous", category: "materials_misc", label: "Misc Materials", productCount: 0 },
  { trade: "miscellaneous", category: "contingency", label: "Contingency", productCount: 0 },
];

// Format category slug to display label
function formatCategoryLabel(category: string): string {
  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Fetch all distinct trades
export async function fetchTrades(): Promise<Trade[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("product_catalog")
    .select("trade")
    .eq("active", true)
    .order("trade");

  if (error) {
    console.error("Error fetching trades:", error);
    return [MISC_TRADE];
  }

  // Get unique trades
  const uniqueTrades = [...new Set(data.map((d) => d.trade))];
  const trades: Trade[] = uniqueTrades.map((t) => ({
    value: t,
    label: t.charAt(0).toUpperCase() + t.slice(1),
  }));

  // Add miscellaneous at the end
  return [...trades, MISC_TRADE];
}

// Fetch categories for a specific trade
export async function fetchCategoriesByTrade(trade: string): Promise<Category[]> {
  if (trade === "miscellaneous") {
    return MISC_CATEGORIES;
  }

  const supabase = createClient();

  const { data, error } = await supabase
    .from("product_catalog")
    .select("category")
    .eq("trade", trade)
    .eq("active", true);

  if (error) {
    console.error("Error fetching categories:", error);
    return [];
  }

  // Count products per category
  const categoryCounts = data.reduce(
    (acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Convert to Category array and sort
  const categories: Category[] = Object.entries(categoryCounts)
    .map(([category, count]) => ({
      trade,
      category,
      label: formatCategoryLabel(category),
      productCount: count,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return categories;
}

// Fetch products for a specific trade and category
export async function fetchProductsByCategory(trade: string, category: string): Promise<Product[]> {
  if (trade === "miscellaneous") {
    return []; // No products for misc categories
  }

  const supabase = createClient();

  const { data, error } = await supabase
    .from("product_catalog")
    .select("id, trade, category, product_name, display_name, manufacturer, sku, unit")
    .eq("trade", trade)
    .eq("category", category)
    .eq("active", true)
    .order("product_name");

  if (error) {
    console.error("Error fetching products:", error);
    return [];
  }

  return data.map((p) => ({
    id: p.id,
    trade: p.trade,
    category: p.category,
    productName: p.product_name,
    displayName: p.display_name,
    manufacturer: p.manufacturer,
    sku: p.sku,
    unit: p.unit,
  }));
}

// Fetch all categories (for initial load)
export async function fetchAllCategories(): Promise<Category[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("product_catalog")
    .select("trade, category")
    .eq("active", true);

  if (error) {
    console.error("Error fetching all categories:", error);
    return MISC_CATEGORIES;
  }

  // Group by trade and category
  const grouped: Record<string, Record<string, number>> = {};
  data.forEach((item) => {
    if (!grouped[item.trade]) grouped[item.trade] = {};
    grouped[item.trade][item.category] = (grouped[item.trade][item.category] || 0) + 1;
  });

  // Flatten to Category array
  const categories: Category[] = [];
  Object.entries(grouped).forEach(([trade, cats]) => {
    Object.entries(cats).forEach(([category, count]) => {
      categories.push({
        trade,
        category,
        label: formatCategoryLabel(category),
        productCount: count,
      });
    });
  });

  // Add misc categories and sort
  return [...categories, ...MISC_CATEGORIES].sort((a, b) => {
    if (a.trade !== b.trade) return a.trade.localeCompare(b.trade);
    return a.label.localeCompare(b.label);
  });
}
