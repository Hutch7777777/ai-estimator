-- Migration: AI Assistant RAG MVP foundation
-- Purpose: Add organization-scoped global/project assistant tables for knowledge,
-- chat history, citations, feedback, rules, and prompt templates.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Reusable membership helper for assistant RLS policies.
CREATE OR REPLACE FUNCTION public.is_organization_member(org_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.organization_memberships om
    WHERE om.organization_id = org_uuid
      AND om.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- KNOWLEDGE COLLECTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  collection_type TEXT NOT NULL DEFAULT 'company',
  visibility TEXT NOT NULL DEFAULT 'organization',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT knowledge_collections_type_check CHECK (
    collection_type IN ('core', 'company', 'project', 'template', 'rule')
  ),
  CONSTRAINT knowledge_collections_visibility_check CHECK (
    visibility IN ('organization', 'project')
  )
);

CREATE INDEX IF NOT EXISTS idx_knowledge_collections_org_project
  ON knowledge_collections(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_collections_type
  ON knowledge_collections(organization_id, collection_type);

-- ============================================================================
-- DOCUMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  collection_id UUID REFERENCES knowledge_collections(id) ON DELETE SET NULL,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT,
  mime_type TEXT,
  storage_bucket TEXT,
  storage_path TEXT,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  extracted_text_checksum TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT documents_status_check CHECK (
    status IN ('uploaded', 'extracting', 'chunking', 'embedding', 'ready', 'error')
  )
);

CREATE INDEX IF NOT EXISTS idx_documents_org_project
  ON documents(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_documents_collection
  ON documents(collection_id);
CREATE INDEX IF NOT EXISTS idx_documents_status
  ON documents(organization_id, status);

-- ============================================================================
-- DOCUMENT CHUNKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  collection_id UUID REFERENCES knowledge_collections(id) ON DELETE SET NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER,
  embedding VECTOR(1536),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_chunks_unique_index UNIQUE(document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document
  ON document_chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_document_chunks_org_project
  ON document_chunks(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_content_tsv
  ON document_chunks USING GIN(content_tsv);
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
  ON document_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;

-- ============================================================================
-- CHAT THREADS AND MESSAGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  scope TEXT NOT NULL DEFAULT 'global',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_threads_scope_check CHECK (scope IN ('global', 'project'))
);

CREATE INDEX IF NOT EXISTS idx_chat_threads_org_project
  ON chat_threads(organization_id, project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_threads_created_by
  ON chat_threads(created_by);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  token_count INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_messages_role_check CHECK (
    role IN ('system', 'user', 'assistant', 'tool')
  )
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread
  ON chat_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_org_project
  ON chat_messages(organization_id, project_id, created_at DESC);

-- ============================================================================
-- FEEDBACK, RULES, AND TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS assistant_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES chat_threads(id) ON DELETE SET NULL,
  message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating TEXT NOT NULL,
  feedback_type TEXT,
  comment TEXT,
  saved_as_rule BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT assistant_feedback_rating_check CHECK (
    rating IN ('helpful', 'not_helpful')
  )
);

CREATE INDEX IF NOT EXISTS idx_assistant_feedback_org_project
  ON assistant_feedback(organization_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_feedback_message
  ON assistant_feedback(message_id);

CREATE TABLE IF NOT EXISTS company_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  collection_id UUID REFERENCES knowledge_collections(id) ON DELETE SET NULL,
  source_feedback_id UUID REFERENCES assistant_feedback(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  rule_type TEXT NOT NULL DEFAULT 'estimating',
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_rules_org_project
  ON company_rules(organization_id, project_id, active);
CREATE INDEX IF NOT EXISTS idx_company_rules_type
  ON company_rules(organization_id, rule_type);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  template_key TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  user_prompt TEXT,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT prompt_templates_unique_key UNIQUE(organization_id, project_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_prompt_templates_org_project
  ON prompt_templates(organization_id, project_id, active);

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS update_knowledge_collections_updated_at ON knowledge_collections;
CREATE TRIGGER update_knowledge_collections_updated_at
  BEFORE UPDATE ON knowledge_collections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_document_chunks_updated_at ON document_chunks;
CREATE TRIGGER update_document_chunks_updated_at
  BEFORE UPDATE ON document_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_chat_threads_updated_at ON chat_threads;
CREATE TRIGGER update_chat_threads_updated_at
  BEFORE UPDATE ON chat_threads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_company_rules_updated_at ON company_rules;
CREATE TRIGGER update_company_rules_updated_at
  BEFORE UPDATE ON company_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_prompt_templates_updated_at ON prompt_templates;
CREATE TRIGGER update_prompt_templates_updated_at
  BEFORE UPDATE ON prompt_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RETRIEVAL HELPER
-- ============================================================================

CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding VECTOR(1536),
  match_organization_id UUID,
  match_project_id UUID DEFAULT NULL,
  match_count INTEGER DEFAULT 8
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE dc.organization_id = match_organization_id
    AND dc.embedding IS NOT NULL
    AND (
      (match_project_id IS NULL AND dc.project_id IS NULL)
      OR (
        match_project_id IS NOT NULL
        AND (dc.project_id IS NULL OR dc.project_id = match_project_id)
      )
    )
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE knowledge_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read knowledge collections"
  ON knowledge_collections FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));
CREATE POLICY "Members can write knowledge collections"
  ON knowledge_collections FOR ALL TO authenticated
  USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "Members can read documents"
  ON documents FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));
CREATE POLICY "Members can write documents"
  ON documents FOR ALL TO authenticated
  USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "Members can read document chunks"
  ON document_chunks FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));
CREATE POLICY "Members can write document chunks"
  ON document_chunks FOR ALL TO authenticated
  USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "Members can read chat threads"
  ON chat_threads FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));
CREATE POLICY "Members can write chat threads"
  ON chat_threads FOR ALL TO authenticated
  USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "Members can read chat messages"
  ON chat_messages FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));
CREATE POLICY "Members can write chat messages"
  ON chat_messages FOR ALL TO authenticated
  USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "Members can read assistant feedback"
  ON assistant_feedback FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));
CREATE POLICY "Members can write assistant feedback"
  ON assistant_feedback FOR ALL TO authenticated
  USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "Members can read company rules"
  ON company_rules FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));
CREATE POLICY "Members can write company rules"
  ON company_rules FOR ALL TO authenticated
  USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "Members can read prompt templates"
  ON prompt_templates FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));
CREATE POLICY "Members can write prompt templates"
  ON prompt_templates FOR ALL TO authenticated
  USING (public.is_organization_member(organization_id))
  WITH CHECK (public.is_organization_member(organization_id));
