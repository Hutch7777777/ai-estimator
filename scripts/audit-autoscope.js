#!/usr/bin/env node
/**
 * Auto-Scope Rules Audit Script
 *
 * Run with: node scripts/audit-autoscope.js
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
    },
  });
  return response.json();
}

async function main() {
  console.log('🔍 Auto-Scope Rules Audit\n');

  // Get all auto-scope rules
  const rules = await fetchTable('siding_auto_scope_rules', {
    select: '*',
    active: 'eq.true',
    order: 'presentation_group.asc,item_order.asc',
  });

  if (!Array.isArray(rules)) {
    console.error('Error fetching rules:', rules);
    return;
  }

  console.log('='.repeat(80));
  console.log('SIDING AUTO-SCOPE RULES');
  console.log('='.repeat(80));
  console.log(`\nTotal active rules: ${rules.length}\n`);

  // Show schema
  if (rules[0]) {
    console.log('Rule columns:', Object.keys(rules[0]).join(', '));
    console.log('');
  }

  // Group by presentation_group
  const byGroup = {};
  rules.forEach(r => {
    const group = r.presentation_group || 'UNASSIGNED';
    if (!byGroup[group]) byGroup[group] = [];
    byGroup[group].push(r);
  });

  console.log('RULES BY PRESENTATION GROUP:');
  console.log('-'.repeat(80));
  Object.keys(byGroup).sort().forEach(group => {
    console.log(`\n📦 ${group.toUpperCase()} (${byGroup[group].length} rules):`);
    byGroup[group].forEach(r => {
      console.log(`   [${r.rule_id}] ${r.rule_name}`);
      console.log(`        SKU: ${r.material_sku}, Category: ${r.material_category}`);
      console.log(`        Output: ${r.output_unit}, Formula: ${r.quantity_formula.substring(0, 60)}...`);
    });
  });

  // List all material_category values
  const categories = [...new Set(rules.map(r => r.material_category))];
  console.log('\n\n' + '='.repeat(80));
  console.log('UNIQUE MATERIAL CATEGORIES IN AUTO-SCOPE:');
  console.log('='.repeat(80));
  categories.sort().forEach(c => console.log(`  - ${c}`));

  // List all material_sku values
  const skus = [...new Set(rules.map(r => r.material_sku))];
  console.log('\n' + '='.repeat(80));
  console.log('UNIQUE MATERIAL SKUS IN AUTO-SCOPE:');
  console.log('='.repeat(80));
  skus.sort().forEach(s => console.log(`  - ${s}`));

  // Cross-reference with pricing_items
  console.log('\n' + '='.repeat(80));
  console.log('SKU ALIGNMENT CHECK (Auto-scope SKUs vs pricing_items)');
  console.log('='.repeat(80));

  const pricingItems = await fetchTable('pricing_items', {
    select: 'sku,product_name,category',
    order: 'sku.asc',
  });

  if (Array.isArray(pricingItems)) {
    const pricingSKUs = new Set(pricingItems.map(p => p.sku));

    console.log('\n⚠️  AUTO-SCOPE SKUs NOT FOUND IN pricing_items:');
    const missingSkus = skus.filter(s => !pricingSKUs.has(s));
    if (missingSkus.length === 0) {
      console.log('   ✅ All auto-scope SKUs exist in pricing_items');
    } else {
      missingSkus.forEach(s => {
        const rule = rules.find(r => r.material_sku === s);
        console.log(`   ❌ ${s} (used by rule: ${rule?.rule_name})`);
      });
    }

    // Also check for category alignment
    console.log('\n' + '='.repeat(80));
    console.log('CATEGORY ALIGNMENT CHECK');
    console.log('='.repeat(80));

    const pricingCategories = new Set(pricingItems.map(p => p.category));

    console.log('\n⚠️  AUTO-SCOPE CATEGORIES NOT FOUND IN pricing_items:');
    const missingCategories = categories.filter(c => !pricingCategories.has(c));
    if (missingCategories.length === 0) {
      console.log('   ✅ All auto-scope categories exist in pricing_items');
    } else {
      missingCategories.forEach(c => {
        const ruleNames = rules.filter(r => r.material_category === c).map(r => r.rule_name);
        console.log(`   ❌ ${c} (used by rules: ${ruleNames.join(', ')})`);
      });
    }
  }

  // Trigger conditions analysis
  console.log('\n' + '='.repeat(80));
  console.log('TRIGGER CONDITIONS ANALYSIS');
  console.log('='.repeat(80));

  const triggerTypes = {};
  rules.forEach(r => {
    const condition = r.trigger_condition;
    const keys = Object.keys(condition || {}).sort().join('+') || 'EMPTY';
    if (!triggerTypes[keys]) triggerTypes[keys] = [];
    triggerTypes[keys].push(r.rule_name);
  });

  console.log('\n| Trigger Condition Keys | Rule Count | Sample Rules |');
  console.log('|------------------------|------------|--------------|');
  Object.entries(triggerTypes).forEach(([keys, ruleNames]) => {
    console.log(`| ${keys.padEnd(22)} | ${String(ruleNames.length).padStart(10)} | ${ruleNames.slice(0, 2).join(', ').substring(0, 30)}... |`);
  });

  // Output unit analysis
  console.log('\n' + '='.repeat(80));
  console.log('OUTPUT UNIT ANALYSIS');
  console.log('='.repeat(80));

  const outputUnits = {};
  rules.forEach(r => {
    const unit = r.output_unit || 'UNSPECIFIED';
    if (!outputUnits[unit]) outputUnits[unit] = 0;
    outputUnits[unit]++;
  });

  console.log('\n| Output Unit | Count |');
  console.log('|-------------|-------|');
  Object.entries(outputUnits).sort((a, b) => b[1] - a[1]).forEach(([unit, count]) => {
    console.log(`| ${unit.padEnd(11)} | ${String(count).padStart(5)} |`);
  });
}

main().catch(console.error);
