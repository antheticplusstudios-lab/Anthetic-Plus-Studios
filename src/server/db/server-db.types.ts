// Server-side Supabase contracts for the four LIVE production databases.
// Source: read-only information_schema inspection of the four production Supabase projects on 2026-10-05.
import type { Json } from "@/integrations/supabase/types";

type ServerTable<Row extends Record<string, unknown>> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: never[];
};
type ServerFunction<Args extends Record<string, unknown>, Returns> = {
  Args: Args;
  Returns: Returns;
};
type ServerDatabaseBase<
  Tables extends Record<string, ServerTable<Record<string, unknown>>>,
  Functions extends Record<string, ServerFunction<Record<string, unknown>, unknown>> = Record<
    string,
    ServerFunction<Record<string, unknown>, unknown>
  >,
> = {
  __InternalSupabase: { PostgrestVersion: "14.5" };
  public: {
    Tables: Tables;
    Views: Record<string, never>;
    Functions: Record<string, ServerFunction<Record<string, unknown>, unknown>> & Functions;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, never>;
  };
};

export type DB1Database = ServerDatabaseBase<
  {
    account_restrictions: ServerTable<{
      id: string;
      client_id: string;
      status: string;
      is_muted: boolean;
      reason: string | null;
      suspended_until: string | null;
      banned_at: string | null;
      banned_by: string | null;
      updated_by: string | null;
      created_at: string;
      updated_at: string;
      user_id: string;
      muted: boolean;
      muted_reason: string | null;
      sessions_revoked_at: string | null;
      restricted_until: string | null;
    }>;
    audit_logs: ServerTable<{
      id: string;
      actor_id: string | null;
      client_id: string | null;
      action: string;
      target_type: string | null;
      target_id: string | null;
      metadata: Json;
      ip_address: string | null;
      user_agent: string | null;
      created_at: string;
      actor_user_id: string | null;
      reason: string | null;
      before_value: Json | null;
      after_value: Json | null;
      request_id: string | null;
    }>;
    feature_flags: ServerTable<{
      key: string;
      description: string | null;
      is_enabled: boolean;
      rules: Json;
      created_at: string;
      updated_at: string;
    }>;
    organization_members: ServerTable<{
      id: string;
      organization_id: string;
      user_id: string;
      role: string;
      created_at: string;
      updated_at: string;
      is_active: boolean;
    }>;
    organizations: ServerTable<{
      id: string;
      name: string;
      slug: string;
      signup_origin: string;
      origin_domain: string | null;
      owner_user_id: string | null;
      is_active: boolean;
      created_at: string;
      updated_at: string;
      partner_source_organization_id: string | null;
      created_by_user_id: string | null;
      metadata: Json;
    }>;
    platform_settings: ServerTable<{
      key: string;
      value: Json;
      updated_by: string | null;
      updated_at: string;
    }>;
    profiles: ServerTable<{
      id: string;
      email: string;
      full_name: string | null;
      avatar_url: string | null;
      platform_role: string;
      signup_origin: string;
      signup_domain: string | null;
      is_active: boolean;
      created_at: string;
      updated_at: string;
      user_id: string | null;
      default_organization_id: string | null;
      client_id: string | null;
      company_name: string | null;
      company_email: string | null;
      website_url: string | null;
      category: string | null;
      registered_origin_domain: string | null;
      profile_completed: boolean;
    }>;
    staff_invites: ServerTable<{
      id: string;
      email: string;
      requested_role: string;
      status: string;
      invited_by: string | null;
      expires_at: string | null;
      created_at: string;
      accepted_at: string | null;
    }>;
    user_activity_events: ServerTable<{
      id: string;
      user_id: string;
      client_id: string | null;
      event_type: string;
      metadata: Json;
      ip_address: string | null;
      user_agent: string | null;
      created_at: string;
    }>;
    user_roles: ServerTable<{
      id: string;
      user_id: string;
      role: string;
      created_at: string;
    }>;
  },
  {
    is_admin: ServerFunction<Record<string, unknown>, boolean>;
    is_staff: ServerFunction<Record<string, unknown>, boolean>;
    has_role: ServerFunction<Record<string, unknown>, boolean>;
    my_origin_domain: ServerFunction<Record<string, unknown>, string | null>;
    claim_staff_invite: ServerFunction<Record<string, unknown>, Json>;
    my_account_status: ServerFunction<Record<string, unknown>, Json>;
    is_blocked: ServerFunction<Record<string, unknown>, boolean>;
    is_muted: ServerFunction<Record<string, unknown>, boolean>;
    admin_moderate_user: ServerFunction<
      { p_actor_user_id: string; p_target_user_id: string; p_action: string; p_reason: string },
      Json
    >;
  }
