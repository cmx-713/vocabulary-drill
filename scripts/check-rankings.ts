import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("Fetching classes...");
    const { data: classes } = await supabase.from('classes').select('id, name');
    console.log("Classes:", classes);

    for (const cls of classes || []) {
        console.log(`\n\nClass: ${cls.name} (${cls.id})`);

        const { data: studentsInfo } = await supabase.from('class_students').select('user_id').eq('class_id', cls.id);
        const classUserIds = (studentsInfo || []).map(s => s.user_id);

        if (classUserIds.length === 0) continue;

        const { data: allLearningStates } = await supabase.from('word_learning_states').select('user_id, error_count, total_attempts').in('user_id', classUserIds);

        const studentAccuracies = new Map<string, { attempts: number, errors: number }>();
        classUserIds.forEach(id => studentAccuracies.set(id, { attempts: 0, errors: 0 }));

        (allLearningStates || []).forEach(s => {
            const entry = studentAccuracies.get(s.user_id) || { attempts: 0, errors: 0 };
            entry.attempts += (s.total_attempts || 0);
            entry.errors += (s.error_count || 0);
            studentAccuracies.set(s.user_id, entry);
        });

        const rankedStudents = Array.from(studentAccuracies.entries()).map(([userId, stats]) => {
            const accuracy = stats.attempts > 0 ? ((stats.attempts - stats.errors) / stats.attempts) : 0;
            return { userId, stats, accuracy };
        }).sort((a, b) => b.accuracy - a.accuracy); // Sort descending (best to worst)

        console.log("Ranked Students:");
        rankedStudents.forEach((r, i) => console.log(`${i + 1}. ${r.userId} - Acc: ${r.accuracy.toFixed(2)} (Att: ${r.stats.attempts}, Err: ${r.stats.errors})`));

        const midPoint = Math.ceil(rankedStudents.length / 2);
        const hardGroupIds = rankedStudents.slice(0, midPoint).map(s => s.userId);
        const easyGroupIds = rankedStudents.slice(midPoint).map(s => s.userId);

        console.log(`\nTop 50% (Hard / 挑战版):`, hardGroupIds);
        console.log(`Bottom 50% (Easy / 基础版):`, easyGroupIds);
    }
}

main().catch(console.error);
