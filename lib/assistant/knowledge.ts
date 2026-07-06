import type { ApiAccessContext } from "@/lib/api/access";
import {
  defaultAssistantCompanyRules,
  defaultAssistantTaskTemplates,
  type AssistantCompanyRuleSeed,
  type AssistantTaskTemplateSeed,
} from "@/lib/assistant/default-knowledge";

type DbRecord = Record<string, unknown>;

export interface AssistantKnowledgeContext {
  rules: AssistantCompanyRuleSeed[];
  templates: AssistantTaskTemplateSeed[];
  source: "database" | "defaults";
}

function asRecord(value: unknown): DbRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DbRecord) : null;
}

function asRecords(value: unknown): DbRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter(Boolean) as DbRecord[] : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeRule(record: DbRecord): AssistantCompanyRuleSeed | null {
  const title = asString(record.title);
  const content = asString(record.content);
  if (!title || !content) return null;

  return {
    title,
    ruleType: (asString(record.rule_type) ?? "estimating") as AssistantCompanyRuleSeed["ruleType"],
    content,
  };
}

function normalizeTemplate(record: DbRecord): AssistantTaskTemplateSeed | null {
  const templateKey = asString(record.template_key);
  const name = asString(record.name);
  const systemPrompt = asString(record.system_prompt);
  if (!templateKey || !name || !systemPrompt) return null;

  const metadata = asRecord(record.metadata);

  return {
    templateKey,
    name,
    description: asString(record.description) ?? "",
    category: (asString(metadata?.category) ?? "review") as AssistantTaskTemplateSeed["category"],
    requiresProject: Boolean(metadata?.requiresProject ?? metadata?.requires_project ?? true),
    userPrompt: asString(record.user_prompt) ?? "",
    systemPrompt,
    variables: asStringArray(record.variables),
  };
}

function withDefaultCoverage(
  rules: AssistantCompanyRuleSeed[],
  templates: AssistantTaskTemplateSeed[]
): AssistantKnowledgeContext {
  const mergedRules = rules.length ? rules : defaultAssistantCompanyRules;
  const mergedTemplates = templates.length ? templates : defaultAssistantTaskTemplates;

  return {
    rules: mergedRules,
    templates: mergedTemplates,
    source: rules.length || templates.length ? "database" : "defaults",
  };
}

export function getDefaultAssistantKnowledge(): AssistantKnowledgeContext {
  return {
    rules: defaultAssistantCompanyRules,
    templates: defaultAssistantTaskTemplates,
    source: "defaults",
  };
}

export async function loadAssistantKnowledge(
  ctx: ApiAccessContext,
  organizationId: string,
  projectId?: string | null
): Promise<AssistantKnowledgeContext> {
  const projectFilter = projectId ? `project_id.is.null,project_id.eq.${projectId}` : "project_id.is.null";

  try {
    const [rulesResult, templatesResult] = await Promise.all([
      ctx.supabase
        .from("company_rules")
        .select("title, content, rule_type")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .or(projectFilter)
        .order("updated_at", { ascending: false })
        .limit(30),
      ctx.supabase
        .from("prompt_templates")
        .select("name, description, template_key, system_prompt, user_prompt, variables, metadata")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .or(projectFilter)
        .order("updated_at", { ascending: false })
        .limit(20),
    ]);

    if (rulesResult.error || templatesResult.error) {
      console.warn("[assistant/knowledge] Falling back to default knowledge", {
        rulesError: rulesResult.error?.message,
        templatesError: templatesResult.error?.message,
      });
      return getDefaultAssistantKnowledge();
    }

    const rules = asRecords(rulesResult.data).map(normalizeRule).filter(Boolean) as AssistantCompanyRuleSeed[];
    const templates = asRecords(templatesResult.data).map(normalizeTemplate).filter(Boolean) as AssistantTaskTemplateSeed[];

    return withDefaultCoverage(rules, templates);
  } catch (error) {
    console.warn("[assistant/knowledge] Falling back to default knowledge", error);
    return getDefaultAssistantKnowledge();
  }
}

export function formatAssistantKnowledgeForPrompt(knowledge: AssistantKnowledgeContext): string {
  const rulesBlock = knowledge.rules.length
    ? knowledge.rules
        .map((rule, index) => `${index + 1}. ${rule.title} (${rule.ruleType})\n${rule.content}`)
        .join("\n\n")
    : "No approved company rules loaded.";

  const templatesBlock = knowledge.templates.length
    ? knowledge.templates
        .map((template, index) => {
          const variables = template.variables.length ? template.variables.join(", ") : "none listed";
          return [
            `${index + 1}. ${template.name} [${template.templateKey}]`,
            `Category: ${template.category}`,
            `Requires project: ${template.requiresProject ? "yes" : "no"}`,
            `Description: ${template.description || "n/a"}`,
            `Variables: ${variables}`,
            `Instructions: ${template.systemPrompt}`,
            template.userPrompt ? `Shortcut prompt: ${template.userPrompt}` : null,
          ].filter(Boolean).join("\n");
        })
        .join("\n\n")
    : "No task templates loaded.";

  return [
    `ASSISTANT KNOWLEDGE SOURCE: ${knowledge.source}`,
    "",
    "APPROVED COMPANY RULES",
    rulesBlock,
    "",
    "APPROVED TASK TEMPLATES",
    templatesBlock,
  ].join("\n");
}
