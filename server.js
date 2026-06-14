const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

function loadApiKey() {
  try {
    const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const k = env.split('\n').find(l => l.startsWith('OPENROUTER_API_KEY='));
    if (k) return k.split('=')[1].trim();
  } catch {}
  return process.env.OPENROUTER_API_KEY || '';
}
const API_KEY = loadApiKey();

const PORT = process.env.PORT || 8768;
const MAX_REF_SENTENCES = parseInt(process.env.MAX_REF_SENTENCES) || 300;

const extMap = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
};

async function generateContent(topic, count, usedSentences) {
  const refList = usedSentences.slice(-MAX_REF_SENTENCES);
  const usedList = refList.length > 0
    ? `\n\nDO NOT repeat any of these sentences:\n${refList.map(s => `- ${s}`).join('\n')}`
    : '';

  const prompt = `You are a Japanese teacher. Generate ${count} Japanese sentences for learning.\n\nTopic: ${topic}\nDifficulty: beginner level, use only simple Japanese\n${usedList}\n\nReturn ONLY valid JSON (no markdown, no code blocks):\n{\n  "sentences": [\n    {\n      "sentence": "Japanese sentence (hiragana and katakana ONLY, absolutely NO kanji)",\n      "translation": "Chinese translation",\n      "vocabulary": [\n        { "word": "key word in Japanese", "meaning": "Chinese meaning" },\n        { "word": "another word", "meaning": "Chinese meaning" }\n      ],\n      "grammar_tip": "short grammar explanation in Chinese"\n    }\n  ],\n  "theme": "topic name in Chinese"\n}\n\nRequirements:\n- Each sentence: natural daily Japanese, useful for conversation\n- Use ONLY hiragana and katakana, absolutely NO kanji\n- Each vocabulary: 1-2 words with Chinese meaning\n- Each sentence has a short grammar tip in Chinese\n- Sentences must be COMPLETELY different from the DO NOT repeat list\n- Vary sentence structures (questions, statements, commands)\n\nReturn at least ${count} sentences.`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:8768',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 3000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }

  const json = await res.json();
  const content = JSON.parse(json.choices[0].message.content.replace(/```json|```/g, '').trim());
  return content;
}

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  if (pathname === '/api/daily' && req.method === 'GET') {
    const topic = parsed.query.topic || '日常對話';
    const count = Math.min(Math.max(parseInt(parsed.query.count) || 5, 1), 20);
    let used = [];
    try { used = JSON.parse(decodeURIComponent(parsed.query.used || '[]')); } catch {}

    (async () => {
      try {
        const content = await generateContent(topic, count, used);

        content.sentences = content.sentences.slice(0, count);
        const dayId = Date.now();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ dayId, theme: content.theme, sentences: content.sentences }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    })();
    return;
  }

  let file = pathname === '/' ? '/index.html' : pathname;
  const fp = path.join(__dirname, file);
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end(); return; }
  const ext = path.extname(fp);
  res.writeHead(200, { 'Content-Type': extMap[ext] || 'text/plain' });
  res.end(fs.readFileSync(fp));
}).listen(PORT, '0.0.0.0', () => process.stdout.write(`Server running on http://0.0.0.0:${PORT}`));
