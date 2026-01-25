#!/usr/bin/env node
/**
 * Schema Audit Script - Pre-expansion validation
 *
 * Run with: node scripts/audit-schema.js
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
  console.log('🔍 Schema Audit for pricing_items expansion\n');

  // ============================================================================
  // 1. PRICING_ITEMS SCHEMA
  // ============================================================================
  console.log('='.repeat(80));
  console.log('1. PRICING_ITEMS TABLE SCHEMA');
  console.log('='.repeat(80));

  const pricingItems = await fetchTable('pricing_items', {
    select: '*',
    limit: '1',
  });

  if (pricingItems[0]) {
    console.log('\nColumn Name                | Sample Value');
    console.log('---------------------------|--------------------------------------------------');
    Object.entries(pricingItems[0]).forEach(([key, value]) => {
      const valStr = value === null ? 'NULL' : String(value).substring(0, 45);
      console.log(`${key.padEnd(26)} | ${valStr}`);
    });
  }

  // ============================================================================
  // 2. ALL PRICING ITEMS FOR ANALYSIS
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('2. CATEGORY DISTRIBUTION');
  console.log('='.repeat(80));

  const allItems = await fetchTable('pricing_items', {
    select: '*',
    order: 'category.asc',
  });

  if (!Array.isArray(allItems)) {
    console.error('Error fetching pricing_items:', allItems);
    return;
  }

  // Group by category
  const byCategory = {};
  allItems.forEach(item => {
    const cat = item.category || 'NULL';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  });

  console.log('\n| Category                      | Count | Trade       |');
  console.log('|-------------------------------|-------|-------------|');
  Object.keys(byCategory).sort().forEach(cat => {
    const trades = [...new Set(byCategory[cat].map(i => i.trade))].join(', ');
    console.log(`| ${cat.padEnd(29)} | ${String(byCategory[cat].length).padStart(5)} | ${trades.padEnd(11)} |`);
  });

  // ============================================================================
  // 3. TRADE DISTRIBUTION
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('3. TRADE DISTRIBUTION');
  console.log('='.repeat(80));

  const byTrade = {};
  allItems.forEach(item => {
    const trade = item.trade || 'NULL';
    if (!byTrade[trade]) byTrade[trade] = [];
    byTrade[trade].push(item);
  });

  console.log('\n| Trade          | Count | Categories Used |');
  console.log('|----------------|-------|-----------------|');
  Object.keys(byTrade).sort().forEach(trade => {
    const cats = [...new Set(byTrade[trade].map(i => i.category))];
    console.log(`| ${trade.padEnd(14)} | ${String(byTrade[trade].length).padStart(5)} | ${cats.length} categories  |`);
  });

  // ============================================================================
  // 4. UNIT OF MEASURE VALUES
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('4. UNIT OF MEASURE VALUES');
  console.log('='.repeat(80));

  const byUnit = {};
  allItems.forEach(item => {
    const unit = item.unit || 'NULL';
    if (!byUnit[unit]) byUnit[unit] = 0;
    byUnit[unit]++;
  });

  console.log('\n| Unit           | Count |');
  console.log('|----------------|-------|');
  Object.entries(byUnit).sort((a, b) => b[1] - a[1]).forEach(([unit, count]) => {
    console.log(`| ${unit.padEnd(14)} | ${String(count).padStart(5)} |`);
  });

  // ============================================================================
  // 5. CHECK FOR DUPLICATE SKUS
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('5. DUPLICATE SKU CHECK');
  console.log('='.repeat(80));

  const skuCounts = {};
  allItems.forEach(item => {
    const sku = item.sku || 'NULL';
    if (!skuCounts[sku]) skuCounts[sku] = [];
    skuCounts[sku].push(item);
  });

  const duplicates = Object.entries(skuCounts).filter(([, items]) => items.length > 1);

  if (duplicates.length > 0) {
    console.log(`\n⚠️  Found ${duplicates.length} duplicate SKUs:\n`);
    duplicates.forEach(([sku, items]) => {
      console.log(`SKU: ${sku} (${items.length} occurrences)`);
      items.forEach(item => {
        console.log(`   - ${item.product_name} [${item.category}] $${item.material_cost}`);
      });
    });
  } else {
    console.log('\n✅ No duplicate SKUs found');
  }

  // ============================================================================
  // 6. SKU PATTERNS BY CATEGORY
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('6. SKU PATTERNS BY CATEGORY');
  console.log('='.repeat(80));

  Object.keys(byCategory).sort().forEach(cat => {
    const skus = byCategory[cat].map(i => i.sku).filter(Boolean);
    if (skus.length > 0) {
      // Find common prefix
      const prefixes = skus.map(s => s.split('-')[0] || s.substring(0, 4));
      const prefixCounts = {};
      prefixes.forEach(p => {
        prefixCounts[p] = (prefixCounts[p] || 0) + 1;
      });
      const topPrefixes = Object.entries(prefixCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([p, c]) => `${p}(${c})`)
        .join(', ');
      console.log(`${cat.padEnd(25)}: ${topPrefixes}`);
    }
  });

  // ============================================================================
  // 7. CHECK AUTO-SCOPE RULES TABLE
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('7. AUTO-SCOPE RULES CHECK');
  console.log('='.repeat(80));

  const autoScopeRules = await fetchTable('siding_auto_scope_rules', {
    select: '*',
    order: 'category.asc,rule_name.asc',
  });

  if (autoScopeRules.error || autoScopeRules.code) {
    console.log('\n⚠️  siding_auto_scope_rules table not found or error:', autoScopeRules.message || autoScopeRules.code);
  } else if (Array.isArray(autoScopeRules) && autoScopeRules.length > 0) {
    console.log(`\nFound ${autoScopeRules.length} auto-scope rules\n`);

    // Show schema
    console.log('Auto-scope rule columns:', Object.keys(autoScopeRules[0]).join(', '));

    // Group by category
    const rulesByCategory = {};
    autoScopeRules.forEach(rule => {
      const cat = rule.category || 'UNCATEGORIZED';
      if (!rulesByCategory[cat]) rulesByCategory[cat] = [];
      rulesByCategory[cat].push(rule);
    });

    console.log('\n| Rule Category               | Rules | Sample Trigger |');
    console.log('|-----------------------------|-------|----------------|');
    Object.keys(rulesByCategory).sort().forEach(cat => {
      const rules = rulesByCategory[cat];
      const sampleTrigger = rules[0].trigger_condition || rules[0].trigger_type || 'N/A';
      console.log(`| ${cat.padEnd(27)} | ${String(rules.length).padStart(5)} | ${String(sampleTrigger).substring(0, 14)} |`);
    });

    // Check for category mismatches
    console.log('\n--- Category Alignment Check ---');
    const pricingCategories = new Set(Object.keys(byCategory));
    const autoScopeCategories = new Set(Object.keys(rulesByCategory));

    const inAutoScopeOnly = [...autoScopeCategories].filter(c => !pricingCategories.has(c));
    const inPricingOnly = [...pricingCategories].filter(c => !autoScopeCategories.has(c));

    if (inAutoScopeOnly.length > 0) {
      console.log('\n⚠️  Categories in auto-scope but NOT in pricing_items:');
      inAutoScopeOnly.forEach(c => console.log(`   - ${c}`));
    }

    if (inPricingOnly.length > 0) {
      console.log('\n📋 Categories in pricing_items but NOT in auto-scope (may be manual-assign only):');
      inPricingOnly.forEach(c => console.log(`   - ${c}`));
    }

    if (inAutoScopeOnly.length === 0 && inPricingOnly.length === 0) {
      console.log('\n✅ All categories are aligned between tables');
    }
  } else {
    console.log('\n⚠️  No auto-scope rules found or table is empty');
  }

  // ============================================================================
  // 8. NULL VALUE CHECK
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('8. NULL VALUE CHECK (Data Quality)');
  console.log('='.repeat(80));

  const nullChecks = {
    sku: allItems.filter(i => !i.sku).length,
    product_name: allItems.filter(i => !i.product_name).length,
    category: allItems.filter(i => !i.category).length,
    trade: allItems.filter(i => !i.trade).length,
    unit: allItems.filter(i => !i.unit).length,
    material_cost: allItems.filter(i => i.material_cost === null).length,
    base_labor_cost: allItems.filter(i => i.base_labor_cost === null).length,
  };

  console.log('\n| Column          | NULL Count | Status |');
  console.log('|-----------------|------------|--------|');
  Object.entries(nullChecks).forEach(([col, count]) => {
    const status = count === 0 ? '✅ OK' : (count > 10 ? '⚠️ Review' : '🔸 Minor');
    console.log(`| ${col.padEnd(15)} | ${String(count).padStart(10)} | ${status.padEnd(6)} |`);
  });

  // ============================================================================
  // 9. PRODUCT LINE ANALYSIS
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('9. PRODUCT LINE ANALYSIS');
  console.log('='.repeat(80));

  const byProductLine = {};
  allItems.forEach(item => {
    const line = item.product_line || 'UNSPECIFIED';
    if (!byProductLine[line]) byProductLine[line] = 0;
    byProductLine[line]++;
  });

  console.log('\n| Product Line                | Count |');
  console.log('|-----------------------------|-------|');
  Object.entries(byProductLine)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([line, count]) => {
      console.log(`| ${line.padEnd(27)} | ${String(count).padStart(5)} |`);
    });

  // ============================================================================
  // 10. MANUFACTURER ANALYSIS
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('10. MANUFACTURER ANALYSIS');
  console.log('='.repeat(80));

  const byManufacturer = {};
  allItems.forEach(item => {
    const mfr = item.manufacturer || 'UNSPECIFIED';
    if (!byManufacturer[mfr]) byManufacturer[mfr] = 0;
    byManufacturer[mfr]++;
  });

  console.log('\n| Manufacturer                | Count |');
  console.log('|-----------------------------|-------|');
  Object.entries(byManufacturer)
    .sort((a, b) => b[1] - a[1])
    .forEach(([mfr, count]) => {
      console.log(`| ${mfr.padEnd(27)} | ${String(count).padStart(5)} |`);
    });

  // ============================================================================
  // 11. COVERAGE DATA CHECK
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('11. COVERAGE DATA CHECK');
  console.log('='.repeat(80));

  const withCoverage = allItems.filter(i => i.coverage_value !== null);
  const coverageUnits = {};
  withCoverage.forEach(item => {
    const unit = item.coverage_unit || 'UNSPECIFIED';
    if (!coverageUnits[unit]) coverageUnits[unit] = 0;
    coverageUnits[unit]++;
  });

  console.log(`\nProducts with coverage data: ${withCoverage.length} / ${allItems.length}`);
  if (Object.keys(coverageUnits).length > 0) {
    console.log('\n| Coverage Unit    | Count |');
    console.log('|------------------|-------|');
    Object.entries(coverageUnits).forEach(([unit, count]) => {
      console.log(`| ${unit.padEnd(16)} | ${String(count).padStart(5)} |`);
    });
  }

  // ============================================================================
  // 12. SPECIAL FLAGS CHECK
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('12. SPECIAL FLAGS CHECK');
  console.log('='.repeat(80));

  const flagChecks = {
    is_colorplus: allItems.filter(i => i.is_colorplus === true).length,
    requires_primer: allItems.filter(i => i.requires_primer === true).length,
    requires_starter_strip: allItems.filter(i => i.requires_starter_strip === true).length,
    joint_flashing_required: allItems.filter(i => i.joint_flashing_required === true).length,
  };

  console.log('\n| Flag                     | TRUE Count |');
  console.log('|--------------------------|------------|');
  Object.entries(flagChecks).forEach(([flag, count]) => {
    console.log(`| ${flag.padEnd(24)} | ${String(count).padStart(10)} |`);
  });

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY & RECOMMENDATIONS');
  console.log('='.repeat(80));

  console.log(`
📊 CURRENT STATE:
   Total Products: ${allItems.length}
   Categories: ${Object.keys(byCategory).length}
   Trades: ${Object.keys(byTrade).length}
   Manufacturers: ${Object.keys(byManufacturer).length}

🔧 SKU PATTERNS TO FOLLOW:
   - Siding: JH-LAP-*, JH-PANEL-*, JH-SHINGLE-*
   - Trim: JH-TRIM-*, CASING-*, FRIEZE-*
   - Roofing: ROOF-*, GAF-*, OC-*, CER-*
   - Windows: WIN-*
   - Gutters: GUT-*
   - Accessories: FLASH-*, CAULK-*, NAIL-*, TYVEK-*

⚠️  ISSUES TO ADDRESS:
   - Duplicate SKUs: ${duplicates.length}
   - NULL categories: ${nullChecks.category}
   - NULL trades: ${nullChecks.trade}

📝 RECOMMENDED CATEGORIES FOR NEW PRODUCTS:
   - decorative (corbels, brackets)
   - shutters
   - posts
   - columns
   - belly_band (if not using trim)

🎯 EXPANSION PRIORITIES:
   1. Add decorative/architectural products (missing entirely)
   2. Expand siding widths (5.25", 6.25", 7.25", 8.25")
   3. Add LP SmartSide products
   4. Add vinyl alternatives
   5. Expand gutter accessories
`);
}

main().catch(console.error);
