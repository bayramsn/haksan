import { ReactNode } from 'react';
import { Button } from '../ui/button';

type Props = {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
};

/** Boş liste durumu — icon + başlık + isteğe bağlı CTA. */
export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="size-12 rounded-xl bg-muted text-muted-foreground grid place-items-center mb-4">
        {icon}
      </div>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {description && <p className="mt-1.5 text-sm text-muted-foreground max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function EmptyStateButton(props: React.ComponentProps<typeof Button>) {
  return <Button size="sm" className="h-9 gap-1" {...props} />;
}