>;

export type DB2Database = ServerDatabaseBase<
  {
    automation_credential_rotations: ServerTable<{
      id: string;
      automation_id: string;
      client_id: string;
      credential_type: string;
      credential_version: number;
      rotated_by: string | null;
      rotated_at: string;
      reason: string | null;
      metadata: Json;
    }>;
    automation_health_checks: ServerTable<{
      id: string;
      automation_id: string;
      status: string;
      latency_ms: number | null;
      error_message: string | null;
      details: Json;
      checked_at: string;
      check_type: string;
      error: string | null;
      metadata: Json;
    }>;
    automation_health_state: ServerTable<{
      automation_id: string;
      check_type: string;
      status: string;
      latency_ms: number | null;
      last_error: string | null;
      last_checked_at: string;
      last_success_at: string | null;
      last_failure_at: string | null;
      failure_count: number;
      recovered_at: string | null;
    }>;
    automation_health: ServerTable<{
      automation_id: string;
      overall: string;
      summary: string;
      checked_at: string;
      last_success_at: string | null;
      last_failure_at: string | null;
    }>;
    automation_installations: ServerTable<{
      id: string;
      automation_id: string;
      client_id: string;
      installation_status: string;
      installation_token_hash: string;
      domain: string | null;
      installed_at: string | null;
      verified_at: string | null;
      last_seen_at: string | null;
      revoked_at: string | null;
      revoke_reason: string | null;
      install_version: string | null;
      runtime_version: string | null;
      metadata: Json;
      created_at: string;
      updated_at: string;
    }>;
    automation_tasks: ServerTable<{
      id: string;
      automation_id: string;
      client_id: string;
      task_key: string;
      task_name: string;
      description: string | null;
      enabled: boolean;
      config: Json;
      created_at: string;
      updated_at: string;
    }>;
    client_automations: ServerTable<{
      id: string;
      client_id: string;
      owner_user_id: string | null;
      subscription_id: string | null;
      product_type: string;
      name: string;
      slug: string;
      company_name: string | null;
      domain: string | null;
      status: string;
      health: string;
      enabled: boolean;
      activated_at: string | null;
      paused_at: string | null;
      disabled_at: string | null;
      expired_at: string | null;
      last_health_check_at: string | null;
      last_heartbeat_at: string | null;
      last_success_at: string | null;
      last_error_at: string | null;
      last_error: string | null;
      usage_current_period: number;
      usage_limit: number | null;
      usage_updated_at: string | null;
      runtime_version: string | null;
      environment: string;
      metadata: Json;
      created_at: string;
      updated_at: string;
      organization_id: string | null;
      user_id: string | null;
      client_name: string;
      automation_name: string;
      product_name: string;
      run_state: string;
      installation_status: string;
      health_status: string;
      usage_count: number;
      renewal_at: string | null;
      expires_at: string | null;
      config: Json;
      automation_type: string | null;
      domain_url: string | null;
      allowed_domains: string[];
      is_active: boolean;
      requires_reinstallation: boolean;
      widget_config: Json;
      script_token_hash: string | null;
      script_token_last4: string | null;
    }>;
    integration_connections: ServerTable<{
      id: string;
      automation_id: string;
      provider: string;
      account_label: string | null;
      credential_ciphertext: string;
      encryption_key_version: number;
      status: string;
      scopes: Json;
      last_verified_at: string | null;
      last_error: string | null;
      updated_at: string;
      created_at: string;
    }>;
    orders: ServerTable<{
      verified_by_user_id: string | null;
      order_id: string;
      created_by_user_id: string | null;
      automation_type: string | null;
      delivery_channel: string | null;
      selected_features: Json;
      pricing_snapshot: Json;
      full_name: string | null;
      company_name: string | null;
      contact_email: string | null;
      country: string | null;
      target_domain_url: string | null;
      payment_method_id: string | null;
      payment_proof_data: Json;
      origin_domain: string | null;
      id: string;
      client_id: string;
      user_id: string | null;
      order_number: string;
      product_type: string | null;
      product_name: string | null;
      total_amount: number;
      currency: string;
      status: string;
      description: string | null;
      metadata: Json;
      submitted_at: string | null;
      verified_at: string | null;
      verified_by: string | null;
      rejected_at: string | null;
      rejection_reason: string | null;
      created_at: string;
      updated_at: string;
      organization_id: string | null;
    }>;
    payment_methods: ServerTable<{
      id: string;
      client_id: string;
      user_id: string | null;
      method_type: string;
      provider_name: string | null;
      account_name: string | null;
      account_identifier: string | null;
      is_active: boolean;
      is_default: boolean;
      metadata: Json;
      created_at: string;
      updated_at: string;
    }>;
    payment_verifications: ServerTable<{
      client_id: string;
      submitted_by_user_id: string;
      transaction_id: string | null;
      sender_name: string | null;
      currency: string | null;
      proof_data: Json;
      verified_by_user_id: string | null;
      verified_at: string | null;
      rejection_reason: string | null;
      id: string;
      order_id: string;
      payment_method_id: string | null;
      sender_phone: string | null;
      trx_id: string | null;
      amount: number | null;
      status: string;
      reviewed_by: string | null;
      reviewed_at: string | null;
      notes: string;
      metadata: Json;
      created_at: string;
      updated_at: string;
    }>;
    pricing_plans: ServerTable<{
      slug: string;
      product_type: string;
      name: string;
      description: string;
      monthly_price: number;
      yearly_price: number | null;
      currency: string;
      active: boolean;
      listed: boolean;
      metadata: Json;
      created_at: string;
      updated_at: string;
      yearly_discount_pct: number;
    }>;
    promo_codes: ServerTable<{
      id: string;
      code: string;
      percent_off: number;
      active: boolean;
      expires_at: string | null;
      metadata: Json;
      created_at: string;
      updated_at: string;
    }>;
    script_generations: ServerTable<{
      id: string;
      automation_id: string;
      token_hint: string;
      token_created_at: string;
      generated_by_user_id: string | null;
      invalidated_at: string | null;
      invalidated_reason: string | null;
      created_at: string;
    }>;
    subscriptions: ServerTable<{
      id: string;
      client_id: string;
      user_id: string | null;
      order_id: string | null;
      product_type: string;
      product_name: string | null;
      plan_code: string;
      status: string;
      amount: number;
      currency: string;
      billing_interval: string;
      started_at: string;
      current_period_start: string;
      current_period_end: string;
      renewal_at: string | null;
      grace_period_start: string | null;
      grace_period_end: string | null;
      cancelled_at: string | null;
      cancellation_reason: string | null;
      expired_at: string | null;
      suspended_at: string | null;
      auto_renew: boolean;
      metadata: Json;
      created_at: string;
      updated_at: string;
      organization_id: string | null;
    }>;
    usage_meters: ServerTable<{
      id: string;
      client_id: string;
      automation_id: string;
      billing_period: string;
      call_minutes_used: number;
      sms_count_used: number;
      tokens_used: number;
      messages_count_used: number;
      workflow_runs_used: number;
      updated_at: string;
    }>;
  },
  {
    generate_automation_token: ServerFunction<
      { p_automation_id: string; p_generated_by?: string | null },
      string
    >;
    resolve_widget_installation: ServerFunction<
      { p_token: string },
      Array<{
        automation_id: string;
        client_id: string;
        automation_type: string;
        name: string;
        domain_url: string;
        allowed_domains: string[];
        run_state: string;
        is_active: boolean;
        requires_reinstallation: boolean;
        expires_at: string | null;
        widget_config: Json;
        subscription_status: string;
      }>
    >;
    automation_local_runtime_state: ServerFunction<{ p_automation_id: string }, Json | null>;
    set_automation_runtime_state: ServerFunction<
      {
        p_automation_id: string;
        p_state: string;
        p_reason: string;
        p_idempotency_key: string;
        p_actor_user_id: string | null;
      },
      Json
    >;
    enqueue_outbox: ServerFunction<
      {
        p_event_type: string;
        p_aggregate_type: string;
        p_aggregate_id: string;
        p_idempotency_key: string;
        p_payload: Json;
      },
      string
    >;
  }
