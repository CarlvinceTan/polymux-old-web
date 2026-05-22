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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agreement_acceptances: {
        Row: {
          accepted_at: string
          agreement: string
          id: string
          ip_address: unknown
          locale: string | null
          user_agent: string | null
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          agreement: string
          id?: string
          ip_address?: unknown
          locale?: string | null
          user_agent?: string | null
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          agreement?: string
          id?: string
          ip_address?: unknown
          locale?: string | null
          user_agent?: string | null
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      artifacts: {
        Row: {
          content: string | null
          created_at: string
          created_by_agent_id: string | null
          id: string
          mime_type: string | null
          name: string
          size_bytes: number
          storage_path: string | null
          workflow_id: string
          workspace_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by_agent_id?: string | null
          id?: string
          mime_type?: string | null
          name: string
          size_bytes?: number
          storage_path?: string | null
          workflow_id: string
          workspace_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by_agent_id?: string | null
          id?: string
          mime_type?: string | null
          name?: string
          size_bytes?: number
          storage_path?: string | null
          workflow_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artifacts_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bench_results: {
        Row: {
          attempt: number
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          idx: number
          pass: boolean
          prompt: string
          reply_bytes: number | null
          reply_tail: string | null
          run_id: string
          spawned_count: number | null
          spawned_ids: Json | null
          trace: Json | null
        }
        Insert: {
          attempt: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          idx: number
          pass: boolean
          prompt: string
          reply_bytes?: number | null
          reply_tail?: string | null
          run_id: string
          spawned_count?: number | null
          spawned_ids?: Json | null
          trace?: Json | null
        }
        Update: {
          attempt?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          idx?: number
          pass?: boolean
          prompt?: string
          reply_bytes?: number | null
          reply_tail?: string | null
          run_id?: string
          spawned_count?: number | null
          spawned_ids?: Json | null
          trace?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "bench_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "bench_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      bench_runs: {
        Row: {
          assigned_instance_id: string | null
          completed_at: string | null
          config_overrides: Json | null
          created_at: string
          created_by: string
          error: string | null
          id: string
          mode: string
          parallel: number
          prompts: Json
          retries: number
          rpm: number | null
          started_at: string | null
          status: string
          summary: Json | null
          timeout_seconds: number
          workspace_id: string | null
        }
        Insert: {
          assigned_instance_id?: string | null
          completed_at?: string | null
          config_overrides?: Json | null
          created_at?: string
          created_by: string
          error?: string | null
          id?: string
          mode: string
          parallel?: number
          prompts: Json
          retries?: number
          rpm?: number | null
          started_at?: string | null
          status?: string
          summary?: Json | null
          timeout_seconds: number
          workspace_id?: string | null
        }
        Update: {
          assigned_instance_id?: string | null
          completed_at?: string | null
          config_overrides?: Json | null
          created_at?: string
          created_by?: string
          error?: string | null
          id?: string
          mode?: string
          parallel?: number
          prompts?: Json
          retries?: number
          rpm?: number | null
          started_at?: string | null
          status?: string
          summary?: Json | null
          timeout_seconds?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bench_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          accent: string
          author_id: string | null
          body_markdown: string
          category: string | null
          cover_image_url: string | null
          created_at: string
          excerpt: string
          id: string
          published_at: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          accent?: string
          author_id?: string | null
          body_markdown?: string
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string
          id?: string
          published_at?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          accent?: string
          author_id?: string | null
          body_markdown?: string
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string
          id?: string
          published_at?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          allocated_cents: number
          created_at: string
          id: string
          session_id: string
          spent_cents: number
          status: string
          updated_at: string
          wallet_id: string
        }
        Insert: {
          allocated_cents: number
          created_at?: string
          id?: string
          session_id: string
          spent_cents?: number
          status?: string
          updated_at?: string
          wallet_id: string
        }
        Update: {
          allocated_cents?: number
          created_at?: string
          id?: string
          session_id?: string
          spent_cents?: number
          status?: string
          updated_at?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      file_order: {
        Row: {
          ordered_names: string[]
          parent_path: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          ordered_names?: string[]
          parent_path: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          ordered_names?: string[]
          parent_path?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_order_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      file_shares: {
        Row: {
          created_at: string
          created_by: string
          file_path: string
          id: string
          permission_level: Database["public"]["Enums"]["share_permission_level"]
          shared_with_workspace_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          file_path: string
          id?: string
          permission_level?: Database["public"]["Enums"]["share_permission_level"]
          shared_with_workspace_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          file_path?: string
          id?: string
          permission_level?: Database["public"]["Enums"]["share_permission_level"]
          shared_with_workspace_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_shares_shared_with_workspace_id_fkey"
            columns: ["shared_with_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_shares_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          backend: string
          backend_mtime: string | null
          backend_ref: string | null
          content_type: string | null
          created_at: string
          created_by: string | null
          etag: string | null
          id: string
          kind: string
          path: string
          size_bytes: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          backend: string
          backend_mtime?: string | null
          backend_ref?: string | null
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          etag?: string | null
          id?: string
          kind: string
          path: string
          size_bytes?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          backend?: string
          backend_mtime?: string | null
          backend_ref?: string | null
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          etag?: string | null
          id?: string
          kind?: string
          path?: string
          size_bytes?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_discussions: {
        Row: {
          answered: boolean
          author_id: string
          author_initials: string
          author_name: string
          body: string
          category: string
          created_at: string
          id: string
          pinned: boolean
          title: string
          updated_at: string
          views: number
        }
        Insert: {
          answered?: boolean
          author_id: string
          author_initials: string
          author_name: string
          body: string
          category: string
          created_at?: string
          id?: string
          pinned?: boolean
          title: string
          updated_at?: string
          views?: number
        }
        Update: {
          answered?: boolean
          author_id?: string
          author_initials?: string
          author_name?: string
          body?: string
          category?: string
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
          views?: number
        }
        Relationships: []
      }
      forum_replies: {
        Row: {
          author_id: string
          author_initials: string
          author_name: string
          body: string
          created_at: string
          discussion_id: string
          id: string
        }
        Insert: {
          author_id: string
          author_initials: string
          author_name: string
          body: string
          created_at?: string
          discussion_id: string
          id?: string
        }
        Update: {
          author_id?: string
          author_initials?: string
          author_name?: string
          body?: string
          created_at?: string
          discussion_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_replies_discussion_id_fkey"
            columns: ["discussion_id"]
            isOneToOne: false
            referencedRelation: "forum_discussions"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_invites: {
        Row: {
          accepted_at: string | null
          email: string
          expires_at: string
          sent_at: string
          sent_by: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          email: string
          expires_at?: string
          sent_at?: string
          sent_by?: string | null
          token: string
        }
        Update: {
          accepted_at?: string | null
          email?: string
          expires_at?: string
          sent_at?: string
          sent_by?: string | null
          token?: string
        }
        Relationships: []
      }
      instances: {
        Row: {
          hostname: string
          instance_id: string
          internal_url: string
          last_heartbeat: string
          started_at: string
          version: string
        }
        Insert: {
          hostname: string
          instance_id: string
          internal_url: string
          last_heartbeat?: string
          started_at: string
          version: string
        }
        Update: {
          hostname?: string
          instance_id?: string
          internal_url?: string
          last_heartbeat?: string
          started_at?: string
          version?: string
        }
        Relationships: []
      }
      integration_install_events: {
        Row: {
          actor_user_id: string
          created_at: string
          event_type: string
          from_version_id: string | null
          id: string
          integration_id: string
          metadata: Json
          to_version_id: string | null
          workspace_id: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          event_type: string
          from_version_id?: string | null
          id?: string
          integration_id: string
          metadata?: Json
          to_version_id?: string | null
          workspace_id: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          event_type?: string
          from_version_id?: string | null
          id?: string
          integration_id?: string
          metadata?: Json
          to_version_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_install_events_from_version_id_fkey"
            columns: ["from_version_id"]
            isOneToOne: false
            referencedRelation: "integration_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_install_events_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_install_events_to_version_id_fkey"
            columns: ["to_version_id"]
            isOneToOne: false
            referencedRelation: "integration_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_install_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_layout_refs: {
        Row: {
          body: string
          created_at: string
          integration_id: string
          target_section: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          integration_id: string
          target_section: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          integration_id?: string
          target_section?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_layout_refs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: true
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_plugin_items: {
        Row: {
          child_integration_id: string
          child_min_version_id: string | null
          created_at: string
          plugin_integration_id: string
          sort_order: number
        }
        Insert: {
          child_integration_id: string
          child_min_version_id?: string | null
          created_at?: string
          plugin_integration_id: string
          sort_order?: number
        }
        Update: {
          child_integration_id?: string
          child_min_version_id?: string | null
          created_at?: string
          plugin_integration_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "integration_plugin_items_child_integration_id_fkey"
            columns: ["child_integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_plugin_items_child_min_version_id_fkey"
            columns: ["child_min_version_id"]
            isOneToOne: false
            referencedRelation: "integration_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_plugin_items_plugin_integration_id_fkey"
            columns: ["plugin_integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_versions: {
        Row: {
          created_at: string
          id: string
          integration_id: string
          manifest: Json
          manifest_sha256: string | null
          manifest_url: string | null
          published_at: string | null
          release_notes: string | null
          status: string
          version: string
          webhook_signing_secret_enc: string | null
          yank_reason: string | null
          yanked_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          integration_id: string
          manifest: Json
          manifest_sha256?: string | null
          manifest_url?: string | null
          published_at?: string | null
          release_notes?: string | null
          status?: string
          version: string
          webhook_signing_secret_enc?: string | null
          yank_reason?: string | null
          yanked_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          integration_id?: string
          manifest?: Json
          manifest_sha256?: string | null
          manifest_url?: string | null
          published_at?: string | null
          release_notes?: string | null
          status?: string
          version?: string
          webhook_signing_secret_enc?: string | null
          yank_reason?: string | null
          yanked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_versions_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_workflow_refs: {
        Row: {
          created_at: string
          integration_id: string
          workflow_id: string
          workflow_version_id: string
        }
        Insert: {
          created_at?: string
          integration_id: string
          workflow_id: string
          workflow_version_id: string
        }
        Update: {
          created_at?: string
          integration_id?: string
          workflow_id?: string
          workflow_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_workflow_refs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: true
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_workflow_refs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_workflow_refs_workflow_version_id_fkey"
            columns: ["workflow_version_id"]
            isOneToOne: false
            referencedRelation: "workflow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          author_name: string
          author_user_id: string | null
          created_at: string
          current_version_id: string | null
          description: string | null
          homepage_url: string | null
          icon_url: string | null
          id: string
          install_count: number
          is_first_party: boolean
          is_verified: boolean
          kind: string
          name: string
          slug: string
          source_repo_url: string | null
          tags: string[]
          updated_at: string
          visibility: string
        }
        Insert: {
          author_name: string
          author_user_id?: string | null
          created_at?: string
          current_version_id?: string | null
          description?: string | null
          homepage_url?: string | null
          icon_url?: string | null
          id?: string
          install_count?: number
          is_first_party?: boolean
          is_verified?: boolean
          kind: string
          name: string
          slug: string
          source_repo_url?: string | null
          tags?: string[]
          updated_at?: string
          visibility?: string
        }
        Update: {
          author_name?: string
          author_user_id?: string | null
          created_at?: string
          current_version_id?: string | null
          description?: string | null
          homepage_url?: string | null
          icon_url?: string | null
          id?: string
          install_count?: number
          is_first_party?: boolean
          is_verified?: boolean
          kind?: string
          name?: string
          slug?: string
          source_repo_url?: string | null
          tags?: string[]
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_current_version_fk"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "integration_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_criteria: {
        Row: {
          created_at: string
          id: string
          label: string
          position: number
          prompt: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          position?: number
          prompt: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          position?: number
          prompt?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      judge_directives: {
        Row: {
          id: string
          text: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          text: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          text?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      mailing_list: {
        Row: {
          created_at: string | null
          email: string
          id: number
          is_verified: boolean | null
          subscribed_at: string | null
          token_expires_at: string | null
          unsubscribe_token: string
          unsubscribed_at: string | null
          updated_at: string | null
          user_id: string | null
          verification_token: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: number
          is_verified?: boolean | null
          subscribed_at?: string | null
          token_expires_at?: string | null
          unsubscribe_token?: string
          unsubscribed_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          verification_token?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: number
          is_verified?: boolean | null
          subscribed_at?: string | null
          token_expires_at?: string | null
          unsubscribe_token?: string
          unsubscribed_at?: string | null
          updated_at?: string | null
          user_id?: string | null
          verification_token?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      maintainers: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          user_id?: string
        }
        Relationships: []
      }
      maintenance_windows: {
        Row: {
          cancellation_email_sent_at: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          description: string
          ends_at: string
          id: string
          initial_email_sent_at: string | null
          starts_at: string
          title: string
        }
        Insert: {
          cancellation_email_sent_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          ends_at: string
          id?: string
          initial_email_sent_at?: string | null
          starts_at: string
          title: string
        }
        Update: {
          cancellation_email_sent_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          ends_at?: string
          id?: string
          initial_email_sent_at?: string | null
          starts_at?: string
          title?: string
        }
        Relationships: []
      }
      message_feedback: {
        Row: {
          created_at: string
          id: string
          message_id: string
          note: string | null
          rating: string
          updated_at: string
          user_id: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          note?: string | null
          rating: string
          updated_at?: string
          user_id: string
          workflow_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          note?: string | null
          rating?: string
          updated_at?: string
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_feedback_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          agent_id: string | null
          content: string
          created_at: string
          id: string
          metadata: Json
          role: string
          workflow_id: string
        }
        Insert: {
          agent_id?: string | null
          content: string
          created_at?: string
          id?: string
          metadata?: Json
          role: string
          workflow_id: string
        }
        Update: {
          agent_id?: string | null
          content?: string
          created_at?: string
          id?: string
          metadata?: Json
          role?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      session_judgments: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          classifications: Json | null
          corrected_classifications: Json | null
          created_at: string
          directives_version: string
          error: string | null
          id: string
          judge_model: string
          reasoning: string | null
          review_notes: string | null
          review_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_email: string | null
          reviewed_by_judge: boolean
          score: number | null
          status: string
          workflow_id: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          classifications?: Json | null
          corrected_classifications?: Json | null
          created_at?: string
          directives_version: string
          error?: string | null
          id?: string
          judge_model: string
          reasoning?: string | null
          review_notes?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_email?: string | null
          reviewed_by_judge?: boolean
          score?: number | null
          status?: string
          workflow_id: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          classifications?: Json | null
          corrected_classifications?: Json | null
          created_at?: string
          directives_version?: string
          error?: string | null
          id?: string
          judge_model?: string
          reasoning?: string | null
          review_notes?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_email?: string | null
          reviewed_by_judge?: boolean
          score?: number | null
          status?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_judgments_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_cents: number
          balance_after_cents: number
          created_at: string
          description: string
          id: string
          metadata: Json
          session_id: string | null
          type: string
          wallet_id: string
        }
        Insert: {
          amount_cents: number
          balance_after_cents: number
          created_at?: string
          description?: string
          id?: string
          metadata?: Json
          session_id?: string | null
          type: string
          wallet_id: string
        }
        Update: {
          amount_cents?: number
          balance_after_cents?: number
          created_at?: string
          description?: string
          id?: string
          metadata?: Json
          session_id?: string | null
          type?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          created_at: string
          description: string | null
          dismissed_at: string | null
          id: string
          metadata: Json
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          dismissed_at?: string | null
          id?: string
          metadata?: Json
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          dismissed_at?: string | null
          id?: string
          metadata?: Json
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          all_notifications_enabled: boolean
          blog_newsletter_subscribed: boolean
          cloaked_browser_enabled: boolean
          created_at: string
          settings: Json
          show_cursor_overlay: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          all_notifications_enabled?: boolean
          blog_newsletter_subscribed?: boolean
          cloaked_browser_enabled?: boolean
          created_at?: string
          settings?: Json
          show_cursor_overlay?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          all_notifications_enabled?: boolean
          blog_newsletter_subscribed?: boolean
          cloaked_browser_enabled?: boolean
          created_at?: string
          settings?: Json
          show_cursor_overlay?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance_cents: number
          created_at: string
          currency: string
          id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          balance_cents?: number
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          balance_cents?: number
          created_at?: string
          currency?: string
          id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_directive_traces: {
        Row: {
          actions: Json
          node_id: string
          recorded_at: string
          recorded_by_run_id: string | null
          workflow_id: string
          workflow_version_id: string
        }
        Insert: {
          actions: Json
          node_id: string
          recorded_at?: string
          recorded_by_run_id?: string | null
          workflow_id: string
          workflow_version_id: string
        }
        Update: {
          actions?: Json
          node_id?: string
          recorded_at?: string
          recorded_by_run_id?: string | null
          workflow_id?: string
          workflow_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_directive_traces_recorded_by_run_id_fkey"
            columns: ["recorded_by_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_directive_traces_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_directive_traces_workflow_version_id_fkey"
            columns: ["workflow_version_id"]
            isOneToOne: false
            referencedRelation: "workflow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          current_node_path: string[]
          error: string | null
          finished_at: string | null
          id: string
          node_states: Json
          scheduled_for: string | null
          started_at: string
          started_by: string | null
          status: string
          trigger: string
          workflow_id: string
          workflow_version_id: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          current_node_path?: string[]
          error?: string | null
          finished_at?: string | null
          id?: string
          node_states?: Json
          scheduled_for?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          trigger?: string
          workflow_id: string
          workflow_version_id: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          current_node_path?: string[]
          error?: string | null
          finished_at?: string | null
          id?: string
          node_states?: Json
          scheduled_for?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          trigger?: string
          workflow_id?: string
          workflow_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_version_id_fkey"
            columns: ["workflow_version_id"]
            isOneToOne: false
            referencedRelation: "workflow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_schedules: {
        Row: {
          active: boolean
          created_at: string
          cron_expression: string
          frequency: string
          one_off_ms: number[]
          timezone: string
          updated_at: string
          updated_by: string | null
          weekdays: number[]
          workflow_id: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          cron_expression?: string
          frequency?: string
          one_off_ms?: number[]
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          weekdays?: number[]
          workflow_id: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          cron_expression?: string
          frequency?: string
          one_off_ms?: number[]
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          weekdays?: number[]
          workflow_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_schedules_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: true
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_schedules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_versions: {
        Row: {
          agent_concern: string | null
          change_summary: string | null
          client_nonce: string | null
          created_at: string
          created_by: string | null
          id: string
          impact_level: string
          locked_node_ids: string[]
          source: string
          steps: Json
          tags: string[]
          turn_id: string | null
          version: number
          workflow_id: string
        }
        Insert: {
          agent_concern?: string | null
          change_summary?: string | null
          client_nonce?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          impact_level?: string
          locked_node_ids?: string[]
          source?: string
          steps: Json
          tags?: string[]
          turn_id?: string | null
          version: number
          workflow_id: string
        }
        Update: {
          agent_concern?: string | null
          change_summary?: string | null
          client_nonce?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          impact_level?: string
          locked_node_ids?: string[]
          source?: string
          steps?: Json
          tags?: string[]
          turn_id?: string | null
          version?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_versions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_running: boolean
          last_browser_mode: string
          last_browser_states: Json
          last_viewport_urls: Json
          name: string
          position: number
          running_kind: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_running?: boolean
          last_browser_mode?: string
          last_browser_states?: Json
          last_viewport_urls?: Json
          name: string
          position?: number
          running_kind?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_running?: boolean
          last_browser_mode?: string
          last_browser_states?: Json
          last_viewport_urls?: Json
          name?: string
          position?: number
          running_kind?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_browser_cookies: {
        Row: {
          domain: string
          expires_at: string | null
          http_only: boolean
          last_seen_at: string
          name: string
          observed_by: string | null
          origin: string
          path: string
          same_site: string
          secure: boolean
          value_enc: string
          workspace_id: string
        }
        Insert: {
          domain: string
          expires_at?: string | null
          http_only?: boolean
          last_seen_at: string
          name: string
          observed_by?: string | null
          origin: string
          path: string
          same_site?: string
          secure?: boolean
          value_enc: string
          workspace_id: string
        }
        Update: {
          domain?: string
          expires_at?: string | null
          http_only?: boolean
          last_seen_at?: string
          name?: string
          observed_by?: string | null
          origin?: string
          path?: string
          same_site?: string
          secure?: boolean
          value_enc?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_browser_cookies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_browser_keys: {
        Row: {
          created_at: string
          vault_secret_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          vault_secret_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          vault_secret_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_browser_keys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_browser_states: {
        Row: {
          captured_by: string | null
          enabled: boolean
          fingerprint_seed: string | null
          id: string
          last_seen_at: string
          last_used_at: string | null
          last_used_by: string | null
          origin: string
          use_count: number
          vault_secret_id: string
          workspace_id: string
        }
        Insert: {
          captured_by?: string | null
          enabled?: boolean
          fingerprint_seed?: string | null
          id?: string
          last_seen_at: string
          last_used_at?: string | null
          last_used_by?: string | null
          origin: string
          use_count?: number
          vault_secret_id: string
          workspace_id: string
        }
        Update: {
          captured_by?: string | null
          enabled?: boolean
          fingerprint_seed?: string | null
          id?: string
          last_seen_at?: string
          last_used_at?: string | null
          last_used_by?: string | null
          origin?: string
          use_count?: number
          vault_secret_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_browser_states_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_file_permissions: {
        Row: {
          created_at: string
          created_by: string | null
          grant_level: string
          path: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          grant_level: string
          path: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          grant_level?: string
          path?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_file_permissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_integration_grants: {
        Row: {
          granted_at: string
          granted_by: string
          scope: string
          workspace_integration_id: string
        }
        Insert: {
          granted_at?: string
          granted_by: string
          scope: string
          workspace_integration_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string
          scope?: string
          workspace_integration_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_integration_grants_workspace_integration_id_fkey"
            columns: ["workspace_integration_id"]
            isOneToOne: false
            referencedRelation: "workspace_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_integration_tokens: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          revoked_at: string | null
          token_hash: string
          token_kind: string
          workspace_integration_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          revoked_at?: string | null
          token_hash: string
          token_kind: string
          workspace_integration_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          revoked_at?: string | null
          token_hash?: string
          token_kind?: string
          workspace_integration_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_integration_tokens_workspace_integration_id_fkey"
            columns: ["workspace_integration_id"]
            isOneToOne: false
            referencedRelation: "workspace_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_integrations: {
        Row: {
          access_token_enc: string | null
          account_display_name: string | null
          account_email: string | null
          auto_update_channel: string
          config: Json
          connected_by: string | null
          created_at: string
          expires_at: string | null
          id: string
          installed_via_plugin_id: string | null
          integration_version_id: string | null
          key_external_id: string | null
          metadata: Json
          provider: string
          refresh_token_enc: string | null
          root_folder_id: string | null
          root_folder_name: string | null
          scopes: string[]
          status: string
          updated_at: string
          workflow_version_id: string | null
          workspace_id: string
        }
        Insert: {
          access_token_enc?: string | null
          account_display_name?: string | null
          account_email?: string | null
          auto_update_channel?: string
          config?: Json
          connected_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          installed_via_plugin_id?: string | null
          integration_version_id?: string | null
          key_external_id?: string | null
          metadata?: Json
          provider: string
          refresh_token_enc?: string | null
          root_folder_id?: string | null
          root_folder_name?: string | null
          scopes?: string[]
          status?: string
          updated_at?: string
          workflow_version_id?: string | null
          workspace_id: string
        }
        Update: {
          access_token_enc?: string | null
          account_display_name?: string | null
          account_email?: string | null
          auto_update_channel?: string
          config?: Json
          connected_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          installed_via_plugin_id?: string | null
          integration_version_id?: string | null
          key_external_id?: string | null
          metadata?: Json
          provider?: string
          refresh_token_enc?: string | null
          root_folder_id?: string | null
          root_folder_name?: string | null
          scopes?: string[]
          status?: string
          updated_at?: string
          workflow_version_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_integrations_installed_via_plugin_id_fkey"
            columns: ["installed_via_plugin_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_integrations_integration_version_id_fkey"
            columns: ["integration_version_id"]
            isOneToOne: false
            referencedRelation: "integration_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_integrations_workflow_version_id_fkey"
            columns: ["workflow_version_id"]
            isOneToOne: false
            referencedRelation: "workflow_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_integrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: string
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          token: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_llm_keys: {
        Row: {
          api_base: string | null
          api_key_enc: string
          created_at: string
          created_by: string
          id: string
          last_four: string
          last_used_at: string | null
          provider: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          api_base?: string | null
          api_key_enc: string
          created_at?: string
          created_by: string
          id?: string
          last_four: string
          last_used_at?: string | null
          provider: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          api_base?: string | null
          api_key_enc?: string
          created_at?: string
          created_by?: string
          id?: string
          last_four?: string
          last_used_at?: string | null
          provider?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_llm_keys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          invited_by: string | null
          joined_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_passwords: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_weak: boolean
          last_used_at: string | null
          last_used_by: string | null
          name: string
          updated_at: string
          url: string
          usage_count: number
          username: string
          vault_secret_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_weak?: boolean
          last_used_at?: string | null
          last_used_by?: string | null
          name: string
          updated_at?: string
          url?: string
          usage_count?: number
          username?: string
          vault_secret_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_weak?: boolean
          last_used_at?: string | null
          last_used_by?: string | null
          name?: string
          updated_at?: string
          url?: string
          usage_count?: number
          username?: string
          vault_secret_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_passwords_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_settings: {
        Row: {
          auto_judge: boolean
          judge_model: string | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          auto_judge?: boolean
          judge_model?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          auto_judge?: boolean
          judge_model?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_token_usage: {
        Row: {
          tokens_used: number
          updated_at: string
          week_start: string
          workspace_id: string
        }
        Insert: {
          tokens_used?: number
          updated_at?: string
          week_start: string
          workspace_id: string
        }
        Update: {
          tokens_used?: number
          updated_at?: string
          week_start?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_token_usage_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          plan: string
          slug: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          plan?: string
          slug: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          plan?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_workspace_invitation: {
        Args: { invite_token: string }
        Returns: Json
      }
      capture_workspace_browser_cookies: {
        Args: { p_cookies: Json; p_origin: string; p_workspace_id: string }
        Returns: number
      }
      capture_workspace_browser_state: {
        Args: {
          p_fingerprint_seed: string
          p_local_storage_delta: Json
          p_observed_by: string
          p_origin: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      claim_due_scheduled_runs: {
        Args: { p_instance: string; p_limit: number; p_now: string }
        Returns: {
          id: string
          scheduled_for: string
          workflow_id: string
          workflow_version_id: string
          workspace_id: string
        }[]
      }
      cleanup_anonymous_users: { Args: never; Returns: undefined }
      count_workspace_workflow_runs_this_month: {
        Args: { p_workspace_id: string }
        Returns: number
      }
      create_workspace_password: {
        Args: {
          p_is_weak?: boolean
          p_name: string
          p_password: string
          p_url: string
          p_username: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          is_weak: boolean
          last_used_at: string | null
          last_used_by: string | null
          name: string
          updated_at: string
          url: string
          usage_count: number
          username: string
          vault_secret_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_passwords"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_workspace_with_owner: {
        Args: { p_name: string; p_slug: string }
        Returns: {
          avatar_url: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          plan: string
          slug: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "workspaces"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_workspace_browser_origin: {
        Args: { p_origin: string; p_workspace_id: string }
        Returns: undefined
      }
      delete_workspace_password: {
        Args: { p_password_id: string }
        Returns: undefined
      }
      effective_file_permission: {
        Args: { p_path: string; p_user_id: string; p_workspace_id: string }
        Returns: string
      }
      ensure_workspace_browser_key: {
        Args: { p_workspace_id: string }
        Returns: string
      }
      expire_stale_scheduled_runs: {
        Args: { p_max_staleness: string; p_now: string }
        Returns: number
      }
      get_or_create_user_settings: {
        Args: { p_user_id: string }
        Returns: {
          all_notifications_enabled: boolean
          blog_newsletter_subscribed: boolean
          cloaked_browser_enabled: boolean
          created_at: string
          settings: Json
          show_cursor_overlay: boolean
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_workspace_password_secret: {
        Args: { p_password_id: string }
        Returns: string
      }
      get_workspace_role: {
        Args: { ws_id: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
      get_workspace_token_usage: {
        Args: { p_week_start: string; p_workspace_id: string }
        Returns: number
      }
      increment_forum_discussion_views: {
        Args: { p_id: string }
        Returns: undefined
      }
      increment_workspace_token_usage: {
        Args: { p_delta: number; p_week_start: string; p_workspace_id: string }
        Returns: number
      }
      is_maintainer: { Args: never; Returns: boolean }
      is_workspace_member: { Args: { ws_id: string }; Returns: boolean }
      list_forum_discussions: {
        Args: {
          p_category?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_sort?: string
        }
        Returns: {
          answered: boolean
          author_id: string
          author_initials: string
          author_name: string
          body: string
          category: string
          created_at: string
          id: string
          last_activity_at: string
          pinned: boolean
          reply_count: number
          title: string
          views: number
        }[]
      }
      list_workspace_members_with_profiles: {
        Args: { ws_id: string }
        Returns: {
          display_name: string
          email: string
          invited_by: string
          joined_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }[]
      }
      load_workspace_browser_cookies: {
        Args: { p_workspace_id: string }
        Returns: {
          domain: string
          expires_at: string
          http_only: boolean
          last_seen_at: string
          name: string
          origin: string
          path: string
          same_site: string
          secure: boolean
          value: string
        }[]
      }
      load_workspace_browser_state: {
        Args: { p_workspace_id: string }
        Returns: {
          fingerprint_seed: string
          last_seen_at: string
          local_storage: Json
          origin: string
        }[]
      }
      notifications_enabled_for_email: {
        Args: { p_email: string }
        Returns: boolean
      }
      peek_workspace_invitation: {
        Args: { invite_token: string }
        Returns: Json
      }
      reorder_workflows: {
        Args: { p_ordered_ids: string[]; p_workspace_id: string }
        Returns: undefined
      }
      soft_delete_workflow: {
        Args: { p_workflow_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_running: boolean
          last_browser_mode: string
          last_browser_states: Json
          last_viewport_urls: Json
          name: string
          position: number
          running_kind: string | null
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workflows"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      touch_workspace_browser_state_used: {
        Args: { p_origin: string; p_used_by: string; p_workspace_id: string }
        Returns: undefined
      }
      update_workspace_password: {
        Args: {
          p_is_weak?: boolean
          p_name: string
          p_password?: string
          p_password_id: string
          p_url: string
          p_username: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          is_weak: boolean
          last_used_at: string | null
          last_used_by: string | null
          name: string
          updated_at: string
          url: string
          usage_count: number
          username: string
          vault_secret_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_passwords"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_user_settings: {
        Args: {
          p_all_notifications_enabled?: boolean
          p_blog_newsletter_subscribed?: boolean
          p_cloaked_browser_enabled?: boolean
          p_settings?: Json
          p_show_cursor_overlay?: boolean
        }
        Returns: {
          all_notifications_enabled: boolean
          blog_newsletter_subscribed: boolean
          cloaked_browser_enabled: boolean
          created_at: string
          settings: Json
          show_cursor_overlay: boolean
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      wipe_descendant_file_permissions: {
        Args: { p_path: string; p_workspace_id: string }
        Returns: number
      }
      workspace_browser_key_passphrase: {
        Args: { p_workspace_id: string }
        Returns: string
      }
      workspace_member_cap_for_plan: {
        Args: { p_plan: string }
        Returns: number
      }
    }
    Enums: {
      share_permission_level: "viewer" | "editor"
      workspace_role: "owner" | "admin" | "member" | "viewer"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      share_permission_level: ["viewer", "editor"],
      workspace_role: ["owner", "admin", "member", "viewer"],
    },
  },
} as const
