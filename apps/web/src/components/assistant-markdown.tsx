import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

interface AssistantMarkdownProps {
  text: string
}

export function AssistantMarkdown({ text }: AssistantMarkdownProps) {
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none
                 prose-pre:bg-transparent prose-pre:p-0 prose-pre:my-2
                 prose-p:my-1 prose-p:leading-relaxed
                 prose-code:before:hidden prose-code:after:hidden"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