>;

export type DB3Database = ServerDatabaseBase<{
  ai_configs: ServerTable<{
    automation_id: string;
    client_id: string;
    primary_provider: string;
    primary_model: string;
    fallback_providers: Json;
    system_prompt: string;
    behavior_config: Json;
    temperature: number;
    max_tokens: number;
    top_p: number | null;
    retrieval_enabled: boolean;
    retrieval_top_k: number;
    semantic_cache_enabled: boolean;
    status: string;
    config_version: number;
    updated_by_user_id: string | null;
    created_at: string;
    updated_at: string;
    provider: string;
    model: string;
    encrypted_api_key: string | null;
    enabled: boolean;
    metadata: Json;
    id: string;
  }>;
  ai_evaluations: ServerTable<{
    id: string;
    client_id: string | null;
    automation_id: string | null;
    conversation_id: string | null;
    transcript: string;
    tone_score: number;
    accuracy_score: number;
    helpfulness_score: number;
    overall_score: number;
    summary: string;
    strengths: Json;
    improvements: Json;
    model: string;
    created_at: string;
  }>;
  crawl_jobs: ServerTable<{
    id: string;
    client_id: string;
    automation_id: string;
    knowledge_base_id: string | null;
    job_type: string;
    target_url: string | null;
    status: string;
    attempt_count: number;
    last_error: string | null;
    next_attempt_at: string;
    metadata: Json;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
  }>;
  kb_chunks: ServerTable<{
    id: string;
    document_id: string;
    knowledge_base_id: string;
    client_id: string;
    automation_id: string;
    chunk_index: number;
    content: string;
    token_count: number | null;
    embedding: Json | null;
    metadata: Json;
    created_at: string;
  }>;
  kb_documents: ServerTable<{
    id: string;
    knowledge_base_id: string;
    client_id: string;
    automation_id: string;
    source_type: string;
    source_name: string;
    canonical_url: string | null;
    storage_path: string | null;
    checksum: string | null;
    content: string;
    priority: number;
    status: string;
    metadata: Json;
    error: string | null;
    created_at: string;
    updated_at: string;
    title: string;
  }>;
  knowledge_bases: ServerTable<{
    id: string;
    client_id: string;
    automation_id: string;
    name: string;
    status: string;
    embedding_model: string;
    embedding_dimensions: number;
    chunk_size: number;
    chunk_overlap: number;
    created_at: string;
    updated_at: string;
    description: string;
  }>;
  llm_api_keys: ServerTable<{
    id: string;
    provider_key: string;
    label: string;
    key_hint: string;
    key_ciphertext: string;
    encryption_key_version: number;
    model: string | null;
    priority: number;
    is_active: boolean;
    cooldown_until: string | null;
    error_count: number;
    request_count: number;
    last_used_at: string | null;
    last_error: string | null;
    created_at: string;
    updated_at: string;
  }>;
  llm_providers: ServerTable<{
    provider_key: string;
    display_name: string;
    base_url: string;
    status: string;
    priority: number;
    default_model: string | null;
    metadata: Json;
    created_at: string;
    updated_at: string;
  }>;
  llm_requests: ServerTable<{
    id: string;
    client_id: string | null;
    automation_id: string | null;
    provider_key: string;
    model: string;
    key_id: string | null;
    status: string;
    http_status: number | null;
    latency_ms: number | null;
    tokens_in: number;
    tokens_out: number;
    error: string | null;
    trace_id: string | null;
    request_metadata: Json;
    created_at: string;
  }>;
  prompt_versions: ServerTable<{
    id: string;
    automation_id: string | null;
    client_id: string | null;
    prompt_key: string;
    version: number;
    content: string;
    is_active: boolean;
    created_by_user_id: string | null;
    created_at: string;
  }>;
  website_ai_knowledge_documents: ServerTable<{
    id: string;
    source_id: string;
    site_id: string;
    title: string;
    content: string;
    content_hash: string;
    version: number;
    status: string;
    authority: number;
    published_at: string | null;
    metadata: Json;
    created_at: string;
    updated_at: string;
  }>;
  website_ai_knowledge_facts: ServerTable<{
    id: string;
    site_id: string;
    document_id: string | null;
    fact_key: string;
    fact_value: Json;
    status: string;
    authority: number;
    valid_from: string | null;
    valid_until: string | null;
    metadata: Json;
    created_at: string;
    updated_at: string;
  }>;
  website_ai_knowledge_sources: ServerTable<{
    id: string;
    site_id: string;
    source_type: string;
    source_name: string;
    canonical_url: string | null;
    content_hash: string | null;
    status: string;
    last_scanned_at: string | null;
    last_success_at: string | null;
    last_change_at: string | null;
    metadata: Json;
    created_at: string;
    updated_at: string;
  }>;
  website_ai_learning_candidates: ServerTable<{
    id: string;
    site_id: string;
    question: string;
    candidate_answer: string | null;
    evidence: Json;
    occurrence_count: number;
    status: string;
    first_seen_at: string;
    last_seen_at: string;
    reviewed_by: string | null;
    reviewed_at: string | null;
    metadata: Json;
  }>;
  website_ai_versions: ServerTable<{
    id: string;
    site_id: string;
    version: number;
    model: string;
    prompt_version: string;
    knowledge_version: number;
    tool_version: string;
    voice_config: Json;
    eval_score: number | null;
    status: string;
    created_at: string;
  }>;
}>;

