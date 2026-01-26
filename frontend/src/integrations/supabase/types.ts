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
      calendar_blocks: {
        Row: {
          coach_id: string
          created_at: string
          date: string | null
          description: string | null
          end_time: string | null
          id: string
          is_recurring: boolean
          recurrence_rule: Json | null
          start_time: string | null
          title: string | null
          type: Database["public"]["Enums"]["calendar_block_type"]
        }
        Insert: {
          coach_id: string
          created_at?: string
          date?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          is_recurring?: boolean
          recurrence_rule?: Json | null
          start_time?: string | null
          title?: string | null
          type: Database["public"]["Enums"]["calendar_block_type"]
        }
        Update: {
          coach_id?: string
          created_at?: string
          date?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          is_recurring?: boolean
          recurrence_rule?: Json | null
          start_time?: string | null
          title?: string | null
          type?: Database["public"]["Enums"]["calendar_block_type"]
        }
        Relationships: []
      }
      class_instances: {
        Row: {
          coach_id: string
          color: string | null
          created_at: string
          date: string
          end_time: string
          id: string
          level_id: string | null
          max_players: number
          name: string | null
          notes: string | null
          overridden_fields: Json | null
          parent_class_id: string | null
          start_time: string
          status: Database["public"]["Enums"]["class_instance_status"]
          updated_at: string
        }
        Insert: {
          coach_id: string
          color?: string | null
          created_at?: string
          date: string
          end_time: string
          id?: string
          level_id?: string | null
          max_players?: number
          name?: string | null
          notes?: string | null
          overridden_fields?: Json | null
          parent_class_id?: string | null
          start_time: string
          status?: Database["public"]["Enums"]["class_instance_status"]
          updated_at?: string
        }
        Update: {
          coach_id?: string
          color?: string | null
          created_at?: string
          date?: string
          end_time?: string
          id?: string
          level_id?: string | null
          max_players?: number
          name?: string | null
          notes?: string | null
          overridden_fields?: Json | null
          parent_class_id?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["class_instance_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_instances_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "coach_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_instances_parent_class_id_fkey"
            columns: ["parent_class_id"]
            isOneToOne: false
            referencedRelation: "parent_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_levels: {
        Row: {
          coach_id: string
          code: string
          created_at: string
          display_order: number
          id: string
          label: string
        }
        Insert: {
          coach_id: string
          code: string
          created_at?: string
          display_order?: number
          id?: string
          label: string
        }
        Update: {
          coach_id?: string
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          label?: string
        }
        Relationships: []
      }
      coach_players: {
        Row: {
          coach_id: string
          created_at: string
          id: string
          level_id: string | null
          notes: string | null
          side: Database["public"]["Enums"]["player_side"] | null
          player_id: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          id?: string
          level_id?: string | null
          notes?: string | null
          side?: Database["public"]["Enums"]["player_side"] | null
          player_id: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          id?: string
          level_id?: string | null
          notes?: string | null
          side?: Database["public"]["Enums"]["player_side"] | null
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_players_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "coach_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_class_participants: {
        Row: {
          created_at: string
          id: string
          parent_class_id: string
          player_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parent_class_id: string
          player_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parent_class_id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_class_participants_parent_class_id_fkey"
            columns: ["parent_class_id"]
            isOneToOne: false
            referencedRelation: "parent_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_class_participants_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_classes: {
        Row: {
          coach_id: string
          color: string | null
          created_at: string
          default_end_time: string
          default_level_id: string | null
          default_start_time: string
          end_date: string | null
          id: string
          is_recurring: boolean
          max_players: number
          name: string | null
          recurrence_rule: Json | null
          start_date: string
          status: string
          type: Database["public"]["Enums"]["class_type"]
          updated_at: string
        }
        Insert: {
          coach_id: string
          color?: string | null
          created_at?: string
          default_end_time: string
          default_level_id?: string | null
          default_start_time: string
          end_date?: string | null
          id?: string
          is_recurring?: boolean
          max_players?: number
          name?: string | null
          recurrence_rule?: Json | null
          start_date: string
          status?: string
          type: Database["public"]["Enums"]["class_type"]
          updated_at?: string
        }
        Update: {
          coach_id?: string
          color?: string | null
          created_at?: string
          default_end_time?: string
          default_level_id?: string | null
          default_start_time?: string
          end_date?: string | null
          id?: string
          is_recurring?: boolean
          max_players?: number
          name?: string | null
          recurrence_rule?: Json | null
          start_date?: string
          status?: string
          type?: Database["public"]["Enums"]["class_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_classes_default_level_id_fkey"
            columns: ["default_level_id"]
            isOneToOne: false
            referencedRelation: "coach_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      presences: {
        Row: {
          class_instance_id: string
          created_at: string
          id: string
          invited: boolean
          justification:
            | Database["public"]["Enums"]["absence_justification"]
            | null
          status: Database["public"]["Enums"]["presence_status"] | null
          player_id: string
          updated_at: string
          validated: boolean
        }
        Insert: {
          class_instance_id: string
          created_at?: string
          id?: string
          invited?: boolean
          justification?:
            | Database["public"]["Enums"]["absence_justification"]
            | null
          status?: Database["public"]["Enums"]["presence_status"] | null
          player_id: string
          updated_at?: string
          validated?: boolean
        }
        Update: {
          class_instance_id?: string
          created_at?: string
          id?: string
          invited?: boolean
          justification?:
            | Database["public"]["Enums"]["absence_justification"]
            | null
          status?: Database["public"]["Enums"]["presence_status"] | null
          player_id?: string
          updated_at?: string
          validated?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "presences_class_instance_id_fkey"
            columns: ["class_instance_id"]
            isOneToOne: false
            referencedRelation: "class_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presences_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      players: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      absence_justification: "justified" | "unjustified"
      app_role: "coach" | "player"
      calendar_block_type: "break" | "holiday" | "off_work" | "personal"
      class_instance_status: "scheduled" | "canceled" | "completed"
      class_type: "academy" | "private"
      player_side: "left" | "right"
      presence_status: "present" | "absent"
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
      absence_justification: ["justified", "unjustified"],
      app_role: ["coach", "player"],
      calendar_block_type: ["break", "holiday", "off_work", "personal"],
      class_instance_status: ["scheduled", "canceled", "completed"],
      class_type: ["academy", "private"],
      player_side: ["left", "right"],
      presence_status: ["present", "absent"],
    },
  },
} as const
