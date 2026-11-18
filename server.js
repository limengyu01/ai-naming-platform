const http = require('http');
const fs = require('fs');
const path = require('path');

require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: false });

const { createClient } = require('@supabase/supabase-js');

const port = process.env.PORT || 3000;

const modelConfigMap = {
  doubao: {
    label: '豆包（火山方舟）',
    baseURL: process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v1',
    apiKey: process.env.DOUBAO_API_KEY || '',
    model: process.env.DOUBAO_MODEL || ''
  },
  deepseek: {
    label: 'DeepSeek',
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat'
  },
  qwen: {
    label: '通义千问',
    baseURL: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: process.env.QWEN_API_KEY || '',
    model: process.env.QWEN_MODEL || 'qwen-plus'
  },
  kimi: {
    label: 'Kimi',
    baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
    apiKey: process.env.KIMI_API_KEY || '',
    model: process.env.KIMI_MODEL || 'moonshot-v1-8k'
  }
};

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString();
  }
  return body ? JSON.parse(body) : {};
}

async function saveHistory({ requirement, result, modelName }) {
  const supabase = getSupabase();
  if (!supabase) {
    console.warn('未配置 SUPABASE_URL 或 SUPABASE_ANON_KEY，本次结果未写入历史记录。');
    return;
  }
  const { error } = await supabase
    .from('name_history')
    .insert({
      user_requirement: requirement,
      name_result: result,
      model_name: modelName
    });
  if (error) {
    console.error('Supabase 写入失败：', error.message);
  }
}

async function handleName(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: '只支持 POST 请求' });
    return;
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch (e) {
    sendJson(res, 400, { error: '请求 JSON 格式不正确' });
    return;
  }

  const requirement = String(payload.requirement || '').trim();
  const modelKey = String(payload.model || 'doubao');
  const style = String(payload.style || '国风');

  if (!requirement) {
    sendJson(res, 400, { error: '请输入起名需求' });
    return;
  }

  const config = modelConfigMap[modelKey];
  if (!config) {
    sendJson(res, 400, { error: '模型不存在，请重新选择' });
    return;
  }
  if (!config.apiKey || !config.model) {
    sendJson(res, 501, { error: `${config.label} 缺少 API Key 或模型 ID，请在环境变量中配置` });
    return;
  }

  const systemPrompt = [
    '你是专业起名顾问。请根据用户需求给出 3 组名字方案。',
    '每组包含：名字、读音或风格、寓意解释。',
    '使用中文，结构清晰，不要编造姓氏以外的个人信息。',
    `当前风格偏好：${style}。`
  ].join('\n');

  let upstream;
  try {
    upstream = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: requirement }
        ],
        stream: true,
        temperature: 0.8
      })
    });
  } catch (e) {
    sendJson(res, 502, { error: `模型平台连接失败：${e.message}` });
    return;
  }

  if (!upstream.ok) {
    const errorText = await upstream.text();
    sendJson(res, upstream.status, { error: `模型平台返回错误：${errorText.slice(0, 300)}` });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content || '';
          if (content) {
            fullText += content;
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        } catch (parseError) {
          console.error('SSE 分片解析失败：', parseError.message);
        }
      }
    }

    await saveHistory({
      requirement,
      result: fullText,
      modelName: config.label
    });

    res.write('data: [DONE]\n\n');
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
  } finally {
    res.end();
  }
}

async function handleHistory(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: '只支持 GET 请求' });
    return;
  }

  const supabase = getSupabase();
  if (!supabase) {
    sendJson(res, 200, { data: [] });
    return;
  }

  const { data, error } = await supabase
    .from('name_history')
    .select('id, user_requirement, name_result, model_name, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    sendJson(res, 500, { error: error.message });
    return;
  }

  sendJson(res, 200, { data });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/' || url.pathname === '/index.html') {
    const htmlPath = path.join(__dirname, 'index.html');
    fs.readFile(htmlPath, (err, data) => {
      if (err) {
        res.statusCode = 500;
        res.end('页面读取失败');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (url.pathname === '/api/name') {
    return handleName(req, res);
  }

  if (url.pathname === '/api/history') {
    return handleHistory(req, res);
  }

  res.statusCode = 404;
  res.end('Not Found');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`AI 起名平台已启动：http://0.0.0.0:${port}`);
});
