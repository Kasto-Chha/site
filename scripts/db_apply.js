#!/usr/bin/env node
try {
  require('dotenv').config();
} catch (e) {}

const { createClient } = require('@supabase/supabase-js');

const seedData = {
  snapshots: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      order: 1,
      kicker: 'DAILY',
      title: 'Daily Snapshot',
      subtitle: 'Quick local signals',
      meta_primary: 'Signal A',
      meta_secondary: 'Signal B',
    },
  ],
  trending_topics: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      rank: 1,
      category: 'Technology',
      title: 'Mobile data price hike',
      description: 'Discussion on recent mobile data price increases',
      badge_label: 'Hot',
      badge_tone: 'positive',
      trend_note: 'up 12%',
      votes_yes: 10,
      votes_no: 2,
      likes: 50,
      comments: 8,
    },
  ],
  popular_topics: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      rank: 1,
      category: 'Finance',
      title: 'Banks increasing fees',
      likes: 150,
      comments: 34,
      sentiment_label: 'Mostly negative',
      sentiment_tone: 'negative',
    },
  ],
  featured_stories: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      slot: 'main',
      title: 'How to save on mobile',
      description: 'Saving tips for Nepali users',
      why_text: 'Important tips and tricks',
      link_url: '/blog/welcome',
      icon: 'star',
    },
  ],
  battles: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      order: 1,
      category: 'Mobile',
      left_title: 'Affordable plans',
      left_desc: 'Cheap but limited',
      left_votes: 10,
      right_title: 'Premium plans',
      right_desc: 'Expensive but reliable',
      right_votes: 5,
    },
  ],
  experiences: [
    {
      id: '66666666-6666-4666-8666-666666666666',
      topic: 'Phone battery life',
      verdict: 'Mixed',
      categories: ['Technology'],
      body: 'Battery dies quickly after heavy use',
      author_name: 'Sita',
      author_initials: 'S',
      user_id: 'user_123',
      love_count: 3,
      reply_count: 0,
    },
  ],
  site_stats: [
    {
      id: '77777777-7777-4777-8777-777777777777',
      order: 1,
      label: 'Total posts',
      value: '1',
    },
  ],
  blog_posts: [
    {
      id: '88888888-8888-4888-8888-888888888888',
      slug: 'welcome',
      title: 'Welcome to KastoChha',
      excerpt: 'Intro to the community',
      content: 'Welcome to KastoChha — share real experiences.',
      status: 'published',
      author_user_id: 'system',
      author_name: 'KastoChha',
      reading_time: 1,
      published_at: new Date().toISOString(),
    },
  ],
  chat_queries: [
    {
      id: '99999999-9999-4999-8999-999999999999',
      query: 'phone battery',
      response: 'Try lowering screen brightness and background refresh.',
      user_id: null,
    },
  ],
};

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing. Add it to .env.local.');
  }

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing. Add it to .env.local.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function tableExists(supabase, tableName) {
  const { error } = await supabase.from(tableName).select('*').limit(1);
  if (!error) {
    return true;
  }

  return !String(error.message || '').toLowerCase().includes('could not find the table');
}

async function insertRows(supabase, tableName, rows) {
  if (!rows.length) {
    return;
  }

  const { error } = await supabase.from(tableName).upsert(rows, { onConflict: 'id' });

  if (error) {
    throw new Error(`${tableName}: ${error.message}`);
  }
}

async function main() {
  const seedOnly = process.argv.includes('--seed-only');
  const supabase = getSupabaseClient();

  const tables = Object.keys(seedData);
  const missingTables = [];

  for (const tableName of tables) {
    const exists = await tableExists(supabase, tableName);
    if (!exists) {
      missingTables.push(tableName);
    }
  }

  if (!seedOnly && missingTables.length) {
    console.error('The following tables are missing in Supabase:');
    for (const tableName of missingTables) {
      console.error(`- ${tableName}`);
    }
    console.error('\nApply the schema from supabase/schema.sql in the Supabase SQL Editor first, then rerun this script.');
    process.exit(1);
  }

  for (const tableName of tables) {
    const rows = seedData[tableName];
    const exists = await tableExists(supabase, tableName);
    if (!exists) {
      console.log(`Skipping missing table: ${tableName}`);
      continue;
    }

    await insertRows(supabase, tableName, rows);
    console.log(`Seeded ${tableName} (${rows.length} row${rows.length === 1 ? '' : 's'})`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
