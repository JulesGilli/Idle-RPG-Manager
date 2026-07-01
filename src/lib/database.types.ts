export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      deployments: {
        Row: {
          blocked: boolean;
          clears_count: number;
          created_at: string;
          hero_ids: string[];
          id: string;
          last_combat: Json | null;
          last_fights: number;
          last_losses: number;
          last_resolved_at: string;
          last_wins: number;
          level_id: string;
          mode: string;
          player_id: string;
        };
        Insert: {
          blocked?: boolean;
          clears_count?: number;
          created_at?: string;
          hero_ids: string[];
          id?: string;
          last_combat?: Json | null;
          last_fights?: number;
          last_losses?: number;
          last_resolved_at?: string;
          last_wins?: number;
          level_id: string;
          mode?: string;
          player_id: string;
        };
        Update: {
          blocked?: boolean;
          clears_count?: number;
          created_at?: string;
          hero_ids?: string[];
          id?: string;
          last_combat?: Json | null;
          last_fights?: number;
          last_losses?: number;
          last_resolved_at?: string;
          last_wins?: number;
          level_id?: string;
          mode?: string;
          player_id?: string;
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
          weight: string;
        };
        Insert: {
          base_atk: number;
          base_def: number;
          base_hp: number;
          base_speed: number;
          id: string;
          name: string;
          weight?: string;
        };
        Update: {
          base_atk?: number;
          base_def?: number;
          base_hp?: number;
          base_speed?: number;
          id?: string;
          name?: string;
          weight?: string;
        };
        Relationships: [];
      };
      heroes: {
        Row: {
          alloc_atk: number;
          alloc_def: number;
          alloc_hp: number;
          alloc_speed: number;
          class_id: string;
          created_at: string;
          equipped_armor_id: string | null;
          equipped_jewel_id: string | null;
          equipped_relic_id: string | null;
          equipped_weapon_id: string | null;
          id: string;
          level: number;
          name: string;
          owner_id: string;
          stat_points: number;
          xp: number;
        };
        Insert: {
          alloc_atk?: number;
          alloc_def?: number;
          alloc_hp?: number;
          alloc_speed?: number;
          class_id: string;
          created_at?: string;
          equipped_armor_id?: string | null;
          equipped_jewel_id?: string | null;
          equipped_relic_id?: string | null;
          equipped_weapon_id?: string | null;
          id?: string;
          level?: number;
          name: string;
          owner_id: string;
          stat_points?: number;
          xp?: number;
        };
        Update: {
          alloc_atk?: number;
          alloc_def?: number;
          alloc_hp?: number;
          alloc_speed?: number;
          class_id?: string;
          created_at?: string;
          equipped_armor_id?: string | null;
          equipped_jewel_id?: string | null;
          equipped_relic_id?: string | null;
          equipped_weapon_id?: string | null;
          id?: string;
          level?: number;
          name?: string;
          owner_id?: string;
          stat_points?: number;
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
            foreignKeyName: 'heroes_equipped_jewel_id_fkey';
            columns: ['equipped_jewel_id'];
            isOneToOne: false;
            referencedRelation: 'items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'heroes_equipped_relic_id_fkey';
            columns: ['equipped_relic_id'];
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
          locked: boolean;
          name: string;
          owner_id: string;
          rarity: string;
          weight: string | null;
        };
        Insert: {
          atk_bonus?: number;
          created_at?: string;
          def_bonus?: number;
          hp_bonus?: number;
          id?: string;
          item_type: string;
          locked?: boolean;
          name: string;
          owner_id: string;
          rarity: string;
          weight?: string | null;
        };
        Update: {
          atk_bonus?: number;
          created_at?: string;
          def_bonus?: number;
          hp_bonus?: number;
          id?: string;
          item_type?: string;
          locked?: boolean;
          name?: string;
          owner_id?: string;
          rarity?: string;
          weight?: string | null;
        };
        Relationships: [];
      };
      level_progress: {
        Row: {
          cleared_at: string;
          level_id: string;
          player_id: string;
        };
        Insert: {
          cleared_at?: string;
          level_id: string;
          player_id: string;
        };
        Update: {
          cleared_at?: string;
          level_id?: string;
          player_id?: string;
        };
        Relationships: [];
      };
      levels: {
        Row: {
          difficulty: number;
          enemy_config: Json;
          id: string;
          is_boss: boolean;
          level_index: number;
          map_id: string;
          name: string;
        };
        Insert: {
          difficulty: number;
          enemy_config: Json;
          id: string;
          is_boss?: boolean;
          level_index: number;
          map_id: string;
          name: string;
        };
        Update: {
          difficulty?: number;
          enemy_config?: Json;
          id?: string;
          is_boss?: boolean;
          level_index?: number;
          map_id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'levels_map_id_fkey';
            columns: ['map_id'];
            isOneToOne: false;
            referencedRelation: 'maps';
            referencedColumns: ['id'];
          },
        ];
      };
      maps: {
        Row: {
          accent: string;
          boss_resource: string;
          id: string;
          name: string;
          resource: string;
          sort: number;
          theme: string;
        };
        Insert: {
          accent?: string;
          boss_resource?: string;
          id: string;
          name: string;
          resource?: string;
          sort: number;
          theme?: string;
        };
        Update: {
          accent?: string;
          boss_resource?: string;
          id?: string;
          name?: string;
          resource?: string;
          sort?: number;
          theme?: string;
        };
        Relationships: [];
      };
      player_resources: {
        Row: {
          amount: number;
          player_id: string;
          resource: string;
        };
        Insert: {
          amount?: number;
          player_id: string;
          resource: string;
        };
        Update: {
          amount?: number;
          player_id?: string;
          resource?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string;
          gold: number;
          id: string;
          last_seen_at: string;
        };
        Insert: {
          created_at?: string;
          display_name: string;
          gold?: number;
          id: string;
          last_seen_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          gold?: number;
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
          gold: number | null;
          levels_cleared: number | null;
          max_difficulty: number | null;
          player_id: string | null;
          total_power: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      allocate_stat: {
        Args: { p_hero_id: string; p_stat: string };
        Returns: undefined;
      };
      delete_items: { Args: { p_item_ids: string[] }; Returns: number };
      equip_item: {
        Args: { p_hero_id: string; p_item_id: string; p_slot: string };
        Returns: undefined;
      };
      set_item_lock: {
        Args: { p_item_ids: string[]; p_locked: boolean };
        Returns: undefined;
      };
      unequip_item: {
        Args: { p_hero_id: string; p_slot: string };
        Returns: undefined;
      };
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
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
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
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
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
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
