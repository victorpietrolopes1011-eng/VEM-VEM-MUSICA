# VEM VEM MÚSICA 🎵 + VEM VEM IA 🤖

BATIDA PIANO BASS VOCAL DO VEM VEM — e agora com um **site de IA próprio**.

## VEM VEM IA

Site de chat com IA, 100% estático (HTML + CSS + JS puro). Sem framework, sem build, sem servidor.

### O que tem
- **Login próprio** — usuário e senha criados no próprio site. **Sem Gmail, sem Google, sem e-mail.**
- Senha salva em **hash SHA-256 com salt** (nunca em texto puro), só no seu navegador.
- Sessão persistente ("continuar conectado") e dica de recuperação opcional.
- **Conversas salvas** por usuário, com busca, renomeio automático pelo título e exportação.
- Respostas em **streaming** (aparecem conforme são geradas), botão de refazer e copiar.
- Multi-provedor: **OpenAI, OpenRouter, Groq, DeepSeek, Ollama local** ou URL customizada.
- Ajustes de **temperature**, tamanho máximo da resposta e **personalidade (system prompt)**.
- Tema escuro, responsivo (funciona no celular).
- Exportar conversa em `.md`, exportar tudo em `.json`, apagar conta e dados.

### 🔞 Filtro de conteúdo adulto
Implementado em `filter.js` e **ativo por padrão**. Roda no navegador, **antes** da mensagem sair:
- Bloqueia pornografia, vídeos adultos, sites pornográficos e pedidos de nudes/deepfake nude.
- Resiste a disfarces: acentos, leetspeak (`p0rn0`) e letras separadas (`p o r n o`).
- **Não** bloqueia contextos legítimos: educação sexual, saúde, IST, denúncia de abuso, pedido de ajuda para largar o vício, controle parental.
- Também filtra a **saída** da IA.
- Conteúdo ilegal (pornografia infantil, estupro, zoofilia) é **bloqueado sempre**, mesmo com o filtro desligado nas configurações.

### Como usar
```bash
# qualquer servidor estático serve
python3 -m http.server 8080
# abra http://localhost:8080
```

1. Crie sua conta (usuário + senha).
2. Abra **⚙ Configurações** → escolha o provedor → cole sua **API key** → escreva o **modelo**.
3. Clique em **Testar conexão** e comece a conversar.

> A API key fica salva apenas no `localStorage` do seu navegador e só é enviada para o provedor que você escolheu.

### Arquivos
| arquivo | função |
|---|---|
| `index.html` | telas de login/cadastro, chat e configurações |
| `styles.css` | tema escuro roxo, responsivo |
| `app.js` | contas, sessão, conversas, chamada à API com streaming |
| `filter.js` | filtro de conteúdo adulto (entrada e saída) |

### Nota honesta
O site não tem restrições de produto: sem limite de mensagens, sem paywall, sem censura de assuntos comuns. Mas as **proteções de segurança do modelo de IA** pertencem ao provedor que você conectar — nenhum site consegue removê-las, e este não tenta.
