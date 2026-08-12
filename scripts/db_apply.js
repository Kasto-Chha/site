#!/usr/bin/env node
try {
  require('dotenv').config();
} catch (e) {}

const { createClient } = require('@supabase/supabase-js');

const seedData = {
  trending_topics: [
    {
      id: '22222222-2222-4222-8222-222222222221',
      rank: 1,
      category: 'Technology',
      title: 'Mobile data price hike kasto chha?',
      description: 'NTC ra Ncell ko price increase — worth it ki overpriced? Vote garnus.',
      badge_label: 'Hot',
      badge_tone: 'positive',
      trend_note: 'up 12%',
      votes_yes: 11,
      votes_mid: 5,
      votes_no: 2,
      likes: 50,
      comments: 8,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      rank: 2,
      category: 'Finance',
      title: 'IPO parne chance kasto chha?',
      description: 'Naya IPO haru lai apply garnu parne ki nai? Community ko anubhav.',
      badge_label: 'Trending',
      badge_tone: 'neutral',
      trend_note: 'up 8%',
      votes_yes: 24,
      votes_mid: 12,
      votes_no: 5,
      likes: 64,
      comments: 12,
    },
    {
      id: '22222222-2222-4222-8222-222222222223',
      rank: 3,
      category: 'Auto',
      title: 'BYD ko gaadi kasto chha?',
      description: 'EV ko craze badhdai cha — Nepal ko road ma worth cha? Owners bol.',
      badge_label: 'New',
      badge_tone: 'positive',
      trend_note: 'up 21%',
      votes_yes: 18,
      votes_mid: 9,
      votes_no: 7,
      likes: 41,
      comments: 9,
    },
  ],
  featured_stories: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      slot: 'main',
      title: 'How to save on mobile',
      description: 'Saving tips for Nepali users',
      why_text: 'Important tips and tricks',
      link_url: '/trending',
      icon: 'star',
    },
  ],
  battles: [
    {
      id: '55555555-5555-4555-8555-555555555551',
      order: 1,
      category: 'Soft Drink',
      left_title: 'Coca-Cola',
      left_desc: 'Classic taste, sabai le manparaune',
      left_votes: 5220,
      left_color: '#c8102e',
      right_title: 'Pepsi',
      right_desc: 'Sweeter, younger crowd ko choice',
      right_votes: 3200,
      right_color: '#1f5fae',
    },
    {
      id: '55555555-5555-4555-8555-555555555552',
      order: 2,
      category: 'Phones',
      left_title: 'iPhone',
      left_desc: 'Premium ra resale value ramro',
      left_votes: 4540,
      left_color: '#2b2b30',
      right_title: 'Galaxy',
      right_desc: 'Features ra value for money',
      right_votes: 3870,
      right_color: '#3a3340',
    },
  ],
  reviews: [
    {
      id: '66666666-6666-4666-8666-666666666661',
      category: 'Career',
      topic: 'Freelancing Nepal',
      topic_slug: 'freelancing-nepal',
      title: 'Freelancing Nepal ma kasto chha?',
      summary: '3 barsa gareko chu. Income ramro tara inconsistent — client finding gaaro.',
      verdict: 'Thikai chha',
      upvotes: 42,
      downvotes: 0,
      author_name: 'Rojan',
      comment_count: 12,
      user_id: 'user_201',
    },
    {
      id: '66666666-6666-4666-8666-666666666662',
      category: 'Housing',
      topic: 'Kathmandu rent',
      topic_slug: 'kathmandu-rent',
      title: 'Kathmandu rent kasto chha?',
      summary: 'Boudha area chai expensive. 1BHK Rs 18,000 maathi — Kirtipur ma sasto.',
      verdict: 'Naramro chha',
      upvotes: 31,
      downvotes: 0,
      author_name: 'Pratik',
      comment_count: 5,
      user_id: 'user_202',
    },
    {
      id: '66666666-6666-4666-8666-666666666663',
      category: 'Education',
      topic: '+2 pachi',
      topic_slug: 'plus-two-pachi',
      title: '+2 pachi k garne best ho?',
      summary: 'Science liye tara engineering mann chhaina. Switch garne ki abroad?',
      verdict: 'Thikai chha',
      upvotes: 27,
      downvotes: 0,
      author_name: 'Bibek',
      comment_count: 8,
      user_id: 'user_203',
    },
    {
      id: '66666666-6666-4666-8666-666666666664',
      category: 'Finance',
      topic: 'eSewa vs Khalti',
      topic_slug: 'esewa-vs-khalti',
      title: 'eSewa vs Khalti kun use garne?',
      summary: 'Cashback Khalti ma ramro tara eSewa reliable. Daily use ko lagi eSewa.',
      verdict: 'Ramro chha',
      upvotes: 36,
      downvotes: 0,
      author_name: 'Sneha',
      comment_count: 9,
      user_id: 'user_204',
    },
    {
      id: '66666666-6666-4666-8666-666666666665',
      category: 'Food',
      topic: 'Sandar momo',
      topic_slug: 'sandar-momo',
      title: 'Sandar ko momo kasto chha?',
      summary: 'Honest bhannu parda overhyped. Local thau ma sasto ra mitho paaucha.',
      verdict: 'Thikai chha',
      upvotes: 22,
      downvotes: 0,
      author_name: 'Niraj',
      comment_count: 6,
      user_id: 'user_205',
    },
    {
      id: '66666666-6666-4666-8666-666666666666',
      category: 'Technology',
      topic: 'Pathao job',
      topic_slug: 'pathao-job',
      title: 'Pathao job kasto chha?',
      summary: 'Part-time ramro side income. Fuel ra wear-tear calculate garnu jaruri.',
      verdict: 'Ramro chha',
      upvotes: 19,
      downvotes: 0,
      author_name: 'Aakash',
      comment_count: 7,
      user_id: 'user_206',
    },
  ],
  // video_url is an embeddable placeholder (no video is stored) — swap for real
  // YouTube/Instagram/TikTok/Vimeo links via /admin/content/reels.
  reels: [
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', order: 1, tag: 'Paisa', title: 'IPO ma paisa lagaune ho?', handle: '@kasto_chha_paisa', accent: '#5a1f24', video_url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', channel_url: 'https://www.youtube.com/results?search_query=nepal+ipo' },
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', order: 2, tag: 'Travels', title: 'ABC Trek kasto chha?', handle: '@kasto_chha_travels', accent: '#143b52', video_url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', channel_url: 'https://www.youtube.com/results?search_query=annapurna+base+camp+trek' },
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', order: 3, tag: 'Motors', title: 'Deepal S07 first drive', handle: '@kasto_chha_motors', accent: '#6b3110', video_url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', channel_url: 'https://www.youtube.com/results?search_query=deepal+s07' },
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', order: 4, tag: 'Food', title: 'Best momo in Kathmandu', handle: '@kasto_chha_food', accent: '#5c4310', video_url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', channel_url: 'https://www.youtube.com/results?search_query=best+momo+kathmandu' },
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', order: 5, tag: 'Tech', title: 'iPhone 17 hands-on', handle: '@kasto_chha_tech', accent: '#332a52', video_url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', channel_url: 'https://www.youtube.com/results?search_query=iphone+17' },
  ],
  site_stats: [
    { id: '77777777-7777-4777-8777-777777777771', order: 1, label: 'Experiences shared', value: '2,400+' },
    { id: '77777777-7777-4777-8777-777777777772', order: 2, label: 'Questions answered', value: '1,100+' },
    { id: '77777777-7777-4777-8777-777777777773', order: 3, label: 'Votes cast', value: '38K+' },
  ],
  // One guest conversation and its two turns. chat_topics must come before
  // chat_messages here — seeding walks these keys in order and the messages
  // carry a foreign key to the topic.
  chat_topics: [
    {
      id: '99999999-9999-4999-8999-999999999999',
      user_id: null,
      title: 'phone battery',
    },
  ],
  chat_messages: [
    {
      id: '99999999-9999-4999-8999-99999999990a',
      topic_id: '99999999-9999-4999-8999-999999999999',
      user_id: null,
      role: 'user',
      content: 'phone battery',
    },
    {
      id: '99999999-9999-4999-8999-99999999990b',
      topic_id: '99999999-9999-4999-8999-999999999999',
      user_id: null,
      role: 'assistant',
      content: 'Try lowering screen brightness and background refresh.',
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
  const msg = err.message || String(err);
  console.error(msg);
  if (/schema cache|could not find|does not exist/i.test(msg)) {
    console.error("\nThe redesign migration has not been applied yet.");
    console.error("Apply supabase/migrations/0001_redesign.sql first, then re-run the seed:");
    console.error("  - Supabase Dashboard -> SQL Editor -> paste the file -> Run");
    console.error("  - or set SUPABASE_DB_URL in .env.local and run: npm run db:migrate");
    console.error("Then: npm run db:seed");
  }
  process.exit(1);
});
