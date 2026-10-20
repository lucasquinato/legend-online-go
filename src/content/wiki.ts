export interface WikiNode {
	id: string
	title: string
	slug?: string
	children?: WikiNode[]
}

// A ordem e os títulos da sidebar são controlados aqui.
// Cada item com slug corresponde a src/content/articles/<slug>.md.
// Categorias com children podem ser aninhadas sem limite de profundidade.
export const wikiNavigation: WikiNode[] = [
	{ id: 'inicio', title: 'Visão geral', slug: 'visao-geral' },
	{
		id: 'cidade',
		title: 'Cidade',
		children: [
			{ id: 'prefeitura', title: 'Prefeitura', slug: 'cidade/prefeitura' },
			{ id: 'santuario', title: 'Santuário', slug: 'cidade/santuario' },
			{
				id: 'residencia',
				title: 'Residência',
				children: [
					{
						id: 'fazenda',
						title: 'Fazenda e Pastagem',
						children: [
							{
								id: 'fazenda-cultivo',
								title: 'Cultivo',
								slug: 'cidade/residencia/fazenda/cultivo',
							},
							{
								id: 'fazenda-pastagem',
								title: 'Pastagem',
								slug: 'cidade/residencia/fazenda/pastagem',
							},
						],
					},
					{
						id: 'navegacao',
						title: 'Navegação',
						children: [
							{ id: 'navegacao-portos', title: 'Portos', slug: 'navegacao/portos' },
							{ id: 'navegacao-navios', title: 'Navios', slug: 'navegacao/navios' },
							{
								id: 'navegacao-comercio',
								title: 'Comércio',
								slug: 'navegacao/comercio',
							},
							{ id: 'navegacao-pesca', title: 'Pesca', slug: 'navegacao/pesca' },
						],
					},
					{
						id: 'residencia-interna',
						title: 'Residência',
						slug: 'residencia/residencia',
					},
				],
			},
			{
				id: 'labirinto',
				title: 'Labirinto',
				children: [
					{ id: 'labirinto-normal', title: 'Normal', slug: 'cidade/labirinto/normal' },
					{ id: 'labirinto-abismo', title: 'Abismo', slug: 'cidade/labirinto/abismo' },
				],
			},
		],
	},
	{
		id: 'combate',
		title: 'Combate',
		children: [
			{ id: 'combate-fundamentos', title: 'Fundamentos', slug: 'combate/fundamentos' },
			{ id: 'combate-critico', title: 'Crítico', slug: 'combate/critico' },
			{ id: 'combate-bloqueio', title: 'Bloqueio', slug: 'combate/bloqueio' },
		],
	},
	{
		id: 'desenvolvimento',
		title: 'Desenvolvimento',
		children: [
			{
				id: 'em-processo',
				title: 'Em Processo',
				slug: 'desenvolvimento/em-processo',
			},
			{ id: 'dev-log', title: 'Dev Log', slug: 'desenvolvimento/dev-log' },
		],
	},
]

export function getWikiPath(slug: string): WikiNode[] | null {
	function visit(nodes: WikiNode[], parents: WikiNode[]): WikiNode[] | null {
		for (const node of nodes) {
			const path = [...parents, node]
			if (node.slug === slug) return path
			if (node.children) {
				const found = visit(node.children, path)
				if (found) return found
			}
		}
		return null
	}
	return visit(wikiNavigation, [])
}

export function nodeContainsSlug(node: WikiNode, slug: string): boolean {
	return (
		node.slug === slug ||
		(node.children?.some((child) => nodeContainsSlug(child, slug)) ?? false)
	)
}

// Vite transforma os arquivos Markdown em módulos de texto carregados sob demanda.
// Nenhuma edição do componente ArticleView é necessária ao criar um artigo novo.
const markdownFiles = import.meta.glob<string>('./articles/**/*.md', {
	query: '?raw',
	import: 'default',
})

export async function loadWikiMarkdown(slug: string): Promise<string | null> {
	if (!getWikiPath(slug)) return null
	const loader = markdownFiles[`./articles/${slug}.md`]
	return loader ? await loader() : null
}
