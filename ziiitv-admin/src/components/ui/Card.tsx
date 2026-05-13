import { classNames } from '../../lib/utils'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'sm' | 'md' | 'lg'
}

export function Card({ children, className, padding = 'md', ...rest }: CardProps) {
  const paddings = { sm: 'p-4', md: 'p-6', lg: 'p-8' }
  return (
    <div
      className={classNames(
        'bg-surface border border-border rounded-xl',
        paddings[padding],
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
