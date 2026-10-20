import MarkdownIt from 'markdown-it'

export interface WikiHeading {
	id: string
	text: string
	level: number
}

export interface RenderedWikiMarkdown {
	html: string
	headings: WikiHeading[]
}

const markdown = new MarkdownIt({
	html: false, // Documentos Markdown não podem executar HTML arbitrário.
	linkify: true,
	typographer: true,
})

export function headingId(text: string): string {
	return (
		text
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'secao'
	)
}

function safeParts(path: string, fromSlug: string): string | null {
	const segments = path.startsWith('/') ? [] : fromSlug.split('/').slice(0, -1)
	for (const part of path.split('/')) {
		if (!part || part === '.') continue
		if (part === '..') {
			if (segments.length === 0) return null
			segments.pop()
		} else {
			segments.push(part)
		}
	}
	return segments.join('/')
}

function articleHref(slug: string, fragment = ''): string {
	const path = `/wiki/${slug}`
	return `${import.meta.env.BASE_URL}#${path}${fragment}`
}

// Redireciona links .md para URLs do Vue Router (modo hash do GitHub Pages).
// Os links externos continuam funcionando normalmente.
export function resolveWikiLink(href: string, fromSlug: string): string {
	if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) return href

	const hashIndex = href.indexOf('#')
	const hash = hashIndex === -1 ? '' : href.slice(hashIndex)
	const path = hashIndex === -1 ? href : href.slice(0, hashIndex)

	if (!path) return articleHref(fromSlug, hash)
	if (path.startsWith('/wiki/')) return articleHref(path.slice('/wiki/'.length), hash)

	if (!/\.md$/i.test(path)) return href
	const resolved = safeParts(path.replace(/\.md$/i, ''), fromSlug)
	return resolved ? articleHref(resolved, hash) : '#'
}

function resolveImageSrc(src: string): string {
	// Imagens em public/images/... são referenciadas no Markdown como /images/...
	if (src.startsWith('/') && !src.startsWith('//')) {
		return `${import.meta.env.BASE_URL}${src.slice(1)}`
	}
	return src
}

export function renderWikiMarkdown(source: string, slug: string): RenderedWikiMarkdown {
	const headings: WikiHeading[] = []
	const seenIds = new Map<string, number>()
	const tokens = markdown.parse(source, {})

	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index]
		if (!token) continue

		if (token.type === 'heading_open') {
			const inline = tokens[index + 1]
			const title =
				inline?.children
					?.filter((part) => ['text', 'code_inline', 'image'].includes(part.type))
					.map((part) => part.content)
					.join('') ||
				inline?.content ||
				''

			const baseId = headingId(title)
			const occurrence = seenIds.get(baseId) ?? 0
			seenIds.set(baseId, occurrence + 1)
			const id = occurrence === 0 ? baseId : `${baseId}-${occurrence + 1}`
			token.attrSet('id', id)

			const level = Number(token.tag.slice(1))
			if (level === 2 || level === 3) headings.push({ id, text: title, level })
		}

		if (token.type !== 'inline' || !token.children) continue

		for (const child of token.children) {
			if (child.type === 'link_open') {
				const href = child.attrGet('href') as string
				if (!href) continue
				child.attrSet('href', resolveWikiLink(href, slug))
				if (/^https?:\/\//i.test(href)) {
					child.attrSet('target', '_blank')
					child.attrSet('rel', 'noopener noreferrer')
				}
			}
			if (child.type === 'image') {
				const src = child.attrGet('src') as string
				if (src) child.attrSet('src', resolveImageSrc(src))
				child.attrSet('loading', 'lazy')
			}
		}
	}

	return {
		html: markdown.renderer.render(tokens, markdown.options, {}),
		headings,
	}
}

export function wikiHeadingHref(slug: string, id: string): string {
	return articleHref(slug, `#${id}`)
}
