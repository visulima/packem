import { ReactNode } from 'react'

interface CodeBlockProps {
  children: ReactNode
  language?: string
  title?: string
  filename?: string
  highlight?: string
  showLineNumbers?: boolean
  className?: string
}

export function CodeBlock({ 
  children, 
  language = '',
  title,
  filename,
  highlight,
  showLineNumbers = false,
  className = '' 
}: CodeBlockProps) {
  return (
    <div className={`rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden ${className}`}>
      {(title || filename) && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            {filename && (
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {filename}
              </span>
            )}
            {title && !filename && (
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {title}
              </span>
            )}
            {language && (
              <span className="px-2 py-1 text-xs font-medium rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                {language}
              </span>
            )}
          </div>
          
          <button 
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            onClick={() => {
              const code = (children as any)?.props?.children || children
              navigator.clipboard?.writeText(code)
            }}
          >
            Copy
          </button>
        </div>
      )}
      
      <div className="relative">
        <pre className={`
          p-4 overflow-x-auto text-sm
          bg-gray-900 text-gray-100
          ${showLineNumbers ? 'pl-12' : ''}
        `}>
          <code className={language ? `language-${language}` : ''}>
            {children}
          </code>
        </pre>
        
        {showLineNumbers && (
          <div className="absolute left-0 top-0 p-4 text-gray-500 select-none">
            {String(children).split('\n').map((_, index) => (
              <div key={index} className="leading-5">
                {index + 1}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}