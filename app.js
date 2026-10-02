/* ============================================================
   VEM VEM IA — app.js
   Login próprio (sem Gmail/Google), contas + conversas no navegador,
   chat com qualquer API compatível com OpenAI, filtro adulto.
   ============================================================ */
"use strict";

/* ---------- storage helpers ---------- */
const DB = {
  k: { users: "vv_users", session: "vv_session" },
  get(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  del(k) { localStorage.removeItem(k); },
  users() { return this.get(this.k.users, {}); },
  saveUsers(u) { this.set(this.k.users, u); },
  userKey(name) { return "vv_data_" + name; },
  userData(name) {
    return this.get(this.userKey(name), {
      chats: [], settings: {
        baseUrl: "https://api.openai.com/v1", apiKey: "", model: "gpt-4o-mini",
        temperature: 0.8, maxTokens: 2048, adultFilter: true,
        system: "Você é a VEM VEM IA, uma assistente direta, criativa e sem enrolação. Responde em português do Brasil, com honestidade e sem sermão desnecessário."
      }
    });
  },
  saveUserData(name, d) { this.set(this.userKey(name), d); }
};

/* ---------- crypto ---------- */
async function sha256(txt) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function randSalt() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join("");
}
const hashPw = (pw, salt) => sha256(salt + ":" + pw + ":vemvem");

/* ---------- estado ---------- */
let CURRENT = null;      // username
let DATA = null;         // dados do usuário
let activeChatId = null;
let streaming = false;
let abortCtl = null;

