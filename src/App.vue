<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import SidebarTreeNode from './components/SidebarTreeNode.vue'
import { wikiNavigation } from './content/wiki'

const route = useRoute()
const menuOpen = ref(false)

watch(
	() => route.fullPath,
	() => {
		menuOpen.value = false
	},
)
</script>

<template>
	<div class="site">
		<header class="site-header">
			<div class="site-container site-header-inner">
				<button
					class="mobile-menu-button"
					type="button"
					aria-label="Abrir ou fechar a navegação"
					aria-controls="wiki-sidebar"
					:aria-expanded="menuOpen"
					@click="menuOpen = !menuOpen"
				>
					<span aria-hidden="true">☰</span>
				</button>

				<RouterLink to="/wiki/visao-geral" class="site-brand" @click="menuOpen = false">
					<span class="site-name">Legend Online Go</span>
					<span class="site-separator" aria-hidden="true"></span>
					<span class="site-kind">Wiki & Dev Log</span>
				</RouterLink>
			</div>
		</header>

		<div v-if="menuOpen" class="mobile-backdrop" @click="menuOpen = false"></div>

		<div class="site-container wiki-layout">
			<aside id="wiki-sidebar" class="wiki-sidebar" :class="{ 'is-open': menuOpen }">
				<div class="sidebar-caption">NAVEGAÇÃO</div>
				<nav aria-label="Navegação da wiki" @keydown.esc="menuOpen = false">
					<ul class="wiki-tree-root">
						<SidebarTreeNode
							v-for="node in wikiNavigation"
							:key="node.id"
							:node="node"
							@navigate="menuOpen = false"
						/>
					</ul>
				</nav>
				<p class="sidebar-footer">Documentação do servidor</p>
			</aside>

			<main id="conteudo" class="wiki-content">
				<div class="article-container"><RouterView /></div>
			</main>
		</div>
	</div>
</template>

<style>
:root {
	color: #273441;
	background: #fff;
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Arial, sans-serif;
	font-size: 15px;
	font-synthesis: none;
	-webkit-font-smoothing: antialiased;
	text-rendering: optimizeLegibility;
}
* {
	box-sizing: border-box;
}
body {
	margin: 0;
	min-width: 320px;
}
a {
	color: #28669c;
}
a:hover {
	color: #184e7e;
}
.site {
	min-height: 100vh;
	background: white;
}
.site-container {
	width: calc(100% - 40px);
	max-width: 1368px;
	margin-inline: auto;
}
.site-header {
	height: 65px;
	position: sticky;
	top: 0;
	z-index: 50;
	background: #fff;
	border-bottom: 1px solid #e6e9ed;
}
.site-header-inner {
	display: flex;
	align-items: center;
	height: 100%;
}
.site-brand {
	display: flex;
	align-items: center;
	gap: 10px;
	text-decoration: none;
	color: #283645;
	min-width: 0;
}
.site-brand:hover {
	color: #283645;
}
.site-name {
	font-size: 16px;
	font-weight: 650;
	white-space: nowrap;
}
.site-separator {
	width: 1px;
	height: 17px;
	background: #d8dfe6;
	margin-inline: 4px;
}
.site-kind {
	color: #8b96a3;
	font-size: 12px;
	white-space: nowrap;
}
.wiki-layout {
	display: grid;
	grid-template-columns: 264px minmax(0, 1fr);
	align-items: start;
}
.wiki-sidebar {
	position: sticky;
	top: 65px;
	height: calc(100vh - 65px);
	overflow-y: auto;
	padding: 34px 19px 40px 0;
	border-right: 1px solid #e6e9ed;
	scrollbar-width: thin;
	scrollbar-color: #d9dfe5 transparent;
}
.sidebar-caption {
	color: #98a2ae;
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 0.12em;
	padding: 0 10px 14px;
}
.wiki-tree-root {
	margin: 0;
	padding: 0;
	list-style: none;
}
.sidebar-footer {
	margin: 32px 10px 0;
	padding-top: 17px;
	border-top: 1px solid #edf0f3;
	font-size: 11px;
	color: #97a1ac;
}
.wiki-content {
	min-width: 0;
	padding: 42px clamp(28px, 5vw, 76px) 110px;
}
.article-container {
	width: 100%;
	max-width: 860px;
	margin-inline: auto;
}
.mobile-menu-button {
	display: none;
}
.mobile-backdrop {
	display: none;
}
@media (max-width: 900px) {
	.site-header {
		height: 60px;
	}
	.mobile-menu-button {
		display: inline-grid;
		place-items: center;
		flex: none;
		width: 36px;
		height: 36px;
		margin-right: 9px;
		border: 1px solid #e7ecf1;
		border-radius: 5px;
		background: #fff;
		color: #506071;
		cursor: pointer;
		font-size: 18px;
	}
	.wiki-layout {
		display: block;
	}
	.wiki-sidebar {
		position: fixed;
		left: 0;
		top: 60px;
		bottom: 0;
		width: min(320px, calc(100vw - 48px));
		height: auto;
		padding: 22px 18px 36px;
		background: #fff;
		border-right: 1px solid #e4e8ee;
		z-index: 42;
		transform: translateX(-105%);
		visibility: hidden;
		transition:
			transform 180ms ease,
			visibility 180ms ease;
	}
	.wiki-sidebar.is-open {
		visibility: visible;
		transform: translateX(0);
	}
	.mobile-backdrop {
		display: block;
		position: fixed;
		z-index: 41;
		inset: 60px 0 0;
		background: rgb(24 38 52 / 26%);
	}
	.wiki-content {
		padding: 32px 10px 75px;
	}
}
@media (max-width: 540px) {
	.site-container {
		width: calc(100% - 28px);
	}
	.site-name {
		font-size: 14px;
	}
	.site-kind,
	.site-separator {
		display: none;
	}
	.wiki-content {
		padding-inline: 3px;
	}
}
@media (prefers-reduced-motion: reduce) {
	.wiki-sidebar {
		transition: none;
	}
}
</style>
