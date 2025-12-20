"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Trade,
  Category,
  Product,
  fetchTrades,
  fetchCategoriesByTrade,
  fetchProductsByCategory,
  MISC_TRADE,
  MISC_CATEGORIES,
} from "@/lib/supabase/cadCategories";

export interface UseProductCategoriesReturn {
  trades: Trade[];
  categories: Category[];
  products: Product[];
  isLoadingTrades: boolean;
  isLoadingCategories: boolean;
  isLoadingProducts: boolean;
  selectedTrade: string | null;
  selectedCategory: string | null;
  setSelectedTrade: (trade: string | null) => void;
  setSelectedCategory: (category: string | null) => void;
  getCategoryLabel: (trade: string, category: string) => string;
  getTradeLabel: (trade: string) => string;
}

export function useProductCategories(): UseProductCategoriesReturn {
  // State
  const [trades, setTrades] = useState<Trade[]>([MISC_TRADE]);
  const [categoriesCache, setCategoriesCache] = useState<Record<string, Category[]>>({
    miscellaneous: MISC_CATEGORIES,
  });
  const [productsCache, setProductsCache] = useState<Record<string, Product[]>>({});

  const [isLoadingTrades, setIsLoadingTrades] = useState(true);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  const [selectedTrade, setSelectedTradeState] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategoryState] = useState<string | null>(null);

  // Fetch trades on mount
  useEffect(() => {
    let mounted = true;

    const loadTrades = async () => {
      setIsLoadingTrades(true);
      try {
        const data = await fetchTrades();
        if (mounted) {
          setTrades(data);
        }
      } catch (error) {
        console.error("Error loading trades:", error);
      } finally {
        if (mounted) {
          setIsLoadingTrades(false);
        }
      }
    };

    loadTrades();

    return () => {
      mounted = false;
    };
  }, []);

  // Fetch categories when trade changes
  useEffect(() => {
    if (!selectedTrade) return;

    // Check cache first
    if (categoriesCache[selectedTrade]) {
      return;
    }

    let mounted = true;

    const loadCategories = async () => {
      setIsLoadingCategories(true);
      try {
        const data = await fetchCategoriesByTrade(selectedTrade);
        if (mounted) {
          setCategoriesCache((prev) => ({
            ...prev,
            [selectedTrade]: data,
          }));
        }
      } catch (error) {
        console.error("Error loading categories:", error);
      } finally {
        if (mounted) {
          setIsLoadingCategories(false);
        }
      }
    };

    loadCategories();

    return () => {
      mounted = false;
    };
  }, [selectedTrade, categoriesCache]);

  // Fetch products when category changes
  useEffect(() => {
    if (!selectedTrade || !selectedCategory) return;

    const cacheKey = `${selectedTrade}:${selectedCategory}`;

    // Check cache first
    if (productsCache[cacheKey]) {
      return;
    }

    let mounted = true;

    const loadProducts = async () => {
      setIsLoadingProducts(true);
      try {
        const data = await fetchProductsByCategory(selectedTrade, selectedCategory);
        if (mounted) {
          setProductsCache((prev) => ({
            ...prev,
            [cacheKey]: data,
          }));
        }
      } catch (error) {
        console.error("Error loading products:", error);
      } finally {
        if (mounted) {
          setIsLoadingProducts(false);
        }
      }
    };

    loadProducts();

    return () => {
      mounted = false;
    };
  }, [selectedTrade, selectedCategory, productsCache]);

  // Set selected trade (resets category)
  const setSelectedTrade = useCallback((trade: string | null) => {
    setSelectedTradeState(trade);
    setSelectedCategoryState(null); // Reset category when trade changes
  }, []);

  // Set selected category
  const setSelectedCategory = useCallback((category: string | null) => {
    setSelectedCategoryState(category);
  }, []);

  // Get current categories for selected trade
  const categories = useMemo(() => {
    if (!selectedTrade) return [];
    return categoriesCache[selectedTrade] || [];
  }, [selectedTrade, categoriesCache]);

  // Get current products for selected trade/category
  const products = useMemo(() => {
    if (!selectedTrade || !selectedCategory) return [];
    const cacheKey = `${selectedTrade}:${selectedCategory}`;
    return productsCache[cacheKey] || [];
  }, [selectedTrade, selectedCategory, productsCache]);

  // Helper to get category label
  const getCategoryLabel = useCallback(
    (trade: string, category: string): string => {
      const tradeCategories = categoriesCache[trade] || [];
      const found = tradeCategories.find((c) => c.category === category);
      return found?.label || category;
    },
    [categoriesCache]
  );

  // Helper to get trade label
  const getTradeLabel = useCallback(
    (trade: string): string => {
      const found = trades.find((t) => t.value === trade);
      return found?.label || trade;
    },
    [trades]
  );

  return {
    trades,
    categories,
    products,
    isLoadingTrades,
    isLoadingCategories,
    isLoadingProducts,
    selectedTrade,
    selectedCategory,
    setSelectedTrade,
    setSelectedCategory,
    getCategoryLabel,
    getTradeLabel,
  };
}
