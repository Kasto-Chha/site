BEGIN;

-- Minimal seeds for KastoChha demo content

INSERT INTO trending_topics (rank, category, title, description, badge_label, badge_tone, trend_note, votes_yes, votes_mid, votes_no, likes, comments)
VALUES
  (1, 'Technology', 'Mobile data price hike kasto chha?', 'NTC ra Ncell ko price increase — worth it ki overpriced? Vote garnus.', 'Hot', 'positive', 'up 12%', 11, 5, 2, 50, 8),
  (2, 'Finance', 'IPO parne chance kasto chha?', 'Naya IPO haru lai apply garnu parne ki nai? Community ko anubhav.', 'Trending', 'neutral', 'up 8%', 24, 12, 5, 64, 12),
  (3, 'Auto', 'BYD ko gaadi kasto chha?', 'EV ko craze badhdai cha — Nepal ko road ma worth cha? Owners bol.', 'New', 'positive', 'up 21%', 18, 9, 7, 41, 9)
ON CONFLICT DO NOTHING;

INSERT INTO featured_stories (slot, title, description, why_text, link_url, icon)
VALUES ('main', 'How to save on mobile', 'Saving tips for Nepali users', 'Important tips and tricks', '/trending', 'star')
ON CONFLICT DO NOTHING;

INSERT INTO battles ("order", category, left_title, left_desc, left_votes, left_color, right_title, right_desc, right_votes, right_color)
VALUES
  (1, 'Soft Drink', 'Coca-Cola', 'Classic taste, sabai le manparaune', 5220, '#c8102e', 'Pepsi', 'Sweeter, younger crowd ko choice', 3200, '#1f5fae'),
  (2, 'Phones', 'iPhone', 'Premium ra resale value ramro', 4540, '#2b2b30', 'Galaxy', 'Features ra value for money', 3870, '#3a3340')
ON CONFLICT DO NOTHING;

INSERT INTO reviews (category, topic, topic_slug, title, summary, verdict, upvotes, downvotes, author_name, comment_count, user_id)
VALUES
  ('Career', 'Freelancing Nepal', 'freelancing-nepal', 'Freelancing Nepal ma kasto chha?', '3 barsa gareko chu. Income ramro tara inconsistent — client finding gaaro.', 'Thikai chha', 42, 0, 'Rojan', 12, 'user_201'),
  ('Housing', 'Kathmandu rent', 'kathmandu-rent', 'Kathmandu rent kasto chha?', 'Boudha area chai expensive. 1BHK Rs 18,000 maathi — Kirtipur ma sasto.', 'Naramro chha', 31, 0, 'Pratik', 5, 'user_202'),
  ('Education', '+2 pachi', 'plus-two-pachi', '+2 pachi k garne best ho?', 'Science liye tara engineering mann chhaina. Switch garne ki abroad?', 'Thikai chha', 27, 0, 'Bibek', 8, 'user_203'),
  ('Finance', 'eSewa vs Khalti', 'esewa-vs-khalti', 'eSewa vs Khalti kun use garne?', 'Cashback Khalti ma ramro tara eSewa reliable. Daily use ko lagi eSewa.', 'Ramro chha', 36, 0, 'Sneha', 9, 'user_204'),
  ('Food', 'Sandar momo', 'sandar-momo', 'Sandar ko momo kasto chha?', 'Honest bhannu parda overhyped. Local thau ma sasto ra mitho paaucha.', 'Thikai chha', 22, 0, 'Niraj', 6, 'user_205'),
  ('Technology', 'Pathao job', 'pathao-job', 'Pathao job kasto chha?', 'Part-time ramro side income. Fuel ra wear-tear calculate garnu jaruri.', 'Ramro chha', 19, 0, 'Aakash', 7, 'user_206')
ON CONFLICT DO NOTHING;

-- video_url is an embeddable placeholder (no video is stored) — swap for real
-- YouTube/Instagram/TikTok/Vimeo links via /admin/content/reels.
INSERT INTO reels ("order", tag, title, handle, accent, video_url, channel_url)
VALUES
  (1, 'Paisa', 'IPO ma paisa lagaune ho?', '@kasto_chha_paisa', '#5a1f24', 'https://www.youtube.com/watch?v=jNQXAC9IVRw', 'https://www.youtube.com/results?search_query=nepal+ipo'),
  (2, 'Travels', 'ABC Trek kasto chha?', '@kasto_chha_travels', '#143b52', 'https://www.youtube.com/watch?v=jNQXAC9IVRw', 'https://www.youtube.com/results?search_query=annapurna+base+camp+trek'),
  (3, 'Motors', 'Deepal S07 first drive', '@kasto_chha_motors', '#6b3110', 'https://www.youtube.com/watch?v=jNQXAC9IVRw', 'https://www.youtube.com/results?search_query=deepal+s07'),
  (4, 'Food', 'Best momo in Kathmandu', '@kasto_chha_food', '#5c4310', 'https://www.youtube.com/watch?v=jNQXAC9IVRw', 'https://www.youtube.com/results?search_query=best+momo+kathmandu'),
  (5, 'Tech', 'iPhone 17 hands-on', '@kasto_chha_tech', '#332a52', 'https://www.youtube.com/watch?v=jNQXAC9IVRw', 'https://www.youtube.com/results?search_query=iphone+17')
ON CONFLICT DO NOTHING;

INSERT INTO site_stats ("order", label, value)
VALUES
  (1, 'Experiences shared', '2,400+'),
  (2, 'Questions answered', '1,100+'),
  (3, 'Votes cast', '38K+')
ON CONFLICT DO NOTHING;

-- One guest conversation (user_id NULL) with both turns, so the chat tables
-- have a shape to look at. Fixed ids keep the re-run idempotent.
INSERT INTO chat_topics (id, user_id, title)
VALUES ('99999999-9999-4999-8999-999999999999', NULL, 'phone battery')
ON CONFLICT DO NOTHING;

INSERT INTO chat_messages (id, topic_id, user_id, role, content)
VALUES
  ('99999999-9999-4999-8999-99999999990a', '99999999-9999-4999-8999-999999999999', NULL, 'user', 'phone battery'),
  ('99999999-9999-4999-8999-99999999990b', '99999999-9999-4999-8999-999999999999', NULL, 'assistant', 'Try lowering screen brightness and background refresh.')
ON CONFLICT DO NOTHING;

COMMIT;
