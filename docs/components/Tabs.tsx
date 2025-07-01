import { ReactNode, useState } from 'react'

interface TabItemProps {
  label: string
  children: ReactNode
  value?: string
}

interface TabsProps {
  children: ReactNode
  defaultValue?: string
  className?: string
}

export function TabItem({ children }: TabItemProps) {
  return <div>{children}</div>
}

export function Tabs({ children, defaultValue, className = '' }: TabsProps) {
  const tabs = Array.isArray(children) ? children : [children]
  const validTabs = tabs.filter(child => 
    child && typeof child === 'object' && 'props' in child && child.props.label
  )
  
  const [activeTab, setActiveTab] = useState(
    defaultValue || validTabs[0]?.props?.value || validTabs[0]?.props?.label || ''
  )

  return (
    <div className={`not-prose ${className}`}>
      {/* Tab Headers */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
        {validTabs.map((tab, index) => {
          const tabValue = tab.props.value || tab.props.label
          const isActive = activeTab === tabValue
          
          return (
            <button
              key={index}
              onClick={() => setActiveTab(tabValue)}
              className={`
                px-4 py-2 text-sm font-medium border-b-2 transition-colors
                ${isActive 
                  ? 'text-blue-600 border-blue-600 dark:text-blue-400 dark:border-blue-400' 
                  : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }
              `}
            >
              {tab.props.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div>
        {validTabs.map((tab, index) => {
          const tabValue = tab.props.value || tab.props.label
          const isActive = activeTab === tabValue
          
          return isActive ? (
            <div key={index}>
              {tab.props.children}
            </div>
          ) : null
        })}
      </div>
    </div>
  )
}