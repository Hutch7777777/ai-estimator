/**
 * @estimatepros/estimating-engine
 *
 * Single source of truth for EstimatePros estimating logic. Pure,
 * framework-agnostic. No DB, no fetch, no globals.
 *
 * The host app should NOT yet wire this in; it's a parallel module while
 * the n8n equivalent remains authoritative.
 */

export { normalizeDetectionEditorApprovalPayload } from './adapters/detectionEditorAdapter';
