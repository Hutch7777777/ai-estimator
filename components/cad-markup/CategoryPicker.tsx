"use client";

import { useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useProductCategories } from "./useProductCategories";
import { MarkupMaterial, DEFAULT_MARKUP_COLOR } from "./types";
import { ColorPicker } from "./ColorPicker";

interface CategoryPickerProps {
  value: MarkupMaterial;
  onChange: (material: MarkupMaterial) => void;
  disabled?: boolean;
}

export function CategoryPicker({ value, onChange, disabled = false }: CategoryPickerProps) {
  const {
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
  } = useProductCategories();

  // Sync hook state with value prop on mount
  useEffect(() => {
    if (value.trade && value.trade !== selectedTrade) {
      setSelectedTrade(value.trade);
    }
    if (value.category && value.category !== selectedCategory) {
      setSelectedCategory(value.category);
    }
  }, []);  // Only on mount

  // Handle trade change
  const handleTradeChange = (trade: string) => {
    setSelectedTrade(trade);
    onChange({
      trade,
      category: "",
      productId: undefined,
      productName: undefined,
      color: value.color || DEFAULT_MARKUP_COLOR,
    });
  };

  // Handle category change
  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    onChange({
      ...value,
      category,
      productId: undefined,
      productName: undefined,
    });
  };

  // Handle product change
  const handleProductChange = (productId: string) => {
    if (productId === "none") {
      onChange({
        ...value,
        productId: undefined,
        productName: undefined,
      });
    } else {
      const product = products.find((p) => p.id === productId);
      onChange({
        ...value,
        productId,
        productName: product?.displayName || product?.productName || undefined,
      });
    }
  };

  // Handle color change
  const handleColorChange = (color: string) => {
    onChange({ ...value, color });
  };

  return (
    <div className="space-y-3">
      {/* Trade Selection */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Trade</Label>
        <Select
          value={value.trade || ""}
          onValueChange={handleTradeChange}
          disabled={disabled || isLoadingTrades}
        >
          <SelectTrigger className="h-9">
            {isLoadingTrades ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SelectValue placeholder="Select trade..." />
            )}
          </SelectTrigger>
          <SelectContent>
            {trades.map((trade) => (
              <SelectItem key={trade.value} value={trade.value}>
                {trade.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Category Selection */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Category</Label>
        <Select
          value={value.category || ""}
          onValueChange={handleCategoryChange}
          disabled={disabled || !value.trade || isLoadingCategories}
        >
          <SelectTrigger className="h-9">
            {isLoadingCategories ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SelectValue placeholder={value.trade ? "Select category..." : "Select trade first"} />
            )}
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat.category} value={cat.category}>
                {cat.label}
                {cat.productCount > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({cat.productCount})
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Product Selection (Optional) */}
      {value.trade && value.category && value.trade !== "miscellaneous" && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Product <span className="text-gray-400">(optional)</span>
          </Label>
          <Select
            value={value.productId || "none"}
            onValueChange={handleProductChange}
            disabled={disabled || isLoadingProducts}
          >
            <SelectTrigger className="h-9">
              {isLoadingProducts ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SelectValue placeholder="Select product..." />
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">— Category only —</span>
              </SelectItem>
              {products.map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  <span className="truncate">
                    {product.displayName || product.productName}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Color Selection */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Color</Label>
        <ColorPicker
          color={value.color || DEFAULT_MARKUP_COLOR}
          onChange={handleColorChange}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
