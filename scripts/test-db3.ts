import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

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
    const { data, error } = await supabase.from('user_progress').select('*').ilike('user_id', '%cathy%');
    console.log(`Found ${data?.length} records matching cathy`);
    console.dir(data, { depth: null });
    if (error) console.error(error);
}

run();
