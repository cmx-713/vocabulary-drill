import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// read .env
const envPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value) {
        envVars[key.trim()] = value.join('=').trim();
    }
});

const supabaseUrl = envVars['VITE_SUPABASE_URL'] || '';
const supabaseKey = envVars['VITE_SUPABASE_ANON_KEY'] || '';

const supabase = createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'lexitrack' }
});

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
    console.log('--- INSERT RESULT ---');
    console.log('Data:', data);
    console.log('Error:', error);
}

run();
