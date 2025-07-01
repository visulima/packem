import { ReactNode } from 'react'
import Link from 'next/link'

interface FeatureCardProps {
  title: string
  description: string
  href: string
  icon?: string | ReactNode
  badge?: string
  className?: string
}

export function FeatureCard({ 
  title, 
  description, 
  href, 
  icon, 
  badge,
  className = '' 
}: FeatureCardProps) {
  return (
    <Link 
      href={href}
      className={`
        group block p-6 rounded-lg border border-gray-200 
        hover:border-gray-300 hover:shadow-md transition-all duration-200
        bg-white dark:bg-gray-900 dark:border-gray-800 dark:hover:border-gray-700
        ${className}
      `}
    >
      <div className="flex items-start gap-4">
        {icon && (
          <div className="flex-shrink-0">
            {typeof icon === 'string' ? (
              <span className="text-2xl">{icon}</span>
            ) : (
              icon
            )}
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {title}
            </h3>
            {badge && (
              <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {badge}
              </span>
            )}
          </div>
          
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            {description}
          </p>
        </div>
        
        <div className="flex-shrink-0">
          <svg 
            className="w-5 h-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  )
}