/* ---------- utils ---------- */
const $ = (id) => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function toast(msg, type = "") {
  const t = $("toast");
  t.textContent = msg; t.className = "toast " + type;
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.add("hidden"), 2800);
}
function esc(s) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function md(s) {
  let h = esc(s);
  h = h.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`);
  h = h.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  h = h.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  h = h.replace(/(^|\s)\*([^*\n]+)\*/g, "$1<i>$2</i>");
  return h;
}
function fmtDate(ts) {
  const d = new Date(ts), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/* ============================================================
   AUTENTICAÇÃO
   ============================================================ */
document.querySelectorAll(".tab").forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const reg = tab.dataset.tab === "register";
    $("loginForm").classList.toggle("hidden", reg);
    $("registerForm").classList.toggle("hidden", !reg);
  };
});
document.addEventListener("click", (e) => {
  const eye = e.target.closest(".pw-eye");
  if (!eye) return;
  const inp = $(eye.dataset.target);
  inp.type = inp.type === "password" ? "text" : "password";
});

$("registerForm").onsubmit = async (e) => {
  e.preventDefault();
  const msg = $("regMsg"); msg.className = "form-msg";
  const user = $("regUser").value.trim();
  const pw = $("regPass").value, pw2 = $("regPass2").value;

  if (!/^[a-zA-Z0-9_.-]{3,20}$/.test(user)) { msg.textContent = "Usuário: 3 a 20 caracteres (letras, números, _ . -)."; return; }
  if (pw.length < 6) { msg.textContent = "A senha precisa de pelo menos 6 caracteres."; return; }
  if (pw !== pw2) { msg.textContent = "As senhas não são iguais."; return; }

  const users = DB.users();
  if (users[user.toLowerCase()]) { msg.textContent = "Esse usuário já existe neste navegador."; return; }

  const salt = randSalt();
  users[user.toLowerCase()] = {
    name: user, salt, hash: await hashPw(pw, salt),
    hint: $("regHint").value.trim(), created: Date.now()
  };
  DB.saveUsers(users);
  msg.className = "form-msg ok";
  msg.textContent = "Conta criada! Entrando...";
  setTimeout(() => login(user, true), 550);
};

$("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const msg = $("loginMsg"); msg.className = "form-msg";
  const user = $("loginUser").value.trim().toLowerCase();
  const pw = $("loginPass").value;
  const u = DB.users()[user];
  if (!u) { msg.textContent = "Usuário não encontrado neste navegador."; return; }
  if (await hashPw(pw, u.salt) !== u.hash) {
    msg.textContent = "Senha incorreta." + (u.hint ? ` Dica: ${u.hint}` : "");
    return;
  }
  login(u.name, $("rememberMe").checked);
};

function login(name, remember) {
  CURRENT = name;
  DATA = DB.userData(name);
  if (remember) DB.set(DB.k.session, { name, at: Date.now() });
  else sessionStorage.setItem("vv_tmp", name);
  $("authScreen").classList.add("hidden");
  $("app").classList.remove("hidden");
  bootApp();
}

$("logoutBtn").onclick = () => {
  if (!confirm("Sair da conta? Suas conversas continuam salvas.")) return;
  DB.del(DB.k.session); sessionStorage.removeItem("vv_tmp");
  location.reload();
};

/* ============================================================
   APP
   ============================================================ */
function bootApp() {
  $("userName").textContent = CURRENT;
  $("userAvatar").textContent = CURRENT[0];
  loadSettingsToUI();
  renderChatList();
  const last = DATA.chats[0];
  if (last) openChat(last.id); else newChat(false);
  updateBadge();
  autoGrow();
}
function save() { DB.saveUserData(CURRENT, DATA); }
const S = () => DATA.settings;

function updateBadge() {
  const s = S();
  $("modelBadge").textContent = s.apiKey ? (s.model || "modelo?") : "sem chave — configure ⚙";
  $("userStat").textContent = DATA.chats.length + (DATA.chats.length === 1 ? " conversa" : " conversas");
  const fs = $("filterState");
  fs.textContent = s.adultFilter ? "ativo" : "DESLIGADO";
  fs.className = s.adultFilter ? "" : "off";
}

/* ---------- conversas ---------- */
function newChat(focus = true) {
  const c = { id: uid(), title: "Nova conversa", messages: [], created: Date.now(), updated: Date.now() };
  DATA.chats.unshift(c); save();
  activeChatId = c.id;
  renderChatList(); renderMessages();
  if (focus) $("input").focus();
  if (window.innerWidth <= 820) $("sidebar").classList.add("closed");
}
const chat = () => DATA.chats.find(c => c.id === activeChatId);

function openChat(id) {
  activeChatId = id;
  renderChatList(); renderMessages();
  if (window.innerWidth <= 820) $("sidebar").classList.add("closed");
}
function delChat(id) {
  const c = DATA.chats.find(x => x.id === id);
  if (!confirm(`Apagar "${c.title}"?`)) return;
  DATA.chats = DATA.chats.filter(x => x.id !== id); save();
  if (activeChatId === id) { if (DATA.chats[0]) openChat(DATA.chats[0].id); else newChat(false); }
  renderChatList(); updateBadge(); toast("Conversa apagada");
}

function renderChatList() {
  const q = $("searchChats").value.trim().toLowerCase();
  const list = DATA.chats.filter(c =>
    !q || c.title.toLowerCase().includes(q) || c.messages.some(m => m.content.toLowerCase().includes(q))
  );
  const el = $("chatList");
  if (!list.length) {
    el.innerHTML = `<div class="empty-list">${q ? "Nada encontrado." : "Nenhuma conversa ainda.<br>Clique em <b>+ Nova conversa</b>."}</div>`;
    return;
  }
  el.innerHTML = list.map(c => `
    <div class="chat-item ${c.id === activeChatId ? "active" : ""}" data-id="${c.id}">
      <div class="ci-txt">
        <div class="ci-title">${esc(c.title)}</div>
        <div class="ci-date">${fmtDate(c.updated)} · ${c.messages.length} msg</div>
      </div>
      <button class="ci-del" data-del="${c.id}">🗑</button>
    </div>`).join("");
  el.querySelectorAll(".chat-item").forEach(it => {
    it.onclick = (e) => {
      if (e.target.dataset.del) { e.stopPropagation(); delChat(e.target.dataset.del); return; }
      openChat(it.dataset.id);
    };
  });
  updateBadge();
}

const WELCOME = `
<div class="welcome">
  <div class="big">VV</div>
  <h3>Olá, <span style="color:var(--accent)">${"{U}"}</span> 👋</h3>
  <p>Pergunte o que quiser. Sem limite de mensagens, sem assunto proibido além de pornografia e vídeos adultos — esses ficam bloqueados.</p>
  <div class="suggest">
    <button class="sg" data-p="Me explique como funciona uma batida de piano bass no estilo VEM VEM, passo a passo."><b>🎹 Produção musical</b><span>batida piano bass vocal</span></button>
    <button class="sg" data-p="Escreva uma letra de música em português, estilo funk melódico, sobre recomeçar."><b>✍️ Escrever letra</b><span>criatividade solta</span></button>
    <button class="sg" data-p="Explique de forma simples e direta como ganhar dinheiro com música na internet em 2026."><b>💡 Ideias</b><span>respostas diretas</span></button>
    <button class="sg" data-p="Revise e melhore este texto que vou colar, mantendo o meu jeito de falar."><b>📝 Revisar texto</b><span>sem mudar seu estilo</span></button>
  </div>
</div>`;

function renderMessages() {
  const c = chat(); const box = $("messages");
  $("chatTitle").textContent = c ? c.title : "Nova conversa";
  if (!c || !c.messages.length) {
    box.innerHTML = WELCOME.replace("{U}", esc(CURRENT));
    box.querySelectorAll(".sg").forEach(b => b.onclick = () => { $("input").value = b.dataset.p; autoGrow(); $("input").focus(); });
    return;
  }
  box.innerHTML = c.messages.map((m, i) => bubble(m, i)).join("");
  box.querySelectorAll("[data-copy]").forEach(b => b.onclick = () => {
    navigator.clipboard.writeText(c.messages[+b.dataset.copy].content); toast("Copiado", "ok");
  });
  box.querySelectorAll("[data-redo]").forEach(b => b.onclick = () => regenerate(+b.dataset.redo));
  box.scrollTop = box.scrollHeight;
}
function bubble(m, i) {
  const role = m.role === "user" ? "user" : (m.role === "system-block" ? "sys" : "ai");
  const av = role === "user" ? esc(CURRENT[0].toUpperCase()) : (role === "sys" ? "!" : "VV");
  const who = role === "user" ? esc(CURRENT) : (role === "sys" ? "Filtro de conteúdo" : "VEM VEM IA");
  const actions = role === "sys" ? "" : `<div class="msg-actions">
      <button data-copy="${i}">⧉ Copiar</button>
      ${role === "ai" ? `<button data-redo="${i}">↻ Refazer</button>` : ""}
    </div>`;
  return `<div class="msg ${role}">
    <div class="bubble-av">${av}</div>
    <div class="bubble"><div class="who">${who}</div><div class="body">${md(m.content)}</div>${actions}</div>
  </div>`;
}

/* ---------- composer ---------- */
const input = $("input");
function autoGrow() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 190) + "px"; }
input.addEventListener("input", autoGrow);
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("composer").requestSubmit(); }
});

$("composer").onsubmit = (e) => { e.preventDefault(); send(); };

async function send() {
  if (streaming) { abortCtl?.abort(); return; }
  const text = input.value.trim();
  if (!text) return;

  // ----- FILTRO DE CONTEÚDO ADULTO -----
  if (S().adultFilter) {
    const res = AdultFilter.check(text);
    if (res.blocked) {
      const c = chat();
      c.messages.push({ role: "user", content: text });
      c.messages.push({ role: "system-block", content: AdultFilter.message(res) });
      c.updated = Date.now();
      if (c.title === "Nova conversa") c.title = text.slice(0, 38);
      save(); input.value = ""; autoGrow(); renderMessages(); renderChatList();
      return;
    }
  }

  if (!S().apiKey && !S().baseUrl.includes("localhost")) {
    openSettings();
    toast("Configure sua API key primeiro", "err");
    return;
  }

  const c = chat();
  c.messages.push({ role: "user", content: text });
  if (c.title === "Nova conversa") c.title = text.slice(0, 38) + (text.length > 38 ? "…" : "");
  c.updated = Date.now(); save();
  input.value = ""; autoGrow();
  renderMessages(); renderChatList();
  await askAI();
}

async function regenerate(index) {
  const c = chat();
  c.messages = c.messages.slice(0, index);
  save(); renderMessages();
  await askAI();
}

async function askAI() {
  const c = chat(); const s = S();
  streaming = true; $("sendBtn").textContent = "■";

  const box = $("messages");
  const holder = document.createElement("div");
  holder.className = "msg ai";
  holder.innerHTML = `<div class="bubble-av">VV</div><div class="bubble"><div class="who">VEM VEM IA</div>
    <div class="body"><span class="typing"><i></i><i></i><i></i></span></div></div>`;
  box.appendChild(holder); box.scrollTop = box.scrollHeight;
  const body = holder.querySelector(".body");

  const payload = {
    model: s.model || "gpt-4o-mini",
    temperature: Number(s.temperature),
    max_tokens: Number(s.maxTokens),
    stream: true,
    messages: [
      { role: "system", content: (s.system || "") + (s.adultFilter ? "\n\nRegra fixa: nunca produza pornografia, descrições sexuais explícitas nem indique vídeos/sites adultos. Qualquer outro assunto pode ser tratado normalmente." : "") },
      ...c.messages.filter(m => m.role === "user" || m.role === "assistant").slice(-24)
        .map(m => ({ role: m.role, content: m.content }))
    ]
  };

  abortCtl = new AbortController();
  let acc = "";
  try {
    const r = await fetch(s.baseUrl.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(s.apiKey ? { Authorization: "Bearer " + s.apiKey } : {}),
        ...(s.baseUrl.includes("openrouter") ? { "HTTP-Referer": location.origin, "X-Title": "VEM VEM IA" } : {})
      },
      body: JSON.stringify(payload),
      signal: abortCtl.signal
    });

    if (!r.ok) {
      const t = await r.text();
      throw new Error(`HTTP ${r.status} — ${t.slice(0, 240)}`);
    }

    const reader = r.body.getReader(); const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        const l = line.trim();
        if (!l.startsWith("data:")) continue;
        const d = l.slice(5).trim();
        if (d === "[DONE]") continue;
        try {
          const j = JSON.parse(d);
          const piece = j.choices?.[0]?.delta?.content || "";
          if (piece) { acc += piece; body.innerHTML = md(acc); box.scrollTop = box.scrollHeight; }
        } catch { /* ignora chunk parcial */ }
      }
    }

    if (!acc) throw new Error("A API respondeu vazio. Verifique o nome do modelo.");

    // filtro na saída
    if (s.adultFilter) {
      const out = AdultFilter.filterOutput(acc);
      if (out.blocked) acc = out.clean;
    }
    c.messages.push({ role: "assistant", content: acc });
  } catch (err) {
    if (err.name === "AbortError" && acc) {
      c.messages.push({ role: "assistant", content: acc + "\n\n_(interrompido)_" });
    } else if (err.name !== "AbortError") {
      c.messages.push({
        role: "system-block",
        content: "⚠️ **Erro ao falar com a API**\n\n" + err.message +
          "\n\nVerifique em ⚙ Configurações: a URL do provedor, a API key e o nome do modelo."
      });
    }
  } finally {
    streaming = false; abortCtl = null; $("sendBtn").textContent = "➤";
    c.updated = Date.now(); save();
    renderMessages(); renderChatList();
  }
}

/* ---------- topo / sidebar ---------- */
$("newChatBtn").onclick = () => newChat();
$("searchChats").oninput = renderChatList;
$("menuBtn").onclick = () => $("sidebar").classList.toggle("closed");
$("deleteBtn").onclick = () => delChat(activeChatId);
$("exportBtn").onclick = () => {
  const c = chat();
  const txt = c.messages.map(m => `### ${m.role === "user" ? CURRENT : m.role === "assistant" ? "VEM VEM IA" : "FILTRO"}\n${m.content}`).join("\n\n");
  download(`${c.title.replace(/[^\w\s-]/g, "")}.md`, `# ${c.title}\n\n${txt}`);
};
function download(name, content, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

/* ---------- configurações ---------- */
function openSettings() { loadSettingsToUI(); $("settingsModal").classList.remove("hidden"); }
$("settingsBtn").onclick = openSettings;
$("closeSettings").onclick = () => $("settingsModal").classList.add("hidden");
$("settingsModal").onclick = (e) => { if (e.target.id === "settingsModal") e.currentTarget.classList.add("hidden"); };

function loadSettingsToUI() {
  const s = S();
  const sel = $("cfgProvider");
  const known = [...sel.options].some(o => o.value === s.baseUrl);
  sel.value = known ? s.baseUrl : "custom";
  $("customUrlWrap").classList.toggle("hidden", known);
  $("cfgBaseUrl").value = s.baseUrl;
  $("cfgKey").value = s.apiKey;
  $("cfgModel").value = s.model;
  $("cfgTemp").value = s.temperature; $("tempVal").textContent = s.temperature;
  $("cfgMaxTok").value = s.maxTokens;
  $("cfgSystem").value = s.system;
  $("cfgFilter").checked = s.adultFilter;
}
function bindCfg() {
  $("cfgProvider").onchange = (e) => {
    const custom = e.target.value === "custom";
    $("customUrlWrap").classList.toggle("hidden", custom ? false : true);
    if (!custom) { S().baseUrl = e.target.value; $("cfgBaseUrl").value = e.target.value; }
    save(); updateBadge();
  };
  $("cfgBaseUrl").oninput = (e) => { S().baseUrl = e.target.value.trim(); save(); };
  $("cfgKey").oninput = (e) => { S().apiKey = e.target.value.trim(); save(); updateBadge(); };
  $("cfgModel").oninput = (e) => { S().model = e.target.value.trim(); save(); updateBadge(); };
  $("cfgTemp").oninput = (e) => { S().temperature = e.target.value; $("tempVal").textContent = e.target.value; save(); };
  $("cfgMaxTok").oninput = (e) => { S().maxTokens = e.target.value; save(); };
  $("cfgSystem").oninput = (e) => { S().system = e.target.value; save(); };
  $("cfgFilter").onchange = (e) => {
    if (!e.target.checked) {
      const ok = confirm("Atenção: desligar deixa passar pedidos de conteúdo adulto para o provedor de IA.\n\nPornografia infantil e conteúdo ilegal continuam SEMPRE bloqueados.\n\nDesligar mesmo assim?");
      if (!ok) { e.target.checked = true; return; }
    }
    S().adultFilter = e.target.checked; save(); updateBadge();
    toast(e.target.checked ? "Filtro adulto ativado" : "Filtro adulto desligado", e.target.checked ? "ok" : "err");
  };

  $("testBtn").onclick = async () => {
    const m = $("testMsg"); m.className = "form-msg"; m.textContent = "Testando...";
    const s = S();
    try {
      const r = await fetch(s.baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(s.apiKey ? { Authorization: "Bearer " + s.apiKey } : {}) },
        body: JSON.stringify({ model: s.model, messages: [{ role: "user", content: "diga apenas: ok" }], max_tokens: 10 })
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} — ${(await r.text()).slice(0, 180)}`);
      m.className = "form-msg ok"; m.textContent = "✅ Conexão funcionando!";
    } catch (e) { m.className = "form-msg"; m.textContent = "❌ " + e.message; }
  };

  $("exportAllBtn").onclick = () =>
    download(`vemvem-ia-${CURRENT}.json`, JSON.stringify({ user: CURRENT, chats: DATA.chats }, null, 2), "application/json");

  $("clearChatsBtn").onclick = () => {
    if (!confirm("Apagar TODAS as conversas? Não tem como desfazer.")) return;
    DATA.chats = []; save(); newChat(false); renderChatList(); toast("Conversas apagadas", "ok");
  };
  $("deleteAccBtn").onclick = () => {
    if (!confirm(`Excluir a conta "${CURRENT}" e tudo dela? Não tem como desfazer.`)) return;
    const u = DB.users(); delete u[CURRENT.toLowerCase()]; DB.saveUsers(u);
    DB.del(DB.userKey(CURRENT)); DB.del(DB.k.session);
    location.reload();
  };
}
bindCfg();

/* ---------- sessão automática ---------- */
(function autoLogin() {
  const s = DB.get(DB.k.session, null) || (sessionStorage.getItem("vv_tmp") ? { name: sessionStorage.getItem("vv_tmp") } : null);
  if (s && DB.users()[s.name.toLowerCase()]) login(s.name, !!DB.get(DB.k.session, null));
  else if (!Object.keys(DB.users()).length) {
    document.querySelector('.tab[data-tab="register"]').click();
  }
})();
