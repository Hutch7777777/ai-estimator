#!/usr/bin/env node
/**
 * Audit Script for pricing_items table
 *
 * Run with: node scripts/audit-pricing-items.js
 */

const SUPABASE_URL = 'https://okwtyttfqbfmcqtenize.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rd3R5dHRmcWJmbWNxdGVuaXplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NDYwNTEsImV4cCI6MjA3ODAyMjA1MX0.I1HRDRZpj4ExWp9_8tB_k1Bxzuc2SjqQ6DSyAar2AOE';

async function fetchTable(table, params = {}) {
  const searchParams = new URLSearchParams(params);
  const url = `${SUPABASE_URL}/rest/v1/${table}?${searchParams.toString()}`;

  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  return response.json();
}

async function main() {
  console.log('🔍 Auditing pricing_items table...\n');

  // 1. Get all products
  console.log('='.repeat(80));
  console.log('1. PRODUCT COUNT BY CATEGORY');
  console.log('='.repeat(80));

  const allItems = await fetchTable('pricing_items', {
    select: '*',
    order: 'category.asc,product_name.asc',
  });

  if (allItems.error) {
    console.error('Error fetching items:', allItems.error, allItems.message);
    return;
  }

  if (!Array.isArray(allItems)) {
    console.error('Unexpected response format:', allItems);
    return;
  }

  console.log(`\nTotal products: ${allItems.length}\n`);

  // Show column names from first item
  if (allItems[0]) {
    console.log('Table columns:', Object.keys(allItems[0]).join(', '));
    console.log('');
  }

  // Group by category
  const byCategory = {};
  allItems.forEach(item => {
    const cat = item.category || 'UNCATEGORIZED';
    if (!byCategory[cat]) {
      byCategory[cat] = {
        items: [],
        minPrice: Infinity,
        maxPrice: -Infinity,
      };
    }
    byCategory[cat].items.push(item);
    // Use material_cost (the actual column name)
    if (item.material_cost != null) {
      byCategory[cat].minPrice = Math.min(byCategory[cat].minPrice, item.material_cost);
      byCategory[cat].maxPrice = Math.max(byCategory[cat].maxPrice, item.material_cost);
    }
  });

  // Display summary table
  console.log('| Category                                 | Count | Min Price | Max Price |');
  console.log('|------------------------------------------|-------|-----------|-----------|');
  Object.keys(byCategory).sort().forEach(cat => {
    const data = byCategory[cat];
    const min = data.minPrice === Infinity ? 'N/A' : `$${data.minPrice.toFixed(2)}`;
    const max = data.maxPrice === -Infinity ? 'N/A' : `$${data.maxPrice.toFixed(2)}`;
    console.log(`| ${cat.padEnd(40)} | ${String(data.items.length).padStart(5)} | ${min.padStart(9)} | ${max.padStart(9)} |`);
  });

  // 2. Get unique categories list
  console.log('\n' + '='.repeat(80));
  console.log('2. UNIQUE CATEGORIES');
  console.log('='.repeat(80));
  const categories = Object.keys(byCategory).sort();
  categories.forEach((cat, i) => {
    console.log(`  ${i + 1}. ${cat}`);
  });

  // 3. Sample products per category
  console.log('\n' + '='.repeat(80));
  console.log('3. SAMPLE PRODUCTS PER CATEGORY');
  console.log('='.repeat(80));

  Object.keys(byCategory).sort().forEach(cat => {
    console.log(`\n📦 ${cat} (${byCategory[cat].items.length} products):`);
    const samples = byCategory[cat].items.slice(0, 8);
    samples.forEach(item => {
      const price = item.material_cost != null ? `$${item.material_cost.toFixed(2)}` : 'N/A';
      console.log(`   • [${item.sku || 'N/A'}] ${item.product_name} - ${price}/${item.unit || 'EA'}`);
    });
    if (byCategory[cat].items.length > 8) {
      console.log(`   ... and ${byCategory[cat].items.length - 8} more`);
    }
  });

  // 4. Identify gaps based on detection classes
  console.log('\n' + '='.repeat(80));
  console.log('4. GAP ANALYSIS - PRODUCTS NEEDED BY DETECTION CLASS');
  console.log('='.repeat(80));

  const DETECTION_CLASSES = [
    // Area classes (SF)
    'siding', 'window', 'door', 'garage', 'roof', 'gable', 'soffit',
    // Linear classes (LF)
    'trim', 'fascia', 'gutter', 'eave', 'rake', 'ridge', 'valley', 'belly_band',
    // Count classes (EA)
    'vent', 'flashing', 'downspout', 'outlet', 'hose_bib', 'light_fixture',
    'corbel', 'gable_vent', 'corner_inside', 'corner_outside',
    'shutter', 'post', 'column', 'bracket',
  ];

  // Map detection classes to expected product categories
  const CLASS_TO_EXPECTED_CATEGORIES = {
    siding: ['lap_siding', 'shingle', 'panel', 'siding', 'board_and_batten', 'lap siding'],
    soffit: ['soffit'],
    trim: ['trim'],
    fascia: ['fascia', 'trim'],
    gutter: ['gutter', 'gutters'],
    downspout: ['downspout', 'gutter'],
    roof: ['roofing', 'shingles'],
    ridge: ['roofing', 'ridge'],
    valley: ['roofing', 'valley'],
    corbel: ['corbel', 'decorative', 'architectural'],
    bracket: ['bracket', 'decorative', 'architectural'],
    shutter: ['shutter', 'decorative'],
    post: ['post', 'porch'],
    column: ['column', 'porch'],
    gable_vent: ['vent', 'gable_vent'],
    vent: ['vent'],
    flashing: ['flashing'],
  };

  const existingCategoriesLower = categories.map(c => c.toLowerCase());

  console.log('\n| Detection Class | Has Products? | Related Categories | Suggested Products |');
  console.log('|-----------------|---------------|--------------------|--------------------|');

  DETECTION_CLASSES.forEach(cls => {
    const expected = CLASS_TO_EXPECTED_CATEGORIES[cls] || [];
    const matchedCategories = existingCategoriesLower.filter(cat =>
      expected.some(exp => cat.includes(exp.toLowerCase()) || exp.toLowerCase().includes(cat))
    );
    const hasProducts = matchedCategories.length > 0;

    let suggestions = '';
    if (!hasProducts && expected.length > 0) {
      suggestions = `Add ${cls} products`;
    }

    const status = hasProducts ? '✅ Yes' : (expected.length > 0 ? '❌ No' : '⏭️ Auto-scope');
    const cats = matchedCategories.slice(0, 2).join(', ') || '-';
    console.log(`| ${cls.padEnd(15)} | ${status.padEnd(13)} | ${cats.padEnd(18)} | ${suggestions.padEnd(18)} |`);
  });

  // 5. Full product list grouped by trade
  console.log('\n' + '='.repeat(80));
  console.log('5. PRODUCTS BY TRADE');
  console.log('='.repeat(80));

  const byTrade = {};
  allItems.forEach(item => {
    const trade = item.trade || 'UNASSIGNED';
    if (!byTrade[trade]) byTrade[trade] = [];
    byTrade[trade].push(item);
  });

  Object.keys(byTrade).sort().forEach(trade => {
    console.log(`\n🔧 ${trade.toUpperCase()} (${byTrade[trade].length} products)`);
  });

  // 6. Products with pricing
  console.log('\n' + '='.repeat(80));
  console.log('6. PRODUCTS WITH PRICING (showing unit costs)');
  console.log('='.repeat(80));

  const withPricing = allItems.filter(i => i.material_cost != null);
  console.log(`\nProducts with material_cost: ${withPricing.length} / ${allItems.length}`);

  console.log('\n| SKU                  | Product Name                             | Category             | Mat $ | Labor $ | Unit |');
  console.log('|----------------------|------------------------------------------|----------------------|-------|---------|------|');
  withPricing.slice(0, 50).forEach(item => {
    const matCost = item.material_cost != null ? `$${item.material_cost.toFixed(2)}` : 'N/A';
    const labCost = item.base_labor_cost != null ? `$${item.base_labor_cost.toFixed(2)}` : 'N/A';
    console.log(`| ${(item.sku || 'N/A').padEnd(20)} | ${(item.product_name || 'N/A').substring(0, 40).padEnd(40)} | ${(item.category || 'N/A').substring(0, 20).padEnd(20)} | ${matCost.padStart(5)} | ${labCost.padStart(7)} | ${(item.unit || 'EA').padEnd(4)} |`);
  });

  if (withPricing.length > 50) {
    console.log(`\n... and ${withPricing.length - 50} more priced products`);
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Products: ${allItems.length}`);
  console.log(`Products with Pricing: ${withPricing.length}`);
  console.log(`Total Categories: ${categories.length}`);
  console.log(`Total Trades: ${Object.keys(byTrade).length}`);
  console.log(`\nCategories: ${categories.join(', ')}`);
  console.log(`\nTrades: ${Object.keys(byTrade).join(', ')}`);
}

main().catch(console.error);
