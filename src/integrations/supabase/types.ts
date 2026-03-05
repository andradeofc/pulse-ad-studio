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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ad_account_daily_spend: {
        Row: {
          account_name: string | null
          ad_account_id: string
          created_at: string
          currency: string | null
          date: string
          fetched_at: string
          id: string
          spend: number
          user_id: string
        }
        Insert: {
          account_name?: string | null
          ad_account_id: string
          created_at?: string
          currency?: string | null
          date: string
          fetched_at?: string
          id?: string
          spend?: number
          user_id: string
        }
        Update: {
          account_name?: string | null
          ad_account_id?: string
          created_at?: string
          currency?: string | null
          date?: string
          fetched_at?: string
          id?: string
          spend?: number
          user_id?: string
        }
        Relationships: []
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address: string
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          admin_user_id: string
          created_at: string
          delivery_method: string
          expires_at: string | null
          id: string
          message: string
          notification_type: string
          scheduled_at: string | null
          sent_at: string | null
          target_audience: string
          target_plans: Json | null
          target_user_ids: Json | null
          title: string
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          delivery_method?: string
          expires_at?: string | null
          id?: string
          message: string
          notification_type?: string
          scheduled_at?: string | null
          sent_at?: string | null
          target_audience?: string
          target_plans?: Json | null
          target_user_ids?: Json | null
          title: string
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          delivery_method?: string
          expires_at?: string | null
          id?: string
          message?: string
          notification_type?: string
          scheduled_at?: string | null
          sent_at?: string | null
          target_audience?: string
          target_plans?: Json | null
          target_user_ids?: Json | null
          title?: string
        }
        Relationships: []
      }
      api_call_logs: {
        Row: {
          ad_account_id: string | null
          created_at: string
          endpoint: string
          error_message: string | null
          facebook_object_id: string | null
          facebook_object_type: string | null
          http_method: string
          id: string
          job_id: string | null
          job_item_id: string | null
          request_body: Json | null
          response_body: Json | null
          response_status: number
          response_time_ms: number | null
          retry_count: number | null
          user_id: string
        }
        Insert: {
          ad_account_id?: string | null
          created_at?: string
          endpoint: string
          error_message?: string | null
          facebook_object_id?: string | null
          facebook_object_type?: string | null
          http_method: string
          id?: string
          job_id?: string | null
          job_item_id?: string | null
          request_body?: Json | null
          response_body?: Json | null
          response_status: number
          response_time_ms?: number | null
          retry_count?: number | null
          user_id: string
        }
        Update: {
          ad_account_id?: string | null
          created_at?: string
          endpoint?: string
          error_message?: string | null
          facebook_object_id?: string | null
          facebook_object_type?: string | null
          http_method?: string
          id?: string
          job_id?: string | null
          job_item_id?: string | null
          request_body?: Json | null
          response_body?: Json | null
          response_status?: number
          response_time_ms?: number | null
          retry_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      campaign_job_items: {
        Row: {
          config: Json | null
          created_at: string
          error_message: string | null
          facebook_id: string | null
          id: string
          item_type: string
          job_id: string
          name: string
          parent_id: string | null
          status: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          error_message?: string | null
          facebook_id?: string | null
          id?: string
          item_type: string
          job_id: string
          name: string
          parent_id?: string | null
          status?: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          error_message?: string | null
          facebook_id?: string | null
          id?: string
          item_type?: string
          job_id?: string
          name?: string
          parent_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "campaign_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_job_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "campaign_job_items"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_jobs: {
        Row: {
          accounts_count: number
          batch_size: number | null
          completed_at: string | null
          config: Json
          created_at: string
          error_message: string | null
          hash: string
          id: string
          last_rate_limit_percent: number | null
          name: string
          paused_at: string | null
          processed_items: number | null
          progress: number
          resume_after: string | null
          started_at: string | null
          status: string
          total_ads: number
          total_adsets: number
          total_campaigns: number
          updated_at: string
          user_id: string
        }
        Insert: {
          accounts_count?: number
          batch_size?: number | null
          completed_at?: string | null
          config?: Json
          created_at?: string
          error_message?: string | null
          hash: string
          id?: string
          last_rate_limit_percent?: number | null
          name: string
          paused_at?: string | null
          processed_items?: number | null
          progress?: number
          resume_after?: string | null
          started_at?: string | null
          status?: string
          total_ads?: number
          total_adsets?: number
          total_campaigns?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          accounts_count?: number
          batch_size?: number | null
          completed_at?: string | null
          config?: Json
          created_at?: string
          error_message?: string | null
          hash?: string
          id?: string
          last_rate_limit_percent?: number | null
          name?: string
          paused_at?: string | null
          processed_items?: number | null
          progress?: number
          resume_after?: string | null
          started_at?: string | null
          status?: string
          total_ads?: number
          total_adsets?: number
          total_campaigns?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      campaign_templates: {
        Row: {
          config: Json
          created_at: string
          description: string | null
          id: string
          is_favorite: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_favorite?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_favorite?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      catalog_media_alerts: {
        Row: {
          alert_type: string
          catalog_name: string
          created_at: string
          id: string
          monitor_id: string
          product_name: string | null
          product_set_name: string
          repaired_at: string | null
          retailer_id: string
          status: string
          user_id: string
          webhook_sent: boolean
        }
        Insert: {
          alert_type?: string
          catalog_name: string
          created_at?: string
          id?: string
          monitor_id: string
          product_name?: string | null
          product_set_name: string
          repaired_at?: string | null
          retailer_id: string
          status?: string
          user_id: string
          webhook_sent?: boolean
        }
        Update: {
          alert_type?: string
          catalog_name?: string
          created_at?: string
          id?: string
          monitor_id?: string
          product_name?: string | null
          product_set_name?: string
          repaired_at?: string | null
          retailer_id?: string
          status?: string
          user_id?: string
          webhook_sent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "catalog_media_alerts_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "catalog_media_monitors"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_media_monitors: {
        Row: {
          auto_repair: boolean
          catalog_id: string
          created_at: string
          creative_id: string | null
          id: string
          is_active: boolean
          issues_found: number
          last_checked_at: string | null
          last_issue_at: string | null
          product_set_id: string
          product_set_name: string
          profile_id: string
          source: string
          updated_at: string
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          auto_repair?: boolean
          catalog_id: string
          created_at?: string
          creative_id?: string | null
          id?: string
          is_active?: boolean
          issues_found?: number
          last_checked_at?: string | null
          last_issue_at?: string | null
          product_set_id: string
          product_set_name: string
          profile_id: string
          source?: string
          updated_at?: string
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          auto_repair?: boolean
          catalog_id?: string
          created_at?: string
          creative_id?: string | null
          id?: string
          is_active?: boolean
          issues_found?: number
          last_checked_at?: string | null
          last_issue_at?: string | null
          product_set_id?: string
          product_set_name?: string
          profile_id?: string
          source?: string
          updated_at?: string
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_media_monitors_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "facebook_catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_media_monitors_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "creatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_media_monitors_product_set_id_fkey"
            columns: ["product_set_id"]
            isOneToOne: false
            referencedRelation: "facebook_product_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_media_monitors_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "facebook_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_schedule_products: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          product_name: string | null
          retailer_id: string
          schedule_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          product_name?: string | null
          retailer_id: string
          schedule_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          product_name?: string | null
          retailer_id?: string
          schedule_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_schedule_products_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "catalog_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_schedules: {
        Row: {
          catalog_id: string
          created_at: string
          creative_id: string
          error_message: string | null
          id: string
          processed_at: string | null
          product_set_id: string
          products_updated: number | null
          profile_id: string
          scheduled_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          catalog_id: string
          created_at?: string
          creative_id: string
          error_message?: string | null
          id?: string
          processed_at?: string | null
          product_set_id: string
          products_updated?: number | null
          profile_id: string
          scheduled_at: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          catalog_id?: string
          created_at?: string
          creative_id?: string
          error_message?: string | null
          id?: string
          processed_at?: string | null
          product_set_id?: string
          products_updated?: number | null
          profile_id?: string
          scheduled_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_schedules_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "facebook_catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_schedules_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "creatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_schedules_product_set_id_fkey"
            columns: ["product_set_id"]
            isOneToOne: false
            referencedRelation: "facebook_product_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_schedules_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "facebook_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_folders: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "creative_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      creatives: {
        Row: {
          created_at: string
          duration: number | null
          file_path: string
          folder_id: string | null
          height: number | null
          id: string
          name: string
          size: number
          thumbnail_url: string | null
          type: string
          updated_at: string
          url: string
          user_id: string
          width: number | null
        }
        Insert: {
          created_at?: string
          duration?: number | null
          file_path: string
          folder_id?: string | null
          height?: number | null
          id?: string
          name: string
          size: number
          thumbnail_url?: string | null
          type: string
          updated_at?: string
          url: string
          user_id: string
          width?: number | null
        }
        Update: {
          created_at?: string
          duration?: number | null
          file_path?: string
          folder_id?: string | null
          height?: number | null
          id?: string
          name?: string
          size?: number
          thumbnail_url?: string | null
          type?: string
          updated_at?: string
          url?: string
          user_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "creatives_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "creative_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_ad_accounts: {
        Row: {
          account_id: string
          amount_spent: number | null
          business_id: string | null
          business_name: string | null
          created_at: string
          currency: string | null
          id: string
          name: string
          nickname: string | null
          profile_id: string
          spend_updated_at: string | null
          status: string | null
          timezone: string | null
        }
        Insert: {
          account_id: string
          amount_spent?: number | null
          business_id?: string | null
          business_name?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          name: string
          nickname?: string | null
          profile_id: string
          spend_updated_at?: string | null
          status?: string | null
          timezone?: string | null
        }
        Update: {
          account_id?: string
          amount_spent?: number | null
          business_id?: string | null
          business_name?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          name?: string
          nickname?: string | null
          profile_id?: string
          spend_updated_at?: string | null
          status?: string | null
          timezone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facebook_ad_accounts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "facebook_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_business_managers: {
        Row: {
          business_id: string
          created_at: string
          id: string
          name: string
          primary_page_id: string | null
          profile_id: string
          timezone: string | null
          updated_at: string
          verification_status: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          name: string
          primary_page_id?: string | null
          profile_id: string
          timezone?: string | null
          updated_at?: string
          verification_status?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          primary_page_id?: string | null
          profile_id?: string
          timezone?: string | null
          updated_at?: string
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facebook_business_managers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "facebook_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_catalogs: {
        Row: {
          business_id: string | null
          business_name: string | null
          catalog_id: string
          created_at: string
          id: string
          name: string
          product_count: number | null
          profile_id: string
          updated_at: string
          vertical: string | null
        }
        Insert: {
          business_id?: string | null
          business_name?: string | null
          catalog_id: string
          created_at?: string
          id?: string
          name: string
          product_count?: number | null
          profile_id: string
          updated_at?: string
          vertical?: string | null
        }
        Update: {
          business_id?: string | null
          business_name?: string | null
          catalog_id?: string
          created_at?: string
          id?: string
          name?: string
          product_count?: number | null
          profile_id?: string
          updated_at?: string
          vertical?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facebook_catalogs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "facebook_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_credentials: {
        Row: {
          access_token: string
          created_at: string
          id: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          access_token: string
          created_at?: string
          id?: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          id?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      facebook_pages: {
        Row: {
          access_token: string | null
          ads_limit: number | null
          ads_running: number | null
          business_id: string | null
          business_name: string | null
          category: string | null
          created_at: string
          followers_count: number | null
          id: string
          is_published: boolean | null
          name: string
          page_id: string
          picture_url: string | null
          profile_id: string
          tasks: string[] | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          ads_limit?: number | null
          ads_running?: number | null
          business_id?: string | null
          business_name?: string | null
          category?: string | null
          created_at?: string
          followers_count?: number | null
          id?: string
          is_published?: boolean | null
          name: string
          page_id: string
          picture_url?: string | null
          profile_id: string
          tasks?: string[] | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          ads_limit?: number | null
          ads_running?: number | null
          business_id?: string | null
          business_name?: string | null
          category?: string | null
          created_at?: string
          followers_count?: number | null
          id?: string
          is_published?: boolean | null
          name?: string
          page_id?: string
          picture_url?: string | null
          profile_id?: string
          tasks?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facebook_pages_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "facebook_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_pixels: {
        Row: {
          account_id: string | null
          account_name: string | null
          business_id: string | null
          business_name: string | null
          created_at: string
          id: string
          name: string
          pixel_id: string
          profile_id: string
        }
        Insert: {
          account_id?: string | null
          account_name?: string | null
          business_id?: string | null
          business_name?: string | null
          created_at?: string
          id?: string
          name: string
          pixel_id: string
          profile_id: string
        }
        Update: {
          account_id?: string | null
          account_name?: string | null
          business_id?: string | null
          business_name?: string | null
          created_at?: string
          id?: string
          name?: string
          pixel_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "facebook_pixels_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "facebook_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_product_sets: {
        Row: {
          catalog_id: string
          created_at: string
          filter: string | null
          id: string
          name: string
          product_count: number | null
          product_set_id: string
        }
        Insert: {
          catalog_id: string
          created_at?: string
          filter?: string | null
          id?: string
          name: string
          product_count?: number | null
          product_set_id: string
        }
        Update: {
          catalog_id?: string
          created_at?: string
          filter?: string | null
          id?: string
          name?: string
          product_count?: number | null
          product_set_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "facebook_product_sets_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "facebook_catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_profiles: {
        Row: {
          access_token: string
          avatar_url: string | null
          created_at: string
          email: string | null
          facebook_id: string
          id: string
          is_primary: boolean
          last_synced_at: string | null
          name: string
          page_token_valid: boolean | null
          permissions: string[] | null
          proxy_host: string | null
          proxy_password: string | null
          proxy_port: number | null
          proxy_protocol: string | null
          proxy_username: string | null
          status: string
          sync_status: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          facebook_id: string
          id?: string
          is_primary?: boolean
          last_synced_at?: string | null
          name: string
          page_token_valid?: boolean | null
          permissions?: string[] | null
          proxy_host?: string | null
          proxy_password?: string | null
          proxy_port?: number | null
          proxy_protocol?: string | null
          proxy_username?: string | null
          status?: string
          sync_status?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          facebook_id?: string
          id?: string
          is_primary?: boolean
          last_synced_at?: string | null
          name?: string
          page_token_valid?: boolean | null
          permissions?: string[] | null
          proxy_host?: string | null
          proxy_password?: string | null
          proxy_port?: number | null
          proxy_protocol?: string | null
          proxy_username?: string | null
          status?: string
          sync_status?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      naming_presets: {
        Row: {
          context: string
          created_at: string
          id: string
          is_favorite: boolean
          name: string
          template: string
          updated_at: string
          user_id: string
        }
        Insert: {
          context: string
          created_at?: string
          id?: string
          is_favorite?: boolean
          name: string
          template: string
          updated_at?: string
          user_id: string
        }
        Update: {
          context?: string
          created_at?: string
          id?: string
          is_favorite?: boolean
          name?: string
          template?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      naming_variables: {
        Row: {
          created_at: string
          id: string
          key: string
          label: string
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          label: string
          updated_at?: string
          user_id: string
          value?: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          label?: string
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          id: string
          key_name: string
          updated_at: string
          updated_by: string | null
          value_json: Json | null
          value_text: string | null
        }
        Insert: {
          id?: string
          key_name: string
          updated_at?: string
          updated_by?: string | null
          value_json?: Json | null
          value_text?: string | null
        }
        Update: {
          id?: string
          key_name?: string
          updated_at?: string
          updated_by?: string | null
          value_json?: Json | null
          value_text?: string | null
        }
        Relationships: []
      }
      rate_limit_tracking: {
        Row: {
          account_id: string
          created_at: string
          id: string
          last_updated_at: string
          request_count: number
          usage_percent: number
          user_id: string
          window_start: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          last_updated_at?: string
          request_count?: number
          usage_percent?: number
          user_id: string
          window_start?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          last_updated_at?: string
          request_count?: number
          usage_percent?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          id: string
          invited_at: string | null
          member_id: string
          owner_id: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_at?: string | null
          member_id: string
          owner_id: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_at?: string | null
          member_id?: string
          owner_id?: string
          status?: string
        }
        Relationships: []
      }
      user_ad_usage: {
        Row: {
          ads_created: number
          created_at: string
          id: string
          period_end: string
          period_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ads_created?: number
          created_at?: string
          id?: string
          period_end: string
          period_start: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ads_created?: number
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_dismissed_notifications: {
        Row: {
          dismissed_at: string
          id: string
          notification_key: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string
          id?: string
          notification_key: string
          user_id: string
        }
        Update: {
          dismissed_at?: string
          id?: string
          notification_key?: string
          user_id?: string
        }
        Relationships: []
      }
      user_notification_reads: {
        Row: {
          id: string
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "admin_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          admin_notes: string | null
          created_at: string
          custom_limits: Json | null
          full_name: string | null
          id: string
          last_login_at: string | null
          last_login_ip: string | null
          phone: string | null
          plan: string | null
          status: Database["public"]["Enums"]["user_status"]
          subscription_starts_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          custom_limits?: Json | null
          full_name?: string | null
          id?: string
          last_login_at?: string | null
          last_login_ip?: string | null
          phone?: string | null
          plan?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          subscription_starts_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          custom_limits?: Json | null
          full_name?: string | null
          id?: string
          last_login_at?: string | null
          last_login_ip?: string | null
          phone?: string | null
          plan?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          subscription_starts_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_zapi_settings: {
        Row: {
          client_token: string
          created_at: string
          id: string
          instance_id: string
          is_enabled: boolean
          recipients: Json
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_token?: string
          created_at?: string
          id?: string
          instance_id?: string
          is_enabled?: boolean
          recipients?: Json
          token?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_token?: string
          created_at?: string
          id?: string
          instance_id?: string
          is_enabled?: boolean
          recipients?: Json
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_create_ads: {
        Args: { ads_to_create: number; check_user_id: string }
        Returns: {
          allowed: boolean
          current_usage: number
          is_unlimited: boolean
          limit_value: number
          message: string
          remaining: number
        }[]
      }
      effective_user_id: { Args: never; Returns: string }
      get_admin_all_user_stats: {
        Args: never
        Returns: {
          ad_accounts_count: number
          campaigns_count: number
          fb_accounts_count: number
          total_spend: number
          user_id: string
        }[]
      }
      get_admin_campaign_details: { Args: { p_job_id: string }; Returns: Json }
      get_admin_user_stats: { Args: { target_user_id: string }; Returns: Json }
      get_admin_users_summary: { Args: never; Returns: Json }
      get_current_ad_usage: {
        Args: { check_user_id: string }
        Returns: {
          ads_limit: number
          ads_used: number
          is_unlimited: boolean
          period_end: string
          period_start: string
        }[]
      }
      get_plan_ad_limit: { Args: { plan_name: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_ad_usage: {
        Args: { p_ads_count: number; p_user_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_collaborator: { Args: never; Returns: boolean }
      is_team_member_of: { Args: { owner_uuid: string }; Returns: boolean }
      user_is_admin: { Args: { check_user_id: string }; Returns: boolean }
      user_owns_facebook_profile: {
        Args: { profile_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "user" | "admin"
      user_status: "active" | "inactive" | "suspended" | "banned"
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
  public: {
    Enums: {
      app_role: ["user", "admin"],
      user_status: ["active", "inactive", "suspended", "banned"],
    },
  },
} as const
