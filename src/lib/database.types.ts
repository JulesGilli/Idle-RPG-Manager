export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      deployments: {
        Row: {
          arc: number;
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
          arc?: number;
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
          arc?: number;
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
      team_presets: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          hero_ids: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          hero_ids?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          hero_ids?: string[];
          created_at?: string;
        };
        Relationships: [];
      };
      dungeon_runs: {
        Row: {
          created_at: string;
          dungeon_type_id: string;
          hero_ids: string[];
          id: string;
          player_id: string;
          reached_index: number;
          result: Json;
          seed: number;
          success: boolean;
        };
        Insert: {
          created_at?: string;
          dungeon_type_id: string;
          hero_ids: string[];
          id?: string;
          player_id: string;
          reached_index: number;
          result: Json;
          seed: number;
          success: boolean;
        };
        Update: {
          created_at?: string;
          dungeon_type_id?: string;
          hero_ids?: string[];
          id?: string;
          player_id?: string;
          reached_index?: number;
          result?: Json;
          seed?: number;
          success?: boolean;
        };
        Relationships: [];
      };
      dungeon_types: {
        Row: {
          boss_index: number;
          id: string;
          loot_table_boss: Json;
          loot_table_miniboss: Json;
          loot_table_normal: Json;
          miniboss_indices: number[];
          monster_sequence: Json;
          name: string;
          regen_pct_between_fights: number;
          tier: number;
        };
        Insert: {
          boss_index: number;
          id: string;
          loot_table_boss?: Json;
          loot_table_miniboss?: Json;
          loot_table_normal?: Json;
          miniboss_indices?: number[];
          monster_sequence: Json;
          name: string;
          regen_pct_between_fights?: number;
          tier?: number;
        };
        Update: {
          boss_index?: number;
          id?: string;
          loot_table_boss?: Json;
          loot_table_miniboss?: Json;
          loot_table_normal?: Json;
          miniboss_indices?: number[];
          monster_sequence?: Json;
          name?: string;
          regen_pct_between_fights?: number;
          tier?: number;
        };
        Relationships: [];
      };
      class_tower_progress: {
        Row: {
          player_id: string;
          class_id: string;
          best_floor: number;
          arc: number;
          updated_at: string;
        };
        Insert: {
          player_id: string;
          class_id: string;
          best_floor?: number;
          arc?: number;
          updated_at?: string;
        };
        Update: {
          player_id?: string;
          class_id?: string;
          best_floor?: number;
          arc?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      tower_progress: {
        Row: {
          player_id: string;
          best_floor: number;
          updated_at: string;
        };
        Insert: {
          player_id: string;
          best_floor?: number;
          updated_at?: string;
        };
        Update: {
          player_id?: string;
          best_floor?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      tower_runs: {
        Row: {
          created_at: string;
          from_floor: number;
          hero_id: string;
          id: string;
          player_id: string;
          reached_floor: number;
          result: Json;
          seed: number;
        };
        Insert: {
          created_at?: string;
          from_floor: number;
          hero_id: string;
          id?: string;
          player_id: string;
          reached_floor: number;
          result: Json;
          seed: number;
        };
        Update: {
          created_at?: string;
          from_floor?: number;
          hero_id?: string;
          id?: string;
          player_id?: string;
          reached_floor?: number;
          result?: Json;
          seed?: number;
        };
        Relationships: [];
      };
      expedition_types: {
        Row: {
          id: string;
          name: string;
          min_level_required: number;
          duration_base_seconds: number;
          loot_table: Json;
        };
        Insert: {
          id: string;
          name: string;
          min_level_required: number;
          duration_base_seconds: number;
          loot_table?: Json;
        };
        Update: {
          id?: string;
          name?: string;
          min_level_required?: number;
          duration_base_seconds?: number;
          loot_table?: Json;
        };
        Relationships: [];
      };
      expedition_runs: {
        Row: {
          id: string;
          player_id: string;
          expedition_type_id: string;
          hero_ids: string[];
          seed: number;
          started_at: string;
          ends_at: string;
          status: string;
          claimed_at: string | null;
        };
        Insert: {
          id?: string;
          player_id: string;
          expedition_type_id: string;
          hero_ids: string[];
          seed: number;
          started_at?: string;
          ends_at: string;
          status?: string;
          claimed_at?: string | null;
        };
        Update: {
          id?: string;
          player_id?: string;
          expedition_type_id?: string;
          hero_ids?: string[];
          seed?: number;
          started_at?: string;
          ends_at?: string;
          status?: string;
          claimed_at?: string | null;
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
          bonus_atk: number;
          bonus_def: number;
          bonus_hp: number;
          bonus_speed: number;
          active_skill_id: string | null;
          ultimate_skill_id: string | null;
          awakened: boolean;
          rune_id: string | null;
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
          skill_points: number;
          skills: Json;
          stat_points: number;
          xp: number;
        };
        Insert: {
          alloc_atk?: number;
          alloc_def?: number;
          alloc_hp?: number;
          alloc_speed?: number;
          bonus_atk?: number;
          bonus_def?: number;
          bonus_hp?: number;
          bonus_speed?: number;
          active_skill_id?: string | null;
          ultimate_skill_id?: string | null;
          awakened?: boolean;
          rune_id?: string | null;
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
          skill_points?: number;
          skills?: Json;
          stat_points?: number;
          xp?: number;
        };
        Update: {
          alloc_atk?: number;
          alloc_def?: number;
          alloc_hp?: number;
          alloc_speed?: number;
          bonus_atk?: number;
          bonus_def?: number;
          bonus_hp?: number;
          bonus_speed?: number;
          active_skill_id?: string | null;
          ultimate_skill_id?: string | null;
          awakened?: boolean;
          rune_id?: string | null;
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
          skill_points?: number;
          skills?: Json;
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
          base_atk_bonus: number;
          base_def_bonus: number;
          base_hp_bonus: number;
          base_passive_value: number;
          created_at: string;
          def_bonus: number;
          hp_bonus: number;
          id: string;
          item_type: string;
          locked: boolean;
          name: string;
          owner_id: string;
          passive_type: string | null;
          passive_value: number;
          rarity: string;
          set_id: string | null;
          tier: number;
          upgrade_level: number;
          upgrade_fails: number;
          blessing_level: number;
          weight: string | null;
        };
        Insert: {
          atk_bonus?: number;
          base_atk_bonus?: number;
          base_def_bonus?: number;
          base_hp_bonus?: number;
          base_passive_value?: number;
          created_at?: string;
          def_bonus?: number;
          hp_bonus?: number;
          id?: string;
          item_type: string;
          locked?: boolean;
          name: string;
          owner_id: string;
          passive_type?: string | null;
          passive_value?: number;
          rarity: string;
          set_id?: string | null;
          tier?: number;
          upgrade_level?: number;
          upgrade_fails?: number;
          blessing_level?: number;
          weight?: string | null;
        };
        Update: {
          atk_bonus?: number;
          base_atk_bonus?: number;
          base_def_bonus?: number;
          base_hp_bonus?: number;
          base_passive_value?: number;
          created_at?: string;
          def_bonus?: number;
          hp_bonus?: number;
          id?: string;
          item_type?: string;
          locked?: boolean;
          name?: string;
          owner_id?: string;
          passive_type?: string | null;
          passive_value?: number;
          rarity?: string;
          set_id?: string | null;
          tier?: number;
          upgrade_level?: number;
          upgrade_fails?: number;
          blessing_level?: number;
          weight?: string | null;
        };
        Relationships: [];
      };
      level_progress: {
        Row: {
          arc: number;
          cleared_at: string;
          level_id: string;
          player_id: string;
        };
        Insert: {
          arc?: number;
          cleared_at?: string;
          level_id: string;
          player_id: string;
        };
        Update: {
          arc?: number;
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
          max_rarity: string;
          name: string;
          resource: string;
          sort: number;
          theme: string;
        };
        Insert: {
          accent?: string;
          boss_resource?: string;
          id: string;
          max_rarity?: string;
          name: string;
          resource?: string;
          sort: number;
          theme?: string;
        };
        Update: {
          accent?: string;
          boss_resource?: string;
          id?: string;
          max_rarity?: string;
          name?: string;
          resource?: string;
          sort?: number;
          theme?: string;
        };
        Relationships: [];
      };
      player_arc: {
        Row: {
          player_id: string;
          current_arc: number;
          max_arc: number;
        };
        Insert: {
          player_id: string;
          current_arc?: number;
          max_arc?: number;
        };
        Update: {
          player_id?: string;
          current_arc?: number;
          max_arc?: number;
        };
        Relationships: [];
      };
      arc_world: {
        Row: {
          arc: number;
          opened: boolean;
        };
        Insert: {
          arc: number;
          opened?: boolean;
        };
        Update: {
          arc?: number;
          opened?: boolean;
        };
        Relationships: [];
      };
      player_resources: {
        Row: {
          amount: number;
          player_id: string;
          resource: string;
          tier: number;
        };
        Insert: {
          amount?: number;
          player_id: string;
          resource: string;
          tier?: number;
        };
        Update: {
          amount?: number;
          player_id?: string;
          resource?: string;
          tier?: number;
        };
        Relationships: [];
      };
      runes: {
        Row: {
          id: string;
          owner_id: string;
          set_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          set_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          set_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          account_xp: number;
          created_at: string;
          display_name: string;
          gold: number;
          id: string;
          last_seen_at: string;
          has_lost: boolean;
          name_changes: number;
          pseudo_chosen: boolean;
          tuto_done: boolean;
          expedition_xp: number;
          forge_xp: number;
          jewel_xp: number;
          relic_xp: number;
        };
        Insert: {
          account_xp?: number;
          created_at?: string;
          display_name: string;
          gold?: number;
          id: string;
          last_seen_at?: string;
          has_lost?: boolean;
          name_changes?: number;
          pseudo_chosen?: boolean;
          tuto_done?: boolean;
          expedition_xp?: number;
          forge_xp?: number;
          jewel_xp?: number;
          relic_xp?: number;
        };
        Update: {
          account_xp?: number;
          created_at?: string;
          display_name?: string;
          gold?: number;
          id?: string;
          last_seen_at?: string;
          has_lost?: boolean;
          name_changes?: number;
          pseudo_chosen?: boolean;
          tuto_done?: boolean;
          expedition_xp?: number;
          forge_xp?: number;
          jewel_xp?: number;
          relic_xp?: number;
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
      rename_hero: {
        Args: { p_hero_id: string; p_name: string };
        Returns: undefined;
      };
      record_defeat: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      release_info: {
        Args: Record<string, never>;
        Returns: {
          release_at: string | null;
          server_now: string;
          version: string | null;
          title: string | null;
          locked: boolean;
          is_admin: boolean;
        }[];
      };
      reset_hero_skills: {
        Args: { p_hero_id: string };
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
