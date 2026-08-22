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
      admin_ads: {
        Row: {
          ad_code: string
          ad_type: string
          created_at: string
          end_at: string | null
          frequency: number | null
          id: string
          platform: string
          priority: number
          start_at: string | null
          status: string
          title: string
          updated_at: string
          zone: string
        }
        Insert: {
          ad_code: string
          ad_type: string
          created_at?: string
          end_at?: string | null
          frequency?: number | null
          id?: string
          platform?: string
          priority?: number
          start_at?: string | null
          status?: string
          title: string
          updated_at?: string
          zone: string
        }
        Update: {
          ad_code?: string
          ad_type?: string
          created_at?: string
          end_at?: string | null
          frequency?: number | null
          id?: string
          platform?: string
          priority?: number
          start_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          zone?: string
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          metadata: Json | null
          resource_id: string | null
          resource_type: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_content: {
        Row: {
          approval_required: boolean
          approved_at: string | null
          approved_by: string | null
          audio_url: string | null
          authenticity: string | null
          author: string | null
          benefits_bn: string[] | null
          benefits_en: string[] | null
          benefits_hi: string[] | null
          benefits_ur: string[] | null
          category: string | null
          category_hierarchy: Json | null
          content: string | null
          content_arabic: string | null
          content_en: string | null
          content_hi: string | null
          content_pronunciation: string | null
          content_pronunciation_en: string | null
          content_pronunciation_hi: string | null
          content_pronunciation_ur: string | null
          content_type: string
          content_ur: string | null
          created_at: string | null
          created_by: string | null
          current_version_id: string | null
          difficulty: string | null
          emotion: string[] | null
          engagement: Json | null
          explanation_bn: string | null
          explanation_en: string | null
          explanation_hi: string | null
          explanation_ur: string | null
          faq: Json | null
          growth: Json | null
          hadith_reference: string | null
          hook: string | null
          hook_variants: string[] | null
          id: string
          image_url: string | null
          is_featured: boolean
          is_published: boolean | null
          legacy_slug: string | null
          metadata: Json | null
          moral_bn: string | null
          moral_en: string | null
          moral_ur: string | null
          navigation: Json | null
          normalized_surah_names: string[] | null
          og_image_data: Json | null
          og_image_url: string | null
          order_index: number | null
          pdf_url: string | null
          published_at: string | null
          quran_meta: Json | null
          reading_time_minutes: number | null
          recommendation_tags: string[] | null
          recommended_moments: string[] | null
          reference: string | null
          related_duas: string[] | null
          related_stories: string[] | null
          scheduled_at: string | null
          search_aliases: Json | null
          semantic_entities: string[] | null
          seo: Json | null
          share_text: string | null
          slug: string | null
          social: Json | null
          source_detail: string | null
          source_name: string | null
          source_type: string | null
          status: string
          subtitle: string | null
          tags: string[] | null
          time_required: string | null
          title: string
          title_arabic: string | null
          title_en: string | null
          title_hi: string | null
          title_ur: string | null
          updated_at: string | null
          user_intents: string[] | null
          viral_score: number | null
          virtue: string | null
          virtue_reference: string | null
          when_to_recite_bn: string | null
          when_to_recite_en: string | null
          when_to_recite_hi: string | null
          when_to_recite_ur: string | null
        }
        Insert: {
          approval_required?: boolean
          approved_at?: string | null
          approved_by?: string | null
          audio_url?: string | null
          audio_trailer_url?: string | null
          authenticity?: string | null
          author?: string | null
          benefits_bn?: string[] | null
          benefits_en?: string[] | null
          benefits_hi?: string[] | null
          benefits_ur?: string[] | null
          category?: string | null
          category_hierarchy?: Json | null
          content?: string | null
          content_arabic?: string | null
          content_en?: string | null
          content_hi?: string | null
          content_pronunciation?: string | null
          content_pronunciation_en?: string | null
          content_pronunciation_hi?: string | null
          content_pronunciation_ur?: string | null
          content_type: string
          content_ur?: string | null
          created_at?: string | null
          created_by?: string | null
          current_version_id?: string | null
          difficulty?: string | null
          emotion?: string[] | null
          engagement?: Json | null
          explanation_bn?: string | null
          explanation_en?: string | null
          explanation_hi?: string | null
          explanation_ur?: string | null
          faq?: Json | null
          growth?: Json | null
          hadith_reference?: string | null
          hook?: string | null
          hook_variants?: string[] | null
          id?: string
          image_url?: string | null
          is_featured?: boolean
          is_published?: boolean | null
          legacy_slug?: string | null
          metadata?: Json | null
          moral_bn?: string | null
          moral_en?: string | null
          moral_ur?: string | null
          navigation?: Json | null
          normalized_surah_names?: string[] | null
          og_image_data?: Json | null
          og_image_url?: string | null
          order_index?: number | null
          pdf_url?: string | null
          published_at?: string | null
          quran_meta?: Json | null
          reading_time_minutes?: number | null
          recommendation_tags?: string[] | null
          recommended_moments?: string[] | null
          reference?: string | null
          related_duas?: string[] | null
          related_stories?: string[] | null
          scheduled_at?: string | null
          search_aliases?: Json | null
          semantic_entities?: string[] | null
          seo?: Json | null
          share_text?: string | null
          slug?: string | null
          social?: Json | null
          source_detail?: string | null
          source_name?: string | null
          source_type?: string | null
          status?: string
          subtitle?: string | null
          tags?: string[] | null
          time_required?: string | null
          title: string
          title_arabic?: string | null
          title_en?: string | null
          title_hi?: string | null
          title_ur?: string | null
          updated_at?: string | null
          user_intents?: string[] | null
          viral_score?: number | null
          virtue?: string | null
          virtue_reference?: string | null
          when_to_recite_bn?: string | null
          when_to_recite_en?: string | null
          when_to_recite_hi?: string | null
          when_to_recite_ur?: string | null
        }
        Update: {
          approval_required?: boolean
          approved_at?: string | null
          approved_by?: string | null
          audio_url?: string | null
          audio_trailer_url?: string | null
          authenticity?: string | null
          author?: string | null
          benefits_bn?: string[] | null
          benefits_en?: string[] | null
          benefits_hi?: string[] | null
          benefits_ur?: string[] | null
          category?: string | null
          category_hierarchy?: Json | null
          content?: string | null
          content_arabic?: string | null
          content_en?: string | null
          content_hi?: string | null
          content_pronunciation?: string | null
          content_pronunciation_en?: string | null
          content_pronunciation_hi?: string | null
          content_pronunciation_ur?: string | null
          content_type?: string
          content_ur?: string | null
          created_at?: string | null
          created_by?: string | null
          current_version_id?: string | null
          difficulty?: string | null
          emotion?: string[] | null
          engagement?: Json | null
          explanation_bn?: string | null
          explanation_en?: string | null
          explanation_hi?: string | null
          explanation_ur?: string | null
          faq?: Json | null
          growth?: Json | null
          hadith_reference?: string | null
          hook?: string | null
          hook_variants?: string[] | null
          id?: string
          image_url?: string | null
          is_featured?: boolean
          is_published?: boolean | null
          legacy_slug?: string | null
          metadata?: Json | null
          moral_bn?: string | null
          moral_en?: string | null
          moral_ur?: string | null
          navigation?: Json | null
          normalized_surah_names?: string[] | null
          og_image_data?: Json | null
          og_image_url?: string | null
          order_index?: number | null
          pdf_url?: string | null
          published_at?: string | null
          quran_meta?: Json | null
          reading_time_minutes?: number | null
          recommendation_tags?: string[] | null
          recommended_moments?: string[] | null
          reference?: string | null
          related_duas?: string[] | null
          related_stories?: string[] | null
          scheduled_at?: string | null
          search_aliases?: Json | null
          semantic_entities?: string[] | null
          seo?: Json | null
          share_text?: string | null
          slug?: string | null
          social?: Json | null
          source_detail?: string | null
          source_name?: string | null
          source_type?: string | null
          status?: string
          subtitle?: string | null
          tags?: string[] | null
          time_required?: string | null
          title?: string
          title_arabic?: string | null
          title_en?: string | null
          title_hi?: string | null
          title_ur?: string | null
          updated_at?: string | null
          user_intents?: string[] | null
          viral_score?: number | null
          virtue?: string | null
          virtue_reference?: string | null
          when_to_recite_bn?: string | null
          when_to_recite_en?: string | null
          when_to_recite_hi?: string | null
          when_to_recite_ur?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_content_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_content_current_version_id_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_layout_settings: {
        Row: {
          created_at: string
          id: string
          layout_key: string
          order_index: number
          platform: string
          section_key: string
          settings: Json | null
          size: string
          updated_at: string
          visible: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          layout_key: string
          order_index?: number
          platform?: string
          section_key: string
          settings?: Json | null
          size?: string
          updated_at?: string
          visible?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          layout_key?: string
          order_index?: number
          platform?: string
          section_key?: string
          settings?: Json | null
          size?: string
          updated_at?: string
          visible?: boolean
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          badge_url: string | null
          created_at: string | null
          created_by: string | null
          deep_link: string | null
          expires_at: string | null
          icon_url: string | null
          id: string
          image_url: string | null
          message: string
          scheduled_at: string | null
          sent_at: string | null
          status: string | null
          target_platform: string
          target_role: Database["public"]["Enums"]["app_role"] | null
          target_user_ids: string[] | null
          ticker_active: boolean | null
          ticker_style: Json | null
          title: string
        }
        Insert: {
          badge_url?: string | null
          created_at?: string | null
          created_by?: string | null
          deep_link?: string | null
          expires_at?: string | null
          icon_url?: string | null
          id?: string
          image_url?: string | null
          message: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string | null
          target_platform?: string
          target_role?: Database["public"]["Enums"]["app_role"] | null
          target_user_ids?: string[] | null
          ticker_active?: boolean | null
          ticker_style?: Json | null
          title: string
        }
        Update: {
          badge_url?: string | null
          created_at?: string | null
          created_by?: string | null
          deep_link?: string | null
          expires_at?: string | null
          icon_url?: string | null
          id?: string
          image_url?: string | null
          message?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string | null
          target_platform?: string
          target_role?: Database["public"]["Enums"]["app_role"] | null
          target_user_ids?: string[] | null
          ticker_active?: boolean | null
          ticker_style?: Json | null
          title?: string
        }
        Relationships: []
      }
      admin_occasions: {
        Row: {
          card_css: string | null
          container_class_name: string | null
          created_at: string
          css_code: string | null
          display_order: number
          dua_text: string | null
          end_date: string
          html_code: string | null
          id: string
          image_url: string | null
          is_active: boolean
          message: string
          platform: string
          start_date: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          card_css?: string | null
          container_class_name?: string | null
          created_at?: string
          css_code?: string | null
          display_order?: number
          dua_text?: string | null
          end_date: string
          html_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          message: string
          platform?: string
          start_date: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          card_css?: string | null
          container_class_name?: string | null
          created_at?: string
          css_code?: string | null
          display_order?: number
          dua_text?: string | null
          end_date?: string
          html_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          message?: string
          platform?: string
          start_date?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_passcode_history: {
        Row: {
          created_at: string
          id: string
          passcode_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          passcode_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          passcode_hash?: string
        }
        Relationships: []
      }
      admin_passcode_reset_tokens: {
        Row: {
          admin_email: string
          code_hash: string
          code_salt: string | null
          created_at: string
          expires_at: string
          id: string
          ip: string | null
          requested_ip: string | null
          requested_user_id: string | null
          used: boolean
          used_at: string | null
        }
        Insert: {
          admin_email?: string
          code_hash: string
          code_salt?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          ip?: string | null
          requested_ip?: string | null
          requested_user_id?: string | null
          used?: boolean
          used_at?: string | null
        }
        Update: {
          admin_email?: string
          code_hash?: string
          code_salt?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          ip?: string | null
          requested_ip?: string | null
          requested_user_id?: string | null
          used?: boolean
          used_at?: string | null
        }
        Relationships: []
      }
      admin_security_config: {
        Row: {
          admin_email: string
          created_at: string
          id: number
          passcode_hash: string | null
          require_fingerprint: boolean
          updated_at: string
        }
        Insert: {
          admin_email?: string
          created_at?: string
          id?: number
          passcode_hash?: string | null
          require_fingerprint?: boolean
          updated_at?: string
        }
        Update: {
          admin_email?: string
          created_at?: string
          id?: number
          passcode_hash?: string | null
          require_fingerprint?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      admin_unlock_attempts: {
        Row: {
          created_at: string
          device_fingerprint: string | null
          id: string
          ip: string | null
          success: boolean
        }
        Insert: {
          created_at?: string
          device_fingerprint?: string | null
          id?: string
          ip?: string | null
          success?: boolean
        }
        Update: {
          created_at?: string
          device_fingerprint?: string | null
          id?: string
          ip?: string | null
          success?: boolean
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      content_approvals: {
        Row: {
          approved_by: string | null
          content_id: string
          created_at: string
          id: string
          reason: string | null
          requested_by: string
          status: string
          updated_at: string
          version_id: string | null
        }
        Insert: {
          approved_by?: string | null
          content_id: string
          created_at?: string
          id?: string
          reason?: string | null
          requested_by: string
          status: string
          updated_at?: string
          version_id?: string | null
        }
        Update: {
          approved_by?: string | null
          content_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          requested_by?: string
          status?: string
          updated_at?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_approvals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_approvals_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "admin_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_approvals_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_approvals_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      content_review_comments: {
        Row: {
          actor_id: string
          comment: string
          content_id: string
          created_at: string
          id: string
        }
        Insert: {
          actor_id: string
          comment: string
          content_id: string
          created_at?: string
          id?: string
        }
        Update: {
          actor_id?: string
          comment?: string
          content_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_review_comments_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "admin_content"
            referencedColumns: ["id"]
          },
        ]
      }
      content_versions: {
        Row: {
          change_summary: string | null
          content: string | null
          content_arabic: string | null
          content_id: string
          created_at: string
          created_by: string
          id: string
          metadata: Json | null
          title: string
          title_arabic: string | null
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          content?: string | null
          content_arabic?: string | null
          content_id: string
          created_at?: string
          created_by: string
          id?: string
          metadata?: Json | null
          title: string
          title_arabic?: string | null
          version_number: number
        }
        Update: {
          change_summary?: string | null
          content?: string | null
          content_arabic?: string | null
          content_id?: string
          created_at?: string
          created_by?: string
          id?: string
          metadata?: Json | null
          title?: string
          title_arabic?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_versions_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "admin_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      device_push_tokens: {
        Row: {
          created_at: string
          device_id: string
          enabled: boolean
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_id: string
          enabled?: boolean
          id?: string
          platform?: string
          token: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string
          enabled?: boolean
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      hadith_books: {
        Row: {
          author: string | null
          author_bn: string | null
          created_at: string
          description: string | null
          description_bn: string | null
          display_order: number
          id: string
          is_active: boolean
          title: string
          title_ar: string | null
          title_bn: string | null
          total_chapters: number
          total_hadiths: number
        }
        Insert: {
          author?: string | null
          author_bn?: string | null
          created_at?: string
          description?: string | null
          description_bn?: string | null
          display_order?: number
          id: string
          is_active?: boolean
          title: string
          title_ar?: string | null
          title_bn?: string | null
          total_chapters?: number
          total_hadiths?: number
        }
        Update: {
          author?: string | null
          author_bn?: string | null
          created_at?: string
          description?: string | null
          description_bn?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          title?: string
          title_ar?: string | null
          title_bn?: string | null
          total_chapters?: number
          total_hadiths?: number
        }
        Relationships: []
      }
      hadith_chapters: {
        Row: {
          book_id: string
          chapter_number: number
          created_at: string
          hadith_count: number
          id: string
          title: string
          title_ar: string | null
          title_bn: string | null
        }
        Insert: {
          book_id: string
          chapter_number: number
          created_at?: string
          hadith_count?: number
          id?: string
          title: string
          title_ar?: string | null
          title_bn?: string | null
        }
        Update: {
          book_id?: string
          chapter_number?: number
          created_at?: string
          hadith_count?: number
          id?: string
          title?: string
          title_ar?: string | null
          title_bn?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hadith_chapters_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "hadith_books"
            referencedColumns: ["id"]
          },
        ]
      }
      hadiths: {
        Row: {
          arabic: string
          bengali: string | null
          book_key: string
          chapter_id: number
          created_at: string
          english: string | null
          explanation_bn: string | null
          hadith_number: number
          hindi: string | null
          id: string
          lessons_bn: string[] | null
          slug: string | null
          topic_bn: string | null
          updated_at: string
          urdu: string | null
        }
        Insert: {
          arabic: string
          bengali?: string | null
          book_key?: string
          chapter_id: number
          created_at?: string
          english?: string | null
          explanation_bn?: string | null
          hadith_number: number
          hindi?: string | null
          id: string
          lessons_bn?: string[] | null
          slug?: string | null
          topic_bn?: string | null
          updated_at?: string
          urdu?: string | null
        }
        Update: {
          arabic?: string
          bengali?: string | null
          book_key?: string
          chapter_id?: number
          created_at?: string
          english?: string | null
          explanation_bn?: string | null
          hadith_number?: number
          hindi?: string | null
          id?: string
          lessons_bn?: string[] | null
          slug?: string | null
          topic_bn?: string | null
          updated_at?: string
          urdu?: string | null
        }
        Relationships: []
      }
      notification_deliveries: {
        Row: {
          browser: string | null
          created_at: string
          endpoint_host: string | null
          error_code: string | null
          error_message: string | null
          id: string
          notification_id: string
          platform: string
          provider_message_id: string | null
          stage: string | null
          status: string
          subscription_endpoint: string | null
          token_id: string
        }
        Insert: {
          browser?: string | null
          created_at?: string
          endpoint_host?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          notification_id: string
          platform: string
          provider_message_id?: string | null
          stage?: string | null
          status?: string
          subscription_endpoint?: string | null
          token_id: string
        }
        Update: {
          browser?: string | null
          created_at?: string
          endpoint_host?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          notification_id?: string
          platform?: string
          provider_message_id?: string | null
          stage?: string | null
          status?: string
          subscription_endpoint?: string | null
          token_id?: string
        }
        Relationships: []
      }
      page_visits: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          created_at: string
          device_type: string | null
          id: string
          language: string | null
          os: string | null
          page_title: string | null
          path: string
          referrer: string | null
          referrer_source: string | null
          region: string | null
          session_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          language?: string | null
          os?: string | null
          page_title?: string | null
          path: string
          referrer?: string | null
          referrer_source?: string | null
          region?: string | null
          session_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          language?: string | null
          os?: string | null
          page_title?: string | null
          path?: string
          referrer?: string | null
          referrer_source?: string | null
          region?: string | null
          session_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      prayer_notification_log: {
        Row: {
          created_at: string
          id: string
          notification_id: string | null
          prayer_date: string
          prayer_name: string
          prayer_time: string
          preference_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notification_id?: string | null
          prayer_date: string
          prayer_name: string
          prayer_time: string
          preference_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notification_id?: string | null
          prayer_date?: string
          prayer_name?: string
          prayer_time?: string
          preference_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prayer_notification_log_preference_id_fkey"
            columns: ["preference_id"]
            isOneToOne: false
            referencedRelation: "user_notification_preferences"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      quiz_questions: {
        Row: {
          category: string
          correct_answer: number
          created_at: string
          difficulty: string
          id: string
          is_active: boolean
          options: string[]
          options_bn: string[] | null
          options_en: string[] | null
          order_index: number
          question: string
          question_bn: string | null
          question_en: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          correct_answer?: number
          created_at?: string
          difficulty?: string
          id?: string
          is_active?: boolean
          options?: string[]
          options_bn?: string[] | null
          options_en?: string[] | null
          order_index?: number
          question: string
          question_bn?: string | null
          question_en?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          correct_answer?: number
          created_at?: string
          difficulty?: string
          id?: string
          is_active?: boolean
          options?: string[]
          options_bn?: string[] | null
          options_en?: string[] | null
          order_index?: number
          question?: string
          question_bn?: string | null
          question_en?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      role_capabilities: {
        Row: {
          allowed: boolean
          capability: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          allowed?: boolean
          capability: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          allowed?: boolean
          capability?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      seo_index_log: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          status_code: number | null
          success: boolean | null
          target_url: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json | null
          status_code?: number | null
          success?: boolean | null
          target_url?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          status_code?: number | null
          success?: boolean | null
          target_url?: string | null
        }
        Relationships: []
      }
      seo_pages: {
        Row: {
          canonical_url: string | null
          changefreq: string | null
          created_at: string
          description: string | null
          id: string
          json_ld: Json | null
          og_image_url: string | null
          path: string
          priority: number | null
          robots: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          canonical_url?: string | null
          changefreq?: string | null
          created_at?: string
          description?: string | null
          id?: string
          json_ld?: Json | null
          og_image_url?: string | null
          path: string
          priority?: number | null
          robots?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          canonical_url?: string | null
          changefreq?: string | null
          created_at?: string
          description?: string | null
          id?: string
          json_ld?: Json | null
          og_image_url?: string | null
          path?: string
          priority?: number | null
          robots?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_activity: {
        Row: {
          activity_data: Json | null
          activity_type: string
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          activity_data?: Json | null
          activity_type: string
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          activity_data?: Json | null
          activity_type?: string
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_mfa_settings: {
        Row: {
          created_at: string
          id: string
          is_mfa_enabled: boolean
          method: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_mfa_enabled?: boolean
          method?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_mfa_enabled?: boolean
          method?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_notification_preferences: {
        Row: {
          calculation_method: string
          created_at: string
          device_id: string
          enabled: boolean
          enabled_prayers: Json
          id: string
          latitude: number
          longitude: number
          notification_offset: number
          timezone: string
          updated_at: string
        }
        Insert: {
          calculation_method?: string
          created_at?: string
          device_id: string
          enabled?: boolean
          enabled_prayers?: Json
          id?: string
          latitude?: number
          longitude?: number
          notification_offset?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          calculation_method?: string
          created_at?: string
          device_id?: string
          enabled?: boolean
          enabled_prayers?: Json
          id?: string
          latitude?: number
          longitude?: number
          notification_offset?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_analytics_alltime_totals: {
        Args: never
        Returns: {
          total_views: number
          unique_visitors: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_recent_admin_passcode: {
        Args: { _limit?: number; _passcode: string }
        Returns: boolean
      }
      set_admin_passcode: { Args: { new_passcode: string }; Returns: boolean }
      slugify: { Args: { input: string }; Returns: string }
      update_admin_passcode: {
        Args: { new_passcode: string }
        Returns: boolean
      }
      verify_admin_passcode: {
        Args: { _device_fingerprint: string; _passcode: string }
        Returns: {
          locked_until: string
          ok: boolean
          reason: string
        }[]
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "editor" | "user"
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
      app_role: ["super_admin", "admin", "editor", "user"],
    },
  },
} as const
