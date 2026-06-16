import assert from 'node:assert/strict';

import {
  resolveEstimateDefaults,
  resolveOrganizationEstimateDefaults,
} from '../lib/estimate-settings/resolve';

const orgSettings = {
  default_markup_percent: 12,
  estimate_defaults_v1: {
    markup_percent: 10,
    trim_system: 'whitewood',
    wrb_product: 'henry-hydrotex',
    overhead: {
      crew_size: 5,
      estimated_weeks: 3,
    },
  },
};

const orgDefaults = resolveOrganizationEstimateDefaults(orgSettings);
assert.equal(orgDefaults.markup_percent, 10);
assert.equal(orgDefaults.trim_system, 'whitewood');
assert.equal(orgDefaults.wrb.product, 'henry-hydrotex');
assert.equal(orgDefaults.overhead.crew_size, 5);
assert.equal(orgDefaults.overhead.estimated_weeks, 3);

const projectWins = resolveEstimateDefaults({
  organizationSettings: orgSettings,
  projectMarkupPercent: 15,
  projectConfig: {
    trim_system: 'hardie',
    wrb: { product: 'tyvek-homewrap' },
    overhead: { crew_size: 2 },
  },
});
assert.equal(projectWins.defaults.markup_percent, 15);
assert.equal(projectWins.defaults.trim_system, 'hardie');
assert.equal(projectWins.defaults.wrb.product, 'tyvek-homewrap');
assert.equal(projectWins.defaults.overhead.crew_size, 2);
assert.equal(projectWins.defaults.overhead.estimated_weeks, 3);
assert.equal(projectWins.sources.markup_percent, 'project');
assert.equal(projectWins.sources.estimate_config, 'project');

const orgWinsWhenProjectMissing = resolveEstimateDefaults({
  organizationSettings: orgSettings,
});
assert.equal(orgWinsWhenProjectMissing.defaults.markup_percent, 10);
assert.equal(orgWinsWhenProjectMissing.defaults.trim_system, 'whitewood');
assert.equal(orgWinsWhenProjectMissing.sources.markup_percent, 'organization');

const systemFallback = resolveEstimateDefaults({});
assert.equal(systemFallback.defaults.markup_percent, 15);
assert.equal(systemFallback.defaults.trim_system, 'hardie');

console.log('estimate defaults resolver validation passed');
