<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getWikiPath, loadWikiMarkdown } from '../content/wiki'
import { renderWikiMarkdown, wikiHeadingHref, type WikiHeading } from '../utils/markdown'

const route = useRoute()
const slug = computed(() => {
  const param = route.params.pathMatch
  return Array.isArray(param) ? param.join('/') : String(param ?? '')
})
const breadcrumbs = computed(() => getWikiPath(slug.value))
const html = ref('')
const headings = ref<WikiHeading[]>([])
const state = ref<'loading' | 'ready' | 'draft' | 'not-found' | 'error'>('loading')
let requestNumber = 0

async function scrollToCurrentHash() {
  await nextTick()
  if (!route.hash) return
  try {
    document.getElementById(decodeURIComponent(route.hash.slice(1)))?.scrollIntoView()
  } catch {
    // Um fragmento inválido não pode impedir a exibição do artigo.
  }
}

watch(slug, async (currentSlug) => {
  const currentRequest = ++requestNumber
  html.value = ''
  headings.value = []
  state.value = 'loading'

  if (!getWikiPath(currentSlug)) {
    state.value = 'not-found'
    return
  }

  try {
    const source = await loadWikiMarkdown(currentSlug)
    if (currentRequest !== requestNumber) return
    if (source === null) {
      state.value = 'draft'
      return
    }
    const rendered = renderWikiMarkdown(source, currentSlug)
    html.value = rendered.html
    headings.value = rendered.headings
    state.value = 'ready'
    await scrollToCurrentHash()
  } catch (error) {
    if (currentRequest !== requestNumber) return
    console.error('Falha ao carregar artigo Markdown:', error)
    state.value = 'error'
  }
}, { immediate: true })

watch(() => route.hash, () => { void scrollToCurrentHash() })
</script>

<template>
  <article class="wiki-article">
    <nav class="breadcrumbs" aria-label="Trilha de navegação">
      <RouterLink to="/wiki/visao-geral">Wiki</RouterLink>
      <template v-for="node in breadcrumbs ?? []" :key="node.id">
        <span class="crumb-divider" aria-hidden="true">/</span>
        <span>{{ node.title }}</span>
      </template>
    </nav>

    <div class="article-tabs"><span class="article-tab-active">Artigo</span></div>

    <p v-if="state === 'loading'" class="info-note" role="status">Carregando artigo…</p>
    <template v-else-if="state === 'ready'">
      <div class="article-grid" :class="{ 'with-toc': headings.length > 0 }">
        <div class="markdown-body" v-html="html"></div>
        <aside v-if="headings.length" class="toc" aria-label="Índice do artigo">
          <div class="toc-heading">Nesta página</div>
          <ul>
            <li v-for="heading in headings" :key="heading.id" :class="{ 'toc-subitem': heading.level === 3 }">
              <a :href="wikiHeadingHref(slug, heading.id)">{{ heading.text }}</a>
            </li>
          </ul>
        </aside>
      </div>
    </template>
    <template v-else-if="state === 'draft'">
      <h1 class="article-title">{{ breadcrumbs?.at(-1)?.title }}</h1>
      <p class="info-note">A documentação desta funcionalidade ainda está em elaboração.</p>
      <p>Para publicar o artigo, crie <code>src/content/articles/{{ slug }}.md</code>.</p>
    </template>
    <template v-else-if="state === 'not-found'">
      <h1 class="article-title">Artigo não encontrado</h1>
      <p>Este endereço não está cadastrado na navegação da wiki.</p>
      <RouterLink to="/wiki/visao-geral">Voltar à visão geral</RouterLink>
    </template>
    <template v-else>
      <h1 class="article-title">Não foi possível carregar este artigo</h1>
      <p>Verifique o arquivo Markdown e tente atualizar a página.</p>
    </template>

    <footer class="article-footer">Legend Online Go · Wiki & Dev Log</footer>
  </article>
</template>

