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
      creatives: {
        Row: {
          created_at: string
          duration: number | null
          file_path: string
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
        Relationships: []
      }
      facebook_ad_accounts: {
        Row: {
          account_id: string
          business_id: string | null
          business_name: string | null
          created_at: string
          currency: string | null
          id: string
          name: string
          profile_id: string
          status: string | null
          timezone: string | null
        }
        Insert: {
          account_id: string
          business_id?: string | null
          business_name?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          name: string
          profile_id: string
          status?: string | null
          timezone?: string | null
        }
        Update: {
          account_id?: string
          business_id?: string | null
          business_name?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          name?: string
          profile_id?: string
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
          last_synced_at: string | null
          name: string
          page_token_valid: boolean | null
          permissions: string[] | null
          proxy_host: string | null
          proxy_password: string | null
          proxy_port: number | null
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
          last_synced_at?: string | null
          name: string
          page_token_valid?: boolean | null
          permissions?: string[] | null
          proxy_host?: string | null
          proxy_password?: string | null
          proxy_port?: number | null
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
          last_synced_at?: string | null
          name?: string
          page_token_valid?: boolean | null
          permissions?: string[] | null
          proxy_host?: string | null
          proxy_password?: string | null
          proxy_port?: number | null
          proxy_username?: string | null
          status?: string
          sync_status?: string | null
          token_expires_at?: string | null
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
      user_owns_facebook_profile: {
        Args: { profile_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
