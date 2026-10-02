/* ============================================================
   filter.js — Filtro de conteúdo adulto (pornografia / vídeos adultos)
   Roda 100% no navegador, ANTES da mensagem sair para a API.
   Objetivo: bloquear pornografia e vídeos adultos, deixando passar
   assuntos normais (inclusive saúde, educação sexual e temas sérios).
   ============================================================ */
(function (global) {
  "use strict";

  // Termos explicitamente pornográficos (PT + EN + gírias)
  const PORN_TERMS = [
    "pornografia", "pornografico", "pornografica", "porno", "pornô", "pornor",
    "pornhub", "xvideos", "xvideo", "xnxx", "redtube", "youporn", "brazzers",
    "onlyfans", "chaturbate", "camgirl", "cam girl", "stripchat", "bongacams",
    "spankbang", "xhamster", "hentai", "doujinshi", "rule34", "nhentai",
    "sexo explicito", "sexo explícito", "cena de sexo", "filme adulto",
    "filmes adultos", "video adulto", "vídeo adulto", "videos adultos",
    "vídeos adultos", "video pornografico", "vídeo pornográfico",
    "conteudo adulto explicito", "conteúdo adulto explícito",
    "nudes", "nude pics", "foto pelada", "fotos peladas", "pelada nua",
    "nsfw", "xxx", "x-rated", "deepfake nude", "nudify", "despir foto",
    "tirar a roupa da foto", "remover roupa da foto",
    "masturbacao video", "masturbação vídeo", "siririca", "punheta",
    "boquete", "chupada no", "gozada", "gozando", "orgia", "suruba",
    "garota de programa", "acompanhante de luxo", "prostituta perto",
    "escort service", "sexcam", "sex cam", "sexshop video", "putaria video",
    "putaria vídeo", "safadeza explicita", "camera escondida banheiro"
  ];

  // Categorias sempre bloqueadas, sem exceção nenhuma (dano grave)
  const HARD_BLOCK = [
    "pornografia infantil", "porno infantil", "cp infantil", "child porn",
    "menor de idade nua", "menor de idade nu", "crianca nua", "criança nua",
    "crianca pelada", "criança pelada", "adolescente nua", "adolescente pelada",
    "loli porn", "shota porn", "jailbait",
    "estupro video", "estupro vídeo", "video de estupro", "vídeo de estupro",
    "zoofilia", "bestialidade", "necrofilia"
  ];

  // Contextos legítimos que NÃO devem ser bloqueados
  const SAFE_CONTEXT = [
    "educacao sexual", "educação sexual", "ist", "dst", "hpv", "hiv",
    "camisinha", "preservativo", "anticoncepcional", "ginecologista",
    "urologista", "puberdade", "menstruacao", "menstruação",
    "abuso sexual denuncia", "denunciar abuso", "disque 100", "disque 180",
    "como bloquear", "bloquear pornografia", "filtro parental",
    "controle parental", "vicio em pornografia", "vício em pornografia",
    "parar de ver porno", "largar o vicio", "largar o vício",
    "lei", "crime", "delegacia", "psicologo", "psicólogo", "terapia"
  ];

  // URLs de sites adultos conhecidos
  const DOMAIN_RE = /\b(?:[\w-]+\.)?(pornhub|xvideos|xnxx|redtube|youporn|brazzers|onlyfans|chaturbate|stripchat|bongacams|spankbang|xhamster|nhentai|rule34|hanime|eporner|motherless|erome)\.(com|net|org|tv|xxx|to|cc)\b/i;

  function normalize(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // tira acento
      .replace(/[0@]/g, "o").replace(/[1!|]/g, "i")       // leetspeak básico
      .replace(/[3]/g, "e").replace(/[4]/g, "a").replace(/[5$]/g, "s")
      .replace(/[^a-z0-9\s.:/-]/g, " ")                   // tira separadores p-o-r-n-o
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripSpaced(s) {
    // "p o r n o" -> "porno"
    return s.replace(/\b(?:[a-z]\s){2,}[a-z]\b/g, (m) => m.replace(/\s/g, ""));
  }

  /**
   * Analisa um texto.
   * @returns {{blocked:boolean, severity:"none"|"adult"|"hard", matched:string|null, reason:string}}
   */
  function check(text) {
    const raw = text || "";
    const n = normalize(raw);
    const nn = stripSpaced(n);

    // 1) Bloqueio absoluto
    for (const t of HARD_BLOCK) {
      const k = normalize(t);
      if (n.includes(k) || nn.includes(k.replace(/\s/g, ""))) {
        return {
          blocked: true, severity: "hard", matched: t,
          reason: "Esse tipo de conteúdo é ilegal e nunca será gerado nem buscado aqui."
        };
      }
    }

    // 2) Contexto seguro (saúde, lei, ajuda, bloquear o vício) → libera
    const safe = SAFE_CONTEXT.some((t) => n.includes(normalize(t)));

    // 3) Domínios adultos
    if (DOMAIN_RE.test(raw) && !safe) {
      return {
        blocked: true, severity: "adult", matched: raw.match(DOMAIN_RE)[0],
        reason: "Links de sites pornográficos estão bloqueados."
      };
    }

    // 4) Termos pornográficos
    for (const t of PORN_TERMS) {
      const k = normalize(t);
      const hit = n.includes(k) || nn.includes(k.replace(/\s/g, ""));
      if (hit && !safe) {
        return {
          blocked: true, severity: "adult", matched: t,
          reason: "Pornografia e vídeos adultos estão bloqueados neste site."
        };
      }
    }

    return { blocked: false, severity: "none", matched: null, reason: "" };
  }

  /** Mensagem mostrada ao usuário quando algo é bloqueado. */
  function message(res) {
    if (res.severity === "hard") {
      return "🚫 **Bloqueado permanentemente.**\n\n" + res.reason +
        "\n\nSe você viu algo assim na internet, denuncie em **denuncie.org.br** ou pelo **Disque 100**.";
    }
    return "🔞 **Bloqueado pelo filtro de conteúdo adulto.**\n\n" + res.reason +
      "\n\nTermo detectado: \"" + res.matched + "\".\n" +
      "Todo o resto funciona normalmente — pode perguntar qualquer outra coisa.";
  }

  /** Censura a resposta da IA caso ela retorne algo explícito. */
  function filterOutput(text) {
    const res = check(text);
    if (res.blocked) {
      return { clean: "🔞 A resposta foi bloqueada pelo filtro de conteúdo adulto.", blocked: true };
    }
    return { clean: text, blocked: false };
  }

  global.AdultFilter = { check, message, filterOutput };
})(window);
