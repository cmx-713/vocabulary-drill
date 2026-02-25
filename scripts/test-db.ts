import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data, error } = await supabase.from('user_progress').insert({
        user_id: 'cathy',
        real_name: 'cathy',
        class_id: null,
        total_games_played: 0,
        perfect_scores: 0,
        current_streak: 0,
        last_practice_date: null,
        unlocked_achievement_ids: []
    });
    console.log('Data:', data);
    console.log('Error:', error);
}

run();
