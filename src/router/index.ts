import { createRouter, createWebHashHistory } from 'vue-router'

export default createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/wiki/visao-geral' },
    {
      path: '/wiki/:pathMatch(.*)*',
      name: 'wiki-article',
      component: () => import('../views/ArticleView.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: '/wiki/visao-geral' },
  ],
  scrollBehavior(to, from) {
    // Fragmentos de artigos são tratados após o Markdown assíncrono ser renderizado.
    if (to.hash) return false
    if (to.path !== from.path) return { top: 0 }
    return false
  },
})
