export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      dungeon_runs: {
        Row: {
          combat_log: Json;
          created_at: string;
          dungeon_id: string;
          hero_ids: string[];
          id: string;
          player_id: string;
          result: string;
          rewards: Json | null;
          seed: number;
        };
        Insert: {
          combat_log: Json;
          created_at?: string;
          dungeon_id: string;
          hero_ids: string[];
          id?: string;
          player_id: string;
          result: string;
          rewards?: Json | null;
          seed: number;
        };
        Update: {
          combat_log?: Json;
          created_at?: string;
          dungeon_id?: string;
          hero_ids?: string[];
          id?: string;
          player_id?: string;
          result?: string;
          rewards?: Json | null;
          seed?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'dungeon_runs_dungeon_id_fkey';
            columns: ['dungeon_id'];
            isOneToOne: false;
            referencedRelation: 'dungeons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dungeon_runs_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'leaderboard';
            referencedColumns: ['player_id'];
          },
          {
            foreignKeyName: 'dungeon_runs_player_id_fkey';
            columns: ['player_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      dungeons: {
        Row: {
          difficulty: number;
          enemy_config: Json;
          id: string;
          name: string;
        };
        Insert: {
          difficulty: number;
          enemy_config: Json;
          id: string;
          name: string;
        };
        Update: {
          difficulty?: number;
          enemy_config?: Json;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      hero_classes: {
        Row: {
          base_atk: number;
          base_def: number;
          base_hp: number;
          base_speed: number;
          id: string;
          name: string;
        };
        Insert: {
          base_atk: number;
          base_def: number;
          base_hp: number;
          base_speed: number;
          id: string;
          name: string;
        };
        Update: {
          base_atk?: number;
          base_def?: number;
          base_hp?: number;
          base_speed?: number;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      heroes: {
        Row: {
          class_id: string;
          created_at: string;
          equipped_armor_id: string | null;
          equipped_weapon_id: string | null;
          id: string;
          level: number;
          name: string;
          owner_id: string;
          xp: number;
        };
        Insert: {
          class_id: string;
          created_at?: string;
          equipped_armor_id?: string | null;
          equipped_weapon_id?: string | null;
          id?: string;
          level?: number;
          name: string;
          owner_id: string;
          xp?: number;
        };
        Update: {
          class_id?: string;
          created_at?: string;
          equipped_armor_id?: string | null;
          equipped_weapon_id?: string | null;
          id?: string;
          level?: number;
          name?: string;
          owner_id?: string;
          xp?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'heroes_class_id_fkey';
            columns: ['class_id'];
            isOneToOne: false;
            referencedRelation: 'hero_classes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'heroes_equipped_armor_id_fkey';
            columns: ['equipped_armor_id'];
            isOneToOne: false;
            referencedRelation: 'items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'heroes_equipped_weapon_id_fkey';
            columns: ['equipped_weapon_id'];
            isOneToOne: false;
            referencedRelation: 'items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'heroes_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'leaderboard';
            referencedColumns: ['player_id'];
          },
          {
            foreignKeyName: 'heroes_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      items: {
        Row: {
          atk_bonus: number;
          created_at: string;
          def_bonus: number;
          hp_bonus: number;
          id: string;
          item_type: string;
          name: string;
          owner_id: string;
          rarity: string;
        };
        Insert: {
          atk_bonus?: number;
          created_at?: string;
          def_bonus?: number;
          hp_bonus?: number;
          id?: string;
          item_type: string;
          name: string;
          owner_id: string;
          rarity: string;
        };
        Update: {
          atk_bonus?: number;
          created_at?: string;
          def_bonus?: number;
          hp_bonus?: number;
          id?: string;
          item_type?: string;
          name?: string;
          owner_id?: string;
          rarity?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'items_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'leaderboard';
            referencedColumns: ['player_id'];
          },
          {
            foreignKeyName: 'items_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string;
          id: string;
          last_seen_at: string;
        };
        Insert: {
          created_at?: string;
          display_name: string;
          id: string;
          last_seen_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          id?: string;
          last_seen_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      leaderboard: {
        Row: {
          display_name: string | null;
          dungeons_completed: number | null;
          max_difficulty: number | null;
          player_id: string | null;
          total_power: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