export type DB4Database = ServerDatabaseBase<
  {
    round_robin_rules: ServerTable<{
      id: string;
      team_id: string;
      event_type: string;
      priority: number;
      conditions: Json;
      enabled: boolean;
      created_at: string;
      updated_at: string;
      active: boolean;
    }>;
    automation_events: ServerTable<{
      id: string;
      provider: string;
      external_event_id: string;
      automation_id: string;
      payload_hash: string;
      status: string;
      execution_id: string | null;
      error: string | null;
      received_at: string;
    }>;
    automation_executions: ServerTable<{
      id: string;
      automation_id: string;
      client_id: string;
      automation_kind: string;
      trigger_type: string;
      idempotency_key: string;
      status: string;
      attempt_count: number;
      max_attempts: number;
      next_attempt_at: string;
      error_class: string | null;
      last_error: string | null;
      timeout_seconds: number;
      locked_by: string | null;
      locked_until: string | null;
      cancel_requested: boolean;
      input: Json;
      result: Json | null;
      queued_at: string;
      started_at: string | null;
      finished_at: string | null;
      updated_at: string;
    }>;
    client_tags: ServerTable<{
      id: string;
      client_id: string;
      tag: string;
      created_at: string;
    }>;
    conversation_diagnostics: ServerTable<{
      id: string;
      client_id: string | null;
      automation_id: string | null;
      conversation_id: string | null;
      created_by_user_id: string | null;
      transcript: string;
      what_went_wrong: string;
      recommended_fix: string;
      severity: string;
      metadata: Json;
      created_at: string;
    }>;
    conversations: ServerTable<{
      id: string;
      client_id: string;
      automation_id: string;
      channel: string;
      visitor_session: string | null;
      customer_phone_or_id: string | null;
      origin: string | null;
      status: string;
      assigned_user_id: string | null;
      assigned_team_id: string | null;
      last_message_at: string;
      handed_off_at: string | null;
      handoff_reason: string | null;
      audio_recording_url: string | null;
      extracted_lead_data: Json;
      summary: string;
      metadata: Json;
      created_at: string;
      updated_at: string;
      contact_id: string | null;
      subject: string;
      closed_at: string | null;
    }>;
    crm_clients: ServerTable<{
      id: string;
      company_name: string;
      website_url: string;
      category: string;
      primary_email: string;
      primary_phone: string;
      status: string;
      metadata: Json;
      created_at: string;
      updated_at: string;
    }>;
    appointments: ServerTable<{
      id: string;
      client_id: string;
      automation_id: string;
      conversation_id: string | null;
      starts_at: string;
      ends_at: string;
      timezone: string;
      status: string;
      visitor_name: string;
      visitor_email: string;
      visitor_phone: string;
      notes: string;
      external_ref: string | null;
      trace_id: string | null;
      created_at: string;
      updated_at: string;
    }>;
    leads: ServerTable<{
      id: string;
      client_id: string;
      automation_id: string;
      conversation_id: string | null;
      name: string;
      email: string;
      phone: string;
      intent: string;
      summary: string;
      source: string;
      lead_score: number;
      status: string;
      trace_id: string | null;
      webhook_status: string | null;
      webhook_response: string | null;
      captured_at: string;
      created_at: string;
      updated_at: string;
      contact_id: string | null;
      assigned_user_id: string | null;
      metadata: Json;
    }>;
    messages: ServerTable<{
      id: string;
      conversation_id: string;
      role: string;
      content: string;
      tokens_used: number;
      provider_key: string | null;
      model: string | null;
      external_message_id: string | null;
      trace_id: string | null;
      metadata: Json;
      created_at: string;
      sender_id: string | null;
      sender_type: string;
      message_type: string;
    }>;
    round_robin_assignments: ServerTable<{
      id: string;
      team_id: string;
      member_id: string | null;
      subject_type: string;
      subject_id: string;
      status: string;
      assigned_at: string;
      released_at: string | null;
      reassigned_from_assignment_id: string | null;
      strategy: string;
      metadata: Json;
      created_at: string;
      reason: string | null;
      skipped_member_ids: string[] | null;
    }>;
    round_robin_members: ServerTable<{
      id: string;
      team_id: string;
      user_id: string | null;
      external_assignee_key: string | null;
      display_name: string;
      priority: number;
      weight: number;
      availability_status: string;
      is_active: boolean;
      max_active: number | null;
      max_daily: number | null;
      current_active: number;
      assigned_today: number;
      metadata: Json;
      created_at: string;
      updated_at: string;
    }>;
    round_robin_teams: ServerTable<{
      id: string;
      client_id: string;
      automation_id: string | null;
      name: string;
      assignment_strategy: string;
      is_active: boolean;
      priority: number;
      fallback_member_id: string | null;
      overflow_behavior: string;
      business_hours: Json;
      settings: Json;
      created_at: string;
      updated_at: string;
    }>;
    ticket_escalations: ServerTable<{
      id: string;
      client_id: string;
      automation_id: string;
      conversation_id: string | null;
      reason: string;
      sentiment: number;
      status: string;
      trace_id: string | null;
      transcript: Json;
      visitor_contact: string;
      assigned_user_id: string | null;
      resolved_at: string | null;
      created_at: string;
      updated_at: string;
    }>;
    workflow_definitions: ServerTable<{
      id: string;
      client_id: string;
      automation_id: string | null;
      name: string;
      description: string;
      status: string;
      version: number;
      trigger_type: string;
      trigger_config: Json;
      metadata: Json;
      created_by_user_id: string | null;
      created_at: string;
      updated_at: string;
    }>;
    workflow_runs: ServerTable<{
      id: string;
      workflow_id: string;
      client_id: string;
      automation_id: string | null;
      trigger_event_id: string | null;
      idempotency_key: string;
      status: string;
      input_payload: Json;
      output_payload: Json;
      current_step_order: number;
      attempt_count: number;
      last_error: string | null;
      queued_at: string;
      started_at: string | null;
      completed_at: string | null;
      updated_at: string;
      resume_at: string | null;
    }>;
    workflow_steps: ServerTable<{
      id: string;
      workflow_id: string;
      step_order: number;
      step_type: string;
      config: Json;
      condition: Json;
      retry_policy: Json;
      timeout_seconds: number;
    }>;
    workflow_webhooks: ServerTable<{
      id: string;
      workflow_id: string;
      endpoint_key_hash: string;
      secret_ciphertext: string;
      encryption_key_version: number;
      is_active: boolean;
      created_at: string;
      last_received_at: string | null;
    }>;
  },
  {
    assign_round_robin: ServerFunction<
      {
        p_team_id: string;
        p_subject_type: string;
        p_subject_id: string;
        p_strategy?: string | null;
        p_manual_member_id?: string | null;
      },
      Array<{ assignment_id: string; member_id: string | null; strategy: string; status: string }>
    >;
    claim_automation_executions: ServerFunction<
      { p_worker_id: string; p_limit?: number; p_lease_seconds?: number },
      unknown
    >;
    finish_automation_execution: ServerFunction<
      {
        p_execution_id: string;
        p_worker_id: string;
        p_outcome: string;
        p_error?: string | null;
        p_result?: Json | null;
      },
      unknown
    >;
  }
>;
