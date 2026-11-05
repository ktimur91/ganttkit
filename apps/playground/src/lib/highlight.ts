import type { HighlighterCore } from 'shiki/core'

export type CodeLang = 'vue' | 'typescript' | 'bash'

let highlighter: Promise<HighlighterCore> | undefined

/** HTML with both theme colors as CSS variables, see `.shiki` in style.css. Shiki loads on first use. */
export async function highlight(code: string, lang: CodeLang): Promise<string> {
  highlighter ??= Promise.all([import('shiki/core'), import('shiki/engine/javascript')]).then(
    ([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) =>
      createHighlighterCore({
        themes: [import('shiki/dist/themes/github-light.mjs'), import('shiki/dist/themes/github-dark.mjs')],
        langs: [
          import('shiki/dist/langs/vue.mjs'),
          import('shiki/dist/langs/typescript.mjs'),
          import('shiki/dist/langs/bash.mjs'),
        ],
        engine: createJavaScriptRegexEngine(),
      }),
  )
  const shiki = await highlighter
  return shiki.codeToHtml(code, { lang, themes: { light: 'github-light', dark: 'github-dark' }, defaultColor: false })
}
