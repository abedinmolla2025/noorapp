import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://llicfiepatzgllmjhzbw.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseKey) throw new Error("Missing SUPABASE_ANON_KEY env var (M-07: no committed key literal)");

const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
  console.log('--- Production Data Verification Report ---');
  console.log('Project ID: llicfiepatzgllmjhzbw');
  console.log('Timestamp:', new Date().toISOString());
  console.log('-------------------------------------------\n');

  try {
    // 1. Branding/Logo
    const { data: branding, error: brandingErr } = await supabase.from('app_settings').select('*').eq('setting_key', 'branding').single();
    console.log('1. Branding/Logo:', branding ? '✅ Visible' : '❌ Missing');
    if (branding) console.log('   - App Name:', branding.setting_value?.appName);
    if (brandingErr) console.log('   - Error:', brandingErr.message);

    // 2. Stories
    const { count: storiesCount, error: storiesErr } = await supabase.from('admin_content').select('*', { count: 'exact', head: true }).eq('content_type', 'story').eq('status', 'published');
    console.log('2. Stories:', storiesCount > 0 ? `✅ Visible (${storiesCount} items)` : '❌ Missing');
    if (storiesErr) console.log('   - Error:', storiesErr.message);

    // 3. Dua Data
    const { count: duaCount, error: duaErr } = await supabase.from('admin_content').select('*', { count: 'exact', head: true }).eq('content_type', 'dua').eq('status', 'published');
    console.log('3. Dua Data:', duaCount > 0 ? `✅ Visible (${duaCount} items)` : '❌ Missing');
    if (duaErr) console.log('   - Error:', duaErr.message);

    // 4. Hadith Data
    const { count: hadithBooksCount, error: hadithErr } = await supabase.from('hadith_books').select('*', { count: 'exact', head: true });
    console.log('4. Hadith Books:', hadithBooksCount > 0 ? `✅ Visible (${hadithBooksCount} items)` : '❌ Missing');
    if (hadithErr) console.log('   - Error:', hadithErr.message);

    // 5. Admin Security Config
    const { data: adminConfig, error: adminErr } = await supabase.from('admin_security_config').select('id').limit(1);
    console.log('5. Admin Config:', adminConfig && adminConfig.length > 0 ? '✅ Table exists and has data' : '⚠️ Table empty or inaccessible');
    if (adminErr) console.log('   - Error:', adminErr.message);

    // 6. Storage Assets
    const { data: storageData, error: storageErr } = await supabase.storage.from('og-images').list('stories');
    console.log('6. Storage Assets (og-images):', storageData && storageData.length > 0 ? `✅ Visible (${storageData.length} files found)` : '❌ Missing');
    if (storageErr) console.log('   - Error:', storageErr.message);

  } catch (err) {
    console.error('Unexpected error during verification:', err);
  }

  console.log('\n-------------------------------------------');
}

verify();
