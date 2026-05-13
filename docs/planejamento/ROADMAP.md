# Roadmap ziiiTV — Documento Oficial

> [!NOTE]
> Este documento centraliza o planejamento do ziiiTV, com as fases atualizadas após a validação da Stack em TV Samsung reais e a construção da UI.

## ✅ Fase 1: Stack Validada (COMPLETA)
- [x] React monta e renderiza na TV (Downgrade para Vite 4 + `@vitejs/plugin-legacy`)
- [x] Playlist carrega (fetch + parse)
- [x] Arquitetura enterprise (singleton DB, idempotência, feature flags)
- [x] Cache persiste (IndexedDB validado entre sessões)
- [x] DebugOverlay implementado
- [x] Navegação D-pad básica (Enter, Back, F1, F2)

## ✅ Fase 2: Home Netflix-like (COMPLETA)
- [x] Layout Netflix-like com hero banner
- [x] Hero banner com dinâmico 
- [x] Carrosséis horizontais flexíveis organizados por streaming (Netflix, Amazon, HBO, Disney+, etc)
- [x] Descrição inteligente abaixo do card focado (3 linhas, Inter font, 55% largura)
- [x] Preview da próxima row visível
- [x] Limpeza agressiva de nomes no parsing da Playlist (zero duplicatas)
- [x] DebugOverlay lateral retrátil (F1 toggle, F2 limpar logs)
- [x] TMDB enrichment em background
- [x] Navegação D-pad estrita e fluida entre zonas (sidebar, topbar, hero, content)
- [x] Continuar Assistindo funcional (base de mock)

## ✅ Fase 3: Player + Tela de Canais (COMPLETA)
- [x] Validar inicialização do Player (Shaka + nativo Samsung AVPlay) na TV real
- [x] Construir lógica autônoma para interceptar links .ts diretos e passar pro AVPlay (PlayerManager)
- [x] Criar tela de Canais independente da Home (via `activeView === 'live'`)
- [x] Grid de canais com EPG (Enriquecimento via TMDB/SportsArtwork)
- [x] Navegação D-pad dentro do Player + Mudança de canais (Seamless Expand)
- [x] Funcionalidade de Preview em miniatura do canal ativo no catálogo (Double-Buffer + setDisplayRect)

## ✅ Fase 4: UX Premium + Qualidade (COMPLETA 28/04/2026)
- [x] Layout Netflix 3 rows (peek cima + card central + peek baixo)
- [x] Cinema mode — overlay `position: fixed` ao autoplay
- [x] Qualidade automática — 4K > FHD > HD > SD + fallback por probe
- [x] Golden offset — preview retoma de onde parou via `seekTo` no `onbufferingcomplete`
- [x] Flag `hasSeekFired` — corrige loop infinito de seek a cada rebuffer
- [x] Poster overlay — cobre tela preta durante loading/buffering
- [x] Buffer tuning — 4000ms inicial / 8000ms pendente
- [x] Zero dynamic imports no PlayerManager — elimina piscada preta
- [x] Logs completos via WebSocket (NAV, SCROLL, CINEMA, PLAY)
- [x] Duas consistências de progresso (heroOffsetMs + progressPct)
- [x] Tela de séries reformulada — rows por temporada (HomeScreen-style)

## ✅ Fase 5: Estabilidade e Backend (COMPLETA 30/04/2026)
- [x] Timeout de 8s no prepareAsync — player nunca trava mais
- [x] Stream Health Monitor — auto-recovery de desync
- [x] Efeito slot machine nos cards (160ms snap duro)
- [x] Animação direcional nas imagens (entra pelo lado do D-pad)
- [x] Supabase: admin salva só canais matchados (~573 vs 59.836)
- [x] Edge Function `get-channels` sem Memory/CPU limit exceeded
- [x] Deploy nas duas TVs (sua UN50RU7100 + pais QN55Q65)
- [x] Dois ícones do app (quadrado + retangular)
- [x] Vídeo splash limpo (sem textos por cima)

## 🎯 Fase 6: Busca e Filtros (PRÓXIMA)
- [ ] Tela de busca isolada com teclado virtual D-pad
- [ ] Filtros rápidos: Gêneros TMDB, Ano, Rating
- [ ] Histórico de busca via IndexedDB

## 🔮 Fase 7: Sync e Backend
- [ ] Sync watch progress com Supabase (`watch_events` já existe no admin)
- [ ] No boot: puxa histórico do Supabase por `user_id`
- [ ] A cada 15s: upsert na tabela `watch_events`

## 🔮 Fase 8: Otimizações
- [ ] Virtualização de listas (react-window) para 100+ rows
- [ ] Configuração manual de qualidade (SD/HD/4K no menu settings)
- [ ] Favoritos persistentes cross-playlist
- [ ] Tela de busca isolada com teclado virtual D-pad
- [ ] Filtros rápidos: Gêneros TMDB, Ano, Rating
- [ ] Histórico de busca via IndexedDB

## 🔮 Fase 6: Sync e Backend
- [ ] Sync watch progress com Supabase (`watch_events` já existe no admin)
- [ ] No boot: puxa histórico do Supabase por `user_id`
- [ ] A cada 15s: upsert na tabela `watch_events`
- [ ] Offline: cai para localStorage, sincroniza quando voltar

## 🔮 Fase 7: Otimizações e Scale
- [ ] Virtualização de listas (react-window) para 100+ rows
- [ ] Intersection Observers para lazy loading de imagens
- [ ] Configuração manual de qualidade (SD/HD/4K no menu settings)
- [ ] Favoritos persistentes cross-playlist

---

## 🏛 Decisões Arquiteturais Vigentes

### Estratégia de Parse (Atual - Fase 2)
- Remove tags de ano ("2023"), qualidades HD/FHD/4K, codecs
- Mantém o nome puro. Agrupa as variantes técnicas ocultamente.
- Detecta plataforma do filme pelo "group-title" dentro da source (filtra o VOD do Live).

### Estratégia Content-First (Ideal - Fase 7)
Visão arquitetônica futura para suportar M3Us de 50k+ com total perfeição:
- **Identidade:** `canonicalId`, `canonicalName`, `contentType` 
- **Metadata Centralizada:** Agrupamentos lógicos em vez de listas puras M3U.
- **VOD vs Live Strict Separation:** Evitar que engine misture filmes on-demand com televisão linear.
