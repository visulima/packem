import { ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const badgeVariants = {
  default: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100',
  secondary: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  success: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
}

const badgeSizes = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base'
}

export function Badge({ 
  children, 
  variant = 'default', 
  size = 'md',
  className = '' 
}: BadgeProps) {
  return (
    <span className={`
      inline-flex items-center font-medium rounded-full
      ${badgeVariants[variant]}
      ${badgeSizes[size]}
      ${className}
    `}>
      {children}
    </span>
  )
}