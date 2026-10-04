export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_restrictions: {
        Row: {
          muted: boolean
          reason: string | null
          sessions_revoked_at: string | null
          status: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          muted?: boolean
          reason?: string | null
          sessions_revoked_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          muted?: boolean
          reason?: string | null
          sessions_revoked_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      app_secrets: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      appointment_slots: {
        Row: {
          automation_id: string
          created_at: string
          ends_at: string
          external_ref: string
          id: string
          notes: string
          starts_at: string
          status: string
          trace_id: string
          visitor_email: string
          visitor_name: string
          visitor_phone: string
        }
        Insert: {
          automation_id: string
          created_at?: string
          ends_at: string
          external_ref?: string
          id?: string
          notes?: string
          starts_at: string
          status?: string
          trace_id?: string
          visitor_email?: string
          visitor_name?: string
          visitor_phone?: string
        }
        Update: {
          automation_id?: string
          created_at?: string
          ends_at?: string
          external_ref?: string
          id?: string
          notes?: string
          starts_at?: string
          status?: string
          trace_id?: string
          visitor_email?: string
          visitor_name?: string
          visitor_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_slots_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automation_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          target: string
        }
        Insert: {
          action: string
          actor_email?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target?: string
        }
        Update: {
          action?: string
          actor_email?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          actor: string | null
          after_value: Json | null
          automation_id: string | null
          before_value: Json | null
          changed_fields: Json
          client_id: string | null
          created_at: string
          event_type: string
          id: string
          reason: string | null
          source_ip: string | null
          target_id: string
          target_type: string
        }
        Insert: {
          actor?: string | null
          after_value?: Json | null
          automation_id?: string | null
          before_value?: Json | null
          changed_fields?: Json
          client_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          reason?: string | null
          source_ip?: string | null
          target_id?: string
          target_type?: string
        }
        Update: {
          actor?: string | null
          after_value?: Json | null
          automation_id?: string | null
          before_value?: Json | null
          changed_fields?: Json
          client_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          reason?: string | null
          source_ip?: string | null
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "client_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_health: {
        Row: {
          automation_id: string
          checked_at: string
          overall: string
          summary: string
        }
        Insert: {
          automation_id: string
          checked_at?: string
          overall: string
          summary?: string
        }
        Update: {
          automation_id?: string
          checked_at?: string
          overall?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_health_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: true
            referencedRelation: "client_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_health_checks: {
        Row: {
          automation_id: string
          check_type: string
          checked_at: string
          error: string | null
          id: string
          latency_ms: number | null
          metadata: Json
          status: string
        }
        Insert: {
          automation_id: string
          check_type: string
          checked_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          metadata?: Json
          status: string
        }
        Update: {
          automation_id?: string
          check_type?: string
          checked_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          metadata?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_health_checks_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "client_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_health_state: {
        Row: {
          automation_id: string
          check_type: string
          failure_count: number
          last_checked_at: string
          last_error: string | null
          last_failure_at: string | null
          last_success_at: string | null
          latency_ms: number | null
          recovered_at: string | null
          status: string
        }
        Insert: {
          automation_id: string
          check_type: string
          failure_count?: number
          last_checked_at?: string
          last_error?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          latency_ms?: number | null
          recovered_at?: string | null
          status: string
        }
        Update: {
          automation_id?: string
          check_type?: string
          failure_count?: number
          last_checked_at?: string
          last_error?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          latency_ms?: number | null
          recovered_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_health_state_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "client_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_instances: {
        Row: {
          automation_slug: string
          billing_plan: string
          business_context: string
          client_id: string
          conversations_count: number
          created_at: string
          expires_at: string | null
          grace_days: number
          id: string
          killed: boolean
          leads_count: number
          origin: string
          prompt_override: string
          provisioned_at: string | null
          script_token: string
          status: Database["public"]["Enums"]["automation_status"]
          system_prompt: string
          updated_at: string
          user_id: string
          warning_sent: boolean
          webhook_secret: string
          webhook_url: string
          webhook_verified: boolean
          website_domain: string
        }
        Insert: {
          automation_slug: string
          billing_plan?: string
          business_context?: string
          client_id?: string
          conversations_count?: number
          created_at?: string
          expires_at?: string | null
          grace_days?: number
          id?: string
          killed?: boolean
          leads_count?: number
          origin?: string
          prompt_override?: string
          provisioned_at?: string | null
          script_token?: string
          status?: Database["public"]["Enums"]["automation_status"]
          system_prompt?: string
          updated_at?: string
          user_id: string
          warning_sent?: boolean
          webhook_secret?: string
          webhook_url?: string
          webhook_verified?: boolean
          website_domain?: string
        }
        Update: {
          automation_slug?: string
          billing_plan?: string
          business_context?: string
          client_id?: string
          conversations_count?: number
          created_at?: string
          expires_at?: string | null
          grace_days?: number
          id?: string
          killed?: boolean
          leads_count?: number
          origin?: string
          prompt_override?: string
          provisioned_at?: string | null
          script_token?: string
          status?: Database["public"]["Enums"]["automation_status"]
          system_prompt?: string
          updated_at?: string
          user_id?: string
          warning_sent?: boolean
          webhook_secret?: string
          webhook_url?: string
          webhook_verified?: boolean
          website_domain?: string
        }
        Relationships: []
      }
      automation_knowledge: {
        Row: {
          archived: boolean
          automation_id: string
          content: string
          created_at: string
          id: string
          scope: string
          title: string
          updated_at: string
          version_hash: string
        }
        Insert: {
          archived?: boolean
          automation_id: string
          content?: string
          created_at?: string
          id?: string
          scope?: string
          title?: string
          updated_at?: string
          version_hash?: string
        }
        Update: {
          archived?: boolean
          automation_id?: string
          content?: string
          created_at?: string
          id?: string
          scope?: string
          title?: string
          updated_at?: string
          version_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_knowledge_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automation_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_tasks: {
        Row: {
          automation_id: string
          config: Json
          enabled: boolean
          id: string
          task_key: string
        }
        Insert: {
          automation_id: string
          config?: Json
          enabled?: boolean
          id?: string
          task_key: string
        }
        Update: {
          automation_id?: string
          config?: Json
          enabled?: boolean
          id?: string
          task_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_tasks_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "client_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_windows: {
        Row: {
          automation_id: string
          created_at: string
          end_minute: number
          id: string
          slot_minutes: number
          start_minute: number
          timezone: string
          weekday: number
        }
        Insert: {
          automation_id: string
          created_at?: string
          end_minute: number
          id?: string
          slot_minutes?: number
          start_minute: number
          timezone?: string
          weekday: number
        }
        Update: {
          automation_id?: string
          created_at?: string
          end_minute?: number
          id?: string
          slot_minutes?: number
          start_minute?: number
          timezone?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_windows_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automation_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      client_automations: {
        Row: {
          assigned_phone_number: string | null
          automation_type: string
          client_id: string
          created_at: string
          domain_url: string
          expires_at: string | null
          hmac_key: string
          id: string
          installed_at: string | null
          is_active: boolean
          last_seen_at: string | null
          last_seen_origin: string | null
          order_id: string | null
          origin_domain: string
          requires_reinstallation: boolean
          run_state: string
          script_token: string
          webhook_url: string
          widget_config: Json
        }
        Insert: {
          assigned_phone_number?: string | null
          automation_type: string
          client_id: string
          created_at?: string
          domain_url?: string
          expires_at?: string | null
          hmac_key?: string
          id?: string
          installed_at?: string | null
          is_active?: boolean
          last_seen_at?: string | null
          last_seen_origin?: string | null
          order_id?: string | null
          origin_domain?: string
          requires_reinstallation?: boolean
          run_state?: string
          script_token?: string
          webhook_url?: string
          widget_config?: Json
        }
        Update: {
          assigned_phone_number?: string | null
          automation_type?: string
          client_id?: string
          created_at?: string
          domain_url?: string
          expires_at?: string | null
          hmac_key?: string
          id?: string
          installed_at?: string | null
          is_active?: boolean
          last_seen_at?: string | null
          last_seen_origin?: string | null
          order_id?: string | null
          origin_domain?: string
          requires_reinstallation?: boolean
          run_state?: string
          script_token?: string
          webhook_url?: string
          widget_config?: Json
        }
        Relationships: [
          {
            foreignKeyName: "client_automations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_automations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["order_id"]
          },
        ]
      }
      client_tags: {
        Row: {
          created_at: string
          id: string
          tag: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tag: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tag?: string
          user_id?: string
        }
        Relationships: []
      }
      conversation_diagnostics: {
        Row: {
          conversation_id: string | null
          created_at: string
          created_by: string
          id: string
          recommended_fix: string
          severity: string
          transcript: string
          what_went_wrong: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          recommended_fix: string
          severity?: string
          transcript: string
          what_went_wrong: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          recommended_fix?: string
          severity?: string
          transcript?: string
          what_went_wrong?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_diagnostics_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          audio_recording_url: string | null
          automation_id: string
          channel: string
          created_at: string
          customer_phone_or_id: string | null
          extracted_lead_data: Json
          id: string
          last_message_at: string
          origin: string
          status: string
          visitor_session: string | null
        }
        Insert: {
          audio_recording_url?: string | null
          automation_id: string
          channel: string
          created_at?: string
          customer_phone_or_id?: string | null
          extracted_lead_data?: Json
          id?: string
          last_message_at?: string
          origin?: string
          status?: string
          visitor_session?: string | null
        }
        Update: {
          audio_recording_url?: string | null
          automation_id?: string
          channel?: string
          created_at?: string
          customer_phone_or_id?: string | null
          extracted_lead_data?: Json
          id?: string
          last_message_at?: string
          origin?: string
          status?: string
          visitor_session?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "client_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      crawl_jobs: {
        Row: {
          automation_id: string
          created_at: string
          id: string
          status: string
          target_url: string
        }
        Insert: {
          automation_id: string
          created_at?: string
          id?: string
          status?: string
          target_url: string
        }
        Update: {
          automation_id?: string
          created_at?: string
          id?: string
          status?: string
          target_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "crawl_jobs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "client_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          automation_id: string
          created_at: string
          email: string
          id: string
          intent: string
          lead_score: number
          name: string
          phone: string
          source: string
          summary: string
          trace_id: string
          updated_at: string
          webhook_response: string
          webhook_status: string
        }
        Insert: {
          automation_id: string
          created_at?: string
          email?: string
          id?: string
          intent?: string
          lead_score?: number
          name?: string
          phone?: string
          source?: string
          summary?: string
          trace_id?: string
          updated_at?: string
          webhook_response?: string
          webhook_status?: string
        }
        Update: {
          automation_id?: string
          created_at?: string
          email?: string
          id?: string
          intent?: string
          lead_score?: number
          name?: string
          phone?: string
          source?: string
          summary?: string
          trace_id?: string
          updated_at?: string
          webhook_response?: string
          webhook_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automation_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      global_prompts: {
        Row: {
          content: string
          key: string
          updated_at: string
        }
        Insert: {
          content?: string
          key: string
          updated_at?: string
        }
        Update: {
          content?: string
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      groq_failover_log: {
        Row: {
          created_at: string
          id: string
          key_id: string | null
          message: string
          status_code: number
        }
        Insert: {
          created_at?: string
          id?: string
          key_id?: string | null
          message?: string
          status_code?: number
        }
        Update: {
          created_at?: string
          id?: string
          key_id?: string | null
          message?: string
          status_code?: number
        }
        Relationships: []
      }
      groq_keys: {
        Row: {
          cooldown_until: string | null
          created_at: string
          enabled: boolean
          error_count: number
          id: string
          is_primary: boolean
          key_hint: string
          key_value: string
          label: string
          last_used_at: string | null
          request_count: number
        }
        Insert: {
          cooldown_until?: string | null
          created_at?: string
          enabled?: boolean
          error_count?: number
          id?: string
          is_primary?: boolean
          key_hint?: string
          key_value: string
          label: string
          last_used_at?: string | null
          request_count?: number
        }
        Update: {
          cooldown_until?: string | null
          created_at?: string
          enabled?: boolean
          error_count?: number
          id?: string
          is_primary?: boolean
          key_hint?: string
          key_value?: string
          label?: string
          last_used_at?: string | null
          request_count?: number
        }
        Relationships: []
      }
      integration_connections: {
        Row: {
          access_token: string
          automation_id: string
          id: string
          provider: string
          refresh_token: string
          status: string
          updated_at: string
        }
        Insert: {
          access_token: string
          automation_id: string
          id?: string
          provider: string
          refresh_token: string
          status?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          automation_id?: string
          id?: string
          provider?: string
          refresh_token?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_connections_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "client_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_documents: {
        Row: {
          automation_id: string
          content: string
          created_at: string
          embedding: string | null
          id: string
          priority: number
          source_name: string
          source_type: string
          storage_path: string | null
        }
        Insert: {
          automation_id: string
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          priority?: number
          source_name: string
          source_type: string
          storage_path?: string | null
        }
        Update: {
          automation_id?: string
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          priority?: number
          source_name?: string
          source_type?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kb_documents_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "client_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_api_keys: {
        Row: {
          api_key: string
          cooldown_until: string | null
          created_at: string
          error_count: number
          id: string
          is_active: boolean
          label: string
          last_error: string | null
          last_error_at: string | null
          last_success_at: string | null
          model: string
          priority: number
          provider: string
          request_count: number
        }
        Insert: {
          api_key: string
          cooldown_until?: string | null
          created_at?: string
          error_count?: number
          id?: string
          is_active?: boolean
          label?: string
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          model?: string
          priority?: number
          provider: string
          request_count?: number
        }
        Update: {
          api_key?: string
          cooldown_until?: string | null
          created_at?: string
          error_count?: number
          id?: string
          is_active?: boolean
          label?: string
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          model?: string
          priority?: number
          provider?: string
          request_count?: number
        }
        Relationships: []
      }
      llm_requests: {
        Row: {
          automation_id: string | null
          created_at: string
          error: string | null
          http_status: number
          id: string
          key_id: string | null
          latency_ms: number
          model: string
          provider: string
          status: string
          tokens_in: number
          tokens_out: number
        }
        Insert: {
          automation_id?: string | null
          created_at?: string
          error?: string | null
          http_status?: number
          id?: string
          key_id?: string | null
          latency_ms?: number
          model: string
          provider: string
          status: string
          tokens_in?: number
          tokens_out?: number
        }
        Update: {
          automation_id?: string | null
          created_at?: string
          error?: string | null
          http_status?: number
          id?: string
          key_id?: string | null
          latency_ms?: number
          model?: string
          provider?: string
          status?: string
          tokens_in?: number
          tokens_out?: number
        }
        Relationships: [
          {
            foreignKeyName: "llm_requests_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "client_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_requests_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "llm_api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          tokens_used: number
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          tokens_used?: number
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          tokens_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          automation_type: string
          client_id: string
          company_name: string
          contact_email: string
          country: string
          created_at: string
          delivery_channel: string
          full_name: string
          id: string
          order_id: string
          origin_domain: string
          payment_method_id: string | null
          payment_proof_data: Json
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          selected_features: Json
          status: string
          target_domain_url: string
          total_amount: number
        }
        Insert: {
          automation_type: string
          client_id: string
          company_name?: string
          contact_email?: string
          country?: string
          created_at?: string
          delivery_channel?: string
          full_name?: string
          id?: string
          order_id?: string
          origin_domain?: string
          payment_method_id?: string | null
          payment_proof_data?: Json
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selected_features?: Json
          status?: string
          target_domain_url: string
          total_amount: number
        }
        Update: {
          automation_type?: string
          client_id?: string
          company_name?: string
          contact_email?: string
          country?: string
          created_at?: string
          delivery_channel?: string
          full_name?: string
          id?: string
          order_id?: string
          origin_domain?: string
          payment_method_id?: string | null
          payment_proof_data?: Json
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selected_features?: Json
          status?: string
          target_domain_url?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "orders_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          created_at: string
          id: string
          instructions: string
          is_active: boolean
          is_card: boolean
          method_name: string
          required_fields: Json
        }
        Insert: {
          created_at?: string
          id?: string
          instructions: string
          is_active?: boolean
          is_card?: boolean
          method_name: string
          required_fields?: Json
        }
        Update: {
          created_at?: string
          id?: string
          instructions?: string
          is_active?: boolean
          is_card?: boolean
          method_name?: string
          required_fields?: Json
        }
        Relationships: []
      }
      payment_submissions: {
        Row: {
          amount: number
          automation_id: string | null
          automation_slug: string
          billing_plan: string
          id: string
          origin: string
          payment_method: string
          promo_code: string | null
          receipt_url: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sender_name: string
          status: Database["public"]["Enums"]["payment_status"]
          submitted_at: string
          transaction_id: string
          user_id: string
        }
        Insert: {
          amount: number
          automation_id?: string | null
          automation_slug: string
          billing_plan: string
          id?: string
          origin?: string
          payment_method: string
          promo_code?: string | null
          receipt_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_name: string
          status?: Database["public"]["Enums"]["payment_status"]
          submitted_at?: string
          transaction_id: string
          user_id: string
        }
        Update: {
          amount?: number
          automation_id?: string | null
          automation_slug?: string
          billing_plan?: string
          id?: string
          origin?: string
          payment_method?: string
          promo_code?: string | null
          receipt_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_name?: string
          status?: Database["public"]["Enums"]["payment_status"]
          submitted_at?: string
          transaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_submissions_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automation_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_plans: {
        Row: {
          active: boolean
          description: string
          listed: boolean
          monthly_price: number
          name: string
          slug: string
          updated_at: string
          yearly_discount_pct: number
        }
        Insert: {
          active?: boolean
          description?: string
          listed?: boolean
          monthly_price?: number
          name?: string
          slug: string
          updated_at?: string
          yearly_discount_pct?: number
        }
        Update: {
          active?: boolean
          description?: string
          listed?: boolean
          monthly_price?: number
          name?: string
          slug?: string
          updated_at?: string
          yearly_discount_pct?: number
        }
        Relationships: []
      }
      product_prices: {
        Row: {
          kind: string
          option_key: string
          price: number
          product: string
          updated_at: string
        }
        Insert: {
          kind?: string
          option_key: string
          price: number
          product: string
          updated_at?: string
        }
        Update: {
          kind?: string
          option_key?: string
          price?: number
          product?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          category: string
          client_id: string
          company_email: string
          company_name: string
          created_at: string
          full_name: string
          id: string
          profile_completed: boolean
          registered_origin_domain: string
          updated_at: string
          user_id: string
          website_url: string
        }
        Insert: {
          category?: string
          client_id?: string
          company_email?: string
          company_name?: string
          created_at?: string
          full_name?: string
          id?: string
          profile_completed?: boolean
          registered_origin_domain?: string
          updated_at?: string
          user_id: string
          website_url?: string
        }
        Update: {
          category?: string
          client_id?: string
          company_email?: string
          company_name?: string
          created_at?: string
          full_name?: string
          id?: string
          profile_completed?: boolean
          registered_origin_domain?: string
          updated_at?: string
          user_id?: string
          website_url?: string
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          expires_at: string | null
          id: string
          percent_off: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          percent_off?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          percent_off?: number
        }
        Relationships: []
      }
      script_generations: {
        Row: {
          automation_id: string
          created_at: string
          generated_by: string | null
          id: string
          invalidated_at: string | null
          invalidated_reason: string | null
          token_hint: string
        }
        Insert: {
          automation_id: string
          created_at?: string
          generated_by?: string | null
          id?: string
          invalidated_at?: string | null
          invalidated_reason?: string | null
          token_hint: string
        }
        Update: {
          automation_id?: string
          created_at?: string
          generated_by?: string | null
          id?: string
          invalidated_at?: string | null
          invalidated_reason?: string | null
          token_hint?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_generations_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "client_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invites: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      tenant_features: {
        Row: {
          automation_id: string
          created_at: string
          enabled: boolean
          feature_key: string
          id: string
          monthly_price: number
          updated_at: string
        }
        Insert: {
          automation_id: string
          created_at?: string
          enabled?: boolean
          feature_key: string
          id?: string
          monthly_price?: number
          updated_at?: string
        }
        Update: {
          automation_id?: string
          created_at?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          monthly_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_features_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automation_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_escalations: {
        Row: {
          automation_id: string
          created_at: string
          id: string
          reason: string
          resolved_at: string | null
          sentiment: number
          status: string
          trace_id: string
          transcript: Json
          visitor_contact: string
        }
        Insert: {
          automation_id: string
          created_at?: string
          id?: string
          reason?: string
          resolved_at?: string | null
          sentiment?: number
          status?: string
          trace_id?: string
          transcript?: Json
          visitor_contact?: string
        }
        Update: {
          automation_id?: string
          created_at?: string
          id?: string
          reason?: string
          resolved_at?: string | null
          sentiment?: number
          status?: string
          trace_id?: string
          transcript?: Json
          visitor_contact?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_escalations_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automation_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      transcript_evaluations: {
        Row: {
          accuracy_score: number
          automation_id: string | null
          created_at: string
          helpfulness_score: number
          id: string
          improvements: Json
          model: string
          overall_score: number
          strengths: Json
          summary: string
          tone_score: number
          transcript: string
          user_id: string
        }
        Insert: {
          accuracy_score?: number
          automation_id?: string | null
          created_at?: string
          helpfulness_score?: number
          id?: string
          improvements?: Json
          model?: string
          overall_score?: number
          strengths?: Json
          summary?: string
          tone_score?: number
          transcript: string
          user_id: string
        }
        Update: {
          accuracy_score?: number
          automation_id?: string | null
          created_at?: string
          helpfulness_score?: number
          id?: string
          improvements?: Json
          model?: string
          overall_score?: number
          strengths?: Json
          summary?: string
          tone_score?: number
          transcript?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcript_evaluations_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automation_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      transcripts: {
        Row: {
          automation_id: string
          created_at: string
          id: string
          messages: Json
          visitor: string
        }
        Insert: {
          automation_id: string
          created_at?: string
          id?: string
          messages?: Json
          visitor?: string
        }
        Update: {
          automation_id?: string
          created_at?: string
          id?: string
          messages?: Json
          visitor?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automation_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_logs: {
        Row: {
          automation_id: string
          created_at: string
          id: string
          model: string
          tokens_in: number
          tokens_out: number
        }
        Insert: {
          automation_id: string
          created_at?: string
          id?: string
          model?: string
          tokens_in?: number
          tokens_out?: number
        }
        Update: {
          automation_id?: string
          created_at?: string
          id?: string
          model?: string
          tokens_in?: number
          tokens_out?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_logs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automation_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_meters: {
        Row: {
          automation_id: string
          billing_period: string
          call_minutes_used: number
          id: string
          sms_count_used: number
          tokens_used: number
          updated_at: string
        }
        Insert: {
          automation_id: string
          billing_period: string
          call_minutes_used?: number
          id?: string
          sms_count_used?: number
          tokens_used?: number
          updated_at?: string
        }
        Update: {
          automation_id?: string
          billing_period?: string
          call_minutes_used?: number
          id?: string
          sms_count_used?: number
          tokens_used?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_meters_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "client_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      widget_rate_limits: {
        Row: {
          automation_id: string
          capacity: number
          refilled_at: string
          tokens: number
        }
        Insert: {
          automation_id: string
          capacity?: number
          refilled_at?: string
          tokens?: number
        }
        Update: {
          automation_id?: string
          capacity?: number
          refilled_at?: string
          tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "widget_rate_limits_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: true
            referencedRelation: "automation_instances"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_automation_action: {
        Args: { _action: string; _id: string; _reason: string }
        Returns: Json
      }
      admin_generate_script: { Args: { _id: string }; Returns: string }
      admin_moderate_user: {
        Args: { _action: string; _reason: string; _user: string }
        Returns: Json
      }
      admin_update_widget_config: {
        Args: { _config: Json; _id: string }
        Returns: undefined
      }
      assert_not_blocked: { Args: never; Returns: undefined }
      automation_runtime_state: { Args: { _id: string }; Returns: string }
      can_manage_client_automation: { Args: { _id: string }; Returns: boolean }
      claim_staff_invite: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      integration_status: {
        Args: { _automation_id: string }
        Returns: {
          provider: string
          status: string
          updated_at: string
        }[]
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_blocked: { Args: { _uid: string }; Returns: boolean }
      is_muted: { Args: { _uid: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      my_account_status: { Args: never; Returns: Json }
      my_client_id: { Args: never; Returns: string }
      my_origin_domain: { Args: never; Returns: string }
      owns_automation: { Args: { _automation_id: string }; Returns: boolean }
      owns_client_automation: { Args: { _id: string }; Returns: boolean }
      place_order: {
        Args: {
          _channel: string
          _company: string
          _country: string
          _email: string
          _features: Json
          _full_name: string
          _method: string
          _msg_channels: string[]
          _product: string
          _proof: Json
          _target: string
        }
        Returns: string
      }
      provision_automation: {
        Args: { _automation_id: string }
        Returns: string
      }
      record_usage: {
        Args: { _automation_id: string; _tokens: number }
        Returns: undefined
      }
      review_order: {
        Args: { _approve: boolean; _order_id: string; _reason: string }
        Returns: string
      }
      review_payment: {
        Args: { _approve: boolean; _payment_id: string; _reason: string }
        Returns: undefined
      }
      run_subscription_lifecycle: { Args: never; Returns: undefined }
      validate_promo: { Args: { _code: string }; Returns: number }
    }
    Enums: {
      app_role: "client" | "verifier" | "admin" | "owner" | "partner"
      automation_status:
        | "paid"
        | "pending_payment"
        | "stopped"
        | "revoked"
        | "suspended"
        | "active"
      payment_status: "pending" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["client", "verifier", "admin", "owner", "partner"],
      automation_status: [
        "paid",
        "pending_payment",
        "stopped",
        "revoked",
        "suspended",
        "active",
      ],
      payment_status: ["pending", "approved", "rejected"],
    },
  },
} as const