<style scoped>
.wiki-article { color: #303a45; overflow-wrap: break-word; }
.breadcrumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; color: #8b96a1; font-size: 12px; margin: 0 0 25px; }
.breadcrumbs a { color: #47759f; text-decoration: none; }
.breadcrumbs a:hover { text-decoration: underline; }
.crumb-divider { color: #b7c0c9; }
.article-tabs { height: 33px; border-bottom: 1px solid #dfe5eb; margin-bottom: 24px; color: #4e6e8b; font-size: 12px; }
.article-tab-active { display: inline-block; height: 33px; padding: 0 13px; border-bottom: 2px solid #5d83a5; font-weight: 600; }
.article-grid { min-width: 0; }
.article-grid.with-toc { display: grid; grid-template-columns: minmax(0, 1fr) 178px; gap: 35px; align-items: start; }
.article-title { color: #273542; font: 400 clamp(28px, 3vw, 36px)/1.25 Georgia, serif; border-bottom: 1px solid #dbe1e7; padding-bottom: 13px; }
.info-note { border-left: 3px solid #b6cce0; padding: 12px 16px; color: #697789; background: #f8fafc; }
.markdown-body { min-width: 0; font-size: 15px; line-height: 1.85; color: #3f4a55; }
.markdown-body :deep(h1), .markdown-body :deep(h2), .markdown-body :deep(h3) { font-family: Georgia, 'Times New Roman', serif; font-weight: 400; line-height: 1.3; color: #273542; scroll-margin-top: 90px; }
.markdown-body :deep(h1) { font-size: clamp(28px, 3vw, 36px); margin: 0 0 24px; padding-bottom: 13px; border-bottom: 1px solid #dbe1e7; }
.markdown-body :deep(h2) { font-size: 25px; margin: 40px 0 17px; padding-bottom: 8px; border-bottom: 1px solid #e6eaee; }
.markdown-body :deep(h3) { font-size: 20px; margin: 28px 0 14px; }
.markdown-body :deep(p) { margin: 0 0 18px; }
.markdown-body :deep(a) { color: #28669c; text-decoration: none; border-bottom: 1px solid transparent; transition: border-color 160ms ease, color 160ms ease; }
.markdown-body :deep(a:hover) { color: #184e7e; border-bottom-color: currentColor; }
.markdown-body :deep(ul), .markdown-body :deep(ol) { padding-left: 25px; margin: 12px 0 22px; }
.markdown-body :deep(li) { margin-bottom: 6px; }
.markdown-body :deep(blockquote) { margin: 20px 0; padding: 4px 18px; background: #f7f9fb; border-left: 3px solid #b7c8d9; color: #647386; }
.markdown-body :deep(blockquote p:last-child) { margin-bottom: 0; }
.markdown-body :deep(table) { border-collapse: collapse; width: 100%; display: block; overflow-x: auto; margin: 22px 0; font-size: 13px; }
.markdown-body :deep(th), .markdown-body :deep(td) { padding: 9px 12px; border: 1px solid #dce3e9; text-align: left; }
.markdown-body :deep(th) { background: #f3f6f9; font-weight: 650; white-space: nowrap; }
.markdown-body :deep(tr:nth-child(even)) { background: #fbfcfd; }
.markdown-body :deep(pre) { margin: 20px 0; padding: 16px; background: #f4f6f8; border: 1px solid #e5e9ee; border-radius: 5px; overflow: auto; font-size: 13px; line-height: 1.6; }
.markdown-body :deep(code) { padding: 2px 5px; background: #f1f3f5; border-radius: 3px; font: 13px/1.6 ui-monospace, 'SFMono-Regular', Consolas, monospace; }
.markdown-body :deep(pre code) { background: transparent; padding: 0; }
.markdown-body :deep(hr) { border: 0; border-top: 1px solid #e0e6eb; margin: 28px 0; }
.markdown-body :deep(img) { max-width: 100%; height: auto; border-radius: 3px; }
.toc { position: sticky; top: 104px; max-height: calc(100vh - 130px); overflow-y: auto; border-left: 1px solid #e3e8ee; padding-left: 15px; font-size: 12px; }
.toc-heading { font-size: 11px; color: #778595; font-weight: 700; margin: 0 0 12px; }
.toc ul { list-style: none; padding: 0; margin: 0; }
.toc li { margin: 0 0 10px; }
.toc li.toc-subitem { padding-left: 11px; }
.toc a { color: #677789; text-decoration: none; transition: color 160ms ease; }
.toc a:hover { color: #28669c; }
.article-footer { margin-top: 70px; padding-top: 15px; border-top: 1px solid #e5e9ed; font-size: 11px; color: #9aa4ae; }
@media (max-width: 1150px) {
  .article-grid.with-toc { display: flex; flex-direction: column; gap: 20px; }
  .article-grid.with-toc > .markdown-body { width: 100%; }
  .toc { position: static; order: -1; max-height: none; width: 100%; background: #fafbfd; padding: 12px 15px; border: 1px solid #e5e9ee; border-radius: 4px; }
  .toc ul { display: flex; flex-wrap: wrap; gap: 7px 15px; }
  .toc li { margin: 0; }
}
@media (prefers-reduced-motion: reduce) { .markdown-body :deep(a), .toc a { transition: none; } }
</style>
