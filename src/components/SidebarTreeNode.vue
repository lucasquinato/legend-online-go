<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { nodeContainsSlug, type WikiNode } from '../content/wiki'

const props = withDefaults(defineProps<{ node: WikiNode; depth?: number }>(), {
  depth: 0,
})
const emit = defineEmits<{ navigate: [] }>()
const route = useRoute()

const currentSlug = computed(() => {
  const param = route.params.pathMatch
  return Array.isArray(param) ? param.join('/') : String(param ?? '')
})

const hasChildren = computed(() => Boolean(props.node.children?.length))
const containsActivePage = computed(() => nodeContainsSlug(props.node, currentSlug.value))
const isActive = computed(() => props.node.slug === currentSlug.value)
const isOpen = ref(false)

// Ao abrir um link direto ou navegar entre artigos, expandir seus ancestrais.
// Um ramo fechado pelo usuário permanece fechado até sua próxima navegação relevante.
watch(currentSlug, () => {
  if (containsActivePage.value && hasChildren.value) isOpen.value = true
}, { immediate: true })
</script>

<template>
  <li class="tree-item">
    <button
      v-if="hasChildren"
      type="button"
      class="tree-row tree-branch"
      :class="{ 'contains-active': containsActivePage }"
      :style="{ '--depth': String(depth) }"
      :aria-expanded="isOpen"
      :aria-controls="`tree-children-${node.id}`"
      @click="isOpen = !isOpen"
    >
      <svg
        class="tree-chevron"
        :class="{ 'chevron-open': isOpen }"
        viewBox="0 0 20 20"
        width="15"
        height="15"
        fill="none"
        aria-hidden="true"
      >
        <path d="m7.5 5 5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span>{{ node.title }}</span>
    </button>

    <RouterLink
      v-else-if="node.slug"
      class="tree-row tree-link"
      :class="{ 'is-active': isActive }"
      :style="{ '--depth': String(depth) }"
      :to="`/wiki/${node.slug}`"
      :aria-current="isActive ? 'page' : undefined"
      @click="emit('navigate')"
    >
      <span class="tree-bullet" aria-hidden="true"></span>
      <span>{{ node.title }}</span>
    </RouterLink>

    <Transition name="tree-expand">
      <div v-if="hasChildren && isOpen" :id="`tree-children-${node.id}`" class="tree-expander">
        <div class="tree-expander-inner">
          <ul class="tree-list tree-list-nested">
            <SidebarTreeNode
              v-for="child in node.children"
              :key="child.id"
              :node="child"
              :depth="depth + 1"
              @navigate="emit('navigate')"
            />
          </ul>
        </div>
      </div>
    </Transition>
  </li>
</template>

<style scoped>
.tree-list { list-style: none; padding: 0; margin: 0; }
.tree-item { margin: 1px 0; }
.tree-row {
  --indent: calc(var(--depth, 0) * 14px);
  width: 100%; min-height: 35px;
  display: flex; align-items: center; gap: 9px;
  padding: 7px 10px 7px calc(9px + var(--indent));
  border: 0; border-radius: 4px; background: transparent;
  color: #536170; font: inherit; font-size: 13px;
  line-height: 1.45; text-align: left; text-decoration: none; cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease, transform 160ms ease;
}
.tree-row:hover { background: #f1f5f9; color: #245c91; transform: translateX(2px); }
.tree-row:focus-visible { outline: 2px solid #7da9d4; outline-offset: -2px; }
.tree-branch { font-weight: 600; color: #394653; }
.tree-branch.contains-active { color: #1c5588; }
.tree-chevron { flex: 0 0 15px; color: #8a95a1; transition: transform 170ms ease; }
.tree-chevron.chevron-open { transform: rotate(90deg); }
.tree-bullet { flex: 0 0 15px; position: relative; height: 15px; }
.tree-bullet::after {
  content: ''; display: block; position: absolute; width: 4px; height: 4px;
  left: 5px; top: 5px; border-radius: 50%; background: #b8c4d0;
}
.tree-link.is-active { background: #edf4fb; color: #20588d; font-weight: 600; }
.tree-link.is-active .tree-bullet::after { background: #3773aa; }
.tree-expander { display: grid; grid-template-rows: 1fr; }
.tree-expander-inner { min-height: 0; overflow: hidden; }
.tree-expand-enter-active, .tree-expand-leave-active { transition: grid-template-rows 180ms ease, opacity 180ms ease; }
.tree-expand-enter-from, .tree-expand-leave-to { grid-template-rows: 0fr; opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .tree-row, .tree-chevron, .tree-expand-enter-active, .tree-expand-leave-active { transition: none; }
}
</style>
