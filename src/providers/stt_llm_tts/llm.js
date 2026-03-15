/**
 * LLM (chat completion) provider adapters with tool-call support.
 *
 * Supported: openai | anthropic | groq | google | xai
 *
 * All providers are called with the same interface:
 *   complete({ systemPrompt, messages, tools, onText, onToolCall })
 *
 * Streaming text chunks are delivered via onText(chunk).
 * Tool calls are delivered via onToolCall({ name, args }).
 * Returns the final full assistant text.
 */

// ── OpenAI / Groq / xAI (OpenAI-compatible) ───────────────────────────────────

async function openAIComplete({ baseURL, apiKey, model, systemPrompt, messages, tools, onText, onToolCall }) {
  const body = {
    model,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  };

  if (tools?.length) {
    body.tools = tools.map((t) => ({
      type:     'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = 'auto';
  }

  const res = await fetch(`${baseURL}/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM ${baseURL} → ${res.status}: ${text.slice(0, 200)}`);
  }

  let fullText     = '';
  let toolCalls    = {};  // { index: { id, name, args_str } }
  const reader     = res.body.getReader();
  const decoder    = new TextDecoder();
  let buf          = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      let chunk;
      try { chunk = JSON.parse(data); } catch { continue; }

      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      // Text content
      if (delta.content) {
        fullText += delta.content;
        if (onText) onText(delta.content);
      }

      // Tool calls (streamed in parts)
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: '', name: '', args_str: '' };
          if (tc.id && !toolCalls[tc.index].id) toolCalls[tc.index].id = tc.id;
          if (tc.function?.name)   toolCalls[tc.index].name     += tc.function.name;
          if (tc.function?.arguments) toolCalls[tc.index].args_str += tc.function.arguments;
        }
      }
    }
  }

  // Dispatch assembled tool calls
  for (const tc of Object.values(toolCalls)) {
    if (tc.name && onToolCall) {
      let args = {};
      try { args = JSON.parse(tc.args_str || '{}'); } catch (err) {
        console.warn(`[LLM] Tool call "${tc.name}" has malformed args — skipping:`, err.message, tc.args_str);
        continue;
      }
      await onToolCall({ id: tc.id, name: tc.name, args });
    }
  }

  return fullText;
}

// ── Anthropic (Claude) ────────────────────────────────────────────────────────

async function anthropicComplete({ apiKey, model, systemPrompt, messages, tools, onText, onToolCall }) {
  const body = {
    model:      model || 'claude-sonnet-4-6',
    max_tokens: 1024,
    stream:     true,
    system:     systemPrompt,
    messages,
  };

  if (tools?.length) {
    body.tools = tools.map((t) => ({
      name:         t.name,
      description:  t.description,
      input_schema: t.parameters,
    }));
  }

  const MAX_RETRIES = 3;
  let res;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (res.ok) break;

    if (res.status === 429 && attempt < MAX_RETRIES - 1) {
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`[LLM] Anthropic 429 — retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    const text = await res.text().catch(() => '');
    throw new Error(`Anthropic → ${res.status}: ${text.slice(0, 200)}`);
  }

  let fullText   = '';
  let toolBlocks = {};  // { index: { id, name, input_str } }
  const reader   = res.body.getReader();
  const decoder  = new TextDecoder();
  let buf        = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      let event;
      try { event = JSON.parse(line.slice(6)); } catch { continue; }

      if (event.type === 'content_block_delta') {
        if (event.delta?.type === 'text_delta') {
          fullText += event.delta.text;
          if (onText) onText(event.delta.text);
        }
        if (event.delta?.type === 'input_json_delta') {
          const idx = event.index;
          if (!toolBlocks[idx]) toolBlocks[idx] = { id: '', name: '', input_str: '' };
          toolBlocks[idx].input_str += event.delta.partial_json;
        }
      }
      if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
        const idx = event.index;
        if (!toolBlocks[idx]) toolBlocks[idx] = { id: '', name: '', input_str: '' };
        toolBlocks[idx].id   = event.content_block.id;
        toolBlocks[idx].name = event.content_block.name;
      }
    }
  }

  for (const tb of Object.values(toolBlocks)) {
    if (tb.name && onToolCall) {
      let args = {};
      try { args = JSON.parse(tb.input_str || '{}'); } catch (err) {
        console.warn(`[LLM] Anthropic tool call "${tb.name}" has malformed input — skipping:`, err.message, tb.input_str);
        continue;
      }
      await onToolCall({ id: tb.id, name: tb.name, args });
    }
  }

  return fullText;
}

// ── Factory ────────────────────────────────────────────────────────────────────

export async function complete({ provider, apiKey, model, systemPrompt, messages, tools, onText, onToolCall }) {
  const BASE_URLS = {
    openai: 'https://api.openai.com/v1',
    groq:   'https://api.groq.com/openai/v1',
    xai:    'https://api.x.ai/v1',
  };

  const MODELS = {
    openai: model || 'gpt-4o',
    groq:   model || 'llama-3.3-70b-versatile',
    xai:    model || 'grok-3-mini',
    google: model || 'gemini-2.0-flash',
  };

  switch (provider) {
    case 'openai':
    case 'groq':
    case 'xai':
      return openAIComplete({
        baseURL: BASE_URLS[provider],
        apiKey:  apiKey || process.env[`${provider.toUpperCase()}_API_KEY`],
        model:   MODELS[provider],
        systemPrompt, messages, tools, onText, onToolCall,
      });

    case 'anthropic':
      return anthropicComplete({
        apiKey:  apiKey || process.env.ANTHROPIC_API_KEY,
        model:   model || 'claude-sonnet-4-6',
        systemPrompt, messages, tools, onText, onToolCall,
      });

    case 'google': {
      // Google uses OpenAI-compatible endpoint via generativelanguage.googleapis.com
      return openAIComplete({
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey:  apiKey || process.env.GOOGLE_API_KEY,
        model:   MODELS.google,
        systemPrompt, messages, tools, onText, onToolCall,
      });
    }

    default:
      console.warn(`[LLM] Unknown provider "${provider}", defaulting to openai`);
      return openAIComplete({
        baseURL: BASE_URLS.openai,
        apiKey:  process.env.OPENAI_API_KEY,
        model:   'gpt-4o',
        systemPrompt, messages, tools, onText, onToolCall,
      });
  }
}
